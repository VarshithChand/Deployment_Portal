using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using DeploymentAPI.Configuration;
using DeploymentAPI.DTOs.Common;
using DeploymentAPI.Filters;
using DeploymentAPI.Helpers;
using DeploymentAPI.Models;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

//
//
// Configuration
// appsettings.Local.json holds real secrets (GitHub PAT) and is gitignored;
// it overrides the placeholder values checked into appsettings.json.
// SETTINGS_FILE_PATH (see SettingsService) redirects this to a mounted
// persistent volume in deployments where the app's own content root gets
// wiped and replaced on every redeploy (e.g. Fly.io) — both this and
// SettingsService must agree on the same path.
//
var localSettingsPath = Environment.GetEnvironmentVariable("SETTINGS_FILE_PATH")
    ?? "appsettings.Local.json";

// When DATABASE_URL is set (see SettingsService), Postgres is the durable
// source of truth — the container's own disk doesn't survive a restart on
// Render's free tier, which otherwise silently reset the admin allowlist
// and every PAT user's credentials back to nothing. This has to run BEFORE
// AddJsonFile below so the settings several IOptionsMonitor<T> bindings
// read straight from that file (GitHubOAuthSettings, AuthorizationSettings,
// DockerSettings, JwtSettings) start out matching what's actually saved,
// not whatever an empty fresh container happens to have on disk.
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");

if (!string.IsNullOrWhiteSpace(databaseUrl))
{
    await SettingsService.HydrateLocalFileFromDatabaseAsync(databaseUrl, localSettingsPath);
}

builder.Configuration.AddJsonFile(localSettingsPath, optional: true, reloadOnChange: true);

// Resolved explicitly from an actual environment variable first — reading
// a JWT signing key through the generic IConfiguration indexer (which can
// just as easily be backed by a committed appsettings.json) is flagged as
// a potential secret disclosure regardless of what that particular value
// happens to be; sourcing it straight from Environment.GetEnvironmentVariable
// makes the "this never comes from a checked-in file" guarantee explicit
// in the code, not just true by convention. Jwt:Secret (appsettings.Local.json,
// which IS gitignored, or Postgres via the same file — see SettingsService)
// remains a local-dev-friendly fallback; a random one is generated as a
// last resort so a brand new deployment doesn't 500 on every request from
// a zero-length signing key. The only cost of that last case is that
// existing sessions need to log in again after a restart, since nothing
// persists a generated value anywhere.
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET");

if (string.IsNullOrWhiteSpace(jwtSecret))
    jwtSecret = builder.Configuration["Jwt:Secret"];

if (string.IsNullOrWhiteSpace(jwtSecret))
    jwtSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

builder.Configuration["Jwt:Secret"] = jwtSecret;

builder.Services.Configure<NotificationSettings>(
    builder.Configuration.GetSection("Notifications"));

builder.Services.Configure<DockerSettings>(
    builder.Configuration.GetSection("Docker"));

builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection("Jwt"));

builder.Services.Configure<GitHubOAuthSettings>(
    builder.Configuration.GetSection("GitHubOAuth"));

builder.Services.Configure<GoogleOAuthSettings>(
    builder.Configuration.GetSection("GoogleOAuth"));

builder.Services.Configure<AuthorizationSettings>(
    builder.Configuration.GetSection("Auth"));

//
// HttpContext access from within services (GitHubAuthService reads the
// current request's logged-in user to resolve their own GitHub credentials)
//
builder.Services.AddHttpContextAccessor();

//
// Controllers
// ApiResponseWrapperFilter applies the app-wide {success,data}/
// {success,error} response envelope globally - see the filter's own
// comment for why this is the one place that contract is implemented,
// rather than hand-edited into every action.
//
builder.Services.AddControllers(options => options.Filters.Add<ApiResponseWrapperFilter>());

//
// Swagger
//
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

//
// Global exception handling — see GlobalExceptionHandler for what this
// actually does (log full detail server-side, never let raw exception text
// reach the client). AddProblemDetails lets ASP.NET Core's own built-in
// error paths (model binding failures, etc.) use the same RFC 7807 shape
// consistently, alongside this handler's own JSON body for anything that
// reaches it unhandled.
//
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

//
// HttpClient
//
builder.Services.AddHttpClient();

