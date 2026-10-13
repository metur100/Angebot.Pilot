using System.Globalization;
using System.Runtime.CompilerServices;
using System.Text;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Invoices;
using AngebotPilot.Application.Validation;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Quotations;
using AngebotPilot.Infrastructure.Pdf;
using Microsoft.Extensions.Logging.Abstractions;
using UglyToad.PdfPig;

namespace AngebotPilot.UnitTests;

internal static class TestCulture
{
    /// <summary>Messages default to German whatever the machine's UI language is; tests opt into English with <see cref="Loc.Use"/>.</summary>
#pragma warning disable CA2255 // Test assembly, not a library: the initializer only pins the default UI culture.
    [ModuleInitializer]
#pragma warning restore CA2255
    internal static void UseGermanMessagesByDefault() => CultureInfo.DefaultThreadCurrentUICulture = Loc.GermanCulture;
}

public class LocTests
{
    [Fact]
    public void Picks_german_by_default_and_english_when_requested()
    {
        Assert.Equal("Hallo", Loc.T("Hallo", "Hello"));
        using (Loc.Use("en"))
        {
            Assert.True(Loc.IsEnglish);
            Assert.Equal("Hello", Loc.T("Hallo", "Hello"));
        }

        Assert.Equal("Hallo", Loc.T("Hallo", "Hello"));
    }

    [Theory]
    [InlineData(null, "de")]
    [InlineData("", "de")]
    [InlineData("de", "de")]
    [InlineData("en", "en")]
    [InlineData("EN", "en")]
    [InlineData("en-GB", "en")]
    [InlineData("fr", "de")]
    public void Normalizes_languages(string? input, string expected) => Assert.Equal(expected, Loc.Normalize(input));

    [Fact]
    public void Explicit_language_ignores_the_current_culture()
    {
        using (Loc.Use("en"))
        {
            Assert.Equal("Hallo", Loc.For("de", "Hallo", "Hello"));
        }

        Assert.Equal("Hello", Loc.For("en", "Hallo", "Hello"));
    }
}

public class LocalizedValidatorTests
{
    private static readonly RegisterRequest NoTerms = new("a@b.de", "kurz", "Test", false);

    [Fact]
    public void Messages_are_german_by_default()
    {
        var errors = new RegisterRequestValidator().Validate(NoTerms).Errors;
        Assert.Contains(errors, e => e.ErrorMessage == "Bitte stimmen Sie den Nutzungsbedingungen zu.");
        Assert.Contains(errors, e => e.ErrorMessage == "Das Passwort muss mindestens 10 Zeichen lang sein.");
    }

    [Fact]
    public void Messages_follow_the_request_language()
    {
        using (Loc.Use("en"))
        {
            var errors = new RegisterRequestValidator().Validate(NoTerms).Errors;
            Assert.Contains(errors, e => e.ErrorMessage == "Please accept the terms of use.");
            Assert.Contains(errors, e => e.ErrorMessage == "The password must be at least 10 characters long.");
        }

        // The same validator instance switches back (messages are resolved per validation, not at construction).
        var validator = new LineItemInputValidator();
        var invalid = new LineItemInput("", null, 1, "Stk.", 10, 0, 19);
        Assert.Contains(validator.Validate(invalid).Errors, e => e.ErrorMessage == "Bitte Bezeichnung angeben.");
        using (Loc.Use("en"))
        {
            Assert.Contains(validator.Validate(invalid).Errors, e => e.ErrorMessage == "Please enter a description.");
        }
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("de", true)]
    [InlineData("en", true)]
    [InlineData("fr", false)]
    [InlineData("EN", false)]
    public void Profile_and_registration_accept_only_de_or_en(string? language, bool valid)
    {
        Assert.Equal(valid, new UpdateProfileRequestValidator().Validate(new UpdateProfileRequest("Test", language)).IsValid);
        var register = new RegisterRequest("a@b.de", "sicheres-Passwort-7", "Test", true, Language: language);
        Assert.Equal(valid, new RegisterRequestValidator().Validate(register).IsValid);
    }
}

