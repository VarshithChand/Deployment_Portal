using DeploymentAPI.Services;
using Microsoft.AspNetCore.Diagnostics;

namespace DeploymentAPI.Helpers;

// The backstop for every exception that reaches ASP.NET Core's own pipeline
// without already having been caught and turned into a safe DTO by the
// controller/service that threw it (see CloudErrorSanitizer and friends for
// the ones that ARE caught close to the source). Nothing here should ever
// reach the client as raw exception text - the message and stack trace go
// to the server-side log (both the in-memory Activity Log admins can see at
// Settings -> Logs, and stderr, which Render's own log aggregation
// captures), and the client gets a generic message plus a correlation ID it
// can quote back for a real investigation.
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ActivityLogService _log;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ActivityLogService log, ILogger<GlobalExceptionHandler> logger)
    {
        _log = log;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var correlationId = httpContext.TraceIdentifier;

        _logger.LogError(exception, "Unhandled exception for {Method} {Path} (correlation {CorrelationId})",
            httpContext.Request.Method, httpContext.Request.Path, correlationId);

        _log.LogError("Server",
            $"Unhandled {exception.GetType().Name} at {httpContext.Request.Method} {httpContext.Request.Path} (correlation {correlationId}).");

        var (statusCode, code, message) = Classify(exception);

        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.Headers["X-Correlation-Id"] = correlationId;
        httpContext.Response.ContentType = "application/json";

        await httpContext.Response.WriteAsJsonAsync(new
        {
            error = message,
            code,
            correlationId
        }, cancellationToken);

        return true;
    }

    private static (int StatusCode, string Code, string Message) Classify(Exception exception) => exception switch
    {
        HttpRequestException httpEx => (
            (int?)httpEx.StatusCode ?? StatusCodes.Status502BadGateway,
            "UPSTREAM_REQUEST_FAILED",
            "Unable to reach an external service."),
        _ => (
            StatusCodes.Status500InternalServerError,
            "INTERNAL_ERROR",
            "Unable to complete the requested operation.")
    };
}
