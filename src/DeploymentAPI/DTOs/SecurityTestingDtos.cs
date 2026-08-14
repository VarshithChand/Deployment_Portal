namespace DeploymentAPI.DTOs;

public class SecurityTestingTargetDto
{
    public string Id { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public DateTime AddedAtUtc { get; set; }
}

public class AddSecurityTestingTargetRequestDto
{
    public string Url { get; set; } = string.Empty;
}

public class SecurityScanRequestDto
{
    public string Url { get; set; } = string.Empty;

    public bool ActiveMode { get; set; }

    // A second, explicit confirmation flag - separate from ActiveMode
    // itself, so a caller can't trip active testing by merely flipping
    // one boolean. Both are re-checked server-side (see
    // SecurityTestingController.Scan) regardless of what the frontend
    // toggle/checkbox state was, per "never grant a capability merely
    // because the frontend remembers a checkbox was ticked" - the same
    // rule this app's MFA login flow already lives by.
    public bool ActiveModeConfirmed { get; set; }
}

// "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" - a plain string rather
// than an enum so it serializes exactly as written without a converter,
// and so a stored historical scan never breaks if a future severity is
// ever added.
public class SecurityFindingDto
{
    public string Severity { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Recommendation { get; set; } = string.Empty;

    // Which check produced this - "SecurityHeaders", "InformationDisclosure",
    // "Cookies", "Cors", "SecretDetection", "ApiDiscovery", "ActiveProbe",
    // etc. Lets the frontend group/filter without parsing the title text.
    public string Category { get; set; } = string.Empty;
}

public class SecurityScanSummaryDto
{
    public int Critical { get; set; }
    public int High { get; set; }
    public int Medium { get; set; }
    public int Low { get; set; }
    public int Info { get; set; }
}

// The full result of one scan - what SecurityTestingScanService produces,
// and (minus nothing - there's no raw response data to strip, everything
// captured here has already been through SecretRedactor) exactly what
// gets persisted as scan history and returned to the frontend. There is
// deliberately no field anywhere on this DTO for a raw response body,
// raw headers dictionary, or request/response cookies - only the
// already-interpreted, already-redacted findings and informational
// summary fields the spec allows storing.
public class SecurityScanResultDto
{
    public string Id { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public DateTime StartedAtUtc { get; set; }

    public double DurationMs { get; set; }

    public bool ActiveMode { get; set; }

    public int SecurityScore { get; set; }

    // A second, independent score - deliberately NOT blended into
    // SecurityScore above (a fast-but-insecure or slow-but-secure site
    // shouldn't average out to looking "medium" on both fronts). Computed
    // from the same already-fetched response, so this costs no extra
    // requests - this is a lightweight HTTP-level performance check
    // (response time, compression, payload size, caching), not a full
    // rendered-page audit like Lighthouse - there's no headless browser
    // here to measure paint/layout/script-execution time with.
    public int PerformanceScore { get; set; }

    public SecurityScanSummaryDto Summary { get; set; } = new();

    public List<SecurityFindingDto> Findings { get; set; } = new();

    // Kept separate from Findings above (not merged in with a Category
    // filter) so PerformanceScore has one unambiguous source list, the
    // same way SecurityScore only ever reflects Findings.
    public List<SecurityFindingDto> PerformanceFindings { get; set; } = new();

    // Safe, informational-only fields about the target itself - never a
    // raw header dump (see TargetInformationDto below for exactly what's
    // included).
    public SecurityTargetInformationDto TargetInfo { get; set; } = new();

    // Set instead of throwing when the fetch itself failed (target
    // unreachable, timed out, blocked by SSRF guard, etc.) - the scan
    // still gets a result record and a history entry either way, same as
    // ExternalHealthCheckService's own per-target Error field.
    public string? Error { get; set; }
}

public class SecurityTargetInformationDto
{
    public bool Https { get; set; }

    public int? StatusCode { get; set; }

    public double? ResponseTimeMs { get; set; }

    public List<string> RedirectChain { get; set; } = new();

    public string? ContentType { get; set; }

    public bool BodyTruncated { get; set; }

    // HTML-escaped before this DTO is even built (see
    // SecurityTestingScanService.ExtractTitle) - the frontend renders it
    // as plain text regardless, this is defense in depth so a copy of the
    // raw value never round-trips anywhere unescaped.
    public string? PageTitle { get; set; }

    public bool RobotsTxtFound { get; set; }

    public bool SecurityTxtFound { get; set; }

    // Performance-relevant fields, captured from the same fetch above -
    // no separate request is made to gather these.
    public long ResponseSizeBytes { get; set; }

    public string? ContentEncoding { get; set; }

    public string? CacheControl { get; set; }

    // Distinct external hostnames referenced by src=/href= attributes in
    // the fetched page - "what other origins does this page hand a
    // visitor's browser off to" (scripts, images, stylesheets, links),
    // the direct answer to "how much of our users' data/traffic goes to
    // someone else." Never fetched or otherwise contacted - this is a
    // static reference list only. Capped and deduped the same way
    // DiscoverApiPaths already is.
    public List<string> ThirdPartyHosts { get; set; } = new();

    // Header display name -> "PASS" | "WARN" | "MISSING" - the quick
    // scannable checklist the spec's own mockup shows (section 10),
    // separate from the scored Findings list (a MISSING/WARN entry here
    // also produces a matching finding, but this dict exists so the UI
    // can render the simple checklist without re-deriving it from
    // findings text).
    public Dictionary<string, string> SecurityHeaders { get; set; } = new();

    // A small, fixed set of non-security-critical headers worth showing
    // for visibility (Server, X-Powered-By, CORS policy, Cache-Control,
    // rate-limit headers) - already passed through SecretRedactor like
    // every other captured value, even though none of these are expected
    // to ever contain one.
    public Dictionary<string, string> ObservedHeaders { get; set; } = new();
}

// A trimmed-down projection of SecurityScanResultDto for the history list
// (GET scans) - the full Findings list is only fetched on demand (GET
// scans/{id}), same "list view is cheap, detail view is a second call"
// shape every other list+detail pair in this app already uses (PAT users/
// admin recovery, artifacts/artifact detail, etc.).
public class SecurityScanHistoryEntryDto
{
    public string Id { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public DateTime StartedAtUtc { get; set; }

    public double DurationMs { get; set; }

    public bool ActiveMode { get; set; }

    public int SecurityScore { get; set; }

    public int PerformanceScore { get; set; }

    public SecurityScanSummaryDto Summary { get; set; } = new();

    public string? Error { get; set; }
}
