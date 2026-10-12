using System.Net;
using System.Net.Http.Json;
using System.Text;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.Infrastructure.Email;
using AngebotPilot.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;

namespace AngebotPilot.IntegrationTests;

[Collection(ApiCollection.Name)]
public class CustomerTests(ApiFactory api)
{
    [Fact]
    public async Task Customer_crud_search_archive_and_concurrency()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var created = await user.CreateCustomerAsync(company: "Großhandel Weiß KG");
        await user.CreateCustomerAsync(company: "Anderer Kunde");

        var search = await user.GetAsync<PagedResult<CustomerListItemDto>>($"{user.C}/customers?search=Weiß");
        Assert.Equal(created.Id, Assert.Single(search.Items).Id);

        var update = new UpsertCustomerRequest(CustomerType.Business, "Großhandel Weiß KG", "Herr", "Paul", "Weiß", created.Email, "030 123", "Neue Straße 1", "10115", "Berlin", "DE",
            true, "Baustelle 5", "10117", "Berlin", "DE", "DE123456789", "Wichtiger Kunde", false, created.RowVersion);
        var updated = await user.PutAsync<CustomerDto>($"{user.C}/customers/{created.Id}", update);
        Assert.Equal("Baustelle 5", updated.ServiceStreet);
        Assert.Equal("DE123456789", updated.VatId);

        // A stale row version is rejected instead of silently overwriting.
        await ProblemAssert.HasAsync(await user.RawPutAsync($"{user.C}/customers/{created.Id}", update with { Notes = "veraltet" }), HttpStatusCode.Conflict, "concurrency_conflict");

        await user.PostAsync<CustomerDto>($"{user.C}/customers/{created.Id}/archive");
        var active = await user.GetAsync<PagedResult<CustomerListItemDto>>($"{user.C}/customers");
        Assert.DoesNotContain(active.Items, c => c.Id == created.Id);
        var archived = await user.GetAsync<PagedResult<CustomerListItemDto>>($"{user.C}/customers?status=archived");
        Assert.Contains(archived.Items, c => c.Id == created.Id);

        var invalid = await user.RawPostAsync($"{user.C}/customers", new UpsertCustomerRequest(CustomerType.Business, null, null, null, null, "keine-mail", null, null, null, null, null, false, null, null, null, null, null, null, false, null));
        await ProblemAssert.HasAsync(invalid, HttpStatusCode.BadRequest, "validation_failed");
        var body = await invalid.Content.ReadAsStringAsync();
        Assert.Contains("\"companyName\"", body, StringComparison.Ordinal);
        Assert.Contains("\"email\"", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Deleting_customers_deletes_or_anonymises_depending_on_documents()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var plain = await user.CreateCustomerAsync();
        var withQuote = await user.CreateCustomerAsync(company: "Mit Angebot GmbH");
        var q = await user.CreateQuotationAsync(withQuote.Id);
        await user.SendAsync(q.Id, followUps: true);

        Assert.Equal("deleted", (await (await user.Client.DeleteAsync($"{user.C}/customers/{plain.Id}")).Content.ReadFromJsonAsync<Dictionary<string, string>>())!["result"]);
        Assert.Equal("anonymized", (await (await user.Client.DeleteAsync($"{user.C}/customers/{withQuote.Id}")).Content.ReadFromJsonAsync<Dictionary<string, string>>())!["result"]);
        var anonymised = await user.GetAsync<CustomerDto>($"{user.C}/customers/{withQuote.Id}");
        Assert.True(anonymised.IsAnonymized);
        Assert.Null(anonymised.Email);
        Assert.Null(anonymised.FirstName);
        // The sent quotation (commercial document) is retained; reminders stop.
        Assert.Equal(QuotationStatus.Sent, (await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}")).Status);
        Assert.All(await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups"), f => Assert.Equal(FollowUpStatus.Cancelled, f.Status));
    }

    [Fact]
    public async Task Csv_export_is_excel_friendly()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        await user.CreateCustomerAsync(company: "=Formel; \"Zitat\" & Söhne");
        var response = await user.RawGetAsync($"{user.C}/customers/export.csv");
        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes[..3]);
        var text = Encoding.UTF8.GetString(bytes[3..]);
        Assert.StartsWith("Typ;Firma;", text, StringComparison.Ordinal);
        Assert.Contains("\"'=Formel; \"\"Zitat\"\" & Söhne\"", text, StringComparison.Ordinal);
    }
}

