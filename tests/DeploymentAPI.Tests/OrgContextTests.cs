using DeploymentAPI.Helpers;
using Xunit;

namespace DeploymentAPI.Tests;

// OrgContext.ParseHeader is the exact three-way branch that keeps a
// Personal-context request byte-for-byte identical to pre-organizations
// behavior (see the plan's own framing of this as the single most
// important safety property of the whole Phase 5/2 rollout) - missing
// header or "personal" must never accidentally fall through to the real-
// organization branch, and an invalid header must never be silently
// treated as Personal (that would let a typo'd/malicious header bypass
// organization membership checks by accident).
public class OrgContextTests
{
    [Fact]
    public void NullHeader_IsPersonal()
    {
        var result = OrgContext.ParseHeader(null);

        Assert.Equal(OrganizationHeaderKind.Personal, result.Kind);
        Assert.Null(result.OrganizationId);
    }

    [Fact]
    public void EmptyHeader_IsPersonal()
    {
        var result = OrgContext.ParseHeader(string.Empty);

        Assert.Equal(OrganizationHeaderKind.Personal, result.Kind);
    }

    [Theory]
    [InlineData("personal")]
    [InlineData("Personal")]
    [InlineData("PERSONAL")]
    public void LiteralPersonal_IsCaseInsensitive(string header)
    {
        var result = OrgContext.ParseHeader(header);

        Assert.Equal(OrganizationHeaderKind.Personal, result.Kind);
    }

    [Fact]
    public void ValidGuid_IsOrganizationWithThatId()
    {
        var id = Guid.NewGuid();

        var result = OrgContext.ParseHeader(id.ToString());

        Assert.Equal(OrganizationHeaderKind.Organization, result.Kind);
        Assert.Equal(id, result.OrganizationId);
    }

    [Theory]
    [InlineData("not-a-guid")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("00000000-0000-0000-0000-00000000000")] // one digit short
    public void GarbageHeader_IsInvalid_NeverSilentlyPersonal(string header)
    {
        var result = OrgContext.ParseHeader(header);

        Assert.Equal(OrganizationHeaderKind.Invalid, result.Kind);
        Assert.Null(result.OrganizationId);
    }
}
