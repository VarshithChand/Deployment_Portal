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
# root) since the app itself only ever needs to read them, not write.
USER $APP_UID

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
    CMD curl -fs http://localhost:8080/api/settings || exit 1

ENTRYPOINT ["dotnet", "DeploymentAPI.dll"]
