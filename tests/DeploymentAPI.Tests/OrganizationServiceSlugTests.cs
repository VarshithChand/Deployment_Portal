using DeploymentAPI.Services;
using Xunit;

namespace DeploymentAPI.Tests;

public class OrganizationServiceSlugTests
{
    [Theory]
    [InlineData("Acme Organization", "acme-organization")]
    [InlineData("FTH VIPS Cloud PMS", "fth-vips-cloud-pms")]
    [InlineData("  Leading And Trailing Spaces  ", "leading-and-trailing-spaces")]
    [InlineData("Already-Slugged", "already-slugged")]
    public void SlugifyBase_LowercasesAndDashesSpaces(string input, string expected)
    {
        Assert.Equal(expected, OrganizationService.SlugifyBase(input));
    }

    [Theory]
    [InlineData("Acme, Inc.!")]
    [InlineData("100% Cloud & Co.")]
    public void SlugifyBase_StripsPunctuation(string input)
    {
        var slug = OrganizationService.SlugifyBase(input);

        Assert.Matches("^[a-z0-9-]+$", slug);
    }

    [Theory]
    [InlineData("!!!")]
    [InlineData("   ")]
    [InlineData("")]
    public void SlugifyBase_FallsBackToOrg_WhenNothingSurvivesCleanup(string input)
    {
        Assert.Equal("org", OrganizationService.SlugifyBase(input));
    }

    [Fact]
    public void SlugifyBase_CapsLengthAtFiftyCharacters()
    {
        var longName = new string('a', 200);

        var slug = OrganizationService.SlugifyBase(longName);

        Assert.True(slug.Length <= 50, $"Expected slug length <= 50, was {slug.Length}");
    }

    [Fact]
    public void SlugifyBase_NeverReturnsEmpty()
    {
        // A name that survives cleanup but is entirely hyphens at the
        // truncation boundary - the "-" trim after the length cap must not
        // leave an empty string.
        var input = new string('-', 60);

        var slug = OrganizationService.SlugifyBase(input);

        Assert.False(string.IsNullOrWhiteSpace(slug));
    }
}