public class LocalizedDomainMessageTests
{
    [Fact]
    public void Issue_problems_and_domain_errors_follow_the_request_language()
    {
        var invoice = InvoiceDomainTests.NewInvoice();
        invoice.ReplaceLineItems([]);
        Assert.Contains(invoice.IssueProblems(invoice.IssueDate), p => p == "Die Rechnung enthält keine Positionen.");
        using (Loc.Use("en"))
        {
            Assert.Contains(invoice.IssueProblems(invoice.IssueDate), p => p == "The invoice has no line items.");
            var ex = Assert.Throws<DomainException>(() => QuotationTransitions.Ensure(QuotationStatus.Accepted, QuotationStatus.Draft));
            Assert.Equal("The status cannot be changed from “Accepted” to “Draft”.", ex.Message);
        }

        var german = Assert.Throws<DomainException>(() => QuotationTransitions.Ensure(QuotationStatus.Accepted, QuotationStatus.Draft));
        Assert.Equal("Der Status kann nicht von „Angenommen“ zu „Entwurf“ geändert werden.", german.Message);
    }
}

public class StoredTextTests
{
    [Theory]
    [InlineData("Angebots-E-Mail an kunde@example.com", "Quotation email to kunde@example.com")]
    [InlineData("1. Erinnerung", "1st reminder")]
    [InlineData("Zahlungserinnerung an kunde@example.com", "Payment reminder to kunde@example.com")]
    [InlineData("Automatische Zahlungserinnerung an kunde@example.com", "Automatic payment reminder to kunde@example.com")]
    [InlineData("An kunde@example.com", "To kunde@example.com")]
    [InlineData("Kopie von AN-2026-0042", "Copy of AN-2026-0042")]
    [InlineData("Kopie von Entwurf", "Copy of draft")]
    [InlineData("Revision 2 von AN-2026-0042", "Revision 2 of AN-2026-0042")]
    [InlineData("Aus Vorlage „Badsanierung“", "From template “Badsanierung”")]
    [InlineData("Ersetzt durch AN-2026-0042-R1", "Superseded by AN-2026-0042-R1")]
    [InlineData("1.234,50 € am 03.10.2026", "1.234,50 € on 03.10.2026")]
    [InlineData("Vom Anbieter erfasst: Telefonisch zugesagt", "Recorded by the provider: Telefonisch zugesagt")]
    [InlineData("Über den Kundenlink von Erika Musterfrau", "Via the customer link by Erika Musterfrau")]
    [InlineData("Angebot abgelaufen", "Quotation expired")]
    [InlineData("Vom Mailserver abgelehnt (550).", "Rejected by the mail server (550).")]
    [InlineData("Angebot AN-2026-0042 wurde angenommen", "Quotation AN-2026-0042 was accepted")]
    [InlineData("Kunde AG hat das Angebot „Neue Heizung“ abgelehnt.", "Kunde AG rejected the quotation “Neue Heizung”.")]
    [InlineData("E-Mail zu Rechnung RE-2026-0007 konnte nicht versendet werden", "Email for invoice RE-2026-0007 could not be sent")]
    public void Translates_known_system_texts_for_english_requests(string german, string english)
    {
        Assert.Equal(german, StoredText.Localize(german));
        using (Loc.Use("en"))
        {
            Assert.Equal(english, StoredText.Localize(german));
        }
    }

    [Theory]
    [InlineData("An den Kunden persönlich übergeben")]
    [InlineData("Kunde hat telefonisch abgesagt")]
    [InlineData("SmtpException")]
    public void Leaves_user_text_and_unknown_texts_unchanged(string text)
    {
        using (Loc.Use("en"))
        {
            Assert.Equal(text, StoredText.Localize(text));
        }
    }

    [Fact]
    public void Activity_summaries_are_only_translated_for_the_action_that_wrote_them()
    {
        using (Loc.Use("en"))
        {
            Assert.Equal("from quotation AN-2026-0042", StoredText.ActivitySummary("invoice.created", "aus Angebot AN-2026-0042"));
            Assert.Equal("AN-2026-0042 (number will not be reused)", StoredText.ActivitySummary("quotation.deleted", "AN-2026-0042 (Nummer wird nicht erneut vergeben)"));
            Assert.Equal("Verein für Kultur", StoredText.ActivitySummary("customer.created", "Verein für Kultur"));
        }
    }
}

