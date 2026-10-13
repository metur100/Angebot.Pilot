using System.Runtime.CompilerServices;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Users;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Application.Auth;

public sealed class AuthOptions
{
    public const string Section = "Auth";

    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(15);

    public TimeSpan RefreshTokenLifetime { get; set; } = TimeSpan.FromDays(30);

    /// <summary>"Body" (default; needed while web app and API are on different sites) or "Cookie" (HttpOnly, same-site deployments).</summary>
    public string WebRefreshTransport { get; set; } = "Body";

    public int MaxFailedLogins { get; set; } = 5;

    public TimeSpan LockoutDuration { get; set; } = TimeSpan.FromMinutes(15);

    public bool UseCookieTransport => string.Equals(WebRefreshTransport, "Cookie", StringComparison.OrdinalIgnoreCase);
}

public sealed record IssuedAccessToken(string Token, DateTimeOffset ExpiresAt);

/// <summary>Creates signed access tokens (JWT). Implemented in the API layer.</summary>
public interface IAccessTokenIssuer
{
    IssuedAccessToken Issue(User user);
}

public sealed record AuthResult(AuthResponse Response, string RefreshToken, DateTimeOffset RefreshExpiresAt, Guid RefreshTokenId);

public sealed class AuthService(
    IAppDbContext db,
    IAccessTokenIssuer tokenIssuer,
    IPasswordHasher<User> hasher,
    IEmailOutbox outbox,
    IEmailDispatchSignal dispatchSignal,
    IAuditLog audit,
    TimeProvider clock,
    IOptions<AuthOptions> authOptions,
    IOptions<AppOptions> appOptions,
    ILogger<AuthService> logger)
{
    /// <summary>Reuse of a just-rotated refresh token within this window is treated as a race, not as theft.</summary>
    public static readonly TimeSpan RotationGracePeriod = TimeSpan.FromSeconds(30);

    private readonly AuthOptions _auth = authOptions.Value;
    private readonly AppOptions _app = appOptions.Value;

    public async Task<AuthResult> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var normalized = User.Normalize(request.Email);
        if (await db.Users.AnyAsync(u => u.NormalizedEmail == normalized, ct))
        {
            throw new ConflictException("email_taken", Loc.T(
                "Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an oder setzen Sie Ihr Passwort zurück.",
                "An account already exists for this email address. Please sign in or reset your password."));
        }

        var now = clock.GetUtcNow();
        var user = new User
        {
            Email = request.Email.Trim(),
            NormalizedEmail = normalized,
            DisplayName = request.DisplayName.Trim(),
            Language = Loc.Normalize(request.Language),
            CreatedAt = now,
        };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Users.Add(user);

        await QueueVerificationEmailAsync(user, ct);
        audit.Record(null, user.Id, "user.registered", "User", user.Id, null);
        var result = IssueTokens(user, request.Client, familyId: null, now);
        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
        return result with { Response = result.Response with { User = await MeAsync(user.Id, ct) } };
    }

    public async Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var normalized = User.Normalize(request.Email);
        var user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized, ct);
        var now = clock.GetUtcNow();
        var invalid = Loc.T("E-Mail-Adresse oder Passwort ist falsch.", "Email address or password is incorrect.");

        if (user is null || user.IsDisabled)
        {
            // Spend comparable time to avoid user enumeration through timing.
            var dummy = new User { Email = "x", NormalizedEmail = "X", DisplayName = "x" };
            hasher.VerifyHashedPassword(dummy, DummyHash.Value ??= hasher.HashPassword(dummy, SecureTokens.Create()), request.Password);
            throw new AuthenticationFailedException(invalid);
        }

        if (user.LockedUntil > now)
        {
            throw new AuthenticationFailedException(Loc.T(
                "Zu viele fehlgeschlagene Anmeldeversuche. Bitte versuchen Sie es in einigen Minuten erneut.",
                "Too many failed sign-in attempts. Please try again in a few minutes."));
        }

        var verification = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= _auth.MaxFailedLogins)
            {
                user.LockedUntil = now + _auth.LockoutDuration;
                user.FailedLoginCount = 0;
                audit.Record(null, user.Id, "user.locked_out", "User", user.Id, null);
            }

            await db.SaveChangesAsync(ct);
            throw new AuthenticationFailedException(invalid);
        }

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, request.Password);
        }

        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        user.LastLoginAt = now;
        var result = IssueTokens(user, request.Client, familyId: null, now);
        await db.SaveChangesAsync(ct);
        return result with { Response = result.Response with { User = await MeAsync(user.Id, ct) } };
    }

    public async Task<AuthResult> RefreshAsync(string? refreshToken, ClientKind client, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(refreshToken))
        {
            throw SessionExpired();
        }

        var hash = SecureTokens.Hash(refreshToken!);
        var stored = await db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        var now = clock.GetUtcNow();
        if (stored?.User is null)
        {
            throw SessionExpired();
        }

        if (stored.RevokedAt is not null)
        {
            // A rotated token was presented again: possible theft. Revoke the whole family – except within a short grace
            // window after rotation, which happens legitimately when two browser tabs refresh at the same moment.
            var withinGrace = stored.RevokedReason == "rotated" && stored.RevokedAt > now - RotationGracePeriod;
            if (stored.ReplacedByTokenId is not null && !withinGrace)
            {
                await RevokeFamilyAsync(stored.FamilyId, now, "reuse_detected", ct);
                audit.Record(null, stored.UserId, "auth.refresh_token_reuse", "User", stored.UserId, null);
                await db.SaveChangesAsync(ct);
                logger.LogWarning("Refresh token reuse detected for user {UserId}; token family revoked", stored.UserId);
            }

            throw SessionExpired();
        }

        if (stored.ExpiresAt <= now || stored.User.IsDisabled || stored.SecurityStamp != stored.User.SecurityStamp)
        {
            throw SessionExpired();
        }

        var result = IssueTokens(stored.User, client, stored.FamilyId, now);
        stored.RevokedAt = now;
        stored.RevokedReason = "rotated";
        stored.ReplacedByTokenId = result.RefreshTokenId;
        await db.SaveChangesAsync(ct);
        return result with { Response = result.Response with { User = await MeAsync(stored.UserId, ct) } };
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(refreshToken))
        {
            return;
        }

        var hash = SecureTokens.Hash(refreshToken!);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is { RevokedAt: null })
        {
            await RevokeFamilyAsync(stored.FamilyId, clock.GetUtcNow(), "logout", ct);
            await db.SaveChangesAsync(ct);
        }
    }

    /// <summary>Always succeeds from the caller's perspective to prevent account enumeration.</summary>
    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct)
    {
        var normalized = User.Normalize(request.Email ?? string.Empty);
        var user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized && !u.IsDisabled, ct);
        if (user is null)
        {
            return;
        }

        var now = clock.GetUtcNow();
        var recent = await db.UserTokens.CountAsync(t => t.UserId == user.Id && t.Purpose == UserTokenPurpose.PasswordReset && t.CreatedAt > now.AddHours(-1), ct);
        if (recent >= 3)
        {
            return;
        }

        var token = SecureTokens.Create();
        var userToken = new UserToken
        {
            UserId = user.Id,
            Purpose = UserTokenPurpose.PasswordReset,
            TokenHash = SecureTokens.Hash(token),
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(60),
        };
        db.UserTokens.Add(userToken);
        var content = EmailTemplates.PasswordReset(user.DisplayName, _app.WebUrl($"reset-password?token={token}"), _app.ProductName, user.Language);
        await outbox.EnqueueAsync(new EnqueueEmail(null, null, EmailKind.PasswordReset, $"password-reset:{userToken.Id:N}:{SecureTokens.Hash(token)[..12]}", user.Email, content), ct);
        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct)
    {
        var token = await ConsumeTokenAsync(request.Token, UserTokenPurpose.PasswordReset, ct)
            ?? throw new GoneException(Loc.T("Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.", "The link is invalid or has expired. Please request a new one."));
        var user = await db.Users.FirstAsync(u => u.Id == token.UserId, ct);
        var now = clock.GetUtcNow();
        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        // Proving control of the mailbox also verifies the address.
        user.EmailVerifiedAt ??= now;
        await RevokeAllAsync(user.Id, now, "password_reset", ct);
        audit.Record(null, user.Id, "user.password_reset", "User", user.Id, null);
        await db.SaveChangesAsync(ct);
    }

    public async Task VerifyEmailAsync(VerifyEmailRequest request, CancellationToken ct)
    {
        var token = await ConsumeTokenAsync(request.Token, UserTokenPurpose.EmailVerification, ct)
            ?? throw new GoneException(Loc.T("Der Bestätigungslink ist ungültig oder abgelaufen.", "The confirmation link is invalid or has expired."));
        var user = await db.Users.FirstAsync(u => u.Id == token.UserId, ct);
        user.EmailVerifiedAt ??= clock.GetUtcNow();
        audit.Record(null, user.Id, "user.email_verified", "User", user.Id, null);
        await db.SaveChangesAsync(ct);
    }

    public async Task ResendVerificationAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        if (user.EmailVerifiedAt is not null)
        {
            return;
        }

        var now = clock.GetUtcNow();
        var recent = await db.UserTokens.CountAsync(t => t.UserId == userId && t.Purpose == UserTokenPurpose.EmailVerification && t.CreatedAt > now.AddHours(-1), ct);
        if (recent >= 3)
        {
            throw new ConflictException("too_many_requests", Loc.T(
                "Bitte warten Sie etwas, bevor Sie eine weitere Bestätigungs-E-Mail anfordern.",
                "Please wait a little before requesting another confirmation email."));
        }

        await QueueVerificationEmailAsync(user, ct);
        await db.SaveChangesAsync(ct);
        dispatchSignal.Notify();
    }

    public async Task<MeDto> MeAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct) ?? throw new NotFoundException();
        var memberships = await db.Memberships.AsNoTracking()
            .Where(m => m.UserId == userId && m.Status == MembershipStatus.Active)
            .OrderBy(m => m.Company!.Name)
            .Select(m => new MembershipDto(m.CompanyId, m.Company!.Name, m.Role, m.Id, m.Company.IsDemo))
            .ToListAsync(ct);
        return new MeDto(user.Id, user.Email, user.DisplayName, user.EmailVerifiedAt is not null, Loc.Normalize(user.Language), memberships);
    }

    public async Task<MeDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct)
    {
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        user.DisplayName = request.DisplayName.Trim();
        if (request.Language is not null)
        {
            user.Language = Loc.Normalize(request.Language);
        }

        await db.SaveChangesAsync(ct);
        return await MeAsync(userId, ct);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct)
    {
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("currentPassword", Loc.T("Das aktuelle Passwort ist falsch.", "The current password is incorrect."))]);
        }

        var now = clock.GetUtcNow();
        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        await RevokeAllAsync(userId, now, "password_changed", ct);
        audit.Record(null, userId, "user.password_changed", "User", userId, null);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>GDPR export (Art. 15/20) of the data stored about the user account itself.</summary>
    public async Task<object> ExportAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == userId, ct);
        var memberships = await db.Memberships.AsNoTracking().Where(m => m.UserId == userId)
            .Select(m => new { m.CompanyId, Company = m.Company!.Name, Role = m.Role.ToString(), Status = m.Status.ToString(), m.JoinedAt, m.DeactivatedAt })
            .ToListAsync(ct);
        var sessions = await db.RefreshTokens.AsNoTracking().Where(t => t.UserId == userId)
            .OrderByDescending(t => t.CreatedAt).Take(100)
            .Select(t => new { Client = t.Client.ToString(), t.CreatedAt, t.ExpiresAt, t.RevokedAt, t.RevokedReason })
            .ToListAsync(ct);
        var auditEvents = await db.AuditEvents.AsNoTracking().Where(a => a.UserId == userId)
            .OrderByDescending(a => a.OccurredAt).Take(1000)
            .Select(a => new { a.Action, a.EntityType, a.EntityId, a.Summary, a.OccurredAt })
            .ToListAsync(ct);
        return new
        {
            ExportedAt = clock.GetUtcNow(),
            Account = new { user.Id, user.Email, user.DisplayName, user.Language, user.CreatedAt, user.EmailVerifiedAt, user.LastLoginAt },
            Memberships = memberships,
            Sessions = sessions,
            Activity = auditEvents,
            Note = Loc.T(
                "Firmendaten (Kunden, Angebote, Aufträge) exportieren Inhaber:innen über Einstellungen → Firma → Daten exportieren.",
                "Owners export company data (customers, quotations, jobs) via Settings → Company → Export data."),
        };
    }

    /// <summary>
    /// Deletes the account. Companies in which the user is the only active member are deleted with all their data.
    /// Fails while the user is the only owner of a company that still has other active members.
    /// </summary>
    public async Task DeleteAccountAsync(Guid userId, string password, ICompanyDeletion companyDeletion, CancellationToken ct)
    {
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, password) == PasswordVerificationResult.Failed)
        {
            throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("password", Loc.T("Das Passwort ist falsch.", "The password is incorrect."))]);
        }

        var ownMemberships = await db.Memberships.Where(m => m.UserId == userId).ToListAsync(ct);
        var companiesToDelete = new List<Guid>();
        foreach (var m in ownMemberships.Where(m => m.IsActive))
        {
            var otherActive = await db.Memberships.Where(o => o.CompanyId == m.CompanyId && o.UserId != userId && o.Status == MembershipStatus.Active)
                .Select(o => o.Role).ToListAsync(ct);
            if (otherActive.Count == 0)
            {
                companiesToDelete.Add(m.CompanyId);
            }
            else if (m.Role == MembershipRole.Owner && !otherActive.Contains(MembershipRole.Owner))
            {
                throw new ConflictException("sole_owner", Loc.T(
                    "Sie sind die einzige Inhaberin bzw. der einzige Inhaber einer Firma mit weiteren Mitgliedern. Übertragen Sie zuerst die Inhaberrolle an ein anderes Mitglied.",
                    "You are the only owner of a company with other members. Transfer the owner role to another member first."));
            }
        }

        foreach (var companyId in companiesToDelete)
        {
            await companyDeletion.DeleteCompanyDataAsync(companyId, ct);
        }

        var now = clock.GetUtcNow();
        await db.RefreshTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
        await db.UserTokens.Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Memberships.Where(m => m.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Notifications.IgnoreQueryFilters().Where(n => n.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Invitations.IgnoreQueryFilters().Where(i => i.NormalizedEmail == user.NormalizedEmail).ExecuteDeleteAsync(ct);
        // Emails still waiting to be sent to the deleted account are cancelled (and their content removed).
        await db.EmailDeliveries.Where(e => e.ToAddress == user.Email && (e.Status == EmailStatus.Pending || e.Status == EmailStatus.RetryScheduled))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.Status, EmailStatus.Cancelled).SetProperty(e => e.BodyText, "[Konto gelöscht]").SetProperty(e => e.BodyHtml, (string?)null), ct);
        db.ChangeTracker.Clear();
        await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(ct);
        audit.Record(null, null, "user.deleted", "User", userId, $"Konto gelöscht am {now:yyyy-MM-dd}");
        await db.SaveChangesAsync(ct);
    }

    private async Task QueueVerificationEmailAsync(User user, CancellationToken ct)
    {
        var token = SecureTokens.Create();
        var now = clock.GetUtcNow();
        var userToken = new UserToken
        {
            UserId = user.Id,
            Purpose = UserTokenPurpose.EmailVerification,
            TokenHash = SecureTokens.Hash(token),
            CreatedAt = now,
            ExpiresAt = now.AddHours(48),
        };
        db.UserTokens.Add(userToken);
        var content = EmailTemplates.EmailVerification(user.DisplayName, _app.WebUrl($"verify-email?token={token}"), _app.ProductName, user.Language);
        await outbox.EnqueueAsync(new EnqueueEmail(null, null, EmailKind.EmailVerification, $"verify:{userToken.TokenHash[..32]}", user.Email, content), ct);
    }

    private async Task<UserToken?> ConsumeTokenAsync(string? raw, UserTokenPurpose purpose, CancellationToken ct)
    {
        if (!SecureTokens.LooksValid(raw))
        {
            return null;
        }

        var hash = SecureTokens.Hash(raw!);
        var now = clock.GetUtcNow();
        var token = await db.UserTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.Purpose == purpose, ct);
        if (token is null || token.UsedAt is not null || token.ExpiresAt <= now)
        {
            return null;
        }

        token.UsedAt = now;
        return token;
    }

    private AuthResult IssueTokens(User user, ClientKind client, Guid? familyId, DateTimeOffset now)
    {
        var access = tokenIssuer.Issue(user);
        var raw = SecureTokens.Create();
        var refresh = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = SecureTokens.Hash(raw),
            FamilyId = familyId ?? Guid.NewGuid(),
            Client = client,
            CreatedAt = now,
            ExpiresAt = now + _auth.RefreshTokenLifetime,
            SecurityStamp = user.SecurityStamp,
        };
        db.RefreshTokens.Add(refresh);
        var bodyToken = client == ClientKind.Web && _auth.UseCookieTransport ? null : raw;
        var response = new AuthResponse(access.Token, access.ExpiresAt, bodyToken, refresh.ExpiresAt,
            new MeDto(user.Id, user.Email, user.DisplayName, user.EmailVerifiedAt is not null, Loc.Normalize(user.Language), []));
        return new AuthResult(response, raw, refresh.ExpiresAt, refresh.Id);
    }

    private static AuthenticationFailedException SessionExpired() =>
        new(Loc.T("Sitzung abgelaufen. Bitte melden Sie sich erneut an.", "Session expired. Please sign in again."));

    private Task<int> RevokeFamilyAsync(Guid familyId, DateTimeOffset now, string reason, CancellationToken ct) =>
        db.RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.RevokedReason, reason), ct);

    private Task<int> RevokeAllAsync(Guid userId, DateTimeOffset now, string reason, CancellationToken ct) =>
        db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.RevokedReason, reason), ct);

    // Hash of a random value, used only to equalise timing for unknown users.
    private static readonly StrongBox<string?> DummyHash = new(null);
}

public sealed class AuthenticationFailedException(string message) : Exception(message);

/// <summary>Deletes all data of one company (used by account and company deletion).</summary>
public interface ICompanyDeletion
{
    Task DeleteCompanyDataAsync(Guid companyId, CancellationToken ct);
}

internal static class MembershipQueries
{
    public static IQueryable<CompanyMembership> ActiveIn(this IQueryable<CompanyMembership> q, Guid companyId) =>
        q.Where(m => m.CompanyId == companyId && m.Status == MembershipStatus.Active);
}