// Used only by ExternalHealthCheckService, which validates the target
// hostname's resolved IP against a private/loopback/link-local denylist
// (see IsDisallowedTargetAsync) before every request - AllowAutoRedirect
// is off so a redirect response can't retarget the request to an address
// that check never saw, which per-hop redirect-following normally would.
builder.Services.AddHttpClient("ExternalHealthCheck")
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        AllowAutoRedirect = false
    });

// Used only by SecurityTestingScanService - same AllowAutoRedirect=false
// reasoning as ExternalHealthCheck above, except this caller DOES follow
// redirects, manually, re-running SsrfGuard on every hop's target first
// (see FetchWithRedirectValidationAsync) - the framework must never do
// that automatically, or a validated hop could jump straight to an
// unvalidated one.
builder.Services.AddHttpClient("SecurityTestingScan")
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        AllowAutoRedirect = false
    });

// Used only by PaasProviderService - the four provider API base URLs
// (api.render.com, api.cloudflare.com, api.netlify.com, api.vercel.com)
// are fixed literals, not user-supplied input, so this doesn't need the
// AllowAutoRedirect=false SSRF guard ExternalHealthCheck/SecurityTestingScan
// use above for arbitrary user-entered hostnames - a plain named client
// for connection pooling is enough.
builder.Services.AddHttpClient("PaasProviders");

builder.Services.AddMemoryCache();

//
// Data Protection - backs SettingsService's Protect()/Unprotect() encryption
// of stored credentials (GitHub PAT, cloud secret keys, Docker/Sonar/Gemini
// tokens). Reuses the same DATABASE_URL Postgres instance the rest of the
// app's durable state already lives in - see PostgresXmlRepository - so the
// key ring (and therefore every credential already encrypted under it)
// survives Render's ephemeral disk being wiped on redeploy. Without this,
// ASP.NET Core would fall back to persisting keys to local disk, which is
// lost on every redeploy, permanently bricking anything encrypted under it.
//
var dataProtectionBuilder = builder.Services.AddDataProtection()
    .SetApplicationName("DeploymentPortal");

if (!string.IsNullOrWhiteSpace(databaseUrl))
{
    var keyRingConnectionString = SettingsService.BuildConnectionString(databaseUrl);
    dataProtectionBuilder.AddKeyManagementOptions(options =>
        options.XmlRepository = new PostgresXmlRepository(keyRingConnectionString));
}

