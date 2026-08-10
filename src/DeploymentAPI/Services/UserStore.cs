using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Backs the Services page's "Users (AdminAPI)" tab — in-memory only, like
// this API's own settings/log stores, seeded with a few rows on startup
// and reset on restart. Was originally a separate AdminAPI project; folded
// in here so the Services page never needs a second, separately-hosted
// origin (with its own CORS/deployment) just to demo an admin panel.
public class UserStore
{
    private readonly object _lock = new();
    private readonly List<UserAccount> _users = new();
    private int _nextId = 1;

    public UserStore()
    {
        Add(new CreateUserRequest { Username = "vvarshithchand", Email = "varshith@example.com", Role = "Admin" });
        Add(new CreateUserRequest { Username = "j.doe", Email = "jane.doe@example.com", Role = "Manager" });
        Add(new CreateUserRequest { Username = "guest", Email = "guest@example.com", Role = "Viewer" });
    }

    public List<UserAccount> GetAll()
    {
        lock (_lock)
        {
            return _users.OrderBy(u => u.Id).ToList();
        }
    }

    public UserAccount? GetById(int id)
    {
        lock (_lock)
        {
            return _users.FirstOrDefault(u => u.Id == id);
        }
    }

    public UserAccount Add(CreateUserRequest request)
    {
        lock (_lock)
        {
            var user = new UserAccount
            {
                Id = _nextId++,
                Username = request.Username,
                Email = request.Email,
                Role = string.IsNullOrWhiteSpace(request.Role) ? "Viewer" : request.Role,
                Active = true,
                CreatedAt = DateTime.UtcNow
            };

            _users.Add(user);
            return user;
        }
    }

    public UserAccount? Update(int id, UpdateUserRequest request)
    {
        lock (_lock)
        {
            var user = _users.FirstOrDefault(u => u.Id == id);
            if (user is null) return null;

            if (request.Email is not null) user.Email = request.Email;
            if (request.Role is not null) user.Role = request.Role;
            if (request.Active is not null) user.Active = request.Active.Value;

            return user;
        }
    }

    public bool Remove(int id)
    {
        lock (_lock)
        {
            return _users.RemoveAll(u => u.Id == id) > 0;
        }
    }
}
