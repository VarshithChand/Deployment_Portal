using AdminAPI.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<UserStore>();

// Same-origin via vite.config.js's proxy (dev) or nginx.conf (Docker)
// needs no CORS at all - this only matters once the portal frontend and
// this API are on different origins (e.g. a Cloudflare-hosted frontend
// calling a separately hosted AdminAPI), which is why it's opt-in via
// config rather than AllowAnyOrigin. Credentials require a specific
// origin list per the CORS spec, same as DeploymentAPI's own policy.
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

var app = builder.Build();

// Configure pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors("ReactPolicy");

app.UseAuthorization();

app.MapControllers();

app.MapGet("/", () => "Admin API Running");

app.Run();