//
// Dependency Injection
//
// Scoped, not Singleton: it resolves the current request's user's own
// GitHub repo/token (see GitHubAuthService) — one instance per request,
// same as GitHubApiService below.
builder.Services.AddScoped<GitHubAuthService>();
builder.Services.AddSingleton<ActivityLogService>();
// Docker.DotNet's client is meant to be created once and reused, like
// HttpClient, rather than re-connected to the daemon on every request.
builder.Services.AddSingleton<DockerApiService>();
builder.Services.AddScoped<GitHubApiService>();
builder.Services.AddScoped<DeploymentService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<SettingsService>();
// Scoped (not Singleton) because it depends on SettingsService, itself
// Scoped — reads that service's already-parsed DATABASE_URL connection
// string rather than re-parsing it.
builder.Services.AddScoped<DatabaseManagementService>();
// Scoped for the same reason as DatabaseManagementService above - it
// depends on SettingsService (Scoped) to read the Resend API key.
builder.Services.AddScoped<IEmailService, ResendEmailService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GoogleAuthService>();
// Singleton - PasswordHasher<TUser>'s default implementation is stateless,
// same reasoning as any other pure-function service in this app. Scoped
// AccountAuthService (below) depends on SettingsService (Scoped), which in
// turn depends on THIS - a Singleton depending on a Scoped service would be
// the captive-dependency mistake DatabaseManagementService's own comment
// warns about; this is the opposite, safe direction.
builder.Services.AddSingleton<IPasswordHasher<PortalUserAccount>, PasswordHasher<PortalUserAccount>>();
builder.Services.AddScoped<AccountAuthService>();
builder.Services.AddScoped<SonarApiService>();
builder.Services.AddScoped<SmokeTestService>();
builder.Services.AddScoped<ExternalHealthCheckService>();
builder.Services.AddScoped<SecurityTestingScanService>();
builder.Services.AddScoped<ErrorAnalysisService>();
builder.Services.AddScoped<PipelineExplanationService>();
// Stateless (holds a static shared HttpClient for the Azure REST calls,
// same reuse rationale as DockerApiService) — every AWS/Azure credential
// it uses is passed in per-call, never held on the instance itself.
builder.Services.AddSingleton<CloudStatusService>();
// Same statelessness as CloudStatusService above - every Render/Cloudflare/
// Netlify/Vercel token it uses is passed in per-call.
builder.Services.AddSingleton<PaasProviderService>();
// Same statelessness as CloudStatusService above - every credential is
// passed in per-call.
builder.Services.AddSingleton<CloudServiceManagementService>();
builder.Services.AddSingleton<ContainerServiceManagementService>();
builder.Services.AddSingleton<ElasticBeanstalkService>();
builder.Services.AddSingleton<AzureAppServiceManagementService>();
builder.Services.AddSingleton<PaasAggregationService>();
// Docker Hub/GHCR browsing for the Container Registry hub - same
// statelessness as CloudServiceManagementService above (credential passed
// in per-call, its two shared HttpClients never carry per-caller state on
// themselves - see ContainerRegistryService's own comment on that).
builder.Services.AddSingleton<ContainerRegistryService>();
// Observability's 4 CSP-native tools (CloudWatch/X-Ray/Azure Monitor/GCP
// Cloud Monitoring) - same statelessness as the services above.
builder.Services.AddSingleton<ObservabilityService>();
// Source Control's AWS CodeCommit sub-page - same statelessness as
// ContainerRegistryService/CloudServiceManagementService above (every
// credential is passed in per-call).
builder.Services.AddSingleton<SourceControlService>();
// Source Control's Azure DevOps sub-pages (Branches/Pipelines/Build
// Artifacts/Package Feeds) - same statelessness as SourceControlService
// above.
builder.Services.AddSingleton<AzureDevOpsService>();
// Its only state is IMemoryCache-backed pending sign-ins, already a
// Singleton itself - safe to share the same way.
builder.Services.AddSingleton<AwsSsoService>();
// Deployment Copilot. GeminiService is stateless (every call takes its API
// key/model as parameters, same as CloudStatusService taking credentials
// per-call) - Singleton, behind the provider-agnostic IAiAssistantService
// so a future non-Gemini implementation is a one-line swap here. AiToolsService
// is Scoped because it depends on Scoped services (GitHubAuthService,
// SettingsService, DatabaseManagementService) that are already resolved to
// the current request's own session.
builder.Services.AddSingleton<IAiAssistantService, GeminiService>();
builder.Services.AddScoped<AiToolsService>();
// Resolved once at startup from real git/environment state (see
// ApplicationBuildInfoService) - Singleton since none of it changes while
// the process is alive. ApplicationSupportToolsService is Scoped because
// it depends on Scoped services (SettingsService, GitHubApiService,
// GitHubAuthService).
builder.Services.AddSingleton<ApplicationBuildInfoService>();
builder.Services.AddScoped<ApplicationSupportToolsService>();

// Per-session last-active/force-logout state for the Services page's
// Users tab (see AdminUsersController) - in-memory, same lifetime
// rationale as ActivityLogService.
builder.Services.AddSingleton<SessionActivityService>();

//
// CORS
// Credentials (the portal_token cookie) require a specific origin list,
// not AllowAnyOrigin, per the CORS spec.
//
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactPolicy", policy =>
    {
        policy
            .WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

//
// Authentication (JWT issued via GitHub OAuth login, carried in an
// httpOnly cookie rather than a header so it's never readable by page JS)
//
var jwtSettings = builder.Configuration.GetSection("Jwt");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSettings["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwtSettings["Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.TryGetValue("portal_token", out var token))
                {
                    context.Token = token;
                }

                return Task.CompletedTask;
            },

            // [Authorize] (used only by GET /api/auth/me - every other
            // endpoint's authorization goes through AdminGate instead,
            // which already produces the standard envelope via
            // ApiResponseWrapperFilter) short-circuits before the MVC
            // action/result-filter pipeline ever runs, so without this its
            // 401/403 would bypass that filter and come back as an empty
            // body instead of the same {success,error:{...}} shape every
            // other error response uses.
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";

                await context.Response.WriteAsJsonAsync(new ApiErrorResponse
                {
                    Success = false,
                    Error = new ApiError
                    {
                        Code = "AUTH_REQUIRED",
                        Message = "Authentication is required.",
                        CorrelationId = context.HttpContext.TraceIdentifier
                    }
                });
            },

            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";

                await context.Response.WriteAsJsonAsync(new ApiErrorResponse
                {
                    Success = false,
                    Error = new ApiError
                    {
                        Code = "ACCESS_DENIED",
                        Message = "You don't have permission to do that.",
                        CorrelationId = context.HttpContext.TraceIdentifier
                    }
                });
            },

            // What actually makes Settings > Account's "sign out this
            // device" take effect immediately, rather than just removing a
            // row from a list nothing else checks (see the pre-existing
            // admin force-logout / SessionActivityService, which was found
            // to write and read under mismatched key namespaces). A token
            // with no jti claim at all (issued before this feature
            // existed) is let through unchecked - there's nothing to look
            // up for it, and it still expires on its own via the JWT's
            // normal lifetime.
            OnTokenValidated = async context =>
            {
                var jti = context.Principal?.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;
                var userId = context.Principal?.FindFirst(ClaimTypes.Name)?.Value;

                if (string.IsNullOrEmpty(jti) || string.IsNullOrEmpty(userId))
                    return;

                var settings = context.HttpContext.RequestServices.GetRequiredService<SettingsService>();

                if (await settings.IsSessionRevokedAsync(userId, jti))
                    context.Fail("Session has been revoked.");
            }
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

