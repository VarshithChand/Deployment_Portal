using System.Security.Cryptography;
using System.Text;
using DeploymentAPI.Configuration;
using DeploymentAPI.Helpers;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
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

builder.Services.Configure<AuthorizationSettings>(
    builder.Configuration.GetSection("Auth"));

//
// HttpContext access from within services (GitHubAuthService reads the
// current request's logged-in user to resolve their own GitHub credentials)
//
builder.Services.AddHttpContextAccessor();

//
// Controllers
//
builder.Services.AddControllers();

//
// Swagger
//
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

//
// HttpClient
//
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

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
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<SonarApiService>();
builder.Services.AddScoped<SmokeTestService>();
builder.Services.AddScoped<ExternalHealthCheckService>();
builder.Services.AddScoped<ErrorAnalysisService>();
builder.Services.AddScoped<PipelineExplanationService>();
// Stateless (holds a static shared HttpClient for the Azure REST calls,
// same reuse rationale as DockerApiService) — every AWS/Azure credential
// it uses is passed in per-call, never held on the instance itself.
builder.Services.AddSingleton<CloudStatusService>();
// Its only state is IMemoryCache-backed pending sign-ins, already a
// Singleton itself - safe to share the same way.
builder.Services.AddSingleton<AwsSsoService>();

// Backs the Services page's "Security (SecurityAPI)" tab's API Keys
// panel — the one sample-data panel left on that page without a real
// portal equivalent to point at instead (Users/Projects/Audit Log now
// read PAT users, Environments, and the real activity log respectively -
// see AdminUsersController/PmsCoreProjectsController/SecurityAuditLogController).
builder.Services.AddSingleton<ApiKeyStore>();

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
// Error handling — surface GitHub API failures (rate limits, 404s, etc.) as a
// clean JSON message instead of an unhandled 500 with no body reaching the UI.
// Also the one place every request passes through, so it's where failures
// get recorded for the Settings page's activity log.
//
var activityLog = app.Services.GetRequiredService<ActivityLogService>();

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (HttpRequestException ex)
    {
        activityLog.LogError("GitHub API", ex.Message);

        context.Response.StatusCode = (int?)ex.StatusCode ?? StatusCodes.Status502BadGateway;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
    catch (Exception ex)
    {
        // Logged, then rethrown unchanged — this middleware isn't meant to
        // change how unexpected errors are handled, only to make sure
        // they're visible somewhere besides the server's own console.
        activityLog.LogError("Server", ex.Message);
        throw;
    }
});

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

    await next();
});

//
// Swagger
// Enabled in every environment (not just Development) so the API surface
// is checkable on the deployed instance too - it only documents request/
// response shapes, the same ones already visible to anyone using the
// portal's own frontend; every actual action still goes through the same
// AdminGate/auth checks regardless of whether it was called via Swagger
// or the real UI.
//
app.UseSwagger();
app.UseSwaggerUI();

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
// Session activity — records that this browser/device (see PortalIdentity)
// made a request just now (Services page's Users tab shows this as "Last
// Active"), and rejects outright if an admin has blocked this specific
// session (see SettingsService.BlockPatUserAsync) - stronger than clearing
// their credentials, since a blocked session is refused even with a still-
// valid token. Runs before auth/controllers so a blocked session can't
// reach anything at all, not just admin-gated routes.
//
app.Use(async (context, next) =>
{
    var key = PortalIdentity.GetOrCreateKey(context);

    var settings = context.RequestServices.GetRequiredService<SettingsService>();

    if (await settings.IsPatUserBlockedAsync(key))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { message = "This session has been blocked by the portal admin." });
        return;
    }

    var userAgent = context.Request.Headers.UserAgent.ToString();
    var ipAddress = context.Connection.RemoteIpAddress?.ToString();
    context.RequestServices.GetRequiredService<SessionActivityService>().Touch(key, userAgent, ipAddress);

    await next();
});

//
// Authentication / Authorization
//
app.UseAuthentication();
app.UseAuthorization();

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
// Controllers
//
app.MapControllers();

//
// Run
//
app.Run();