[Collection(ApiCollection.Name)]
public class QuotationTests(ApiFactory api)
{
    [Fact]
    public async Task Server_calculates_totals_and_numbers_are_sequential()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q1 = await user.CreateQuotationAsync(customer.Id);
        var q2 = await user.CreateQuotationAsync(customer.Id);
        var year = api.Clock.GetUtcNow().Year;
        Assert.Equal($"AN-{year}-0001", q1.Number);
        Assert.Equal($"AN-{year}-0002", q2.Number);

        // 2.5 × 48 − 10 % = 108.00; 3 × 19.99 = 59.97; 12.35 @ 7 %
        Assert.Equal(180.32m, q1.Totals.NetTotal);
        Assert.Equal(32.77m, q1.Totals.TaxTotal);
        Assert.Equal(213.09m, q1.Totals.GrossTotal);
        Assert.Equal(108.00m, q1.LineItems[0].LineNet);
        Assert.Equal(Enumerable.Range(1, 3), q1.LineItems.Select(i => i.Position));

        var preview = await user.PostAsync<TotalsDto>($"{user.C}/quotations/calculate", new CalculateRequest(TaxMode.Standard, TestUser.DefaultItems));
        Assert.Equal(q1.Totals.GrossTotal, preview.GrossTotal);

        // Deleted draft numbers are never reused.
        Assert.Equal(HttpStatusCode.NoContent, (await user.Client.DeleteAsync($"{user.C}/quotations/{q2.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.RawGetAsync($"{user.C}/quotations/{q2.Id}")).StatusCode);
        var q3 = await user.CreateQuotationAsync(customer.Id);
        Assert.Equal($"AN-{year}-0003", q3.Number);
    }

    [Fact]
    public async Task Concurrent_creation_never_produces_duplicate_numbers()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        await api.WithDbAsync(async db =>
        {
            var sub = db.Subscriptions.Single(s => s.CompanyId == user.CompanyId);
            sub.Plan = SubscriptionPlan.Business;
            sub.Status = SubscriptionStatus.Active;
            return await db.SaveChangesAsync();
        });
        var customer = await user.CreateCustomerAsync();
        var tasks = Enumerable.Range(0, 20).Select(_ => user.RawPostAsync($"{user.C}/quotations",
            new CreateQuotationRequest(customer.Id, "Parallel", null, null, null, null, null, null, null, null, null, TestUser.DefaultItems)));
        var responses = await Task.WhenAll(tasks);
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        var numbers = new List<string>();
        foreach (var r in responses)
        {
            numbers.Add((await r.Content.ReadFromJsonAsync<QuotationDto>(ApiFactory.Json))!.Number);
        }

        Assert.Equal(20, numbers.Distinct().Count());
        var year = api.Clock.GetUtcNow().Year;
        Assert.Equal(Enumerable.Range(1, 20).Select(i => $"AN-{year}-{i:0000}").Order(), numbers.Order());
    }

    [Fact]
    public async Task Drafts_are_editable_sent_quotations_are_not()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        var request = new UpdateQuotationRequest(customer.Id, "Geändert", q.IssueDate, q.ValidUntil, TaxMode.SmallBusiness, null, null, "AGB", null, null,
            [new LineItemInput("Neu", null, 1, "pauschal", 500m, 0, 19)], q.RowVersion);
        var updated = await user.PutAsync<QuotationDto>($"{user.C}/quotations/{q.Id}", request);
        Assert.Equal(500m, updated.Totals.GrossTotal); // § 19: no VAT
        Assert.Single(updated.LineItems);

        await ProblemAssert.HasAsync(await user.RawPutAsync($"{user.C}/quotations/{q.Id}", request), HttpStatusCode.Conflict, "concurrency_conflict");
        var invalid = request with { RowVersion = updated.RowVersion, LineItems = [new LineItemInput("", null, -1, "Stk.", -5, 0, 19)] };
        var bad = await user.RawPutAsync($"{user.C}/quotations/{q.Id}", invalid);
        await ProblemAssert.HasAsync(bad, HttpStatusCode.BadRequest, "validation_failed");
        Assert.Contains("lineItems[0].quantity", await bad.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        await user.SendAsync(q.Id, followUps: false, SendMode.Manual);
        var sent = await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}");
        await ProblemAssert.HasAsync(await user.RawPutAsync($"{user.C}/quotations/{q.Id}", request with { RowVersion = sent.RowVersion }), HttpStatusCode.Conflict, "quotation_not_editable");
        await ProblemAssert.HasAsync(await user.Client.DeleteAsync($"{user.C}/quotations/{q.Id}"), HttpStatusCode.Conflict, "quotation_not_deletable");
    }

