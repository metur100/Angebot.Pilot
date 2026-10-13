using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AngebotPilot.Api.Infrastructure;
using AngebotPilot.Application.Auth;
using AngebotPilot.Application.Background;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Companies;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Application.Dashboard;
using AngebotPilot.Application.Files;
using AngebotPilot.Application.Jobs;
using AngebotPilot.Application.Public;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Application.Templates;
using AngebotPilot.Domain;
using AngebotPilot.Infrastructure.Email;
using AngebotPilot.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AngebotPilot.Api.Endpoints;

public static class Endpoints
{
    public const string RefreshCookie = "ap_refresh";
    private static readonly JsonSerializerOptions ExportJson = new(JsonSerializerDefaults.Web) { WriteIndented = true, ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles };

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1");
        MapAuth(api.MapGroup("/auth").RequireRateLimiting("auth"));
        MapMe(api.MapGroup(string.Empty).RequireAuthorization());
        MapCompanies(api);
        MapPublic(api.MapGroup("/public/quotations/{token}").RequireRateLimiting("public"));
        api.MapPost("/billing/webhooks/{provider}", BillingWebhook).RequireRateLimiting("public").ExcludeFromDescription();
        app.MapPost("/api/internal/jobs/run", RunJobs).RequireRateLimiting("jobs").ExcludeFromDescription();

