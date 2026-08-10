using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Backs the Services page's "Security (SecurityAPI)" tab's Audit Log
// panel — see UserStore for why this lives here instead of a separately-
// hosted origin.
public class AuditLogStore
{
    private readonly object _lock = new();
    private readonly List<AuditLogEntry> _entries = new();
    private int _nextId = 1;

    public AuditLogStore()
    {
        Add(new CreateAuditLogRequest { Actor = "vvarshithchand", Action = "login", Resource = "SecurityAPI", Outcome = "Success" });
        Add(new CreateAuditLogRequest { Actor = "unknown", Action = "login", Resource = "SecurityAPI", Outcome = "Failure" });
    }

    public List<AuditLogEntry> GetRecent(int limit = 200)
    {
        lock (_lock)
        {
            return _entries
                .OrderByDescending(e => e.Timestamp)
                .Take(limit)
                .ToList();
        }
    }

    public AuditLogEntry Add(CreateAuditLogRequest request)
    {
        lock (_lock)
        {
            var entry = new AuditLogEntry
            {
                Id = _nextId++,
                Timestamp = DateTime.UtcNow,
                Actor = request.Actor,
                Action = request.Action,
                Resource = request.Resource,
                Outcome = string.IsNullOrWhiteSpace(request.Outcome) ? "Success" : request.Outcome
            };

            _entries.Add(entry);
            return entry;
        }
    }
}
