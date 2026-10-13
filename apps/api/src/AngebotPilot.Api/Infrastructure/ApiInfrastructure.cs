using System.Diagnostics;
using System.Globalization;
using System.Security.Claims;
using System.Text;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Auth;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Companies;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Users;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;

namespace AngebotPilot.Api.Infrastructure;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "angebotpilot-api";

    public string Audience { get; set; } = "angebotpilot-clients";

    /// <summary>HMAC-SHA256 key, at least 32 bytes. Must be provided via secret configuration in every environment.</summary>
    public string SigningKey { get; set; } = string.Empty;

    public SymmetricSecurityKey CreateKey()
    {
        if (Encoding.UTF8.GetByteCount(SigningKey) < 32)
        {
            throw new InvalidOperationException("Jwt:SigningKey must be configured with at least 32 bytes.");
        }

        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey));
    }
}

/// <summary>Issues access tokens. Uses the system clock because JwtBearer validates lifetimes against wall-clock time.</summary>
public sealed class JwtAccessTokenIssuer(IOptions<JwtOptions> jwt, IOptions<AuthOptions> auth) : IAccessTokenIssuer
{
    private readonly JsonWebTokenHandler _handler = new();

    public IssuedAccessToken Issue(User user)
    {
        var now = TimeProvider.System.GetUtcNow();
        var expires = now + auth.Value.AccessTokenLifetime;
        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Value.Issuer,
            Audience = jwt.Value.Audience,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
                new Claim("name", user.DisplayName),
            ]),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(jwt.Value.CreateKey(), SecurityAlgorithms.HmacSha256),
        });
        return new IssuedAccessToken(token, expires);
    }
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid? UserId =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public Guid RequireUserId() => UserId ?? throw new UnauthorizedAccessException();
}

public static class HttpContextExtensions
{
    private const string MemberKey = "angebotpilot.member";

    public static Guid UserId(this HttpContext http) => http.RequestServices.GetRequiredService<ICurrentUser>().RequireUserId();

    public static CurrentMember Member(this HttpContext http) =>
        http.Items[MemberKey] as CurrentMember ?? throw new InvalidOperationException("Company membership was not resolved for this endpoint.");

    internal static void SetMember(this HttpContext http, CurrentMember member) => http.Items[MemberKey] = member;
}

/// <summary>Resolves {companyId} against the caller's active membership before any company endpoint runs.</summary>
public sealed class CompanyMemberFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!Guid.TryParse(http.Request.RouteValues["companyId"]?.ToString(), out var companyId))
        {
            return Results.NotFound();
        }

        var access = http.RequestServices.GetRequiredService<CompanyAccess>();
        http.SetMember(await access.ResolveAsync(http.UserId(), companyId, http.RequestAborted));
        return await next(context);
    }
}

public sealed class ValidationFilter<T> : IEndpointFilter
    where T : class
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var argument = context.Arguments.OfType<T>().FirstOrDefault();
        if (argument is null)
        {
            throw new ValidationException([new FluentValidation.Results.ValidationFailure("body", Loc.T("Die Anfrage enthält keine gültigen Daten.", "The request contains no valid data."))]);
        }

        var validator = context.HttpContext.RequestServices.GetService<IValidator<T>>();
        if (validator is not null)
        {
            var result = await validator.ValidateAsync(argument, context.HttpContext.RequestAborted);
            if (!result.IsValid)
            {
                throw new ValidationException(result.Errors);
            }
        }

        return await next(context);
    }
}

public static class EndpointExtensions
{
    public static RouteHandlerBuilder Validate<T>(this RouteHandlerBuilder builder)
        where T : class => builder.AddEndpointFilter<ValidationFilter<T>>();
}