        if (app.Environment.IsDevelopment() || app.Environment.IsEnvironment("Testing"))
        {
            api.MapGet("/dev/emails", (string? to) => Results.Ok(CaptureEmailSender.All
                .Where(m => to is null || string.Equals(m.To, to, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => new { m.Id, m.To, m.Subject, m.BodyText, m.CreatedAt, m.Attachments })));
        }

        app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "AngebotPilot API", version = typeof(Endpoints).Assembly.GetName().Version?.ToString() }));
        app.MapGet("/health/ready", async (AppDbContext db, CancellationToken ct) =>
            await db.Database.CanConnectAsync(ct) ? Results.Ok(new { status = "ready" }) : Results.Problem(statusCode: 503, title: "Datenbank nicht erreichbar"));
    }

    // ---------- Auth ----------
    private static void MapAuth(RouteGroupBuilder g)
    {
        g.MapPost("/register", async (RegisterRequest r, AuthService auth, HttpContext http, IOptions<AuthOptions> o, CancellationToken ct) =>
            AuthOk(http, await auth.RegisterAsync(r, ct), o.Value, created: true)).Validate<RegisterRequest>();
        g.MapPost("/login", async (LoginRequest r, AuthService auth, HttpContext http, IOptions<AuthOptions> o, CancellationToken ct) =>
            AuthOk(http, await auth.LoginAsync(r, ct), o.Value)).Validate<LoginRequest>();
        g.MapPost("/refresh", async (RefreshRequest r, AuthService auth, HttpContext http, IOptions<AuthOptions> o, CancellationToken ct) =>
        {
            var token = r.RefreshToken ?? (o.Value.UseCookieTransport && RequireClientHeader(http) ? http.Request.Cookies[RefreshCookie] : null);
            return AuthOk(http, await auth.RefreshAsync(token, ClientOf(http), ct), o.Value);
        });
        g.MapPost("/logout", async (LogoutRequest r, AuthService auth, HttpContext http, IOptions<AuthOptions> o, CancellationToken ct) =>
        {
            var token = r.RefreshToken ?? (o.Value.UseCookieTransport && RequireClientHeader(http) ? http.Request.Cookies[RefreshCookie] : null);
            await auth.LogoutAsync(token, ct);
            http.Response.Cookies.Delete(RefreshCookie, new CookieOptions { Path = "/api/v1/auth", Secure = true, SameSite = SameSiteMode.Strict });
            return Results.NoContent();
        });
        g.MapPost("/forgot-password", async (ForgotPasswordRequest r, AuthService auth, CancellationToken ct) =>
        {
            await auth.ForgotPasswordAsync(r, ct);
            return Results.Accepted();
        }).RequireRateLimiting("password-reset");
        g.MapPost("/reset-password", async (ResetPasswordRequest r, AuthService auth, CancellationToken ct) =>
        {
            await auth.ResetPasswordAsync(r, ct);
            return Results.NoContent();
        }).Validate<ResetPasswordRequest>().RequireRateLimiting("password-reset");
        g.MapPost("/verify-email", async (VerifyEmailRequest r, AuthService auth, CancellationToken ct) =>
        {
            await auth.VerifyEmailAsync(r, ct);
            return Results.NoContent();
        });
        g.MapPost("/resend-verification", async (HttpContext http, AuthService auth, CancellationToken ct) =>
        {
            await auth.ResendVerificationAsync(http.UserId(), ct);
            return Results.Accepted();
        }).RequireAuthorization();
    }

    private static IResult AuthOk(HttpContext http, AuthResult result, AuthOptions options, bool created = false)
    {
        if (result.Response.RefreshToken is null && options.UseCookieTransport)
        {
            http.Response.Cookies.Append(RefreshCookie, result.RefreshToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Path = "/api/v1/auth",
                Expires = result.RefreshExpiresAt,
                IsEssential = true,
            });
        }

        http.Response.Headers.CacheControl = "no-store";
        return created ? Results.Created("/api/v1/me", result.Response) : Results.Ok(result.Response);
    }

    private static ClientKind ClientOf(HttpContext http) =>
        string.Equals(http.Request.Headers["X-AngebotPilot-Client"], "mobile", StringComparison.OrdinalIgnoreCase) ? ClientKind.Mobile : ClientKind.Web;

    /// <summary>CSRF guard for the cookie transport: a custom header forces a CORS preflight for cross-site requests.</summary>
    private static bool RequireClientHeader(HttpContext http) => http.Request.Headers.ContainsKey("X-AngebotPilot-Client");

    // ---------- Me & invitations ----------
    private static void MapMe(RouteGroupBuilder api)
    {
        api.MapGet("/me", (HttpContext http, AuthService auth, CancellationToken ct) => auth.MeAsync(http.UserId(), ct));
        api.MapPatch("/me", (UpdateProfileRequest r, HttpContext http, AuthService auth, CancellationToken ct) => auth.UpdateProfileAsync(http.UserId(), r, ct))
            .Validate<UpdateProfileRequest>();
        api.MapPost("/me/change-password", async (ChangePasswordRequest r, HttpContext http, AuthService auth, CancellationToken ct) =>
        {
            await auth.ChangePasswordAsync(http.UserId(), r, ct);
            return Results.NoContent();
        }).Validate<ChangePasswordRequest>().RequireRateLimiting("auth");
        api.MapGet("/me/export", async (HttpContext http, AuthService auth, CancellationToken ct) =>
            JsonDownload(await auth.ExportAsync(http.UserId(), ct), "angebotpilot-konto-export.json"));
        api.MapPost("/me/delete", async (DeleteAccountRequest r, HttpContext http, AuthService auth, CompanyService companies, CancellationToken ct) =>
        {
            await auth.DeleteAccountAsync(http.UserId(), r.Password, companies, ct);
            return Results.NoContent();
        }).RequireRateLimiting("auth");
        api.MapGet("/invitations/{token}", (string token, CompanyService companies, CancellationToken ct) => companies.PreviewInvitationAsync(token, ct))
            .AllowAnonymous().RequireRateLimiting("public");
        api.MapPost("/invitations/accept", async (AcceptInvitationRequest r, HttpContext http, CompanyService companies, AuthService auth, CancellationToken ct) =>
        {
            await companies.AcceptInvitationAsync(http.UserId(), r.Token, ct);
            return await auth.MeAsync(http.UserId(), ct);
        });
        api.MapPost("/companies", async (CreateCompanyRequest r, HttpContext http, CompanyService companies, CancellationToken ct) =>
        {
            var company = await companies.CreateAsync(http.UserId(), r, ct);
            return Results.Created($"/api/v1/companies/{company.Id}", company);
        }).Validate<CreateCompanyRequest>();
    }

    // ---------- Company-scoped ----------
    private static void MapCompanies(RouteGroupBuilder api)
    {
        var c = api.MapGroup("/companies/{companyId:guid}").RequireAuthorization().AddEndpointFilter<CompanyMemberFilter>();

        c.MapGet("", (HttpContext h, CompanyService s, CancellationToken ct) => s.GetAsync(h.Member(), ct));
        c.MapPut("", (UpdateCompanyRequest r, HttpContext h, CompanyService s, CancellationToken ct) => s.UpdateAsync(h.Member(), r, ct)).Validate<UpdateCompanyRequest>();
        c.MapPost("/delete", async (DeleteCompanyRequest r, HttpContext h, CompanyService s, CancellationToken ct) =>
        {
            await s.DeleteCompanyAsync(h.Member(), r.ConfirmName, ct);
            return Results.NoContent();
        }).Validate<DeleteCompanyRequest>();
        c.MapGet("/export", async (HttpContext h, CompanyService s, CancellationToken ct) => JsonDownload(await s.ExportAsync(h.Member(), ct), "angebotpilot-firmen-export.json"));
        c.MapGet("/settings", (HttpContext h, CompanyService s, CancellationToken ct) => s.GetSettingsAsync(h.Member(), ct));
        c.MapPut("/settings", (CompanySettingsDto r, HttpContext h, CompanyService s, CancellationToken ct) => s.UpdateSettingsAsync(h.Member(), r, ct)).Validate<CompanySettingsDto>();
        c.MapPut("/logo", async (IFormFile file, HttpContext h, CompanyService s, CancellationToken ct) =>
            await s.UploadLogoAsync(h.Member(), new UploadedFile(file.FileName, file.ContentType, file.Length, file.OpenReadStream), ct))
            .DisableAntiforgery().RequireRateLimiting("upload").WithMetadata(new RequestSizeLimitAttribute(2 * 1024 * 1024));
        c.MapGet("/logo", async (HttpContext h, CompanyService s, CancellationToken ct) =>
        {
            var logo = await s.GetLogoAsync(h.Member().CompanyId, ct);
            if (logo is null)
            {
                return Results.NotFound();
            }

            h.Response.Headers.CacheControl = "private, max-age=300";
            return Results.Stream(logo.Value.Content, logo.Value.ContentType);
        });
        c.MapDelete("/logo", (HttpContext h, CompanyService s, CancellationToken ct) => s.DeleteLogoAsync(h.Member(), ct));
        c.MapGet("/tax-rates", (CompanyService s, CancellationToken ct) => s.TaxRatesAsync(ct));
        c.MapPost("/tax-rates", (UpsertTaxRateRequest r, HttpContext h, CompanyService s, CancellationToken ct) => s.UpsertTaxRateAsync(h.Member(), null, r, ct)).Validate<UpsertTaxRateRequest>();
        c.MapPut("/tax-rates/{id:guid}", (Guid id, UpsertTaxRateRequest r, HttpContext h, CompanyService s, CancellationToken ct) => s.UpsertTaxRateAsync(h.Member(), id, r, ct)).Validate<UpsertTaxRateRequest>();

        c.MapGet("/members", (HttpContext h, CompanyService s, CancellationToken ct) => s.MembersAsync(h.Member(), ct));
        c.MapPatch("/members/{id:guid}", (Guid id, UpdateMemberRequest r, HttpContext h, CompanyService s, CancellationToken ct) => s.UpdateMemberRoleAsync(h.Member(), id, r.Role, ct))
            .Validate<UpdateMemberRequest>();
        c.MapPost("/members/{id:guid}/deactivate", (Guid id, HttpContext h, CompanyService s, CancellationToken ct) => s.SetMemberActiveAsync(h.Member(), id, false, ct));
        c.MapPost("/members/{id:guid}/reactivate", (Guid id, HttpContext h, CompanyService s, CancellationToken ct) => s.SetMemberActiveAsync(h.Member(), id, true, ct));
        c.MapGet("/invitations", (HttpContext h, CompanyService s, CancellationToken ct) => s.InvitationsAsync(h.Member(), ct));
        c.MapPost("/invitations", (CreateInvitationRequest r, HttpContext h, CompanyService s, CancellationToken ct) => s.InviteAsync(h.Member(), r, ct))
            .Validate<CreateInvitationRequest>().RequireRateLimiting("auth");
        c.MapDelete("/invitations/{id:guid}", async (Guid id, HttpContext h, CompanyService s, CancellationToken ct) =>
        {
            await s.RevokeInvitationAsync(h.Member(), id, ct);
            return Results.NoContent();
        });

        c.MapGet("/subscription", (HttpContext h, BillingService s, CancellationToken ct) => s.GetAsync(h.Member().CompanyId, ct));
        c.MapPost("/subscription/change-plan", async (ChangePlanRequest r, HttpContext h, BillingService s, AuthService auth, CancellationToken ct) =>
        {
            var me = await auth.MeAsync(h.UserId(), ct);
            return await s.ChangePlanAsync(h.Member(), r.Plan, me.Email, ct);
        }).Validate<ChangePlanRequest>();
        c.MapGet("/dashboard", (DateOnly? from, DateOnly? to, HttpContext h, DashboardService s, CancellationToken ct) => s.GetAsync(h.Member(), from, to, ct));
        c.MapGet("/activity", (int? page, int? pageSize, HttpContext h, DashboardService s, CancellationToken ct) => s.ActivityAsync(h.Member(), page ?? 1, pageSize ?? 25, ct));

        // Customers
        c.MapGet("/customers", (string? search, CustomerType? type, string? status, string? sort, int? page, int? pageSize, CustomerService s, CancellationToken ct) =>
            s.ListAsync(new CustomerListQuery(search, type, status, sort, page ?? 1, pageSize ?? 25), ct));
        c.MapPost("/customers", async (UpsertCustomerRequest r, HttpContext h, CustomerService s, CancellationToken ct) =>
        {
            var customer = await s.CreateAsync(h.Member(), r, ct);
            return Results.Created($"customers/{customer.Id}", customer);
        }).Validate<UpsertCustomerRequest>();
        c.MapGet("/customers/export.csv", async (HttpContext h, CustomerService s, CancellationToken ct) => CsvFile(await s.ExportCsvAsync(h.Member(), ct), "kunden"));
        c.MapGet("/customers/{id:guid}", (Guid id, CustomerService s, CancellationToken ct) => s.GetAsync(id, ct));
        c.MapPut("/customers/{id:guid}", (Guid id, UpsertCustomerRequest r, HttpContext h, CustomerService s, CancellationToken ct) => s.UpdateAsync(h.Member(), id, r, ct)).Validate<UpsertCustomerRequest>();
        c.MapPost("/customers/{id:guid}/archive", (Guid id, HttpContext h, CustomerService s, CancellationToken ct) => s.SetArchivedAsync(h.Member(), id, true, ct));
        c.MapPost("/customers/{id:guid}/unarchive", (Guid id, HttpContext h, CustomerService s, CancellationToken ct) => s.SetArchivedAsync(h.Member(), id, false, ct));
        c.MapDelete("/customers/{id:guid}", async (Guid id, HttpContext h, CustomerService s, CancellationToken ct) => Results.Ok(new { result = await s.DeleteAsync(h.Member(), id, ct) }));
        c.MapGet("/customers/{id:guid}/quotations", (Guid id, QuotationService s, CancellationToken ct) => s.ForCustomerAsync(id, ct));
        c.MapGet("/customers/{id:guid}/jobs", (Guid id, JobService s, CancellationToken ct) => s.ForCustomerAsync(id, ct));

        // Quotations
        c.MapGet("/quotations", (string? search, string? status, Guid? customerId, DateOnly? from, DateOnly? to, string? sort, int? page, int? pageSize, QuotationService s, CancellationToken ct) =>
            s.ListAsync(new QuotationListQuery(search, ParseList<QuotationStatus>(status), customerId, from, to, sort, page ?? 1, pageSize ?? 25), ct));
        c.MapPost("/quotations", async (CreateQuotationRequest r, HttpContext h, QuotationService s, CancellationToken ct) =>
        {
            var q = await s.CreateAsync(h.Member(), r, ct);
            return Results.Created($"quotations/{q.Id}", q);
        }).Validate<CreateQuotationRequest>();
        c.MapPost("/quotations/calculate", (CalculateRequest r, QuotationService s) => s.Calculate(r)).Validate<CalculateRequest>();
        c.MapPost("/quotations/lookup-by-token", (LookupByTokenRequest r, QuotationService s, CancellationToken ct) => s.LookupByTokenAsync(r.Token, ct));
        c.MapGet("/quotations/export.csv", async (string? search, string? status, Guid? customerId, DateOnly? from, DateOnly? to, HttpContext h, QuotationService s, CancellationToken ct) =>
            CsvFile(await s.ExportCsvAsync(h.Member(), new QuotationListQuery(search, ParseList<QuotationStatus>(status), customerId, from, to, null), ct), "angebote"));
        c.MapGet("/quotations/{id:guid}", (Guid id, QuotationService s, CancellationToken ct) => s.GetAsync(id, ct));
        c.MapPut("/quotations/{id:guid}", (Guid id, UpdateQuotationRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.UpdateAsync(h.Member(), id, r, ct)).Validate<UpdateQuotationRequest>();
        c.MapDelete("/quotations/{id:guid}", async (Guid id, HttpContext h, QuotationService s, CancellationToken ct) =>
        {
            await s.DeleteDraftAsync(h.Member(), id, ct);
            return Results.NoContent();
        });
        c.MapPost("/quotations/{id:guid}/duplicate", (Guid id, HttpContext h, QuotationService s, CancellationToken ct) => s.DuplicateAsync(h.Member(), id, ct));
        c.MapPost("/quotations/{id:guid}/revise", (Guid id, HttpContext h, QuotationService s, CancellationToken ct) => s.ReviseAsync(h.Member(), id, ct));
        c.MapPost("/quotations/{id:guid}/send", (Guid id, SendQuotationRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.SendAsync(h.Member(), id, r, ct))
            .Validate<SendQuotationRequest>().RequireRateLimiting("send");
        c.MapPost("/quotations/{id:guid}/accept", (Guid id, DecisionRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.RecordDecisionAsync(h.Member(), id, true, r.Note, ct)).Validate<DecisionRequest>();
        c.MapPost("/quotations/{id:guid}/reject", (Guid id, DecisionRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.RecordDecisionAsync(h.Member(), id, false, r.Note, ct)).Validate<DecisionRequest>();
        c.MapPost("/quotations/{id:guid}/cancel", (Guid id, CancelRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.CancelAsync(h.Member(), id, r.Reason, ct)).Validate<CancelRequest>();
        c.MapGet("/quotations/{id:guid}/pdf", async (Guid id, HttpContext h, QuotationService s, CancellationToken ct) =>
        {
            var (content, fileName) = await s.PdfAsync(h.Member(), id, ct);
            return PdfFile(h, content, fileName);
        });
        c.MapGet("/quotations/{id:guid}/events", (Guid id, QuotationService s, CancellationToken ct) => s.EventsAsync(id, ct));
        c.MapGet("/quotations/{id:guid}/deliveries", (Guid id, HttpContext h, QuotationService s, CancellationToken ct) => s.DeliveriesAsync(h.Member(), id, ct));
        c.MapGet("/quotations/{id:guid}/follow-ups", (Guid id, QuotationService s, CancellationToken ct) => s.FollowUpsAsync(id, ct));
        c.MapPost("/quotations/{id:guid}/follow-ups/cancel", async (Guid id, HttpContext h, QuotationService s, CancellationToken ct) =>
        {
            await s.CancelFollowUpsAsync(h.Member(), id, ct);
            return Results.NoContent();
        });
        c.MapPost("/quotations/{id:guid}/public-link", (Guid id, HttpContext h, QuotationService s, CancellationToken ct) => s.CreatePublicLinkAsync(h.Member(), id, ct));
        c.MapDelete("/quotations/{id:guid}/public-link", async (Guid id, HttpContext h, QuotationService s, CancellationToken ct) =>
        {
            await s.RevokePublicLinkAsync(h.Member(), id, ct);
            return Results.NoContent();
        });
        c.MapPost("/quotations/{id:guid}/convert-to-job", (Guid id, ConvertToJobRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.ConvertToJobAsync(h.Member(), id, r, ct))
            .Validate<ConvertToJobRequest>();
        c.MapPost("/quotations/{id:guid}/save-as-template", (Guid id, SaveAsTemplateRequest r, HttpContext h, QuotationService s, CancellationToken ct) => s.SaveAsTemplateAsync(h.Member(), id, r, ct))
            .Validate<SaveAsTemplateRequest>();

        // Templates
        c.MapGet("/templates", (TemplateService s, CancellationToken ct) => s.ListAsync(ct));
        c.MapPost("/templates", (UpsertTemplateRequest r, HttpContext h, TemplateService s, CancellationToken ct) => s.CreateAsync(h.Member(), r, ct)).Validate<UpsertTemplateRequest>();
        c.MapGet("/templates/{id:guid}", (Guid id, TemplateService s, CancellationToken ct) => s.GetAsync(id, ct));
        c.MapPut("/templates/{id:guid}", (Guid id, UpsertTemplateRequest r, HttpContext h, TemplateService s, CancellationToken ct) => s.UpdateAsync(h.Member(), id, r, ct)).Validate<UpsertTemplateRequest>();
        c.MapDelete("/templates/{id:guid}", async (Guid id, HttpContext h, TemplateService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(h.Member(), id, ct);
            return Results.NoContent();
        });

        // Jobs
        c.MapGet("/jobs", (string? search, string? status, Guid? assignedUserId, Guid? customerId, string? sort, int? page, int? pageSize, JobService s, CancellationToken ct) =>
            s.ListAsync(new JobListQuery(search, ParseList<JobStatus>(status), assignedUserId, customerId, sort, page ?? 1, pageSize ?? 25), ct));
        c.MapGet("/jobs/export.csv", async (HttpContext h, JobService s, CancellationToken ct) => CsvFile(await s.ExportCsvAsync(h.Member(), ct), "auftraege"));
        c.MapGet("/jobs/{id:guid}", (Guid id, JobService s, CancellationToken ct) => s.GetAsync(id, ct));
        c.MapPut("/jobs/{id:guid}", (Guid id, UpdateJobRequest r, HttpContext h, JobService s, CancellationToken ct) => s.UpdateAsync(h.Member(), id, r, ct)).Validate<UpdateJobRequest>();
        c.MapPost("/jobs/{id:guid}/status", (Guid id, ChangeJobStatusRequest r, HttpContext h, JobService s, CancellationToken ct) => s.ChangeStatusAsync(h.Member(), id, r.Status, ct)).Validate<ChangeJobStatusRequest>();

        // Notifications
        c.MapGet("/notifications", (bool? unreadOnly, int? page, int? pageSize, HttpContext h, NotificationService s, CancellationToken ct) =>
            s.ListAsync(h.Member(), unreadOnly ?? false, page ?? 1, pageSize ?? 25, ct));
        c.MapGet("/notifications/unread-count", async (HttpContext h, NotificationService s, CancellationToken ct) => new { count = await s.UnreadCountAsync(h.Member(), ct) });
        c.MapPost("/notifications/read-all", async (HttpContext h, NotificationService s, CancellationToken ct) =>
        {
            await s.MarkReadAsync(h.Member(), null, ct);
            return Results.NoContent();
        });
        c.MapPost("/notifications/{id:guid}/read", async (Guid id, HttpContext h, NotificationService s, CancellationToken ct) =>
        {
            await s.MarkReadAsync(h.Member(), id, ct);
            return Results.NoContent();
        });
    }

    // ---------- Public customer page ----------
    private static void MapPublic(RouteGroupBuilder g)
    {
        g.MapGet("", (string token, PublicQuotationService s, HttpContext h, CancellationToken ct) =>
        {
            h.Response.Headers.CacheControl = "no-store";
            h.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
            return s.GetAsync(token, ct);
        });
        g.MapGet("/pdf", async (string token, PublicQuotationService s, HttpContext h, CancellationToken ct) =>
        {
            var (content, fileName) = await s.PdfAsync(token, ct);
            return PdfFile(h, content, fileName);
        });
        g.MapGet("/logo", async (string token, PublicQuotationService s, CancellationToken ct) =>
        {
            var logo = await s.LogoAsync(token, ct);
            return logo is null ? Results.NotFound() : Results.Stream(logo.Value.Content, logo.Value.ContentType);
        });
        g.MapPost("/accept", (string token, PublicAcceptRequest r, PublicQuotationService s, CancellationToken ct) => s.DecideAsync(token, true, r.FullName, r.Note, ct))
            .Validate<PublicAcceptRequest>();
        g.MapPost("/reject", (string token, PublicRejectRequest r, PublicQuotationService s, CancellationToken ct) => s.DecideAsync(token, false, r.FullName, r.Reason, ct))
            .Validate<PublicRejectRequest>();
        g.MapPost("/opt-out", async (string token, PublicQuotationService s, CancellationToken ct) =>
        {
            await s.OptOutAsync(token, ct);
            return Results.NoContent();
        });
    }

    private static async Task<IResult> BillingWebhook(string provider, HttpRequest request, BillingService billing, CancellationToken ct)
    {
        using var reader = new StreamReader(request.Body, Encoding.UTF8);
        var payload = await reader.ReadToEndAsync(ct);
        if (payload.Length > 64 * 1024)
        {
            return Results.BadRequest();
        }

        var headers = request.Headers.ToDictionary(h => h.Key, h => h.Value.ToString(), StringComparer.OrdinalIgnoreCase);
        return await billing.HandleWebhookAsync(payload, headers, ct) ? Results.Ok() : Results.BadRequest();
    }

    /// <summary>
    /// Runs scheduled work. Protected by a shared secret (constant-time comparison) and a strict rate limit; it accepts no
    /// parameters, so it cannot be abused to send arbitrary emails. Disabled (404) when no secret is configured.
    /// </summary>
    private static async Task<IResult> RunJobs(HttpContext http, JobRunner runner, IConfiguration configuration, CancellationToken ct)
    {
        var secret = configuration["Jobs:TriggerSecret"];
        if (string.IsNullOrEmpty(secret) || secret.Length < 32)
        {
            return Results.NotFound();
        }

        var header = http.Request.Headers.Authorization.ToString();
        var provided = header.StartsWith("Bearer ", StringComparison.Ordinal) ? header[7..] : string.Empty;
        if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(provided)), SHA256.HashData(Encoding.UTF8.GetBytes(secret))))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(await runner.RunAllAsync(ct));
    }

    private static IResult PdfFile(HttpContext http, byte[] content, string fileName)
    {
        http.Response.Headers.CacheControl = "no-store";
        return Results.File(content, "application/pdf", fileName);
    }

    private static IResult CsvFile(byte[] content, string name) =>
        Results.File(content, "text/csv; charset=utf-8", $"angebotpilot-{name}-{DateTime.UtcNow:yyyy-MM-dd}.csv");

    private static IResult JsonDownload(object data, string fileName) =>
        Results.File(JsonSerializer.SerializeToUtf8Bytes(data, ExportJson), "application/json", fileName);

    private static List<T>? ParseList<T>(string? value)
        where T : struct, Enum
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var list = new List<T>();
        foreach (var part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (Enum.TryParse<T>(part, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed))
            {
                list.Add(parsed);
            }
        }

        return list;
    }

    internal static string Invariant(FormattableString s) => s.ToString(CultureInfo.InvariantCulture);
}
