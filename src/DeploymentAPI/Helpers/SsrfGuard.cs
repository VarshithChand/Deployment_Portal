using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Shared by every feature that makes the server issue an outbound request
// to an admin-supplied URL (ExternalHealthCheckService, and
// SecurityTestingScanService) - extracted from ExternalHealthCheckService's
// original private copy so both stay in sync automatically instead of
// carrying two independently-maintained denylists that could quietly drift
// apart, the same reasoning MfaPolicy/IsSessionConsideredActiveAsync
// already established for other shared security decisions in this app.
//
// Resolves the hostname once and checks every resulting address (a
// hostname can round-robin across several) against a private/loopback/
// link-local denylist - this is what stops an admin-gated "fetch this URL"
// feature from becoming a way to read the backend's own host network or
// steal cloud instance-metadata credentials (169.254.169.254 and
// friends), with the response echoed straight back to the caller. Callers
// that follow redirects MUST re-run this on every hop's target host, not
// just the original one - a redirect is exactly how a public-looking URL
// can retarget a request at a private address after the fact.
public static class SsrfGuard
{
    public static async Task<bool> IsDisallowedTargetAsync(string host)
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
            // actual HTTP call the caller makes next will fail with its
            // own clear error.
            return false;
        }

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

    // Azure resource IDs (nsgResourceId, resourceId) get concatenated
    // directly after the hardcoded "https://management.azure.com" host in
    // several ARM calls (CloudServiceManagementService's NSG rule methods,
    // CloudStatusService.GetAzureResourceDetailAsync) - a caller-supplied
    // value, not one this app generates itself. Uri.EscapeDataString isn't
    // an option there (it would also escape the "/" separators a multi-
    // segment resource ID needs), so this instead requires the WHOLE
    // string to already be exactly the safe shape a real ARM resource ID
    // has: only [A-Za-z0-9._()/-], never "@", ":", "?", "#", or whitespace.
    // That closes the userinfo-authority trick a raw "@" would otherwise
    // allow (a value like "@evil.com/x" turns "https://management.azure.
    // com@evil.com/x" into a request to evil.com, with management.azure.
    // com merely read as bogus userinfo) - which would also hand that
    // request's live Azure Bearer token to whatever host it retargeted to.
    private static readonly Regex AzureResourceIdRegex = new(
        @"^/subscriptions/[A-Za-z0-9-]{36}/resourceGroups/[A-Za-z0-9._()-]{1,90}/providers/[A-Za-z0-9./_-]+$",
        RegexOptions.None, TimeSpan.FromSeconds(1));

    public static bool IsValidAzureResourceId(string? resourceId) =>
        !string.IsNullOrWhiteSpace(resourceId) && AzureResourceIdRegex.IsMatch(resourceId);

    // Same reasoning as IsValidAzureResourceId, for the ACR loginServer
    // that becomes the actual outbound request HOST (not just a path
    // segment) in CloudServiceManagementService's ACR methods - here an
    // unvalidated value is a direct arbitrary-host SSRF, not just the
    // userinfo trick, and the request carries a live Azure Bearer token.
    // Real ACR login servers are always exactly "<name>.azurecr.io" -
    // Azure's own naming rule for the registry name part is 5-50 lowercase
    // alphanumeric characters.
    private static readonly Regex AcrLoginServerRegex = new(
        @"^[a-z0-9]{5,50}\.azurecr\.io$", RegexOptions.None, TimeSpan.FromSeconds(1));

    public static bool IsValidAcrLoginServer(string? loginServer) =>
        !string.IsNullOrWhiteSpace(loginServer) && AcrLoginServerRegex.IsMatch(loginServer);
}