public class LocalizedEmailTests
{
    [Fact]
    public void Account_emails_keep_the_german_text_and_have_an_english_version()
    {
        var german = EmailTemplates.PasswordReset("Max", "https://app.example/#/reset-password?token=abc", "AngebotPilot");
        Assert.Equal("Passwort zurücksetzen – AngebotPilot", german.Subject);
        Assert.StartsWith("Hallo Max,", german.BodyText, StringComparison.Ordinal);
        Assert.Contains("Sie haben angefordert, Ihr Passwort zurückzusetzen. Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden.", german.BodyText, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"de\">", german.BodyHtml, StringComparison.Ordinal);
        Assert.Equal(german, EmailTemplates.PasswordReset("Max", "https://app.example/#/reset-password?token=abc", "AngebotPilot", "de"));

        var english = EmailTemplates.PasswordReset("Max", "https://app.example/#/reset-password?token=abc", "AngebotPilot", "en");
        Assert.Equal("Reset your password – AngebotPilot", english.Subject);
        Assert.Contains("Set a new password: https://app.example/#/reset-password?token=abc", english.BodyText, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"en\">", english.BodyHtml, StringComparison.Ordinal);

        Assert.Equal("Please confirm your email address – AngebotPilot", EmailTemplates.EmailVerification("Max", "https://x", "AngebotPilot", "en").Subject);
        Assert.Equal("Invitation to Firma GmbH on AngebotPilot", EmailTemplates.Invitation("Firma GmbH", "Max", MembershipRole.Admin, "https://x", "AngebotPilot", "en").Subject);
        Assert.Contains("als Administrator:in beizutreten", EmailTemplates.Invitation("Firma GmbH", "Max", MembershipRole.Admin, "https://x", "AngebotPilot").BodyText, StringComparison.Ordinal);
    }

    [Fact]
    public void Customer_emails_stay_german_for_english_requests()
    {
        var q = SampleQuotation();
        var invoice = InvoiceDomainTests.NewInvoice();
        invoice.Issue("RE-2026-0007", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        ComposedEmail[] Compose() =>
        [
            EmailTemplates.QuotationSent(q, "Firma GmbH", null, null, "https://x/q/abc", true, null, "https://x/q/abc?abmelden=1", "#2F45D8"),
            EmailTemplates.Reminder(FollowUpKind.FirstReminder, q, "Firma GmbH", "https://x/q/abc", false, null, null, "#2F45D8"),
            EmailTemplates.InvoiceSent(invoice, "Firma GmbH", null, null, null, "#2F45D8"),
            EmailTemplates.PaymentReminder(invoice, "Firma GmbH", null, null, "#2F45D8"),
        ];

        var german = Compose();
        using (Loc.Use("en"))
        {
            Assert.Equal(german, Compose());
        }
    }

    [Fact]
    public void Documents_are_identical_for_english_requests()
    {
        var q = SampleQuotation();
        var invoice = InvoiceDomainTests.NewInvoice();
        invoice.Issue("RE-2026-0007", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        var seller = EInvoiceTests.Seller();
        var invoiceRenderer = new InvoicePdfRenderer(NullLogger<InvoicePdfRenderer>.Instance);
        (string Xml, string InvoicePdf, string QuotationPdf, string Csv) Render() =>
        (
            Encoding.UTF8.GetString(EInvoiceWriter.Write(invoice, seller)),
            PdfText(invoiceRenderer.Render(new PdfInvoice(invoice, seller, false, InvoiceDocuments.GiroCode(invoice, seller)))),
            PdfText(new QuotationPdfRenderer().Render(new PdfQuotation(q, seller, "https://x/q/abc", false))),
            Encoding.UTF8.GetString(Csv.Write(["Betrag", "Datum"], [[Csv.Money(1234.5m), Csv.Date(invoice.DueDate)]])));

        var german = Render();
        using (Loc.Use("en"))
        {
            Assert.Equal(german, Render());
        }

        Assert.Contains("Zahlbar bis zum", german.Xml, StringComparison.Ordinal);
        Assert.Contains("Rechnungsdatum", german.InvoicePdf, StringComparison.Ordinal);
        Assert.Contains("1234,50", german.Csv, StringComparison.Ordinal);
    }

    private static Quotation SampleQuotation()
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.RecipientName = "Kunde AG";
        q.RecipientEmail = "kunde@example.com";
        q.ReplaceLineItems([new QuotationLineItem { Title = "Montage", Quantity = 2.5m, Unit = "Std.", UnitPriceNet = 48m, TaxRatePercent = 19 }]);
        return q;
    }

    private static string PdfText(byte[] pdf)
    {
        using var doc = PdfDocument.Open(pdf);
        return string.Join(' ', doc.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
    }
}