    [Fact]
    public async Task Pdf_is_generated_and_frozen_after_sending()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Müller Fenster & Türen");
        var customer = await user.CreateCustomerAsync(company: "Bäckerei Größe");
        var q = await user.CreateQuotationAsync(customer.Id);

        var draftPdf = await user.RawGetAsync($"{user.C}/quotations/{q.Id}/pdf");
        Assert.Equal("application/pdf", draftPdf.Content.Headers.ContentType!.MediaType);
        using (var doc = PdfDocument.Open(await draftPdf.Content.ReadAsByteArrayAsync()))
        {
            Assert.Contains("ENTWURF", string.Concat(doc.GetPage(1).Letters.Select(l => l.Value)));
        }

        await user.SendAsync(q.Id);
        var bytes = await (await user.RawGetAsync($"{user.C}/quotations/{q.Id}/pdf")).Content.ReadAsByteArrayAsync();
        using var sentDoc = PdfDocument.Open(bytes);
        var text = string.Join(' ', sentDoc.GetPage(1).GetWords().Select(w => w.Text));
        Assert.Contains(q.Number, text);
        Assert.Contains("Bäckerei", text);
        Assert.Contains("213,09", text);
        Assert.DoesNotContain("ENTWURF", string.Concat(sentDoc.GetPage(1).Letters.Select(l => l.Value)));
        Assert.DoesNotContain("intern", text); // internal notes never appear on the document

        // Changing company data later does not change the stored, sent document.
        var company = await user.GetAsync<CompanyDto>(user.C);
        await user.PutAsync<CompanyDto>(user.C, new UpdateCompanyRequest("Neuer Name GmbH", company.AddressLine1, null, company.PostalCode, company.City, "DE", null, null, null, null, null, "#2F45D8", "Europe/Berlin", "de-DE", company.RowVersion));
        var again = await (await user.RawGetAsync($"{user.C}/quotations/{q.Id}/pdf")).Content.ReadAsByteArrayAsync();
        Assert.Equal(bytes, again);
    }

    [Fact]
    public async Task Duplicate_and_revision_flow()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        var copy = await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/duplicate");
        Assert.NotEqual(q.Number, copy.Number);
        Assert.Equal(QuotationStatus.Draft, copy.Status);
        Assert.Equal(q.Totals.GrossTotal, copy.Totals.GrossTotal);

        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/quotations/{q.Id}/revise"), HttpStatusCode.Conflict, "quotation_not_revisable");
        await user.SendAsync(q.Id);
        var revision = await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/revise");
        Assert.Equal($"{q.Number}-R1", revision.Number);
        Assert.Equal(q.Id, revision.PreviousRevisionId);
        Assert.Equal(2, revision.Revisions.Count);

        // Sending the revision supersedes the original: cancelled, reminders stopped, links revoked.
        var sent = await user.SendAsync(revision.Id);
        var original = await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}");
        Assert.Equal(QuotationStatus.Cancelled, original.Status);
        Assert.False(original.HasActivePublicLink);
        Assert.Contains(await user.GetAsync<List<QuotationEventDto>>($"{user.C}/quotations/{q.Id}/events"), e => e.Type == QuotationEventType.SupersededByRevision);
        Assert.Equal(QuotationStatus.Sent, sent.Quotation.Status);
    }

    [Fact]
    public async Task List_filters_sorting_paging_and_csv()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var a = await user.CreateCustomerAsync(company: "Alpha GmbH");
        var b = await user.CreateCustomerAsync(company: "Beta AG");
        var qa = await user.CreateQuotationAsync(a.Id);
        await user.CreateQuotationAsync(b.Id);
        await user.CreateQuotationAsync(b.Id);
        await user.SendAsync(qa.Id, false, SendMode.Manual);

        var sent = await user.GetAsync<PagedResult<QuotationListItemDto>>($"{user.C}/quotations?status=Sent");
        Assert.Equal(qa.Id, Assert.Single(sent.Items).Id);
        var byCustomer = await user.GetAsync<PagedResult<QuotationListItemDto>>($"{user.C}/quotations?customerId={b.Id}&sort=number&pageSize=1&page=2");
        Assert.Equal(2, byCustomer.TotalCount);
        Assert.Single(byCustomer.Items);
        var search = await user.GetAsync<PagedResult<QuotationListItemDto>>($"{user.C}/quotations?search=Alpha");
        Assert.Equal(qa.Id, Assert.Single(search.Items).Id);
        var csv = Encoding.UTF8.GetString(await (await user.RawGetAsync($"{user.C}/quotations/export.csv?status=Sent")).Content.ReadAsByteArrayAsync());
        Assert.Contains(qa.Number, csv, StringComparison.Ordinal);
        Assert.Contains("213,09", csv, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Templates_are_copied_into_quotations()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var template = await user.PostAsync<TemplateDto>($"{user.C}/templates", new UpsertTemplateRequest("Wartung", null, "Intro aus Vorlage", "Schluss", "Bedingungen", TaxMode.Standard,
            [new TemplateLineItemInput("Wartungspauschale", null, 1, "pauschal", 120m, 0, null)]));
        var q = await user.PostAsync<QuotationDto>($"{user.C}/quotations", new CreateQuotationRequest(customer.Id, null, template.Id, null, null, null, null, null, null, null, null, null));
        Assert.Equal("Wartung", q.Title);
        Assert.Equal("Intro aus Vorlage", q.IntroText);
        Assert.Equal(19m, Assert.Single(q.LineItems).TaxRatePercent); // company default rate
        Assert.Equal(142.80m, q.Totals.GrossTotal);

        await user.PutAsync<QuotationDto>($"{user.C}/quotations/{q.Id}", new UpdateQuotationRequest(customer.Id, "Anders", q.IssueDate, q.ValidUntil, TaxMode.Standard, null, null, null, null, null,
            [new LineItemInput("Geändert", null, 2, "Std.", 1m, 0, 19)], q.RowVersion));
        var unchanged = await user.GetAsync<TemplateDto>($"{user.C}/templates/{template.Id}");
        Assert.Equal("Wartungspauschale", Assert.Single(unchanged.LineItems).Title);

        var saved = await user.PostAsync<TemplateDto>($"{user.C}/quotations/{q.Id}/save-as-template", new SaveAsTemplateRequest("Aus Angebot", null));
        Assert.Equal("Geändert", Assert.Single(saved.LineItems).Title);
    }
}

