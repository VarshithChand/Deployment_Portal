namespace DeploymentAPI.DTOs;

// Durable, per-login escalating-lockout state (see
// Helpers/MfaLockoutPolicy.cs) - stored via SettingsService the same way
// every other per-login MFA fact is, specifically so a backend restart
// can't reset an in-progress escalation back to tier 0. Tier 0 means
// "never locked out" / "fully reset after a correct code" - the first
// real lockout moves this to 1.
public class MfaLockoutStateDto
{
    public int Tier { get; set; }

    public int AttemptsInTier { get; set; }

    public DateTime? LockedUntilUtc { get; set; }
}
