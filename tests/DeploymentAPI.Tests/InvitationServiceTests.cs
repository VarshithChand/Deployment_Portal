using DeploymentAPI.Services;
using Xunit;

namespace DeploymentAPI.Tests;

public class InvitationServiceTests
{
    [Fact]
    public void ComputeTokenHash_IsDeterministic()
    {
        var token = "a1b2c3d4e5f6";

        var first = InvitationService.ComputeTokenHash(token);
        var second = InvitationService.ComputeTokenHash(token);

        Assert.Equal(first, second);
    }

    [Fact]
    public void ComputeTokenHash_DifferentTokensProduceDifferentHashes()
    {
        var hashA = InvitationService.ComputeTokenHash("token-a");
        var hashB = InvitationService.ComputeTokenHash("token-b");

        Assert.NotEqual(hashA, hashB);
    }

    [Fact]
    public void ComputeTokenHash_NeverReturnsTheRawTokenItself()
    {
        // The whole point of hashing before storage (see InvitationService's
        // own header comment on this being a deliberate strengthening over
        // the plaintext-stored email-verification/password-reset tokens) -
        // a regression here would mean the raw, bearer-usable token ends up
        // sitting in the database same as the value this method returns.
        var token = "super-secret-raw-token-value";

        var hash = InvitationService.ComputeTokenHash(token);

        Assert.NotEqual(token, hash);
        Assert.Equal(64, hash.Length); // SHA-256, hex-encoded
    }

    [Fact]
    public void ComputeTokenHash_IsLowercaseHex()
    {
        var hash = InvitationService.ComputeTokenHash("Mixed-Case-Input");

        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Theory]
    [InlineData("pending", 1, true)]   // expires in the future
    [InlineData("pending", -1, false)] // already expired
    [InlineData("accepted", 1, false)] // already used
    [InlineData("revoked", 1, false)]
    [InlineData("expired", 1, false)]
    public void IsAcceptable_MirrorsTheAcceptAsyncSqlPredicate(string status, int hoursFromNow, bool expected)
    {
        var now = DateTime.UtcNow;
        var expiresAt = now.AddHours(hoursFromNow);

        Assert.Equal(expected, InvitationService.IsAcceptable(status, expiresAt, now));
    }
}