[Collection(ApiCollection.Name)]
public class SendingAndFollowUpTests(ApiFactory api)
{
    [Fact]
    public async Task Email_send_requires_verified_sender()
    {
        var user = await api.RegisterAsync(verify: false);
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/quotations/{q.Id}/send", new SendQuotationRequest(SendMode.Email, null, null, null, true, true, true)),
            HttpStatusCode.Conflict, "email_not_verified");
        Assert.Equal(QuotationStatus.Draft, (await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}")).Status);
    }

    [Fact]
    public async Task Sending_queues_email_with_pdf_and_link_and_schedules_follow_ups()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customerEmail = $"kunde-{Guid.NewGuid():N}@test.example";
        var customer = await user.CreateCustomerAsync(customerEmail);
        var q = await user.CreateQuotationAsync(customer.Id);
        var sent = await user.SendAsync(q.Id);
        Assert.Equal(QuotationStatus.Sent, sent.Quotation.Status);
        Assert.NotNull(sent.PublicUrl);

        var deliveries = await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/quotations/{q.Id}/deliveries");
        Assert.Equal(EmailStatus.Pending, Assert.Single(deliveries).Status); // queued is not "sent"

        await api.RunJobsAsync();
        deliveries = await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/quotations/{q.Id}/deliveries");
        Assert.Equal(EmailStatus.HandedOff, Assert.Single(deliveries).Status);
        var mail = Assert.Single(ApiFactory.EmailsTo(customerEmail));
        Assert.Contains(q.Number, mail.Subject, StringComparison.Ordinal);
        Assert.Equal($"Angebot_{q.Number}.pdf", Assert.Single(mail.Attachments));
        Assert.Contains("https://web.test/#/q/", mail.BodyText, StringComparison.Ordinal);
        Assert.Contains("abmelden=1", mail.BodyText, StringComparison.Ordinal);

        var followUps = await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups");
        Assert.Contains(followUps, f => f.Kind == FollowUpKind.FirstReminder && f.Status == FollowUpStatus.Scheduled);
        Assert.Contains(followUps, f => f.Kind == FollowUpKind.ExpiryReminder);

