using System.Security.Cryptography;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Background;
using AngebotPilot.Application.Companies;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Application.Invoices;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Application.Templates;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Users;
using AngebotPilot.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Api.Infrastructure;

/// <summary>
/// Explicit, opt-in development seed (<c>dotnet run -- seed-demo</c>). Creates one clearly labelled demo company
/// ("… (Demo)", IsDemo = true) with fictitious data, built through the regular services. Never runs automatically,
/// refuses Production, and never uses a fixed password: it takes DEMO_PASSWORD or generates one.
/// </summary>
public static class DemoSeeder
{
    public const string DemoEmail = "demo@angebotpilot.example";

    public static async Task SeedAsync(IServiceProvider sp)
    {
        var db = sp.GetRequiredService<AppDbContext>();
        var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("DemoSeeder");
        var normalized = User.Normalize(DemoEmail);
        if (await db.Users.AnyAsync(u => u.NormalizedEmail == normalized))
        {
            logger.LogInformation("Demo user already exists – nothing to do.");
            return;
        }

        var password = Environment.GetEnvironmentVariable("DEMO_PASSWORD");
        var generated = string.IsNullOrWhiteSpace(password);
        if (generated)
        {
            password = "Demo-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)) + "9";
        }

        var clock = sp.GetRequiredService<TimeProvider>();
        var now = clock.GetUtcNow();
        var user = new User { Email = DemoEmail, NormalizedEmail = normalized, DisplayName = "Lena Muster", CreatedAt = now, EmailVerifiedAt = now };
        user.PasswordHash = sp.GetRequiredService<IPasswordHasher<User>>().HashPassword(user, password!);
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var companies = sp.GetRequiredService<CompanyService>();
        var company = await companies.CreateAsync(user.Id, new CreateCompanyRequest(
            "Muster Elektrotechnik (Demo)", "Beispielweg 12", "50667", "Köln", "DE", "kontakt@muster-elektro.example", "0221 1234567", "DE123456789", TaxMode.Standard, "AN"), default);
        var c = await db.Companies.FirstAsync(x => x.Id == company.Id);
        c.IsDemo = true;
        c.Website = "muster-elektro.example";
        var settings = await db.CompanySettings.FirstAsync(s => s.CompanyId == company.Id);
        settings.ShowBankDetails = true;
        settings.BankAccountHolder = "Muster Elektrotechnik";
        settings.BankName = "Beispielbank";
        settings.Iban = "DE02120300000000202051";
        settings.Bic = "BYLADEM1001";
        settings.SecondReminderEnabled = true;
        await db.SaveChangesAsync();

        sp.GetRequiredService<ITenantContext>().Set(company.Id);
        var membership = await db.Memberships.FirstAsync(m => m.CompanyId == company.Id && m.UserId == user.Id);
        var member = new CurrentMember(user.Id, company.Id, membership.Id, MembershipRole.Owner);

        var customers = sp.GetRequiredService<CustomerService>();
        var cBakery = await customers.CreateAsync(member, Customer(CustomerType.Business, "Bäckerei Sonnenschein GmbH", "Frau", "Anna", "Becker", "anna.becker@baeckerei-sonnenschein.example", "Hauptstraße 5", "50672", "Köln"), default);
        var cOffice = await customers.CreateAsync(member, Customer(CustomerType.Business, "Kanzlei Weber & Partner", "Herr", "Thomas", "Weber", "t.weber@kanzlei-weber.example", "Ringstraße 18", "50674", "Köln"), default);
        var cPrivate = await customers.CreateAsync(member, Customer(CustomerType.Private, null, "Herr", "Jonas", "Schäfer", "jonas.schaefer@mail.example", "Lindenallee 3", "50858", "Köln"), default);
        var cSchool = await customers.CreateAsync(member, Customer(CustomerType.Business, "Kita Regenbogen e. V.", "Frau", "Miriam", "Özdemir", "verwaltung@kita-regenbogen.example", "Parkweg 9", "50733", "Köln"), default);
        await customers.CreateAsync(member, Customer(CustomerType.Private, null, "Frau", "Sophie", "Krüger", "sophie.krueger@mail.example", "Am Weiher 21", "51069", "Köln"), default);

        var templates = sp.GetRequiredService<TemplateService>();
        await templates.CreateAsync(member, new UpsertTemplateRequest("E-Check Gewerbe", "Prüfung ortsveränderlicher Geräte nach DGUV V3", null, null, null, null,
        [
            new TemplateLineItemInput("Anfahrt", "Pauschale im Stadtgebiet", 1, "pauschal", 39m, 0, 19),
            new TemplateLineItemInput("Prüfung ortsveränderlicher Geräte", "inkl. Prüfprotokoll und Prüfplakette", 25, "Stk.", 6.9m, 0, 19),
            new TemplateLineItemInput("Dokumentation", "Digitales Prüfprotokoll", 1, "pauschal", 45m, 0, 19),
        ]), default);

        var quotations = sp.GetRequiredService<QuotationService>();
        var today = DateOnly.FromDateTime(now.UtcDateTime);

        // Accepted + converted to job
        var q1 = await quotations.CreateAsync(member, Quote(cBakery.Id, "Erneuerung Unterverteilung Backstube", today.AddDays(-20),
        [
            Line("Unterverteilung 3-reihig", "Montage inkl. Hutschienen und Klemmen", 1, "Stk.", 489m, 0, 19),
            Line("Fehlerstromschutzschalter 40 A", "Typ A, 4-polig", 2, "Stk.", 89.5m, 0, 19),
            Line("Leitungsschutzschalter B16", null, 12, "Stk.", 11.9m, 5, 19),
            Line("Arbeitszeit Elektromeister", null, 6.5m, "Std.", 72m, 0, 19),
        ]), default);
        await quotations.SendAsync(member, q1.Id, new SendQuotationRequest(SendMode.Email, null, null, null, true, true, true), default);
        await quotations.RecordDecisionAsync(member, q1.Id, true, "Telefonisch zugesagt", default);
        var job1 = await quotations.ConvertToJobAsync(member, q1.Id, new ConvertToJobRequest(null, "Arbeiten vor Ladenöffnung (ab 5 Uhr)", today.AddDays(5), today.AddDays(12), user.Id, null), default);

        // Sent, awaiting decision, follow-ups scheduled
        var q2 = await quotations.CreateAsync(member, Quote(cOffice.Id, "LED-Umrüstung Büroflächen 2. OG", today.AddDays(-3),
        [
            Line("LED-Panel 62x62 cm", "4000 K, UGR < 19", 24, "Stk.", 64.9m, 10, 19),
            Line("Demontage Altleuchten inkl. Entsorgung", null, 24, "Stk.", 9.5m, 0, 19),
            Line("Montage", null, 12, "Std.", 68m, 0, 19),
        ]), default);
        await quotations.SendAsync(member, q2.Id, new SendQuotationRequest(SendMode.Email, null, null, null, true, true, true), default);

        // Sent to a private customer, reduced VAT line, expiring soon
        var q3 = await quotations.CreateAsync(member, Quote(cPrivate.Id, "Wallbox-Installation Carport", today.AddDays(-25),
        [
            Line("Wallbox 11 kW", "inkl. Lastmanagement-Vorbereitung", 1, "Stk.", 749m, 0, 19),
            Line("Zuleitung NYY-J 5x6 mm²", null, 18, "m", 14.2m, 0, 19),
            Line("Installation und Inbetriebnahme", null, 5, "Std.", 72m, 0, 19),
        ]), default);
        await quotations.SendAsync(member, q3.Id, new SendQuotationRequest(SendMode.Email, null, null, null, true, true, true), default);
        await db.Quotations.Where(x => x.Id == q3.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ValidUntil, today.AddDays(4)));

