using DeploymentAPI.Helpers;
using Xunit;

namespace DeploymentAPI.Tests;

public class TerraformFileNamingTests
{
    [Theory]
    [InlineData("main.tf")]
    [InlineData("outputs.tf.json")]
    [InlineData("modules/network/main.tf")]
    [InlineData("modules/network/subnets/main.tf")]
    [InlineData("network-config_v2.tf")]
    public void ValidateRelativePath_AcceptsWellFormedPaths(string path)
    {
        var (valid, error, normalized) = TerraformFileNaming.ValidateRelativePath(path);

        Assert.True(valid);
        Assert.Null(error);
        Assert.Equal(path, normalized);
    }

    [Fact]
    public void ValidateRelativePath_NormalizesBackslashes()
    {
        var (valid, _, normalized) = TerraformFileNaming.ValidateRelativePath(@"modules\network\main.tf");

        Assert.True(valid);
        Assert.Equal("modules/network/main.tf", normalized);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("../../etc/passwd.tf")]
    [InlineData("modules/../../../etc/passwd.tf")]
    [InlineData("/main.tf")]
    [InlineData("main.tf/")]
    [InlineData("modules//main.tf")]
    [InlineData("modules/./main.tf")]
    [InlineData("main.txt")]
    [InlineData("modules/<script>/main.tf")]
    public void ValidateRelativePath_RejectsAnythingOutsideTheAllowedShape(string? path)
    {
        var (valid, error, normalized) = TerraformFileNaming.ValidateRelativePath(path);

        Assert.False(valid);
        Assert.NotNull(error);
        Assert.Null(normalized);
    }

    [Fact]
    public void ValidateRelativePath_RejectsExcessivelyDeepNesting()
    {
        var path = string.Join("/", Enumerable.Repeat("a", 13)) + "/main.tf";

        var (valid, _, _) = TerraformFileNaming.ValidateRelativePath(path);

        Assert.False(valid);
    }

    // ValidateFileName (the org-scoped, flat-only validator) must stay
    // exactly as strict as before - "sub/dir/main.tf" is still rejected
    // there even though ValidateRelativePath now accepts it, since these
    // are two genuinely separate invariants for two separate features.
    [Fact]
    public void ValidateFileName_StillRejectsPathsWithDirectorySeparators()
    {
        var (valid, error) = TerraformFileNaming.ValidateFileName("sub/dir/main.tf");

        Assert.False(valid);
        Assert.NotNull(error);
    }
}