        // Running the jobs again sends nothing twice.
        await api.RunJobsAsync();
        Assert.Single(ApiFactory.EmailsTo(customerEmail));
    }

    [Fact]
    public async Task Due_reminder_is_sent_once_and_further_reminders_stop_after_acceptance()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customerEmail = $"kunde-{Guid.NewGuid():N}@test.example";
        var customer = await user.CreateCustomerAsync(customerEmail);
        var q = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q.Id);
        await api.RunJobsAsync();

        var first = (await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups")).Single(f => f.Kind == FollowUpKind.FirstReminder);
        await api.WithDbAsync(async db => await db.FollowUpSchedules.IgnoreQueryFilters().Where(f => f.Id == first.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(f => f.DueAt, api.Clock.GetUtcNow().AddMinutes(-1))));
        var run = await api.RunJobsAsync();
        Assert.True(run.FollowUpsQueued >= 1);
        await api.RunJobsAsync();
        var mails = ApiFactory.EmailsTo(customerEmail);
        Assert.Equal(2, mails.Count);
        Assert.StartsWith("Kurze Nachfrage", mails[1].Subject, StringComparison.Ordinal);
        Assert.Contains(await user.GetAsync<List<QuotationEventDto>>($"{user.C}/quotations/{q.Id}/events"), e => e.Type == QuotationEventType.ReminderQueued);

        await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/accept", new DecisionRequest("Telefonisch"));
        var remaining = await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups");
        Assert.DoesNotContain(remaining, f => f.Status == FollowUpStatus.Scheduled);
        Assert.Contains(remaining, f => f.Status == FollowUpStatus.Cancelled && f.StatusReason == "Angebot angenommen");
    }

    [Fact]
    public async Task Temporary_failures_are_retried_and_permanent_failures_reported()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q.Id, followUps: false);

        CaptureEmailSender.ForcedOutcomes.Enqueue(Application.Abstractions.EmailSendOutcome.TemporaryFailure);
        await api.RunJobsAsync();
        var delivery = Assert.Single(await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/quotations/{q.Id}/deliveries"));
        Assert.Equal(EmailStatus.RetryScheduled, delivery.Status);
        Assert.Equal(1, delivery.Attempts);

        api.Clock.Advance(TimeSpan.FromMinutes(2));
        await api.RunJobsAsync();
        delivery = Assert.Single(await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/quotations/{q.Id}/deliveries"));
        Assert.Equal(EmailStatus.HandedOff, delivery.Status);
        Assert.Equal(2, delivery.Attempts);

        var q2 = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q2.Id, followUps: false);
        CaptureEmailSender.ForcedOutcomes.Enqueue(Application.Abstractions.EmailSendOutcome.PermanentFailure);
        await api.RunJobsAsync();
        delivery = Assert.Single(await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/quotations/{q2.Id}/deliveries"));
        Assert.Equal(EmailStatus.Failed, delivery.Status);
        Assert.Contains(await user.GetAsync<List<QuotationEventDto>>($"{user.C}/quotations/{q2.Id}/events"), e => e.Type == QuotationEventType.EmailFailed);
        var notifications = await user.GetAsync<PagedResult<NotificationDto>>($"{user.C}/notifications");
        Assert.Contains(notifications.Items, n => n.Type == "email.failed");
    }

    [Fact]
    public async Task Overdue_quotations_expire_and_their_reminders_stop()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q.Id);
        await api.WithDbAsync(async db => await db.Quotations.IgnoreQueryFilters().Where(x => x.Id == q.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ValidUntil, DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime).AddDays(-2))));
        var run = await api.RunJobsAsync();
        Assert.True(run.QuotationsExpired >= 1);
        var expired = await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}");
        Assert.Equal(QuotationStatus.Expired, expired.Status);
        Assert.DoesNotContain(await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups"), f => f.Status == FollowUpStatus.Scheduled);
    }

    [Fact]
    public async Task External_job_trigger_requires_the_secret()
    {
        var client = api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/internal/jobs/run", null)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "wrong-secret-wrong-secret-wrong-secret");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/internal/jobs/run", null)).StatusCode);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", ApiFactory.JobsSecret);
        var ok = await client.PostAsync("/api/internal/jobs/run", null);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("emailsHandedOff", await ok.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Concurrent_job_runs_are_serialised_by_the_lock()
    {
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => api.RunJobsAsync()));
        Assert.Contains(results, r => !r.SkippedBecauseLocked);
    }
}
