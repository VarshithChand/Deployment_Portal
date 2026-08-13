namespace DeploymentAPI.DTOs.Common;

// The standard envelope every controller action's response now goes
// through - applied globally by Filters/ApiResponseWrapperFilter, not by
// hand at each of the ~90 action methods (they keep returning bare
// Ok(dto)/BadRequest(new{message}) exactly as before; the filter is the one
// seam this whole contract goes through). See ApiErrorResponse for the
// failure-path counterpart.
public class ApiResponse<T>
{
    public bool Success { get; set; } = true;

    public T? Data { get; set; }
}

public class ApiErrorResponse
{
    public bool Success { get; set; } = false;

    public ApiError Error { get; set; } = new();
}

public class ApiError
{
    public string Code { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    // Ties a generic client-facing message back to the exact server-side
    // log entry (Activity Log + stderr) - same TraceIdentifier-based value
    // GlobalExceptionHandler already stamps as X-Correlation-Id on every
    // response (see Program.cs's correlation-ID middleware).
    public string? CorrelationId { get; set; }
}
