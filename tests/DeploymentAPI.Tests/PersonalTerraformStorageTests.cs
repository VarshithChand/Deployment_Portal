using DeploymentAPI.DTOs;
using DeploymentAPI.Models;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DeploymentAPI.Tests;

// Exercises SettingsService's personal (non-org) Terraform PROJECT storage
// directly - the exact layer TerraformController's projects/* actions call -
// against a real temp JSON file, bypassing HTTP and the full login flow
// entirely (this app has no WebApplicationFactory-based integration test
// infra yet). Each test gets its own SETTINGS_FILE_PATH so they can run
// without colliding.
public class PersonalTerraformStorageTests : IDisposable
{
    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string ApplicationName { get; set; } = "DeploymentAPI.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public string EnvironmentName { get; set; } = "Development";
    }

    private readonly string _tempFile;
    private readonly string? _previousSettingsPath;
    private readonly SettingsService _settings;

    public PersonalTerraformStorageTests()
    {
        _tempFile = Path.Combine(Path.GetTempPath(), $"tf-storage-test-{Guid.NewGuid():N}.json");

        _previousSettingsPath = Environment.GetEnvironmentVariable("SETTINGS_FILE_PATH");
        Environment.SetEnvironmentVariable("SETTINGS_FILE_PATH", _tempFile);

        var dataProtection = DataProtectionProvider.Create("DeploymentAPI.Tests.PersonalTerraform");

        _settings = new SettingsService(
            new FakeHostEnvironment(),
            new ActivityLogService(),
            dataProtection,
            new SessionActivityService(),
            new PasswordHasher<PortalUserAccount>());
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("SETTINGS_FILE_PATH", _previousSettingsPath);

        if (File.Exists(_tempFile))
            File.Delete(_tempFile);
    }

    [Fact]
    public async Task CreateProject_RoundTripsAFlatFile()
    {
        const string userId = "usr_test1";

        var (success, error, project, fileResults) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App Creation", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "resource \"azurerm_resource_group\" \"x\" {}" }
            });

        Assert.True(success, error);
        Assert.NotNull(project);
        Assert.Equal("Web App Creation", project!.Name);
        Assert.Single(project.Files);
        Assert.True(fileResults[0].Accepted, fileResults[0].Error);

        var projects = await _settings.ListUserTerraformProjectsAsync(userId);
        Assert.Single(projects);
        Assert.Equal(project.ProjectId, projects[0].ProjectId);
    }

    [Fact]
    public async Task CreateProject_RequiresAName()
    {
        var (success, error, project, _) = await _settings.CreateUserTerraformProjectAsync(
            "usr_test", "   ", new List<TerraformFileUploadEntryDto>());

        Assert.False(success);
        Assert.NotNull(error);
        Assert.Null(project);
    }

    [Fact]
    public async Task UploadThenGet_RoundTripsANestedPath()
    {
        const string userId = "usr_test2";

        var (_, _, project, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Cluster Infra", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "modules/network/main.tf", Content = "# network module" }
            });

        var detail = await _settings.GetProjectFileAsync(userId, project!.ProjectId, "modules/network/main.tf");

        Assert.NotNull(detail);
        Assert.Equal("# network module", detail!.Content);
    }

    [Fact]
    public async Task Projects_AreIsolatedPerUser()
    {
        await _settings.CreateUserTerraformProjectAsync(
            "usr_a", "Project A", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "# a" }
            });

        var projectsForOtherUser = await _settings.ListUserTerraformProjectsAsync("usr_b");

        Assert.Empty(projectsForOtherUser);
    }

    [Fact]
    public async Task TwoProjects_CanEachHaveTheirOwnSameNamedFile()
    {
        const string userId = "usr_test3";

        var (_, _, projectA, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "# web app version" }
            });

        var (_, _, projectB, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Cluster Infra", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "# cluster version" }
            });

        var fileA = await _settings.GetProjectFileAsync(userId, projectA!.ProjectId, "main.tf");
        var fileB = await _settings.GetProjectFileAsync(userId, projectB!.ProjectId, "main.tf");

        Assert.Equal("# web app version", fileA!.Content);
        Assert.Equal("# cluster version", fileB!.Content);

        var projects = await _settings.ListUserTerraformProjectsAsync(userId);
        Assert.Equal(2, projects.Count);
    }

    [Fact]
    public async Task Upload_AcceptsWidenedFileTypesLikeTfvarsAndMarkdown()
    {
        const string userId = "usr_test4";

        var (success, _, project, fileResults) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "# tf" },
                new() { FileName = "terraform.tfvars", Content = "location = \"eastus\"" },
                new() { FileName = "README.md", Content = "# docs" },
                new() { FileName = ".gitignore", Content = ".terraform/" },
                new() { FileName = "notes.txt", Content = "not allowed" }
            });

        Assert.True(success);
        Assert.Equal(4, project!.Files.Count);
        Assert.True(fileResults.Single(r => r.FileName == "notes.txt").Accepted == false);
    }

    [Fact]
    public async Task UploadFilesToProject_RejectsAnInvalidPathButAcceptsTheRest()
    {
        const string userId = "usr_test5";

        var (_, _, project, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "# ok" }
            });

        var results = await _settings.UploadFilesToProjectAsync(userId, project!.ProjectId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "variables.tf", Content = "# ok too" },
            new() { FileName = "../../etc/passwd.tf", Content = "# bad" }
        });

        Assert.NotNull(results);
        Assert.True(results!.Single(r => r.FileName == "variables.tf").Accepted);
        Assert.False(results.Single(r => r.FileName == "../../etc/passwd.tf").Accepted);

        var detail = await _settings.GetUserTerraformProjectAsync(userId, project.ProjectId);
        Assert.Equal(2, detail!.Files.Count);
    }

    [Fact]
    public async Task UploadFilesToProject_ReturnsNullForAMissingProject()
    {
        var results = await _settings.UploadFilesToProjectAsync(
            "usr_test6", Guid.NewGuid(), new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "x" }
            });

        Assert.Null(results);
    }

    [Fact]
    public async Task ReUpload_UpsertsRatherThanDuplicating()
    {
        const string userId = "usr_test7";

        var (_, _, project, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "v1" }
            });

        await _settings.UploadFilesToProjectAsync(userId, project!.ProjectId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "v2" }
        });

        var detail = await _settings.GetUserTerraformProjectAsync(userId, project.ProjectId);
        Assert.Single(detail!.Files);

        var file = await _settings.GetProjectFileAsync(userId, project.ProjectId, "main.tf");
        Assert.Equal("v2", file!.Content);
    }

    [Fact]
    public async Task DeleteProject_RemovesItAndItsFiles()
    {
        const string userId = "usr_test8";

        var (_, _, project, _) = await _settings.CreateUserTerraformProjectAsync(
            userId, "Web App", new List<TerraformFileUploadEntryDto>
            {
                new() { FileName = "main.tf", Content = "x" }
            });

        var deleted = await _settings.DeleteUserTerraformProjectAsync(userId, project!.ProjectId);
        Assert.True(deleted);

        Assert.Empty(await _settings.ListUserTerraformProjectsAsync(userId));
        Assert.Null(await _settings.GetUserTerraformProjectAsync(userId, project.ProjectId));
    }
}
