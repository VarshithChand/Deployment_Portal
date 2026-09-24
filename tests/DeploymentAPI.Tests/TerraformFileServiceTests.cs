using DeploymentAPI.Services;
using Xunit;

namespace DeploymentAPI.Tests;

public class TerraformFileServiceTests
{
    [Theory]
    [InlineData("main.tf")]
    [InlineData("variables.tf")]
    [InlineData("outputs.tf.json")]
    [InlineData("network-config_v2.tf")]
    public void ValidateFileName_AcceptsWellFormedTerraformFileNames(string fileName)
    {
        var (valid, error) = TerraformFileService.ValidateFileName(fileName);

        Assert.True(valid);
        Assert.Null(error);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ValidateFileName_RejectsMissingName(string? fileName)
    {
        var (valid, error) = TerraformFileService.ValidateFileName(fileName);

        Assert.False(valid);
        Assert.NotNull(error);
    }

    [Theory]
    [InlineData("main.txt")]        // wrong extension
    [InlineData("main")]            // no extension at all
    [InlineData("../../etc/passwd.tf")] // path traversal attempt
    [InlineData("sub/dir/main.tf")] // directory separator
    [InlineData("main .tf")]        // embedded space
    [InlineData("<script>.tf")]     // markup injection attempt
    public void ValidateFileName_RejectsAnythingOutsideTheAllowedShape(string fileName)
    {
        var (valid, error) = TerraformFileService.ValidateFileName(fileName);

        Assert.False(valid);
        Assert.NotNull(error);
    }

    [Fact]
    public void ValidateFileName_RejectsExcessivelyLongNames()
    {
        var fileName = new string('a', 250) + ".tf";

        var (valid, _) = TerraformFileService.ValidateFileName(fileName);

        Assert.False(valid);
    }
}
