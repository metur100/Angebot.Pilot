using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.IntegrationTests.Infrastructure;
using UglyToad.PdfPig;

namespace AngebotPilot.IntegrationTests;

/// <summary>Accept-Language selects German or English messages; the user's stored language drives account emails; documents never change.</summary>
[Collection(ApiCollection.Name)]
public class LocalizationTests(ApiFactory api)
{
    [Theory]
    [InlineData(null, "de")]
    [InlineData("de-DE", "de")]
    [InlineData("en", "en")]
    [InlineData("en-US,en;q=0.9,de;q=0.8", "en")]
    [InlineData("fr-FR,en;q=0.5", "en")]
    [InlineData("fr", "de")]
    public async Task Validation_errors_follow_accept_language(string? acceptLanguage, string expected)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/register")
        {
            Content = JsonContent.Create(new RegisterRequest("new@test.example", "kurz", "X", false), options: ApiFactory.Json),
        };
        if (acceptLanguage is not null)
        {
            request.Headers.TryAddWithoutValidation("Accept-Language", acceptLanguage);
        }

        var response = await api.CreateClient().SendAsync(request);
        await ProblemAssert.HasAsync(response, HttpStatusCode.BadRequest, "validation_failed");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(expected, response.Content.Headers.ContentLanguage.Single());
        if (expected == "en")
        {
            Assert.Contains("\"title\":\"Invalid input\"", body, StringComparison.Ordinal);
            Assert.Contains("The password must be at least 10 characters long.", body, StringComparison.Ordinal);
            Assert.Contains("Please accept the terms of use.", body, StringComparison.Ordinal);
        }
        else
        {
            Assert.Contains("\"title\":\"Ungültige Eingaben\"", body, StringComparison.Ordinal);
            Assert.Contains("Das Passwort muss mindestens 10 Zeichen lang sein.", body, StringComparison.Ordinal);
            Assert.Contains("Bitte stimmen Sie den Nutzungsbedingungen zu.", body, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Business_errors_and_event_details_are_translated_for_english_requests()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Sprachen GmbH");
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q.Id, false, SendMode.Manual);

        var german = await user.RawPostAsync($"{user.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, null, null));
        Assert.Contains("Nur angenommene Angebote", await german.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        user.Client.DefaultRequestHeaders.AcceptLanguage.Add(new StringWithQualityHeaderValue("en"));
        var english = await user.RawPostAsync($"{user.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, null, null));
        await ProblemAssert.HasAsync(english, HttpStatusCode.Conflict, "quotation_not_accepted");
        Assert.Contains("Only accepted quotations can be converted into a job.", await english.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var events = await user.GetAsync<List<QuotationEventDto>>($"{user.C}/quotations/{q.Id}/events");
        Assert.Contains(events, e => e.Type == QuotationEventType.MarkedAsSent && e.Details == "Delivered by the provider without email");
        var activity = await user.GetAsync<PagedResult<ActivityDto>>($"{user.C}/activity");
        Assert.Contains(activity.Items, a => a.Type == "quotation.marked_sent" && a.Summary.StartsWith("Quotation marked as sent", StringComparison.Ordinal));
        Assert.StartsWith("Conversion rate", (await user.GetAsync<DashboardDto>($"{user.C}/dashboard")).ConversionRateDefinition, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Profile_language_round_trip()
    {
        var user = await api.RegisterAsync();
        Assert.Equal("de", (await user.GetAsync<MeDto>("/api/v1/me")).Language);

        var updated = await PatchMeAsync(user, new { displayName = "Ana English", language = "en" });
        Assert.Equal("en", updated.Language);
        Assert.Equal("Ana English", updated.DisplayName);

        // Older clients omit the language: it stays unchanged.
        Assert.Equal("en", (await PatchMeAsync(user, new { displayName = "Ana" })).Language);
        Assert.Equal("en", (await user.GetAsync<MeDto>("/api/v1/me")).Language);

        var invalid = await user.Client.PatchAsJsonAsync("/api/v1/me", new { displayName = "Ana", language = "fr" }, ApiFactory.Json);
        await ProblemAssert.HasAsync(invalid, HttpStatusCode.BadRequest, "validation_failed");
        Assert.Contains("\"language\"", await invalid.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        Assert.Contains("\"language\": \"en\"", await user.Client.GetStringAsync("/api/v1/me/export"), StringComparison.Ordinal);
        Assert.Equal("de", (await PatchMeAsync(user, new { displayName = "Ana", language = "de" })).Language);
    }

    [Fact]
    public async Task Register_with_english_sends_english_account_emails()
    {
        var email = $"english-{Guid.NewGuid():N}@test.example";
        var client = api.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(email, "Sicheres-Passwort-1", "Emma English", true, Language: "en"), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>(ApiFactory.Json))!;
        Assert.Equal("en", auth.User.Language);

        await api.RunJobsAsync();
        var verification = ApiFactory.EmailsTo(email)[0];
        Assert.Equal("Please confirm your email address – AngebotPilot", verification.Subject);
        Assert.StartsWith("Hello Emma English,", verification.BodyText, StringComparison.Ordinal);

        // The reset email uses the stored language, not the (German) request.
        var forgot = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/forgot-password") { Content = JsonContent.Create(new ForgotPasswordRequest(email), options: ApiFactory.Json) };
        forgot.Headers.AcceptLanguage.Add(new StringWithQualityHeaderValue("de"));
        Assert.Equal(HttpStatusCode.Accepted, (await client.SendAsync(forgot)).StatusCode);
        await api.RunJobsAsync();
        var reset = ApiFactory.EmailsTo(email)[^1];
        Assert.Equal("Reset your password – AngebotPilot", reset.Subject);
        Assert.Contains("Set a new password: https://web.test/#/reset-password?token=", reset.BodyText, StringComparison.Ordinal);

        // German users keep the unchanged German emails.
        var german = await api.RegisterAsync(verify: false);
        await api.RunJobsAsync();
        Assert.Equal("Bitte bestätigen Sie Ihre E-Mail-Adresse – AngebotPilot", ApiFactory.EmailsTo(german.Email)[0].Subject);
    }

    [Fact]
    public async Task Decision_notification_uses_the_senders_language()
    {
        var user = await api.RegisterAsync();
        await PatchMeAsync(user, new { displayName = "Sender", language = "en" });
        await user.CreateCompanyAsync("Entscheidung GmbH");
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        var sent = await user.SendAsync(q.Id);
        var token = ApiFactory.ExtractPublicToken(sent.PublicUrl!);

        // The customer's page is German; the email to the (English) user is English.
        var accepted = await api.CreateClient().PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Erika Musterfrau", true, null), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        await api.RunJobsAsync();
        var notification = ApiFactory.EmailsTo(user.Email)[^1];
        Assert.Equal($"Quotation {sent.Quotation.Number} was accepted", notification.Subject);
        Assert.Contains("Name entered: Erika Musterfrau", notification.BodyText, StringComparison.Ordinal);

        // The customer email itself stayed German.
        Assert.StartsWith("Ihr Angebot", ApiFactory.EmailsTo(customer.Email!)[0].Subject, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Documents_are_identical_under_english()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Dokumente GmbH");
        var company = await user.GetAsync<CompanyDto>(user.C);
        await user.PutAsync<CompanyDto>(user.C, new UpdateCompanyRequest(company.Name, company.AddressLine1, company.AddressLine2, company.PostalCode, company.City, company.Country,
            company.Email, company.Phone, company.Website, company.VatId, "214/5678/9012", company.BrandColor, company.TimeZone, company.Language, company.RowVersion));
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);

        Assert.Equal(PdfText(await GetBytesAsync(user, $"{user.C}/quotations/{q.Id}/pdf", "de")), PdfText(await GetBytesAsync(user, $"{user.C}/quotations/{q.Id}/pdf", "en")));
        Assert.Equal(await GetBytesAsync(user, $"{user.C}/quotations/export.csv", "de"), await GetBytesAsync(user, $"{user.C}/quotations/export.csv", "en"));
        Assert.Equal(await GetBytesAsync(user, $"{user.C}/customers/export.csv", "de"), await GetBytesAsync(user, $"{user.C}/customers/export.csv", "en"));

        // Two identical invoices, issued under German and English: PDF and e-invoice differ only in the number.
        var documents = new List<(string Xml, string Pdf)>();
        foreach (var language in new[] { "de", "en" })
        {
            var draft = await user.PostAsync<InvoiceDto>($"{user.C}/invoices", new CreateInvoiceRequest(customer.Id, null, null, null, null, null, null, null, null, null, null, null, TestUser.DefaultItems));
            var issue = new HttpRequestMessage(HttpMethod.Post, $"{user.C}/invoices/{draft.Id}/issue") { Content = JsonContent.Create(new { }) };
            issue.Headers.AcceptLanguage.Add(new StringWithQualityHeaderValue(language));
            var issued = (await (await user.Client.SendAsync(issue)).EnsureSuccessStatusCode().Content.ReadFromJsonAsync<InvoiceDto>(ApiFactory.Json))!;
            var xml = Encoding.UTF8.GetString(await GetBytesAsync(user, $"{user.C}/invoices/{issued.Id}/xml", language));
            var pdf = PdfText(await GetBytesAsync(user, $"{user.C}/invoices/{issued.Id}/pdf", language));
            documents.Add((xml.Replace(issued.Number!, "NUMBER", StringComparison.Ordinal), pdf.Replace(issued.Number!, "NUMBER", StringComparison.Ordinal)));
        }

        Assert.Equal(documents[0].Xml, documents[1].Xml);
        Assert.Equal(documents[0].Pdf, documents[1].Pdf);
        Assert.Contains("Zahlbar bis zum", documents[1].Xml, StringComparison.Ordinal);
        Assert.Contains("Rechnungsdatum", documents[1].Pdf, StringComparison.Ordinal);
    }

    private static async Task<MeDto> PatchMeAsync(TestUser user, object body)
    {
        var response = await user.Client.PatchAsJsonAsync("/api/v1/me", body, ApiFactory.Json);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<MeDto>(ApiFactory.Json))!;
    }

    private static async Task<byte[]> GetBytesAsync(TestUser user, string url, string language)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.AcceptLanguage.Add(new StringWithQualityHeaderValue(language));
        var response = await user.Client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

    private static string PdfText(byte[] pdf)
    {
        using var doc = PdfDocument.Open(pdf);
        return string.Join(' ', doc.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
    }
}
