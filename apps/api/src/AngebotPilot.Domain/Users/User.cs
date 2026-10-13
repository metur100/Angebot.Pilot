using AngebotPilot.Domain.Common;

namespace AngebotPilot.Domain.Users;

public sealed class User : Entity
{
    public required string Email { get; set; }

    /// <summary>Upper-invariant email used for unique lookups.</summary>
    public required string NormalizedEmail { get; set; }

    public required string DisplayName { get; set; }

    public string PasswordHash { get; set; } = string.Empty;

    public DateTimeOffset? EmailVerifiedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }

    /// <summary>Consecutive failed logins, used for temporary lockout.</summary>
    public int FailedLoginCount { get; set; }

    public DateTimeOffset? LockedUntil { get; set; }

    /// <summary>Changes whenever credentials change; existing refresh tokens become invalid.</summary>
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    public bool IsDisabled { get; set; }

    /// <summary>UI language preference ("de" or "en"); also the language of account emails and notifications.</summary>
    public string Language { get; set; } = Loc.German;

    public static string Normalize(string email) => email.Trim().ToUpperInvariant();
}

public sealed class RefreshToken : Entity
{
    public Guid UserId { get; set; }

    public User? User { get; set; }

    /// <summary>SHA-256 of the opaque token. The raw token is never stored.</summary>
    public required string TokenHash { get; set; }

    /// <summary>All tokens issued by rotation from the same login share a family; reuse revokes the family.</summary>
    public Guid FamilyId { get; set; }

    public ClientKind Client { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public string? RevokedReason { get; set; }

    public Guid? ReplacedByTokenId { get; set; }

    public Guid SecurityStamp { get; set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}

/// <summary>One-time token for email verification or password reset.</summary>
public sealed class UserToken : Entity
{
    public Guid UserId { get; set; }

    public User? User { get; set; }

    public UserTokenPurpose Purpose { get; set; }

    public required string TokenHash { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? UsedAt { get; set; }
}
