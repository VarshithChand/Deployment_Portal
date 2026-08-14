using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;

namespace DeploymentAPI.Services;

// Settings > Security Testing Lab's scan engine. Every fetch this service
// makes goes through the same chain the feature's own spec insisted on:
// caller already proven super-admin (AdminGate, enforced by the
// controller before this is ever constructed-and-called) -> target already
// on the authorized allowlist (SettingsService.IsSecurityTestingTargetAuthorizedAsync,
// also checked by the controller) -> SsrfGuard on the host AND on every
// redirect hop -> a bounded, timed-out GET/HEAD/OPTIONS-only request ->
// findings built from headers/body text that's already been redacted of
// anything secret-shaped before it's returned. There is no path through
// this file that accepts a caller-supplied HTTP method, follows a
// redirect without re-validating it, or reads an unbounded response body -
// see the class-level comment on Helpers/SsrfGuard for why that matters.
public class SecurityTestingScanService
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
    private const int MaxResponseBytes = 1_000_000;
    private const int MaxRedirectHops = 5;
    private const int MaxDiscoveredEndpoints = 30;
    private const int MaxActiveProbeEndpoints = 10;

    private static readonly string[] SecurityHeaderNames =
    {
        "Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options",
        "X-Frame-Options", "Referrer-Policy", "Permissions-Policy",
        "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy"
    };

    private static readonly Regex ApiPathRegex = new(
        @"(?<![\w.])/api/[A-Za-z0-9_\-/]{1,80}", RegexOptions.Compiled, TimeSpan.FromSeconds(2));

    private static readonly Regex VersionLikeRegex = new(
        @"\d+\.\d+", RegexOptions.Compiled, TimeSpan.FromSeconds(1));

    // Matches src="http(s)://host/..." / href="http(s)://host/..." - only
    // ABSOLUTE, cross-origin references (a relative path or same-origin
    // absolute URL is never "someone else"). Deliberately simple (no HTML
    // parser) - this only needs to answer "what other hosts does this
    // page's markup point at," not build a full DOM.
    private static readonly Regex ExternalReferenceRegex = new(
        @"(?:src|href)\s*=\s*[""']https?://([^/""'\s]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled, TimeSpan.FromSeconds(2));

    private const int MaxThirdPartyHosts = 25;

    private readonly IHttpClientFactory _httpClientFactory;

    public SecurityTestingScanService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<SecurityScanResultDto> ScanAsync(Uri target, bool activeMode)
    {
        var stopwatch = Stopwatch.StartNew();

        var result = new SecurityScanResultDto
        {
            Id = Guid.NewGuid().ToString("N"),
            Target = target.ToString(),
            StartedAtUtc = DateTime.UtcNow,
            ActiveMode = activeMode
        };

        var findings = new List<SecurityFindingDto>();
        var performanceFindings = new List<SecurityFindingDto>();

        // Timed separately from the overall scan's own stopwatch (which
        // also covers robots.txt/security.txt/active-probe requests below)
        // - this is specifically "how long did the target itself take to
        // answer," the number a Performance Score should actually be based
        // on.
        var fetchStopwatch = Stopwatch.StartNew();
        var fetch = await FetchWithRedirectValidationAsync(target, HttpMethod.Get);
        fetchStopwatch.Stop();

        if (fetch.Error != null)
        {
            result.Error = fetch.Error;
            stopwatch.Stop();
            result.DurationMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 0);
            return result;
        }

        var bodyRedaction = SecretRedactor.Redact(fetch.Body);
        var responseSizeBytes = Encoding.UTF8.GetByteCount(fetch.Body);

        result.TargetInfo = BuildTargetInfo(fetch, bodyRedaction.Text, responseSizeBytes);
        result.TargetInfo.ResponseTimeMs = Math.Round(fetchStopwatch.Elapsed.TotalMilliseconds, 0);

        findings.AddRange(BuildSecurityHeaderFindings(fetch, result.TargetInfo));
        findings.AddRange(BuildInfoDisclosureFindings(fetch));
        findings.AddRange(BuildCookieFindings(fetch, target));
        findings.AddRange(BuildCorsFindings(fetch));
        findings.AddRange(BuildSecretFindings(fetch, bodyRedaction.MatchCount));

        var discoveredPaths = DiscoverApiPaths(bodyRedaction.Text);
        findings.AddRange(BuildApiDiscoveryFindings(discoveredPaths));

        var thirdPartyHosts = DiscoverThirdPartyHosts(bodyRedaction.Text, target);
        result.TargetInfo.ThirdPartyHosts = thirdPartyHosts;
        findings.AddRange(BuildThirdPartyFindings(thirdPartyHosts));

        var (robotsFound, securityTxtFound) = await CheckWellKnownFilesAsync(target);
        result.TargetInfo.RobotsTxtFound = robotsFound;
        result.TargetInfo.SecurityTxtFound = securityTxtFound;

        if (activeMode)
        {
            findings.AddRange(await BuildActiveProbeFindingsAsync(target, discoveredPaths));
        }

        performanceFindings.AddRange(BuildPerformanceFindings(result.TargetInfo, responseSizeBytes));

        result.Findings = findings;
        result.PerformanceFindings = performanceFindings;
        result.Summary = Summarize(findings);
        result.SecurityScore = ComputeScore(findings);
        result.PerformanceScore = ComputeScore(performanceFindings);

        stopwatch.Stop();
        result.DurationMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 0);

        return result;
    }

    private sealed record FetchResult(
        int? StatusCode,
        Dictionary<string, string> Headers,
        string Body,
        bool BodyTruncated,
        string? ContentType,
        List<string> RedirectChain,
        Uri FinalUri,
        string? Error);

    // The one place this whole feature actually talks to the network.
    // AllowAutoRedirect is off on the "SecurityTestingScan" HttpClient
    // (see Program.cs) specifically so every redirect lands here instead
    // of being followed silently - each hop's target host is re-run
    // through SsrfGuard before it's ever requested, which a public URL
    // redirecting to a private/metadata address (the exact DNS-rebinding/
    // redirect-to-metadata scenario the spec calls out) would otherwise
    // slip past a check that only ever looked at the original host.
    private async Task<FetchResult> FetchWithRedirectValidationAsync(Uri uri, HttpMethod method, int hopsRemaining = MaxRedirectHops)
    {
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return new FetchResult(null, new(), string.Empty, false, null, new(), uri, "Not a valid http(s) URL.");
        }

        if (await SsrfGuard.IsDisallowedTargetAsync(uri.Host))
        {
            return new FetchResult(null, new(), string.Empty, false, null, new(),
                uri, "Target blocked by SSRF protection (private, loopback, or link-local address).");
        }

        var client = _httpClientFactory.CreateClient("SecurityTestingScan");
        client.Timeout = RequestTimeout;

        try
        {
            using var request = new HttpRequestMessage(method, uri);
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

            if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location != null)
            {
                if (hopsRemaining <= 0)
                {
                    return new FetchResult((int)response.StatusCode, FlattenHeaders(response), string.Empty,
                        false, null, new() { uri.ToString() }, uri, "Too many redirects.");
                }

                var nextUri = response.Headers.Location.IsAbsoluteUri
                    ? response.Headers.Location
                    : new Uri(uri, response.Headers.Location);

                var nested = await FetchWithRedirectValidationAsync(nextUri, method, hopsRemaining - 1);

                return nested with { RedirectChain = new List<string> { uri.ToString() }.Concat(nested.RedirectChain).ToList() };
            }

            var (body, truncated) = await ReadBoundedBodyAsync(response);

            return new FetchResult(
                (int)response.StatusCode,
                FlattenHeaders(response),
                body,
                truncated,
                response.Content.Headers.ContentType?.MediaType,
                new List<string> { uri.ToString() },
                uri,
                null);
        }
        catch (TaskCanceledException)
        {
            return new FetchResult(null, new(), string.Empty, false, null, new(), uri,
                $"Timed out after {RequestTimeout.TotalSeconds:0}s.");
        }
        catch (HttpRequestException)
        {
            return new FetchResult(null, new(), string.Empty, false, null, new(), uri,
                "Couldn't complete that request (connection or TLS error).");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[SecurityTestingScan] {ex}");
            return new FetchResult(null, new(), string.Empty, false, null, new(), uri, "Unable to reach that target.");
        }
    }

    private static Dictionary<string, string> FlattenHeaders(HttpResponseMessage response)
    {
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var header in response.Headers)
            headers[header.Key] = string.Join("; ", header.Value);

        foreach (var header in response.Content.Headers)
            headers.TryAdd(header.Key, string.Join("; ", header.Value));

        return headers;
    }

    private static async Task<(string Body, bool Truncated)> ReadBoundedBodyAsync(HttpResponseMessage response)
    {
        await using var stream = await response.Content.ReadAsStreamAsync();

        var buffer = new byte[8192];
        using var memory = new MemoryStream();
        var truncated = false;

        int read;

        while ((read = await stream.ReadAsync(buffer)) > 0)
        {
            var remaining = MaxResponseBytes - (int)memory.Length;

            if (remaining <= 0)
            {
                truncated = true;
                break;
            }

            memory.Write(buffer, 0, Math.Min(read, remaining));

            if (read > remaining)
            {
                truncated = true;
                break;
            }
        }

        return (Encoding.UTF8.GetString(memory.ToArray()), truncated);
    }

    private static SecurityTargetInformationDto BuildTargetInfo(FetchResult fetch, string redactedBody, int responseSizeBytes)
    {
        var info = new SecurityTargetInformationDto
        {
            Https = fetch.FinalUri.Scheme == Uri.UriSchemeHttps,
            StatusCode = fetch.StatusCode,
            RedirectChain = fetch.RedirectChain,
            ContentType = fetch.ContentType,
            BodyTruncated = fetch.BodyTruncated,
            PageTitle = ExtractTitle(redactedBody),
            ResponseSizeBytes = responseSizeBytes,
            ContentEncoding = fetch.Headers.TryGetValue("Content-Encoding", out var encoding) ? encoding : null,
            CacheControl = fetch.Headers.TryGetValue("Cache-Control", out var cacheControl) ? cacheControl : null
        };

        foreach (var name in SecurityHeaderNames)
        {
            var present = fetch.Headers.ContainsKey(name);
            var warn = name == "Content-Security-Policy" && present
                && (fetch.Headers[name].Contains("unsafe-inline", StringComparison.OrdinalIgnoreCase)
                    || fetch.Headers[name].Contains("unsafe-eval", StringComparison.OrdinalIgnoreCase));

            info.SecurityHeaders[name] = !present ? "MISSING" : warn ? "WARN" : "PASS";
        }

        foreach (var name in new[] { "Server", "X-Powered-By", "Access-Control-Allow-Origin", "Cache-Control", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After" })
        {
            if (fetch.Headers.TryGetValue(name, out var value))
                info.ObservedHeaders[name] = SecretRedactor.Redact(value).Text;
        }

        return info;
    }

    private static string? ExtractTitle(string redactedBody)
    {
        var match = Regex.Match(redactedBody, @"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline, TimeSpan.FromSeconds(1));

        if (!match.Success)
            return null;

        // HTML-escaped so a copy of the raw value never round-trips
        // anywhere unescaped, even though the frontend renders this as
        // plain text (never dangerouslySetInnerHTML) regardless.
        return WebUtility.HtmlEncode(match.Groups[1].Value.Trim());
    }

    private static List<SecurityFindingDto> BuildSecurityHeaderFindings(FetchResult fetch, SecurityTargetInformationDto info)
    {
        var findings = new List<SecurityFindingDto>();

        void Add(string header, string severity, string description, string recommendation)
        {
            if (info.SecurityHeaders.GetValueOrDefault(header) != "PASS")
            {
                findings.Add(new SecurityFindingDto
                {
                    Severity = info.SecurityHeaders.GetValueOrDefault(header) == "WARN" ? "MEDIUM" : severity,
                    Title = info.SecurityHeaders.GetValueOrDefault(header) == "WARN" ? $"Weak {header}" : $"Missing {header}",
                    Description = description,
                    Recommendation = recommendation,
                    Category = "SecurityHeaders"
                });
            }
        }

        if (info.Https)
        {
            Add("Strict-Transport-Security", "MEDIUM",
                "The site is served over HTTPS but doesn't send HSTS, so a user's first visit (or one over a " +
                "compromised network) could still be downgraded to plain HTTP.",
                "Add a Strict-Transport-Security header (e.g. max-age=31536000; includeSubDomains).");
        }
        else
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = "Site not served over HTTPS",
                Description = "The final response was served over plain HTTP, exposing traffic to interception/tampering.",
                Recommendation = "Serve the site over HTTPS and redirect HTTP to HTTPS.",
                Category = "SecurityHeaders"
            });
        }

        Add("Content-Security-Policy", "MEDIUM",
            "No Content-Security-Policy header (or one permitting unsafe-inline/unsafe-eval) limits this site's " +
            "own defense against injected/XSS script execution.",
            "Configure a restrictive CSP appropriate to the site's actual script/style sources.");

        Add("X-Content-Type-Options", "LOW",
            "Without X-Content-Type-Options: nosniff, some browsers may MIME-sniff a response into an " +
            "unintended, more dangerous content type.",
            "Add X-Content-Type-Options: nosniff.");

        Add("X-Frame-Options", "LOW",
            "Without X-Frame-Options (or an equivalent frame-ancestors CSP directive), this page can be " +
            "embedded in another site's frame, enabling clickjacking.",
            "Add X-Frame-Options: DENY (or SAMEORIGIN if framing by your own origin is intended).");

        Add("Referrer-Policy", "LOW",
            "Without a Referrer-Policy, the full referring URL (which can include sensitive query parameters) " +
            "may be sent to third-party destinations linked from this page.",
            "Add a Referrer-Policy such as strict-origin-when-cross-origin.");

        Add("Permissions-Policy", "INFO",
            "No Permissions-Policy header - browser feature access (camera, geolocation, etc.) is left at " +
            "browser defaults rather than explicitly restricted.",
            "Add a Permissions-Policy restricting features this site doesn't use.");

        Add("Cross-Origin-Opener-Policy", "INFO",
            "No Cross-Origin-Opener-Policy - this page can share a browsing context group with cross-origin " +
            "popups, which COOP exists to isolate against.",
            "Add Cross-Origin-Opener-Policy: same-origin if cross-origin popup interaction isn't required.");

        Add("Cross-Origin-Resource-Policy", "INFO",
            "No Cross-Origin-Resource-Policy - other origins can embed this response (e.g. as an image/script) " +
            "unless CORP restricts it.",
            "Add Cross-Origin-Resource-Policy: same-origin/same-site if that's not intended.");

        return findings;
    }

    private static List<SecurityFindingDto> BuildInfoDisclosureFindings(FetchResult fetch)
    {
        var findings = new List<SecurityFindingDto>();

        if (fetch.Headers.TryGetValue("Server", out var server) && VersionLikeRegex.IsMatch(server))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "LOW",
                Title = "Server header discloses version information",
                Description = $"The Server header (\"{SecretRedactor.Redact(server).Text}\") includes what looks like a specific version number, which helps an attacker match known vulnerabilities to this software version.",
                Recommendation = "Configure the server/proxy to omit or generalize the Server header's version detail.",
                Category = "InformationDisclosure"
            });
        }

        if (fetch.Headers.ContainsKey("X-Powered-By"))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "LOW",
                Title = "X-Powered-By header present",
                Description = "The X-Powered-By header reveals the backend framework/runtime, narrowing the field of known vulnerabilities an attacker would try.",
                Recommendation = "Disable the X-Powered-By header at the framework or proxy level.",
                Category = "InformationDisclosure"
            });
        }

        return findings;
    }

    private static List<SecurityFindingDto> BuildCookieFindings(FetchResult fetch, Uri target)
    {
        var findings = new List<SecurityFindingDto>();

        if (!fetch.Headers.TryGetValue("Set-Cookie", out var raw))
            return findings;

        var https = target.Scheme == Uri.UriSchemeHttps;

        // Multiple Set-Cookie headers are joined by "; " the same as every
        // other multi-value header in FlattenHeaders, which loses the
        // per-cookie attribute grouping a real Set-Cookie list has - close
        // enough for a presence/absence check across the whole header set,
        // not meant to attribute a missing flag to one specific cookie.
        var lower = raw.ToLowerInvariant();

        if (https && !lower.Contains("secure"))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "HIGH",
                Title = "Cookie set without the Secure attribute",
                Description = "This HTTPS site sets a cookie without the Secure attribute, so it could still be sent over a plain HTTP connection if one is ever made.",
                Recommendation = "Add the Secure attribute to every cookie set by this site.",
                Category = "Cookies"
            });
        }

        if (!lower.Contains("httponly"))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = "Cookie set without the HttpOnly attribute",
                Description = "A cookie without HttpOnly is readable by JavaScript, widening the impact of any XSS on this site to full session/cookie theft.",
                Recommendation = "Add the HttpOnly attribute to cookies that don't need JavaScript access.",
                Category = "Cookies"
            });
        }

        if (!lower.Contains("samesite"))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = "Cookie set without a SameSite attribute",
                Description = "Without SameSite, this cookie is sent on cross-site requests by default in older browsers, widening CSRF exposure.",
                Recommendation = "Add SameSite=Lax (or Strict) to this site's cookies.",
                Category = "Cookies"
            });
        }

        return findings;
    }

    private static List<SecurityFindingDto> BuildCorsFindings(FetchResult fetch)
    {
        var findings = new List<SecurityFindingDto>();

        if (!fetch.Headers.TryGetValue("Access-Control-Allow-Origin", out var origin))
            return findings;

        var wildcardOrigin = origin.Trim() == "*";
        var allowsCredentials = fetch.Headers.TryGetValue("Access-Control-Allow-Credentials", out var creds)
            && string.Equals(creds.Trim(), "true", StringComparison.OrdinalIgnoreCase);

        if (wildcardOrigin && allowsCredentials)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "HIGH",
                Title = "CORS allows any origin together with credentials",
                Description = "Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true " +
                    "is an invalid/dangerous combination - browsers reject it, but sending it at all usually " +
                    "indicates a CORS misconfiguration worth reviewing directly.",
                Recommendation = "Return a specific, validated origin (never *) whenever credentials are allowed.",
                Category = "Cors"
            });
        }
        else if (wildcardOrigin)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = "CORS allows any origin",
                Description = "Access-Control-Allow-Origin: * lets any website's JavaScript read this response.",
                Recommendation = "Restrict Access-Control-Allow-Origin to the specific origins that legitimately need it, if this endpoint returns anything non-public.",
                Category = "Cors"
            });
        }

        return findings;
    }

    private static List<SecurityFindingDto> BuildSecretFindings(FetchResult fetch, int bodyMatchCount)
    {
        var findings = new List<SecurityFindingDto>();

        if (bodyMatchCount > 0)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "CRITICAL",
                Title = "Potential secret detected in response body",
                Description = $"The response body contains {bodyMatchCount} value(s) that match common secret/credential patterns (API keys, tokens, private keys, etc.). The actual value is never shown here.",
                Recommendation = "Locate and rotate the affected credential immediately, then remove it from anything client-reachable.",
                Category = "SecretDetection"
            });
        }

        foreach (var (name, value) in fetch.Headers)
        {
            if (SecretRedactor.ContainsPotentialSecret(value))
            {
                findings.Add(new SecurityFindingDto
                {
                    Severity = "CRITICAL",
                    Title = "Potential secret detected in a response header",
                    Description = $"The \"{name}\" response header contains a value matching common secret/credential patterns. The actual value is never shown here.",
                    Recommendation = "Locate and rotate the affected credential immediately, then remove it from response headers.",
                    Category = "SecretDetection"
                });
            }
        }

        return findings;
    }

    private static List<string> DiscoverApiPaths(string redactedBody)
    {
        return ApiPathRegex.Matches(redactedBody)
            .Select(m => m.Value)
            .Distinct()
            .Take(MaxDiscoveredEndpoints)
            .ToList();
    }

    private static List<SecurityFindingDto> BuildApiDiscoveryFindings(List<string> discoveredPaths)
    {
        return discoveredPaths.Select(path => new SecurityFindingDto
        {
            Severity = "INFO",
            Title = $"Discovered endpoint reference: {path}",
            Description = "Referenced in the page's own HTML/JavaScript, already visible to any client that loads this page - not independently probed in passive mode.",
            Recommendation = "Confirm this endpoint enforces the authentication/authorization it's meant to, and isn't exposing more than intended to an unauthenticated caller.",
            Category = "ApiDiscovery"
        }).ToList();
    }

    // "How much of our users' data/traffic goes to someone else" - every
    // distinct external host this page's own markup references via src=/
    // href=. Purely a static read of what's already in the page, never
    // fetched or contacted - see ExternalReferenceRegex's own comment.
    private static List<string> DiscoverThirdPartyHosts(string redactedBody, Uri target)
    {
        return ExternalReferenceRegex.Matches(redactedBody)
            .Select(m => m.Groups[1].Value)
            .Where(host => !string.Equals(host, target.Host, StringComparison.OrdinalIgnoreCase)
                && !host.EndsWith("." + target.Host, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxThirdPartyHosts)
            .ToList();
    }

    private static List<SecurityFindingDto> BuildThirdPartyFindings(List<string> thirdPartyHosts)
    {
        return thirdPartyHosts.Select(host => new SecurityFindingDto
        {
            Severity = "INFO",
            Title = $"Page references third-party host: {host}",
            Description = "This page's own HTML loads a resource (script, image, stylesheet, or link) from an " +
                "origin outside this site. Depending on what that resource is, the third party can potentially " +
                "observe the visit (via the request itself, cookies it sets, or the Referer header) even without " +
                "any data being deliberately sent to it.",
            Recommendation = "Confirm this third party is expected and trusted, and that no more information than " +
                "necessary (query parameters, referrer, cookies) reaches it.",
            Category = "ThirdPartyRequests"
        }).ToList();
    }

    // A lightweight, HTTP-level performance check - response time,
    // compression, payload size, and caching, all computed from the same
    // single fetch every other check already ran against. This is NOT a
    // Lighthouse-style page-load audit: there's no headless browser here
    // to measure paint, layout, or script execution time, and this scan
    // never fetches a page's linked CSS/JS/images to measure their own
    // weight - only the one HTML/API response actually requested.
    private static List<SecurityFindingDto> BuildPerformanceFindings(SecurityTargetInformationDto info, int responseSizeBytes)
    {
        var findings = new List<SecurityFindingDto>();

        var responseTimeMs = info.ResponseTimeMs ?? 0;

        if (responseTimeMs > 3000)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "HIGH",
                Title = $"Slow response time ({responseTimeMs:0} ms)",
                Description = "The target took over 3 seconds to respond, which most visitors will perceive as the site being broken or unresponsive.",
                Recommendation = "Investigate server-side latency (cold starts, slow queries, unoptimized rendering) for this endpoint.",
                Category = "Performance"
            });
        }
        else if (responseTimeMs > 1000)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = $"Elevated response time ({responseTimeMs:0} ms)",
                Description = "The target took over 1 second to respond - noticeable to visitors, though not yet severe.",
                Recommendation = "Look for easy wins (caching, a warm server instance, a slow dependency call) before this grows further.",
                Category = "Performance"
            });
        }

        if (responseSizeBytes > 500_000 && string.IsNullOrEmpty(info.ContentEncoding))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "MEDIUM",
                Title = $"Large uncompressed response ({responseSizeBytes / 1024} KB)",
                Description = "The response is over 500 KB and isn't compressed (no Content-Encoding), meaning every visitor downloads the full uncompressed size.",
                Recommendation = "Enable gzip or Brotli compression at the server/CDN level.",
                Category = "Performance"
            });
        }
        else if (string.IsNullOrEmpty(info.ContentEncoding) && responseSizeBytes > 50_000)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "LOW",
                Title = "Response not compressed",
                Description = "No Content-Encoding (gzip/br) header was present on a response over 50 KB.",
                Recommendation = "Enable compression at the server/CDN level - it's usually a free, no-tradeoff win.",
                Category = "Performance"
            });
        }

        if (info.BodyTruncated)
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "INFO",
                Title = "Response exceeds 1 MB (truncated for this scan)",
                Description = "This scan only reads the first 1 MB of a response - the real page is at least that large, which is worth checking directly regardless of this tool's own cap.",
                Recommendation = "Review the full response size with browser DevTools' Network tab for the real figure.",
                Category = "Performance"
            });
        }

        if (string.IsNullOrEmpty(info.CacheControl))
        {
            findings.Add(new SecurityFindingDto
            {
                Severity = "INFO",
                Title = "No Cache-Control header",
                Description = "Without Cache-Control, browsers fall back to heuristic caching, which can mean unnecessary repeat downloads for returning visitors.",
                Recommendation = "Set an explicit Cache-Control appropriate to how often this content actually changes.",
                Category = "Performance"
            });
        }

        return findings;
    }

    private async Task<(bool RobotsFound, bool SecurityTxtFound)> CheckWellKnownFilesAsync(Uri target)
    {
        var robots = await FetchWithRedirectValidationAsync(new Uri(target, "/robots.txt"), HttpMethod.Get);
        var securityTxt = await FetchWithRedirectValidationAsync(new Uri(target, "/.well-known/security.txt"), HttpMethod.Get);

        return (robots.StatusCode is >= 200 and < 300, securityTxt.StatusCode is >= 200 and < 300);
    }

    // Active mode only - GET-only reachability/auth-posture probes against
    // paths this same scan already discovered referenced in the target's
    // own page content. Never a caller-supplied method, never a path
    // outside the original target's own scheme+host (new Uri(target, path)
    // resolves relative to the target regardless of what the discovered
    // string looks like), never anything beyond a plain GET - there is no
    // way to reach a POST/PUT/PATCH/DELETE through this method.
    private async Task<List<SecurityFindingDto>> BuildActiveProbeFindingsAsync(Uri target, List<string> discoveredPaths)
    {
        var findings = new List<SecurityFindingDto>();

        foreach (var path in discoveredPaths.Take(MaxActiveProbeEndpoints))
        {
            var probeUri = new Uri(target, path);
            var probe = await FetchWithRedirectValidationAsync(probeUri, HttpMethod.Get);

            if (probe.Error != null || probe.StatusCode == null)
                continue;

            var status = probe.StatusCode.Value;

            findings.Add(new SecurityFindingDto
            {
                Severity = status is 401 or 403 ? "LOW" : status is >= 200 and < 300 ? "INFO" : "INFO",
                Title = status is 401 or 403
                    ? $"{path} appears to require authentication (HTTP {status})"
                    : status is >= 200 and < 300
                        ? $"{path} appears publicly reachable (HTTP {status})"
                        : $"{path} returned HTTP {status}",
                Description = "Active-mode GET reachability probe - no request body or state-changing method was sent.",
                Recommendation = status is >= 200 and < 300
                    ? "Confirm this endpoint is intended to be reachable without authentication."
                    : "No action needed if this matches the intended access control for this endpoint.",
                Category = "ActiveProbe"
            });
        }

        return findings;
    }

    private static SecurityScanSummaryDto Summarize(List<SecurityFindingDto> findings) => new()
    {
        Critical = findings.Count(f => f.Severity == "CRITICAL"),
        High = findings.Count(f => f.Severity == "HIGH"),
        Medium = findings.Count(f => f.Severity == "MEDIUM"),
        Low = findings.Count(f => f.Severity == "LOW"),
        Info = findings.Count(f => f.Severity == "INFO")
    };

    private static int ComputeScore(List<SecurityFindingDto> findings)
    {
        var score = 100;

        foreach (var finding in findings)
        {
            score -= finding.Severity switch
            {
                "CRITICAL" => 25,
                "HIGH" => 15,
                "MEDIUM" => 8,
                "LOW" => 3,
                _ => 0
            };
        }

        return Math.Max(0, score);
    }
}