        // Rejected
        var q4 = await quotations.CreateAsync(member, Quote(cSchool.Id, "Rauchwarnmelder Gruppenräume", today.AddDays(-40),
        [
            Line("Rauchwarnmelder mit 10-Jahres-Batterie", null, 14, "Stk.", 32.5m, 0, 19),
            Line("Montage und Funktionsprüfung", null, 4, "Std.", 64m, 0, 19),
        ]), default);
        await quotations.SendAsync(member, q4.Id, new SendQuotationRequest(SendMode.Manual, null, null, null, null, true, false), default);
        await quotations.RecordDecisionAsync(member, q4.Id, false, "Budget erst im nächsten Jahr", default);

        // Expired
        var q5 = await quotations.CreateAsync(member, Quote(cOffice.Id, "Netzwerkverkabelung Besprechungsraum", today.AddDays(-50),
        [
            Line("Netzwerkdose Cat 6A, 2-fach", null, 6, "Stk.", 38m, 0, 19),
            Line("Verlegekabel Cat 7", null, 85, "m", 2.9m, 0, 19),
            Line("Arbeitszeit", null, 7, "Std.", 64m, 0, 19),
        ]), default);
        await quotations.SendAsync(member, q5.Id, new SendQuotationRequest(SendMode.Manual, null, null, null, null, false, false), default);
        await db.Quotations.Where(x => x.Id == q5.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ValidUntil, today.AddDays(-5)));

        // Drafts
        await quotations.CreateAsync(member, Quote(cBakery.Id, "Außenbeleuchtung Parkplatz", today,
        [
            Line("LED-Mastleuchte 40 W", null, 4, "Stk.", 289m, 0, 19),
            Line("Erdkabel NYY-J 3x2,5 mm²", null, 60, "m", 4.8m, 0, 19),
        ]), default);

        db.ChangeTracker.Clear();
        // Invoices: a draft from the job, a paid invoice and an overdue, partly paid one.
        var invoices = sp.GetRequiredService<InvoiceService>();
        await invoices.CreateFromJobAsync(member, job1.Id, default);
        var paid = await invoices.CreateAsync(member, new CreateInvoiceRequest(cOffice.Id, "Prüfung ortsfester Anlagen (DGUV V3)", today.AddDays(-12), today.AddDays(-15), null, null,
            null, null, null, null, "Bestellung 2026-118", null,
        [
            new LineItemInput("Prüfung ortsfeste Anlage Bürofläche", "inkl. Prüfprotokoll", 1, "pauschal", 420m, 0, 19),
            new LineItemInput("Austausch defekter FI-Schutzschalter", null, 2, "Stk.", 68.5m, 0, 19),
        ]), default);
        await invoices.IssueAsync(member, paid.Id, default);
        await invoices.SendAsync(member, paid.Id, new SendInvoiceRequest(SendMode.Manual, null, null, null), default);
        await invoices.RecordPaymentAsync(member, paid.Id, new RecordPaymentRequest(paid.Totals.GrossTotal, today.AddDays(-2), "Überweisung", null), default);
        var overdue = await invoices.CreateAsync(member, new CreateInvoiceRequest(cSchool.Id, "Wartung Notbeleuchtung", today.AddDays(-30), today.AddDays(-33), today.AddDays(-31), null,
            null, null, null, null, null, null,
        [
            new LineItemInput("Wartung Sicherheitsbeleuchtung", "Funktions- und Dauerprüfung, 18 Leuchten", 18, "Stk.", 14.5m, 0, 19),
            new LineItemInput("Ersatzakku Notleuchte", null, 4, "Stk.", 32m, 0, 19),
            new LineItemInput("Anfahrt", null, 1, "pauschal", 35m, 0, 19),
        ]), default);
        await invoices.IssueAsync(member, overdue.Id, default);
        await invoices.SendAsync(member, overdue.Id, new SendInvoiceRequest(SendMode.Manual, null, null, null), default);
        await invoices.RecordPaymentAsync(member, overdue.Id, new RecordPaymentRequest(150m, today.AddDays(-5), "Überweisung", "Teilzahlung"), default);

        await sp.GetRequiredService<JobRunner>().RunAllAsync(default);
        logger.LogWarning("Demo data created. Login: {Email} / {Password}{Hint}", DemoEmail, generated ? password : "(DEMO_PASSWORD)", generated ? " (generated – store it now)" : string.Empty);
    }

    private static UpsertCustomerRequest Customer(CustomerType type, string? company, string salutation, string first, string last, string email, string street, string zip, string city) =>
        new(type, company, salutation, first, last, email, "0221 " + Math.Abs(email.GetHashCode(StringComparison.Ordinal) % 9000000 + 1000000), street, zip, city, "DE", false, null, null, null, null, null, null, false, null);

    private static CreateQuotationRequest Quote(Guid customerId, string title, DateOnly issueDate, IReadOnlyList<LineItemInput> items) =>
        new(customerId, title, null, issueDate, DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30), TaxMode.Standard, null, null, null, null, null, items);

    private static LineItemInput Line(string title, string? description, decimal quantity, string unit, decimal price, decimal discount, decimal tax) =>
        new(title, description, quantity, unit, price, discount, tax);
}