//
// Forwarded headers — must be the very first middleware. Render (and most
// PaaS hosts) terminate HTTPS at their own edge and forward plain HTTP to
// this container, so without this, Request.IsHttps reads false here even
// though the site is genuinely served over HTTPS. Every cross-site cookie
// this app sets (portal_token, oauth_state, portal_session) keys its
// SameSite/Secure attributes off Request.IsHttps — get that wrong and those
// cookies get set as SameSite=Lax, which browsers silently drop on the
// cross-site requests a separately-hosted frontend (e.g. Cloudflare Pages/
// Workers) makes to this API. KnownNetworks/KnownProxies are cleared
// because Render's proxy isn't a fixed address we can allowlist in advance.
var forwardedHeaderOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
forwardedHeaderOptions.KnownNetworks.Clear();
forwardedHeaderOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeaderOptions);

//
// Correlation ID — stamped on every response (success or failure) so a
// report that includes it can be matched back to the exact server-side log
// entry (see GlobalExceptionHandler), without needing any extra client-side
// plumbing beyond echoing this header back if they choose to.
//
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Correlation-Id"] = context.TraceIdentifier;
    await next();
});

//
// Error handling — GlobalExceptionHandler is the backstop for anything that
// reaches here unhandled: it logs full detail server-side (Activity Log +
// stderr) and returns a safe, generic JSON body instead of raw exception
// text. Replaces this app's previous hand-rolled try/catch, which echoed
// HttpRequestException.Message straight into the response body.
//
app.UseExceptionHandler();

//
// Security headers — this API only ever returns JSON (the frontend is a
// separate SPA), but Swagger's own UI below is HTML, and these are cheap,
// standard defense-in-depth regardless of response type: stop a browser
// from MIME-sniffing a JSON response into something executable, stop this
// app from being framed by another site (clickjacking), and don't leak
// the full request URL to third-party origins via the Referer header.
//
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

    // Every response here is dynamic, per-session, or admin data - none of
    // it should ever be cached by a browser or an intermediary. Without an
    // explicit no-store, a Cache Rule added later for this hostname (even
    // one meant for something unrelated) could start serving one caller's
    // response - several of which are scoped by the X-Session-Id request
    // HEADER, not the URL, so a typical cache key wouldn't vary on it at
    // all - back to a completely different caller.
    context.Response.Headers["Cache-Control"] = "no-store";

    // The real, browser-enforced CSP for this app's actual HTML document
    // lives with the frontend (deployment-ui/vite.config.js writes a
    // Cloudflare _headers file at build time) - DeploymentAPI never serves
    // index.html itself, EXCEPT for Swagger's own bundled HTML UI below,
    // which still needs 'unsafe-inline' (Swashbuckle relies on inline
    // script/style). Every other route here only ever returns JSON, so
    // scoping the permissive policy to just /swagger - and using a
    // maximally restrictive one everywhere else - is strictly more
    // correct than applying Swagger's exception portal-wide, with no
    // functional downside (a JSON body never executes a CSP directive
    // regardless of how permissive it is).
    context.Response.Headers["Content-Security-Policy"] = context.Request.Path.StartsWithSegments("/swagger")
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
        : "default-src 'none'; frame-ancestors 'none'";
    context.Response.Headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()";

    await next();
});