/// <summary>Maps exceptions to RFC 7807 problem details with a stable <c>code</c>. Never leaks stack traces or internals.</summary>
public sealed class ProblemExceptionHandler(ILogger<ProblemExceptionHandler> logger, IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var http = httpContext;
        var (status, code, title, detail, errors) = exception switch
        {
            ValidationException v => (400, "validation_failed", Loc.T("Ungültige Eingaben", "Invalid input"), Loc.T("Bitte prüfen Sie die markierten Felder.", "Please check the highlighted fields."), ToErrors(v)),
            BadHttpRequestException => (400, "bad_request", Loc.T("Ungültige Anfrage", "Invalid request"), Loc.T("Die Anfrage konnte nicht gelesen werden.", "The request could not be read."), null),
            AuthenticationFailedException a => (401, "invalid_credentials", Loc.T("Anmeldung fehlgeschlagen", "Sign-in failed"), a.Message, null),
            UnauthorizedAccessException => (401, "unauthorized", Loc.T("Nicht angemeldet", "Not signed in"), Loc.T("Bitte melden Sie sich an.", "Please sign in."), null),
            EntitlementException e => (402, e.Code, Loc.T("Tarifgrenze erreicht", "Plan limit reached"), e.Message, null),
            ForbiddenException f => (403, "forbidden", Loc.T("Keine Berechtigung", "No permission"), f.Message, null),
            NotFoundException n => (404, "not_found", Loc.T("Nicht gefunden", "Not found"), n.Message, null),
            ConflictException c => (c.Code == "too_many_requests" ? 429 : 409, c.Code, Loc.T("Konflikt", "Conflict"), c.Message, null),
            DomainException d => (409, d.Code, Loc.T("Aktion nicht möglich", "Action not possible"), d.Message, null),
            DbUpdateConcurrencyException => (409, "concurrency_conflict", Loc.T("Bearbeitungskonflikt", "Edit conflict"),
                Loc.T("Der Datensatz wurde zwischenzeitlich geändert. Bitte laden Sie ihn neu.", "The record was changed in the meantime. Please reload it."), null),
            DbUpdateException { InnerException: SqlException { Number: 2601 or 2627 } } => (409, "duplicate", Loc.T("Konflikt", "Conflict"),
                Loc.T("Der Eintrag existiert bereits oder wurde gleichzeitig angelegt.", "The entry already exists or was created at the same time."), null),
            SqlException { Number: 1205 } or DbUpdateException { InnerException: SqlException { Number: 1205 } } => (409, "concurrency_conflict", Loc.T("Bearbeitungskonflikt", "Edit conflict"),
                Loc.T("Die Aktion kollidierte mit einer gleichzeitigen Änderung. Bitte versuchen Sie es erneut.", "The action collided with a simultaneous change. Please try again."), null),
            GoneException g => (410, "gone", Loc.T("Nicht mehr verfügbar", "No longer available"), g.Message, null),
            OperationCanceledException when http.RequestAborted.IsCancellationRequested => (499, "cancelled", Loc.T("Abgebrochen", "Cancelled"), null, null),
            _ => (500, "internal_error", Loc.T("Serverfehler", "Server error"),
                Loc.T("Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.", "An unexpected error occurred. Please try again later."), (Dictionary<string, string[]>?)null),
        };

        if (status == 500)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Route}", http.Request.Method, RouteOf(http));
        }
        else if (status != 499)
        {
            logger.LogInformation("Request failed with {Status} {Code} for {Method} {Route}", status, code, http.Request.Method, RouteOf(http));
        }

        http.Response.StatusCode = status;
        var problem = new ProblemDetails { Status = status, Title = title, Detail = detail, Type = $"https://httpstatuses.io/{status}" };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = Activity.Current?.Id ?? http.TraceIdentifier;
        if (errors is not null)
        {
            problem.Extensions["errors"] = errors;
        }

        return await problemDetails.TryWriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = problem, Exception = exception });
    }

    private static Dictionary<string, string[]> ToErrors(ValidationException e) =>
        e.Errors.GroupBy(x => CamelPath(x.PropertyName)).ToDictionary(g => g.Key, g => g.Select(x => x.ErrorMessage).Distinct().ToArray());

    /// <summary>Route template instead of the raw path: public tokens must never reach the logs.</summary>
    public static string RouteOf(HttpContext http) => http.GetEndpoint() is RouteEndpoint route ? route.RoutePattern.RawText ?? "(unknown)" : "(unmatched)";

    /// <summary>"LineItems[0].UnitPriceNet" → "lineItems[0].unitPriceNet".</summary>
    public static string CamelPath(string path) =>
        string.Join('.', path.Split('.').Select(segment => segment.Length == 0 ? segment : char.ToLowerInvariant(segment[0]) + segment[1..]));
}

/// <summary>
/// Selects the language of user-facing messages from Accept-Language: English when the client prefers it, otherwise
/// German. Only the UI culture is set; the formatting culture stays untouched, so documents (PDF, e-invoice, CSV,
/// customer emails) are byte-for-byte the same in both languages. Registered before the exception handler so error
/// responses are localized too.
/// </summary>
public sealed class RequestLanguageMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext http)
    {
        var language = FromAcceptLanguage(http.Request.GetTypedHeaders().AcceptLanguage);
        CultureInfo.CurrentUICulture = Loc.Culture(language);
        // Set when the response starts: the exception handler clears headers set earlier.
        http.Response.OnStarting(() =>
        {
            http.Response.Headers.ContentLanguage = language;
            return Task.CompletedTask;
        });
        return next(http);
    }

    /// <summary>First supported language by quality ("en-GB;q=0.9, de;q=0.8" → "en"); German when none is supported.</summary>
    public static string FromAcceptLanguage(IEnumerable<StringWithQualityHeaderValue> values) =>
        values.Where(v => v.Quality is null or > 0)
            .OrderByDescending(v => v.Quality ?? 1)
            .Select(v => v.Value.Value?.Split('-')[0].ToLowerInvariant())
            .FirstOrDefault(Loc.IsSupported) ?? Loc.German;
}

/// <summary>Adds conservative security headers to every API response.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext http)
    {
        var headers = http.Response.Headers;
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "no-referrer";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        headers["Cross-Origin-Resource-Policy"] = "cross-origin";
        if (!http.Request.Path.StartsWithSegments("/swagger", StringComparison.OrdinalIgnoreCase))
        {
            headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
        }

        return next(http);
    }
}
