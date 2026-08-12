using Amazon;
using Amazon.Runtime;
using Amazon.SSO;
using Amazon.SSO.Model;
using Amazon.SSOOIDC;
using Amazon.SSOOIDC.Model;
using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Microsoft.Extensions.Caching.Memory;

namespace DeploymentAPI.Services;

// AWS IAM Identity Center's real sign-in flow (the same "device
// authorization" mechanism the AWS CLI uses for `aws sso login`) — the
// closest thing AWS actually offers to "log in with your username,
// password, and MFA and get access." The visitor authenticates entirely on
// AWS's own domain (opened in a new tab/popup); this backend only ever
// sees an opaque device code and, once they approve it there, a bearer
// token scoped to listing their accounts/roles and minting temporary
// credentials - never their password, never their MFA code.
//
// Each in-progress sign-in is held in-memory (IMemoryCache, already used
// elsewhere in this app) keyed by a random pendingId, tagged with the
// PortalIdentity session that started it so one visitor can't poll or
// complete another's sign-in. Entries expire on their own shortly after
// the device code itself would (AWS gives ~10 minutes to approve it).
public class AwsSsoService
{
    private readonly IMemoryCache _cache;

    public AwsSsoService(IMemoryCache cache)
    {
        _cache = cache;
    }

    private class PendingAuth
    {
        public string SessionKey = string.Empty;
        public string ClientId = string.Empty;
        public string ClientSecret = string.Empty;
        public string DeviceCode = string.Empty;
        public string SsoRegion = string.Empty;
        public string? AccessToken;
    }

    private static string CacheKey(string pendingId) => $"aws-sso-pending:{pendingId}";

    public async Task<AwsSsoStartResponseDto> StartAsync(string sessionKey, AwsSsoStartRequestDto request)
    {
        var region = RegionEndpoint.GetBySystemName(request.SsoRegion);

        using var oidcClient = new AmazonSSOOIDCClient(new AnonymousAWSCredentials(), region);

        var client = await oidcClient.RegisterClientAsync(new RegisterClientRequest
        {
            ClientName = "deployment-portal",
            ClientType = "public"
        });

        var device = await oidcClient.StartDeviceAuthorizationAsync(new StartDeviceAuthorizationRequest
        {
            ClientId = client.ClientId,
            ClientSecret = client.ClientSecret,
            StartUrl = request.StartUrl
        });

        var pendingId = Guid.NewGuid().ToString("N");
        var expiresIn = device.ExpiresIn ?? 600;
        var interval = device.Interval ?? 5;

        _cache.Set(CacheKey(pendingId), new PendingAuth
        {
            SessionKey = sessionKey,
            ClientId = client.ClientId,
            ClientSecret = client.ClientSecret,
            DeviceCode = device.DeviceCode,
            SsoRegion = request.SsoRegion
        }, TimeSpan.FromSeconds(Math.Max(expiresIn, 60)));

        return new AwsSsoStartResponseDto
        {
            PendingId = pendingId,
            VerificationUriComplete = device.VerificationUriComplete,
            UserCode = device.UserCode,
            IntervalSeconds = Math.Max(interval, 5),
            ExpiresInSeconds = expiresIn
        };
    }

    public async Task<AwsSsoPollResponseDto> PollAsync(string sessionKey, string pendingId)
    {
        if (!TryGetOwnedEntry(sessionKey, pendingId, out var pending))
            return new AwsSsoPollResponseDto { Status = "expired" };

        if (pending!.AccessToken != null)
            return new AwsSsoPollResponseDto { Status = "success" };

        try
        {
            using var oidcClient = new AmazonSSOOIDCClient(
                new AnonymousAWSCredentials(), RegionEndpoint.GetBySystemName(pending.SsoRegion));

            var token = await oidcClient.CreateTokenAsync(new CreateTokenRequest
            {
                ClientId = pending.ClientId,
                ClientSecret = pending.ClientSecret,
                DeviceCode = pending.DeviceCode,
                GrantType = "urn:ietf:params:oauth:grant-type:device_code"
            });

            pending.AccessToken = token.AccessToken;

            return new AwsSsoPollResponseDto { Status = "success" };
        }
        catch (AuthorizationPendingException)
        {
            return new AwsSsoPollResponseDto { Status = "pending" };
        }
        catch (SlowDownException)
        {
            return new AwsSsoPollResponseDto { Status = "pending" };
        }
        catch (ExpiredTokenException)
        {
            return new AwsSsoPollResponseDto { Status = "expired" };
        }
        catch (AccessDeniedException)
        {
            return new AwsSsoPollResponseDto { Status = "denied" };
        }
        catch (Exception ex)
        {
            return new AwsSsoPollResponseDto { Status = "error", Error = CloudErrorSanitizer.Describe(ex, "AWS", "SSO sign-in") };
        }
    }

    public async Task<List<AwsSsoAccountRolesDto>?> ListAccountsAndRolesAsync(string sessionKey, string pendingId)
    {
        if (!TryGetOwnedEntry(sessionKey, pendingId, out var pending) || pending!.AccessToken == null)
            return null;

        using var ssoClient = new AmazonSSOClient(
            new AnonymousAWSCredentials(), RegionEndpoint.GetBySystemName(pending.SsoRegion));

        var accounts = await ssoClient.ListAccountsAsync(new ListAccountsRequest
        {
            AccessToken = pending.AccessToken
        });

        var result = new List<AwsSsoAccountRolesDto>();

        foreach (var account in accounts.AccountList)
        {
            var roles = await ssoClient.ListAccountRolesAsync(new ListAccountRolesRequest
            {
                AccessToken = pending.AccessToken,
                AccountId = account.AccountId
            });

            result.Add(new AwsSsoAccountRolesDto
            {
                AccountId = account.AccountId,
                AccountName = account.AccountName,
                EmailAddress = account.EmailAddress,
                Roles = roles.RoleList.Select(r => r.RoleName).ToList()
            });
        }

        return result;
    }

    public async Task<AwsSessionCredentials?> GetRoleCredentialsAsync(
        string sessionKey, string pendingId, string accountId, string accountName, string roleName)
    {
        if (!TryGetOwnedEntry(sessionKey, pendingId, out var pending) || pending!.AccessToken == null)
            return null;

        using var ssoClient = new AmazonSSOClient(
            new AnonymousAWSCredentials(), RegionEndpoint.GetBySystemName(pending.SsoRegion));

        var response = await ssoClient.GetRoleCredentialsAsync(new GetRoleCredentialsRequest
        {
            AccessToken = pending.AccessToken,
            AccountId = accountId,
            RoleName = roleName
        });

        var credentials = response.RoleCredentials;

        // AWS always sends this in practice; the fallback only guards
        // against a theoretically absent field, not a real expected case.
        var expiresAt = credentials.Expiration is long epochMs
            ? DateTimeOffset.FromUnixTimeMilliseconds(epochMs).UtcDateTime
            : DateTime.UtcNow.AddHours(1);

        return new AwsSessionCredentials(
            credentials.AccessKeyId,
            credentials.SecretAccessKey,
            credentials.SessionToken,
            expiresAt,
            accountId,
            accountName,
            roleName);
    }

    private bool TryGetOwnedEntry(string sessionKey, string pendingId, out PendingAuth? pending)
    {
        if (_cache.TryGetValue(CacheKey(pendingId), out PendingAuth? found) && found != null && found.SessionKey == sessionKey)
        {
            pending = found;
            return true;
        }

        pending = null;
        return false;
    }
}
