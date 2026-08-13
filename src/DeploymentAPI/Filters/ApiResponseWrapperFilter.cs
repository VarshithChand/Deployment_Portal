using System.Reflection;
using DeploymentAPI.DTOs.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace DeploymentAPI.Filters;

// Applies the app-wide {success,data} / {success,error:{code,message,
// correlationId}} response envelope to every controller action, without
// touching any of the ~90 individual action methods - they keep returning
// bare Ok(dto), BadRequest(new { message = "..." }), NotFound(), etc.
// exactly as before (including every existing AdminGate.StatusCode(403,
// new {message=...}) call). This is the one seam the whole response
// contract goes through; the matching frontend seam is apiBase.js's
// response interceptor, which unwraps `data` back out (and flattens
// `error.message` back onto the top level) before any existing frontend
// code ever sees a response - so none of the ~50 frontend consumer files
// needed to change either.
//
// Deliberately does NOT touch: file downloads (DownloadArtifact's binary
// response), redirects (the GitHub OAuth login/callback flow), or a bare
// 204 No Content (which by HTTP spec shouldn't carry a body at all).
public class ApiResponseWrapperFilter : IAsyncResultFilter
{
    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        var correlationId = context.HttpContext.TraceIdentifier;

        context.Result = context.Result switch
        {
            FileResult or RedirectResult or LocalRedirectResult or RedirectToActionResult
                or ContentResult or NoContentResult or EmptyResult => context.Result,

            ObjectResult { StatusCode: null or >= 200 and < 300 } ok =>
                WrapSuccess(ok.Value, ok.StatusCode ?? StatusCodes.Status200OK),

            OkResult => WrapSuccess(null, StatusCodes.Status200OK),

            ObjectResult err =>
                WrapError(err.Value, err.StatusCode ?? StatusCodes.Status500InternalServerError, correlationId),

            IStatusCodeActionResult status =>
                WrapError(null, status.StatusCode ?? StatusCodes.Status500InternalServerError, correlationId),

            _ => context.Result
        };

        await next();
    }

    private static ObjectResult WrapSuccess(object? value, int statusCode) =>
        new(new ApiResponse<object?> { Success = true, Data = value }) { StatusCode = statusCode };

    private static ObjectResult WrapError(object? value, int statusCode, string correlationId)
    {
        var (code, message) = ExtractCodeAndMessage(value, statusCode);

        return new ObjectResult(new ApiErrorResponse
        {
            Success = false,
            Error = new ApiError { Code = code, Message = message, CorrelationId = correlationId }
        })
        { StatusCode = statusCode };
    }

    // Existing action methods almost universally already return
    // `new { message = "..." }` (some now `new { message, code }` after
    // earlier hardening passes) - reflection reads whatever shape is
    // already there rather than requiring every call site to be rewritten
    // to a specific type first.
    private static (string Code, string Message) ExtractCodeAndMessage(object? value, int statusCode)
    {
        if (value is ProblemDetails problem)
            return (DefaultCodeFor(statusCode), problem.Detail ?? problem.Title ?? DefaultMessageFor(statusCode));

        if (value == null)
            return (DefaultCodeFor(statusCode), DefaultMessageFor(statusCode));

        var type = value.GetType();

        var messageProp = type.GetProperty("message", BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance);
        var codeProp = type.GetProperty("code", BindingFlags.IgnoreCase | BindingFlags.Public | BindingFlags.Instance);

        var message = messageProp?.GetValue(value) as string;
        var code = codeProp?.GetValue(value) as string;

        return (code ?? DefaultCodeFor(statusCode), message ?? DefaultMessageFor(statusCode));
    }

    private static string DefaultCodeFor(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest => "VALIDATION_ERROR",
        StatusCodes.Status401Unauthorized => "AUTH_REQUIRED",
        StatusCodes.Status403Forbidden => "ACCESS_DENIED",
        StatusCodes.Status404NotFound => "NOT_FOUND",
        StatusCodes.Status409Conflict => "CONFLICT",
        StatusCodes.Status422UnprocessableEntity => "VALIDATION_ERROR",
        StatusCodes.Status429TooManyRequests => "RATE_LIMITED",
        >= 500 => "INTERNAL_ERROR",
        _ => "REQUEST_FAILED"
    };

    private static string DefaultMessageFor(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest => "The request was invalid.",
        StatusCodes.Status401Unauthorized => "Authentication is required.",
        StatusCodes.Status403Forbidden => "You don't have permission to do that.",
        StatusCodes.Status404NotFound => "That resource wasn't found.",
        StatusCodes.Status409Conflict => "That conflicts with the current state.",
        StatusCodes.Status422UnprocessableEntity => "The request couldn't be validated.",
        StatusCodes.Status429TooManyRequests => "Too many requests - try again shortly.",
        >= 500 => "Unable to complete the requested operation.",
        _ => "The request failed."
    };
}
