FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY DeploymentAPI.csproj ./
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# curl for the HEALTHCHECK below — docker-compose uses this to know when
# the API is actually ready to serve requests, not just that the process
# has started, so the frontend container doesn't come up and start
# proxying to a backend that isn't listening yet.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# $APP_UID is a non-root user (UID 64198) the official aspnet image already
# creates for exactly this — switched to after copying files (which needs
# root). Unlike the other three APIs' in-memory-only stores, this one's
# SettingsService actually creates/writes appsettings.Local.json under
# this same WORKDIR at runtime (it's gitignored, so it's never in the
# image to begin with) - without this chown, $APP_UID has no permission
# to create that file at all and the app crashes on its very first boot
# whenever DATABASE_URL is set (confirmed in production: "Access to the
# path '/app/appsettings.Local.json' is denied").
RUN chown -R $APP_UID:$APP_UID /app

USER $APP_UID

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
    CMD curl -fs http://localhost:8080/api/settings || exit 1

ENTRYPOINT ["dotnet", "DeploymentAPI.dll"]