//
// HTTPS
// UseHsts is skipped in Development — the header is cached by the browser
// for a year by default, which is a well-known footgun if this host is
// ever later served locally over plain HTTP again.
//
app.UseHttpsRedirection();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

//
// CORS
//
app.UseCors("ReactPolicy");

//
// Authentication / Authorization
//
app.UseAuthentication();
app.UseAuthorization();

//
// Account activity — records that this account (see RequireAuth) made a
// request just now (Services page's Users tab shows this as "Last
// Active"), and rejects outright if an admin has blocked this specific
// account (see SettingsService.BlockPatUserAsync) - stronger than clearing
// their credentials, since a blocked account is refused even with a still-
// valid token. Moved to run AFTER UseAuthentication (unlike its
// PortalIdentity-session-keyed predecessor, which ran before it) since
// both the block list and activity tracking are now keyed by the
// authenticated account's own id, not an anonymous per-browser session -
// there's nothing to check or record yet for a request that hasn't logged
// in (see AccountAuthController/AuthController's own login/signup routes,
// which this simply lets straight through unblocked-by-definition).
//
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var key = RequireAuth.ResolveUserId(context);

        var settings = context.RequestServices.GetRequiredService<SettingsService>();

        if (await settings.IsPatUserBlockedAsync(key))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { message = "This account has been blocked by the portal admin." });
            return;
        }

        var userAgent = context.Request.Headers.UserAgent.ToString();
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var endpoint = $"{context.Request.Method} {context.Request.Path}";
        context.RequestServices.GetRequiredService<SessionActivityService>().Touch(key, userAgent, ipAddress, endpoint);

        // Keeps Settings > Account's Active Sessions list showing real
        // recency (see SettingsService.TouchSessionAsync) - a no-op for a
        // token issued before the Jti claim existed.
        var jti = context.User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;

        if (!string.IsNullOrEmpty(jti))
        {
            await settings.TouchSessionAsync(key, jti, userAgent, ipAddress);
        }
    }

    await next();
});

//
// Per-user GitHub credentials — loads the current request's logged-in
// user's own repo/token into the request-scoped GitHubAuthService once,
// before any controller action runs. Must come after UseAuthentication so
// HttpContext.User is already populated.
//
app.Use(async (context, next) =>
{
    var githubAuth = context.RequestServices.GetRequiredService<GitHubAuthService>();
    await githubAuth.LoadAsync();
    await next();
});

//
// Mandatory-MFA enforcement
// MfaEnforcementGate.jsx's full-screen "blocked" state (see BootstrapController's
// MfaNudge.Blocked / MfaPolicy) was, until now, a UI-only render gate —
// nothing on the backend stopped a browser (or a direct API call bypassing
// the frontend entirely) from still reaching real GitHub/AWS/Azure/GCP/
// portal data underneath it. That gap is real for exactly the sessions
// this screen exists to lock down: anyone who connected a token back when
// their account had no MFA enabled yet (so the two-step PAT-login/MFA
// gate in AuthController never applied to them), then later saved a cloud
// credential or got flagged Required by an admin, making the nudge
// mandatory *after the fact*. This closes that gap where every other real
// authorization boundary in this app already lives — server-side, never
// trusted to the frontend alone (same reasoning as SessionActivityService's
// PIN-attempt counter, or MfaGate's login-time enforcement).
//
// Deliberately allowlisted (must stay reachable for a blocked session to
// ever see why it's blocked, or to actually get unblocked):
//   - /api/bootstrap        - the only way the frontend learns it's blocked
//   - /api/auth              - logout, session-epoch polling, mfa/pending, /me
//   - /api/mfa               - the actual enroll/verify/disable flow
//   - /api/settings/me/mfa   - the skip-nudge action
//   - /swagger, /api/health  - unrelated to this session's own MFA state
// Uses GitHubAuthService.GetAuthenticatedLoginAsync (already 60s-cached
// per token, see that service's own comment) rather than a fresh GitHub
// call, so a session sitting on the block screen doesn't burn a live
// GitHub API call on every request it makes while stuck there.
//
var mfaBlockAllowlist = new[]
{
    "/api/bootstrap", "/api/auth", "/api/mfa", "/api/settings/me/mfa", "/swagger", "/api/health"
};

