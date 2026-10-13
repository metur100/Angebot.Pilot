using System.Security.Cryptography;
using System.Text;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Audit;
using AngebotPilot.Domain.Companies;

namespace AngebotPilot.Application.Common;

public sealed class NotFoundException(string? message = null)
    : Exception(message ?? Loc.T("Der Eintrag wurde nicht gefunden.", "The item was not found."));

public sealed class ForbiddenException(string? message = null)
    : Exception(message ?? Loc.T("Für diese Aktion fehlt Ihnen die Berechtigung.", "You do not have permission for this action."));

/// <summary>409 with a stable code, e.g. <c>concurrency_conflict</c>, <c>already_converted</c>.</summary>
public sealed class ConflictException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>Request is valid but not allowed by the current plan/subscription (HTTP 402).</summary>
public sealed class EntitlementException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>A link/token that is invalid, expired or revoked (HTTP 410 for public links).</summary>
public sealed class GoneException(string message) : Exception(message);

public sealed class AppOptions
{
    public const string Section = "App";

    /// <summary>Base URL of the web app used in emails, e.g. https://metur100.github.io/Angebot.Pilot.App/#</summary>
    public string WebBaseUrl { get; set; } = "http://localhost:5173/#";

    /// <summary>Public base URL of this API (for absolute links in emails).</summary>
    public string ApiBaseUrl { get; set; } = "http://localhost:5080";

    /// <summary>Landing site with legal pages.</summary>
    public string LandingUrl { get; set; } = "https://metur100.github.io/Angebot.Pilot.Landing/";

    public string ProductName { get; set; } = "AngebotPilot";

    /// <summary>Days a public link stays viewable after the quotation's validity date.</summary>
    public int PublicLinkGraceDays { get; set; } = 60;

    public string PublicQuotationUrl(string token) => $"{WebBaseUrl.TrimEnd('/')}/q/{token}";

    public string WebUrl(string pathAndQuery) => $"{WebBaseUrl.TrimEnd('/')}/{pathAndQuery.TrimStart('/')}";
}

public static class SecureTokens
{
    /// <summary>256-bit cryptographically random, URL-safe token.</summary>
    public static string Create(int bytes = 32) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static bool LooksValid(string? token) =>
        token is { Length: >= 20 and <= 128 } && token.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}

public static class RowVersions
{
    public static string Encode(byte[] rowVersion) => Convert.ToBase64String(rowVersion);

    public static byte[] Decode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            throw new ConflictException("concurrency_conflict", Loc.T("Ungültige Versionsangabe.", "Invalid version."));
        }
    }
}

public static class CompanyTime
{
    public static TimeZoneInfo Resolve(string? timeZoneId)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(string.IsNullOrWhiteSpace(timeZoneId) ? "Europe/Berlin" : timeZoneId);
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        }
    }

    public static bool IsValid(string timeZoneId)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            return true;
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return false;
        }
    }

    public static DateOnly Today(DateTimeOffset now, string? timeZoneId) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Resolve(timeZoneId)).DateTime);
}

public static class MemberExtensions
{
    public static void Require(this CurrentMember member, MembershipRole minimum, string? message = null)
    {
        if (!Enum.IsDefined(member.Role) || member.Role < minimum)
        {
            throw new ForbiddenException(message ?? minimum switch
            {
                MembershipRole.Owner => Loc.T("Nur Inhaber:innen dürfen diese Aktion ausführen.", "Only owners may perform this action."),
                MembershipRole.Admin => Loc.T("Nur Administrator:innen und Inhaber:innen dürfen diese Aktion ausführen.", "Only admins and owners may perform this action."),
                _ => Loc.T("Für diese Aktion fehlt Ihnen die Berechtigung.", "You do not have permission for this action."),
            });
        }
    }
}

public interface IAuditLog
{
    void Record(Guid? companyId, Guid? userId, string action, string? entityType, Guid? entityId, string? summary);
}

/// <summary>Adds audit events to the current unit of work; they are saved together with the business change.</summary>
public sealed class AuditLog(IAppDbContext db, TimeProvider clock) : IAuditLog
{
    public void Record(Guid? companyId, Guid? userId, string action, string? entityType, Guid? entityId, string? summary) =>
        db.AuditEvents.Add(new AuditEvent
        {
            CompanyId = companyId,
            UserId = userId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Summary = summary is { Length: > 500 } ? summary[..500] : summary,
            OccurredAt = clock.GetUtcNow(),
        });
}

public static class Text
{
    public static string? Clean(string? value)
    {
        if (value is null)
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    public static string? Upper(string? value) => Clean(value)?.ToUpperInvariant().Replace(" ", string.Empty);

    public static string FormatAddress(params string?[] lines) =>
        string.Join('\n', lines.Where(l => !string.IsNullOrWhiteSpace(l)).Select(l => l!.Trim()));

    public static string CompanyAddress(Company c) =>
        FormatAddress(c.AddressLine1, c.AddressLine2, string.Join(' ', new[] { c.PostalCode, c.City }.Where(s => !string.IsNullOrWhiteSpace(s))));
}

/// <summary>CSV for German Excel: UTF-8 with BOM, semicolon separator, CRLF, RFC 4180 quoting, formula-injection guard.</summary>
public static class Csv
{
    public static byte[] Write(IEnumerable<string> header, IEnumerable<IEnumerable<string?>> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(';', header.Select(Escape))).Append("\r\n");
        foreach (var row in rows)
        {
            sb.Append(string.Join(';', row.Select(Escape))).Append("\r\n");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        return [.. preamble, .. body];
    }

    public static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        // Prevent CSV/formula injection when the file is opened in a spreadsheet.
        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            value = "'" + value;
        }

        return value.IndexOfAny([';', '"', '\n', '\r', ',']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }

    public static string Money(decimal value) => value.ToString("0.00", System.Globalization.CultureInfo.GetCultureInfo("de-DE"));

    public static string Date(DateOnly? value) => value?.ToString("dd.MM.yyyy", System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

    public static string DateTime(DateTimeOffset? value, TimeZoneInfo tz) =>
        value is null ? string.Empty : TimeZoneInfo.ConvertTime(value.Value, tz).ToString("dd.MM.yyyy HH:mm", System.Globalization.CultureInfo.InvariantCulture);
}
