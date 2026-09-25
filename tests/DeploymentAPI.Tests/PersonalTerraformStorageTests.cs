using DeploymentAPI.DTOs;
using DeploymentAPI.Models;
using DeploymentAPI.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DeploymentAPI.Tests;

// Exercises SettingsService's personal (non-org) Terraform file storage
// directly - the exact layer TerraformController.UploadFiles/ListFiles/
// GetFile call - against a real temp JSON file, bypassing HTTP and the
// full login flow entirely (this app has no WebApplicationFactory-based
// integration test infra yet). Each test gets its own SETTINGS_FILE_PATH
// so they can run without colliding.
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
    public async Task UploadThenList_RoundTripsAFlatFile()
    {
        const string userId = "usr_test1";

        var results = await _settings.UploadUserTerraformFilesAsync(userId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "resource \"azurerm_resource_group\" \"x\" {}" }
        });

        Assert.Single(results);
        Assert.True(results[0].Accepted, results[0].Error);

        var files = await _settings.ListUserTerraformFilesAsync(userId);

        Assert.Single(files);
        Assert.Equal("main.tf", files[0].FileName);
        Assert.True(files[0].ContentLength > 0);
    }

    [Fact]
    public async Task UploadThenGet_RoundTripsANestedPath()
    {
        const string userId = "usr_test2";

        var results = await _settings.UploadUserTerraformFilesAsync(userId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "modules/network/main.tf", Content = "# network module" }
        });

        Assert.True(results[0].Accepted, results[0].Error);

        var detail = await _settings.GetUserTerraformFileAsync(userId, "modules/network/main.tf");

        Assert.NotNull(detail);
        Assert.Equal("# network module", detail!.Content);
    }

    [Fact]
    public async Task Upload_IsIsolatedPerUser()
    {
        await _settings.UploadUserTerraformFilesAsync("usr_a", new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "# a" }
        });

        var filesForOtherUser = await _settings.ListUserTerraformFilesAsync("usr_b");

        Assert.Empty(filesForOtherUser);
    }

    [Fact]
    public async Task Upload_RejectsAnInvalidFileNameButAcceptsTheRest()
    {
        const string userId = "usr_test3";

        var results = await _settings.UploadUserTerraformFilesAsync(userId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "# ok" },
            new() { FileName = "../../etc/passwd.tf", Content = "# bad" }
        });

        Assert.Equal(2, results.Count);
        Assert.True(results.Single(r => r.FileName == "main.tf").Accepted);
        Assert.False(results.Single(r => r.FileName == "../../etc/passwd.tf").Accepted);

        var files = await _settings.ListUserTerraformFilesAsync(userId);
        Assert.Single(files);
    }

    [Fact]
    public async Task ReUpload_UpsertsRatherThanDuplicating()
    {
        const string userId = "usr_test4";

        await _settings.UploadUserTerraformFilesAsync(userId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "v1" }
        });

        await _settings.UploadUserTerraformFilesAsync(userId, new List<TerraformFileUploadEntryDto>
        {
            new() { FileName = "main.tf", Content = "v2" }
        });

        var files = await _settings.ListUserTerraformFilesAsync(userId);
        Assert.Single(files);

        var detail = await _settings.GetUserTerraformFileAsync(userId, "main.tf");
        Assert.Equal("v2", detail!.Content);
    }
}