app.Use(async (context, next) =>
{
    var path = context.Request.Path;

    // Not-yet-authenticated requests fall through unevaluated - there's no
    // account here to check yet, and the downstream controller's own
    // RequireAuth check (or AdminGate, for the still-active PAT-based
    // routes) already produces the right 401/403 for those on its own.
    // This mirrors the allowlist below in spirit (both exist to keep
    // pre-login/still-getting-set-up traffic moving) but is a distinct
    // check, not a redundant one - the allowlist covers specific PATHS
    // that must stay reachable even for an already-blocked account, while
    // this covers accounts that were never authenticated in the first
    // place.
    if (!path.StartsWithSegments("/api") || mfaBlockAllowlist.Any(p => path.StartsWithSegments(p))
        || context.User.Identity?.IsAuthenticated != true)
    {
        await next();
        return;
    }

    var settings = context.RequestServices.GetRequiredService<SettingsService>();
    var key = RequireAuth.ResolveUserId(context);

    var policy = await MfaPolicy.EvaluateAsync(settings, key);

    if (policy.Blocked)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";

        await context.Response.WriteAsJsonAsync(new ApiErrorResponse
        {
            Success = false,
            Error = new ApiError
            {
                Code = "MFA_REQUIRED",
                Message = "Multi-factor authentication is required for this account before continuing. Finish setting it up to regain access.",
                CorrelationId = context.TraceIdentifier
            }
        });

        return;
    }

    await next();
});

//
// Swagger
// Kept available in every environment (not just Development) so the API
// surface is checkable on the deployed instance too - but gated behind the
// same Admin authority (OAuth "Admin" role, or an allowlisted PAT owner,
// or bootstrap mode when the allowlist is still empty - see AdminGate)
// every other sensitive read in this app requires, instead of serving the
// full route/DTO/parameter surface to anonymous visitors. Must come after
// UseAuthentication/UseAuthorization and the GitHubAuthService.LoadAsync
// middleware above so both the OAuth role check and the PAT-owner fallback
// have what they need already resolved. 404 rather than 401/403 on denial
// so an anonymous prober can't even confirm Swagger exists here, the same
// as every other AdminGate-protected route in this app.
//
app.MapWhen(
    context => context.Request.Path.StartsWithSegments("/swagger"),
    swaggerBranch =>
    {
        swaggerBranch.Use(async (context, next) =>
        {
            var settings = context.RequestServices.GetRequiredService<SettingsService>();
            var view = await settings.GetViewAsync();

            var isAdmin = view.AdminGitHubUsernames.Count == 0
                || (context.User.Identity?.IsAuthenticated == true && context.User.IsInRole("Admin"));

            if (!isAdmin && view.AdminGitHubUsernames.Count > 0)
            {
                var auth = context.RequestServices.GetRequiredService<GitHubAuthService>();

                if (auth.HasToken)
                {
                    var login = await auth.GetAuthenticatedLoginAsync();
                    isAdmin = login != null && view.AdminGitHubUsernames.Any(
                        u => string.Equals(u, login, StringComparison.OrdinalIgnoreCase));
                }
            }

            if (!isAdmin)
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            await next();
        });

        swaggerBranch.UseSwagger();
        swaggerBranch.UseSwaggerUI();
    });

//
// Controllers
//
app.MapControllers();

//
// Startup checks
// A visible warning (Activity Log + the process's own stdout, so it shows
// up in Render's log stream too) if this instance is running in bootstrap
// mode - see AdminGate.IsAdminOrBootstrap - the moment it comes up, not
// just whenever someone happens to look at Activity Log. Only in
// Production: bootstrap mode is the expected, harmless state for local
// dev and doesn't need an alarm every time someone runs the API locally.
//
if (app.Environment.IsProduction())
{
    using var startupScope = app.Services.CreateScope();
    var startupSettings = startupScope.ServiceProvider.GetRequiredService<SettingsService>();
    var startupView = await startupSettings.GetViewAsync();

    if (startupView.AdminGitHubUsernames.Count == 0)
    {
        var log = startupScope.ServiceProvider.GetRequiredService<ActivityLogService>();
        const string message = "Startup check: the admin allowlist is EMPTY - this instance is in bootstrap " +
            "mode, meaning every visitor is currently treated as Admin. Configure Settings -> Credentials -> " +
            "Admin Allowlist as soon as possible.";

        log.LogError("Startup", message);
        Console.Error.WriteLine($"[SECURITY WARNING] {message}");
    }
}

//
// Run
//
app.Run();
