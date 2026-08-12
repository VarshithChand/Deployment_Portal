using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Settings > External APIs — checks a list of admin-supplied health-check
// URLs (the VCPMS cluster/version fleet, or anything else pasted in) from
// the server, not the browser: these endpoints almost certainly don't send
// CORS headers allowing a cross-origin fetch from this portal's own
// frontend origin, and centralizing it here means every check is the same
// admin-gated action regardless of who's watching.
public class ExternalHealthCheckService
{
    // Some of these (Azure App Service instances that spun down/are cold-
    // starting, for instance) take noticeably longer than a typical health
    // check to respond - 10s was flagging genuinely-healthy-but-slow
    // endpoints as unreachable. Every check still runs concurrently (see
    // CheckAllAsync), so this only affects how long the single slowest
    // endpoint in a batch gets before being marked unreachable, not how
    // long the whole "Check All" click takes when most respond quickly.
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(30);
    private const int MaxBodyLength = 4000;

    private readonly IHttpClientFactory _httpClientFactory;

    public ExternalHealthCheckService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    // Checked concurrently, not one at a time - a fleet of 30-50 endpoints
    // at up to 10s each would otherwise make a single "Check All" click
    // take minutes instead of seconds.
    public async Task<List<ExternalHealthResultDto>> CheckAllAsync(IEnumerable<string> urls)
    {
        var tasks = urls
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Select(u => CheckOneAsync(u.Trim()));

        return (await Task.WhenAll(tasks)).ToList();
    }

    private async Task<ExternalHealthResultDto> CheckOneAsync(string url)
    {
        var result = new ExternalHealthResultDto { Url = url };

        // This whole feature is admin-gated, so the caller is already
        // trusted with arbitrary outbound requests the same way they're
        // trusted to configure any other repo/registry URL elsewhere in
        // this app - still worth rejecting anything that isn't a plain
        // http(s) URL outright before it ever reaches HttpClient.
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            result.Error = "Not a valid http(s) URL.";
            return result;
        }

        // SSRF guard: even for an admin-gated feature, a hostname that
        // resolves to loopback/link-local (this covers every cloud
        // provider's 169.254.169.254 instance-metadata address)/private
        // range would let this become a way to read the backend's own host
        // network or steal instance credentials, with the response echoed
        // straight back to the caller. Resolved once here, and redirects
        // are disabled below (see the "ExternalHealthCheck" HttpClient
        // registration in Program.cs) rather than re-validated per hop, so
        // a redirect to a private address can't bypass this check.
        if (await IsDisallowedTargetAsync(uri.Host))
        {
            result.Error = "This address is not allowed (private, loopback, or link-local).";
            return result;
        }

        var client = _httpClientFactory.CreateClient("ExternalHealthCheck");
        client.Timeout = RequestTimeout;

        var stopwatch = Stopwatch.StartNew();

        try
        {
            using var response = await client.GetAsync(uri);
            stopwatch.Stop();

            var body = await response.Content.ReadAsStringAsync();

            result.StatusCode = (int)response.StatusCode;
            result.Ok = response.IsSuccessStatusCode;
            result.ResponseTimeMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 0);
            result.Body = body.Length > MaxBodyLength ? body[..MaxBodyLength] : body;

            if ((int)response.StatusCode is >= 300 and < 400)
            {
                result.Error = "Received a redirect - redirects aren't followed automatically for this check " +
                    "(the target address must be checked before every hop, so this stops instead of retargeting " +
                    "itself to wherever the redirect points).";
            }
        }
        catch (TaskCanceledException)
        {
            result.Error = $"Timed out after {RequestTimeout.TotalSeconds:0}s.";
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ExternalHealthCheck] {ex}");

            result.Error = ex switch
            {
                System.Net.Sockets.SocketException => "Couldn't resolve or reach that host.",
                System.Net.Http.HttpRequestException => "Couldn't complete that request (connection or TLS error).",
                _ => "Unable to reach that endpoint."
            };
        }

        return result;
    }

    private static async Task<bool> IsDisallowedTargetAsync(string host)
    {
        // A bare IP literal (e.g. someone pasted "http://169.254.169.254/")
        // needs no DNS lookup at all.
        if (IPAddress.TryParse(host, out var literalIp))
            return IsDisallowedAddress(literalIp);

        IPAddress[] addresses;

        try
        {
            addresses = await Dns.GetHostAddressesAsync(host);
        }
        catch (SocketException)
        {
            // Can't resolve it at all - not our problem to explain, the
            // actual HTTP call below will fail with its own clear error.
            return false;
        }

        // A hostname can resolve to several addresses (round-robin DNS) -
        // every single one has to be safe, since HttpClient/the OS is free
        // to pick any of them.
        return addresses.Any(IsDisallowedAddress);
    }

    private static bool IsDisallowedAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return true;

        var bytes = address.GetAddressBytes();

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            // 10.0.0.0/8
            if (bytes[0] == 10) return true;
            // 172.16.0.0/12
            if (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) return true;
            // 192.168.0.0/16
            if (bytes[0] == 192 && bytes[1] == 168) return true;
            // 169.254.0.0/16 - link-local, covers every major cloud
            // provider's instance-metadata address (169.254.169.254).
            if (bytes[0] == 169 && bytes[1] == 254) return true;
            // 0.0.0.0/8
            if (bytes[0] == 0) return true;
        }
        else if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            // fc00::/7 - unique local addresses (IPv6's private-range
            // equivalent).
            if ((bytes[0] & 0xFE) == 0xFC) return true;
            // fe80::/10 - link-local (covers fd00:ec2::254 and similar
            // IPv6 metadata addresses some clouds use).
            if (bytes[0] == 0xFE && (bytes[1] & 0xC0) == 0x80) return true;
        }

        return false;
    }
}
