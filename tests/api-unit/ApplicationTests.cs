using System.Text;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Validation;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.UnitTests;

public class ValidatorTests
{
    [Theory]
    [InlineData("kurz1", false)]
    [InlineData("nurbuchstaben", false)]
    [InlineData("1234567890", false)]
    [InlineData("sicheres-Passwort-7", true)]
    public void Password_policy(string password, bool valid)
    {
        var result = new RegisterRequestValidator().Validate(new RegisterRequest("a@b.de", password, "Test", true));
        Assert.Equal(valid, result.Errors.All(e => e.PropertyName != "Password"));
    }

    [Fact]
    public void Registration_requires_terms_acceptance()
    {
        var result = new RegisterRequestValidator().Validate(new RegisterRequest("a@b.de", "sicheres-Passwort-7", "Test", false));
        Assert.Contains(result.Errors, e => e.PropertyName == "AcceptTerms");
    }

    [Theory]
    [InlineData("DE89370400440532013000", true)]
    [InlineData("DE89 3704 0044 0532 0130 00", true)]
    [InlineData("DE89370400440532013001", false)]
    [InlineData("XX00", false)]
    public void Iban_checksum(string iban, bool valid) => Assert.Equal(valid, Rules.IsValidIban(iban));

    [Fact]
    public void Line_items_reject_negative_prices_quantities_and_too_many_decimals()
    {
        var v = new LineItemInputValidator();
        Assert.False(v.Validate(new LineItemInput("A", null, 0, "Stk.", 10, 0, 19)).IsValid);
        Assert.False(v.Validate(new LineItemInput("A", null, 1, "Stk.", -1, 0, 19)).IsValid);
        Assert.False(v.Validate(new LineItemInput("A", null, 1, "Stk.", 10.001m, 0, 19)).IsValid);
        Assert.False(v.Validate(new LineItemInput("A", null, 1.0001m, "Stk.", 10, 0, 19)).IsValid);
        Assert.False(v.Validate(new LineItemInput("", null, 1, "Stk.", 10, 0, 19)).IsValid);
        Assert.False(v.Validate(new LineItemInput("A", null, 1, "Stk.", 10, 120, 19)).IsValid);
        Assert.True(v.Validate(new LineItemInput("A", null, 2.5m, "Std.", 48.5m, 10, 19)).IsValid);
    }

    [Fact]
    public void Business_customer_requires_company_name_private_requires_last_name()
    {
        var v = new UpsertCustomerRequestValidator();
        var business = Customer(CustomerType.Business, null, "Muster");
        Assert.Contains(v.Validate(business).Errors, e => e.PropertyName == "CompanyName");
        var person = Customer(CustomerType.Private, null, null);
        Assert.Contains(v.Validate(person).Errors, e => e.PropertyName == "LastName");
        Assert.True(v.Validate(Customer(CustomerType.Private, null, "Muster")).IsValid);
    }

    [Fact]
    public void Validity_must_not_precede_issue_date()
    {
        var request = new UpdateQuotationRequest(Guid.NewGuid(), "Titel", new DateOnly(2026, 10, 10), new DateOnly(2026, 10, 9), TaxMode.Standard,
            null, null, null, null, null, [new LineItemInput("A", null, 1, "Stk.", 1, 0, 19)], "AAAA");
        Assert.Contains(new UpdateQuotationRequestValidator().Validate(request).Errors, e => e.PropertyName == "ValidUntil");
    }

    [Fact]
    public void Email_send_needs_pdf_or_link()
    {
        var v = new SendQuotationRequestValidator();
        Assert.False(v.Validate(new SendQuotationRequest(SendMode.Email, null, null, null, false, false, true)).IsValid);
        Assert.True(v.Validate(new SendQuotationRequest(SendMode.Email, null, null, null, true, false, true)).IsValid);
        Assert.True(v.Validate(new SendQuotationRequest(SendMode.Manual, null, null, null, false, false, false)).IsValid);
    }

    [Fact]
    public void Settings_validate_prefix_and_reminder_spacing()
    {
        var dto = new CompanySettingsDto("an-1", "AU", 30, TaxMode.Standard, null, null, null, null, false, null, null, null, null, null, null,
            true, 5, true, 6, true, 3, true, true);
        var errors = new CompanySettingsValidator().Validate(dto).Errors;
        Assert.Contains(errors, e => e.PropertyName == "QuotationPrefix");
        Assert.Contains(errors, e => e.PropertyName == "SecondReminderAfterDays");
    }

