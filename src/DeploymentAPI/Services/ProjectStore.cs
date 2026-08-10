using DeploymentAPI.DTOs;

namespace DeploymentAPI.Services;

// Backs the Services page's "Projects (PMSCoreAPI)" tab — see UserStore
// for why this lives here instead of a separately-hosted origin.
public class ProjectStore
{
    private readonly object _lock = new();
    private readonly List<Project> _projects = new();
    private readonly List<ProjectTask> _tasks = new();
    private int _nextProjectId = 1;
    private int _nextTaskId = 1;

    public ProjectStore()
    {
        var portal = AddProject(new CreateProjectRequest
        {
            Name = "Deployment Portal",
            Description = "The CI/CD dashboard itself."
        });
        UpdateProject(portal.Id, new UpdateProjectRequest { Status = "Active" });

        AddTask(portal.Id, new CreateTaskRequest { Title = "Wire up Docker management page", Assignee = "vvarshithchand" });
        AddTask(portal.Id, new CreateTaskRequest { Title = "Add release notes to History page", Assignee = "j.doe" });

        var migration = AddProject(new CreateProjectRequest
        {
            Name = "Sample Services Cleanup",
            Description = "AdminAPI / PMSCoreAPI / SecurityAPI — fill in real endpoints."
        });
        UpdateProject(migration.Id, new UpdateProjectRequest { Status = "Planning" });
    }

    // ---------- Projects ----------

    public List<Project> GetAllProjects()
    {
        lock (_lock)
        {
            return _projects.OrderBy(p => p.Id).ToList();
        }
    }

    public Project? GetProject(int id)
    {
        lock (_lock)
        {
            return _projects.FirstOrDefault(p => p.Id == id);
        }
    }

    public Project AddProject(CreateProjectRequest request)
    {
        lock (_lock)
        {
            var project = new Project
            {
                Id = _nextProjectId++,
                Name = request.Name,
                Description = request.Description,
                Status = "Planning",
                CreatedAt = DateTime.UtcNow
            };

            _projects.Add(project);
            return project;
        }
    }

    public Project? UpdateProject(int id, UpdateProjectRequest request)
    {
        lock (_lock)
        {
            var project = _projects.FirstOrDefault(p => p.Id == id);
            if (project is null) return null;

            if (request.Name is not null) project.Name = request.Name;
            if (request.Description is not null) project.Description = request.Description;
            if (request.Status is not null) project.Status = request.Status;

            return project;
        }
    }

    public bool RemoveProject(int id)
    {
        lock (_lock)
        {
            _tasks.RemoveAll(t => t.ProjectId == id);
            return _projects.RemoveAll(p => p.Id == id) > 0;
        }
    }

    // ---------- Tasks ----------

    public List<ProjectTask> GetTasksForProject(int projectId)
    {
        lock (_lock)
        {
            return _tasks.Where(t => t.ProjectId == projectId).OrderBy(t => t.Id).ToList();
        }
    }

    public ProjectTask? GetTask(int taskId)
    {
        lock (_lock)
        {
            return _tasks.FirstOrDefault(t => t.Id == taskId);
        }
    }

    public ProjectTask? AddTask(int projectId, CreateTaskRequest request)
    {
        lock (_lock)
        {
            if (!_projects.Any(p => p.Id == projectId)) return null;

            var task = new ProjectTask
            {
                Id = _nextTaskId++,
                ProjectId = projectId,
                Title = request.Title,
                Assignee = request.Assignee,
                Status = "Todo",
                DueDate = request.DueDate
            };

            _tasks.Add(task);
            return task;
        }
    }

    public ProjectTask? UpdateTask(int taskId, UpdateTaskRequest request)
    {
        lock (_lock)
        {
            var task = _tasks.FirstOrDefault(t => t.Id == taskId);
            if (task is null) return null;

            if (request.Title is not null) task.Title = request.Title;
            if (request.Assignee is not null) task.Assignee = request.Assignee;
            if (request.Status is not null) task.Status = request.Status;
            if (request.DueDate is not null) task.DueDate = request.DueDate;

            return task;
        }
    }

    public bool RemoveTask(int taskId)
    {
        lock (_lock)
        {
            return _tasks.RemoveAll(t => t.Id == taskId) > 0;
        }
    }
}
