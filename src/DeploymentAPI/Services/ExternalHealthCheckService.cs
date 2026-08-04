using System.Diagnostics;
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
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);
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

        var client = _httpClientFactory.CreateClient();
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
        }
        catch (TaskCanceledException)
        {
            result.Error = $"Timed out after {RequestTimeout.TotalSeconds:0}s.";
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        return result;
    }
}