    [Fact]
    public void Public_acceptance_requires_name_and_confirmation()
    {
        var v = new PublicAcceptRequestValidator();
        Assert.False(v.Validate(new PublicAcceptRequest("", true, null)).IsValid);
        Assert.False(v.Validate(new PublicAcceptRequest("Max Muster", false, null)).IsValid);
        Assert.True(v.Validate(new PublicAcceptRequest("Max Muster", true, null)).IsValid);
    }

    private static UpsertCustomerRequest Customer(CustomerType type, string? company, string? lastName) =>
        new(type, company, null, null, lastName, null, null, null, null, null, null, false, null, null, null, null, null, null, false, null);
}

public class CsvTests
{
    [Fact]
    public void Writes_utf8_bom_semicolons_and_quotes()
    {
        var bytes = Csv.Write(["Name", "Betrag"], [["Müller; Söhne", "1.234,50"], ["Zeile\n2", "\"Zitat\""]]);
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);
        var text = Encoding.UTF8.GetString(bytes[3..]);
        Assert.Equal("Name;Betrag\r\n\"Müller; Söhne\";\"1.234,50\"\r\n\"Zeile\n2\";\"\"\"Zitat\"\"\"\r\n", text);
    }

    [Theory]
    [InlineData("=HYPERLINK(\"x\")")]
    [InlineData("+49 221")]
    [InlineData("@SUM(A1)")]
    public void Guards_against_formula_injection(string value) => Assert.StartsWith("'", Csv.Escape(value).Trim('"'));

    [Fact]
    public void Formats_money_and_dates_for_german_excel()
    {
        Assert.Equal("1234,50", Csv.Money(1234.5m));
        Assert.Equal("03.10.2026", Csv.Date(new DateOnly(2026, 10, 3)));
    }
}

public class SecureTokenTests
{
    [Fact]
    public void Tokens_are_random_url_safe_and_hashed()
    {
        var a = SecureTokens.Create();
        var b = SecureTokens.Create();
        Assert.NotEqual(a, b);
        Assert.True(a.Length >= 43);
        Assert.True(SecureTokens.LooksValid(a));
        Assert.Equal(64, SecureTokens.Hash(a).Length);
        Assert.Equal(SecureTokens.Hash(a), SecureTokens.Hash(a));
        Assert.False(SecureTokens.LooksValid("../../etc"));
        Assert.False(SecureTokens.LooksValid("short"));
    }
}

public class EmailTemplateTests
{
    [Fact]
    public void Quotation_email_contains_number_next_step_and_opt_out_but_no_tracking()
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.ReplaceLineItems([QuotationCalculatorTests.Item(1, 100m, 0, 19)]);
        q.RecipientContact = "Frau <b>Becker</b>";
        var mail = EmailTemplates.QuotationSent(q, "Muster & Co", null, null, "https://app.example/#/q/token", true, null, "https://app.example/#/q/token?abmelden=1", "#2F45D8");

        Assert.Equal("Ihr Angebot AN-2026-0001 von Muster & Co", mail.Subject);
        Assert.Contains("119,00 €", mail.BodyText);
        Assert.Contains("online annehmen", mail.BodyText);
        Assert.Contains("abmelden=1", mail.BodyText);
        Assert.Contains("Frau &lt;b&gt;Becker&lt;/b&gt;", mail.BodyHtml);
        Assert.DoesNotContain("<img", mail.BodyHtml, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(FollowUpKind.FirstReminder, "Kurze Nachfrage")]
    [InlineData(FollowUpKind.SecondReminder, "Nachfrage")]
    [InlineData(FollowUpKind.ExpiryReminder, "noch bis")]
    public void Reminder_subjects(FollowUpKind kind, string expected)
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.ReplaceLineItems([QuotationCalculatorTests.Item(1, 100m, 0, 19)]);
        Assert.Contains(expected, EmailTemplates.Reminder(kind, q, "Firma", "https://x/#/q/t", false, null, "https://x/#/q/t?abmelden=1", "#000000").Subject);
    }
}
