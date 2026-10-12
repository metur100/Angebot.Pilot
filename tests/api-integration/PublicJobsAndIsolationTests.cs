using System.Net;
using System.Net.Http.Json;
using System.Text;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.IntegrationTests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;

namespace AngebotPilot.IntegrationTests;

[Collection(ApiCollection.Name)]
public class PublicQuotationTests(ApiFactory api)
{
    private async Task<(TestUser User, QuotationDto Quotation, string Token)> SentQuotationAsync()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Öffentliche Firma");
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        var sent = await user.SendAsync(q.Id);
        return (user, sent.Quotation, ApiFactory.ExtractPublicToken(sent.PublicUrl!));
    }

    [Fact]
    public async Task Customer_sees_only_intended_data_and_can_accept_once()
    {
        var (user, q, token) = await SentQuotationAsync();
        var anon = api.CreateClient();
        var response = await anon.GetAsync($"/api/v1/public/quotations/{token}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("intern", json, StringComparison.Ordinal); // internal notes
        Assert.DoesNotContain(user.Email, json, StringComparison.Ordinal);
        Assert.DoesNotContain(q.Id.ToString(), json, StringComparison.Ordinal);
        var view = (await response.Content.ReadFromJsonAsync<PublicQuotationDto>(ApiFactory.Json))!;
        Assert.True(view.CanDecide);
        Assert.Equal(213.09m, view.Totals.GrossTotal);
        Assert.Equal("Öffentliche Firma", view.CompanyName);

        var pdf = await anon.GetAsync($"/api/v1/public/quotations/{token}/pdf");
        using (var doc = PdfDocument.Open(await pdf.Content.ReadAsByteArrayAsync()))
        {
            Assert.Contains(q.Number, string.Join(' ', doc.GetPage(1).GetWords().Select(w => w.Text)));
        }

        await ProblemAssert.HasAsync(await anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("", false, null), ApiFactory.Json), HttpStatusCode.BadRequest, "validation_failed");
        var accepted = await anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Erika Musterfrau", true, "Bitte Termin im Mai"), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(QuotationStatus.Accepted, (await accepted.Content.ReadFromJsonAsync<PublicDecisionResponse>(ApiFactory.Json))!.Status);

        // No conflicting or repeated decisions.
        await ProblemAssert.HasAsync(await anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/reject", new PublicRejectRequest(null, null), ApiFactory.Json), HttpStatusCode.Conflict, "already_decided");
        await ProblemAssert.HasAsync(await anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Jemand", true, null), ApiFactory.Json), HttpStatusCode.Conflict, "already_decided");

        var detail = await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}");
        Assert.Equal(QuotationStatus.Accepted, detail.Status);
        Assert.Equal(ActorType.Customer, detail.DecidedByActor);
        Assert.Equal("Erika Musterfrau", detail.DecisionName);
        Assert.NotNull(detail.PublicLinkLastOpenedAt);
        var events = await user.GetAsync<List<QuotationEventDto>>($"{user.C}/quotations/{q.Id}/events");
        Assert.Contains(events, e => e.Type == QuotationEventType.PublicLinkOpened);
        Assert.Contains(events, e => e.Type == QuotationEventType.Accepted && e.ActorType == ActorType.Customer);
        Assert.Contains((await user.GetAsync<PagedResult<NotificationDto>>($"{user.C}/notifications")).Items, n => n.Type == "quotation.accepted");
    }

    [Fact]
    public async Task Concurrent_decisions_produce_exactly_one_result()
    {
        var (_, _, token) = await SentQuotationAsync();
        var anon = api.CreateClient();
        var responses = await Task.WhenAll(
            anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Person A", true, null), ApiFactory.Json),
            anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/reject", new PublicRejectRequest("Person B", null), ApiFactory.Json),
            anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Person C", true, null), ApiFactory.Json));
        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Invalid_revoked_and_expired_links_are_refused()
    {
        var (user, q, token) = await SentQuotationAsync();
        var anon = api.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/api/v1/public/quotations/not-a-real-token-but-long-enough-xyz")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/v1/public/quotations/{q.Id}")).StatusCode); // an id is not a token
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync("/api/v1/public/quotations/..%2F..%2Fetc")).StatusCode);

        // Regenerating revokes the previous link.
        var fresh = await user.PostAsync<PublicLinkResponse>($"{user.C}/quotations/{q.Id}/public-link");
        Assert.Equal(HttpStatusCode.Gone, (await anon.GetAsync($"/api/v1/public/quotations/{token}")).StatusCode);
        var freshToken = ApiFactory.ExtractPublicToken(fresh.Url);
        Assert.Equal(HttpStatusCode.OK, (await anon.GetAsync($"/api/v1/public/quotations/{freshToken}")).StatusCode);

        // After the validity date, acceptance is refused and the quotation expires.
        await api.WithDbAsync(async db => await db.Quotations.IgnoreQueryFilters().Where(x => x.Id == q.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ValidUntil, DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime).AddDays(-1))));
        await ProblemAssert.HasAsync(await anon.PostAsJsonAsync($"/api/v1/public/quotations/{freshToken}/accept", new PublicAcceptRequest("Zu Spät", true, null), ApiFactory.Json), HttpStatusCode.Conflict, "quotation_expired");
        var view = await anon.GetFromJsonAsync<PublicQuotationDto>($"/api/v1/public/quotations/{freshToken}", ApiFactory.Json);
        Assert.Equal(QuotationStatus.Expired, view!.Status);
        Assert.False(view.CanDecide);

        await user.Client.DeleteAsync($"{user.C}/quotations/{q.Id}/public-link");
        Assert.Equal(HttpStatusCode.Gone, (await anon.GetAsync($"/api/v1/public/quotations/{freshToken}")).StatusCode);
    }

    [Fact]
    public async Task Only_token_hashes_are_stored()
    {
        var (_, q, token) = await SentQuotationAsync();
        var stored = await api.WithDbAsync(db => db.PublicQuotationAccesses.IgnoreQueryFilters().Where(a => a.QuotationId == q.Id).Select(a => a.TokenHash).ToListAsync());
        Assert.NotEmpty(stored);
        Assert.DoesNotContain(token, stored);
        Assert.Contains(Application.Common.SecureTokens.Hash(token), stored);
    }

    [Fact]
    public async Task Customer_can_opt_out_of_reminders()
    {
        var (user, q, token) = await SentQuotationAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await api.CreateClient().PostAsync($"/api/v1/public/quotations/{token}/opt-out", null)).StatusCode);
        Assert.All(await user.GetAsync<List<FollowUpDto>>($"{user.C}/quotations/{q.Id}/follow-ups"), f => Assert.NotEqual(FollowUpStatus.Scheduled, f.Status));
        Assert.True((await user.GetAsync<CustomerDto>($"{user.C}/customers/{q.CustomerId}")).FollowUpOptOut);
    }
}

[Collection(ApiCollection.Name)]
public class JobConversionTests(ApiFactory api)
{
    [Fact]
    public async Task Accepted_quotation_converts_once_and_job_lifecycle_works()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, null, null)), HttpStatusCode.Conflict, "quotation_not_accepted");
        await user.SendAsync(q.Id, false, SendMode.Manual);
        await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/accept", new DecisionRequest(null));

        var today = DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime);
        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => user.RawPostAsync($"{user.C}/quotations/{q.Id}/convert-to-job",
            new ConvertToJobRequest("Montage", "Details", today.AddDays(2), today.AddDays(9), user.UserId, null))));
        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        var job = (await responses.Single(r => r.StatusCode == HttpStatusCode.OK).Content.ReadFromJsonAsync<JobDto>(ApiFactory.Json))!;
        Assert.Equal(q.Id, job.QuotationId);
        Assert.Equal(q.Number, job.QuotationNumber);
        Assert.Equal(q.Totals.NetTotal, job.QuotationNetTotal);
        Assert.StartsWith($"AU-{today.Year}-", job.Number, StringComparison.Ordinal);
        Assert.Equal(JobStatus.Open, job.Status);
        Assert.Equal(job.Id, (await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}")).JobId);

        job = await user.PostAsync<JobDto>($"{user.C}/jobs/{job.Id}/status", new ChangeJobStatusRequest(JobStatus.InProgress));
        Assert.NotNull(job.StartedAt);
        job = await user.PostAsync<JobDto>($"{user.C}/jobs/{job.Id}/status", new ChangeJobStatusRequest(JobStatus.Completed));
        Assert.NotNull(job.CompletedAt);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/jobs/{job.Id}/status", new ChangeJobStatusRequest(JobStatus.Cancelled)), HttpStatusCode.Conflict, "invalid_status_transition");

        var stranger = await api.RegisterAsync();
        await ProblemAssert.HasAsync(await user.RawPutAsync($"{user.C}/jobs/{job.Id}", new UpdateJobRequest("x", null, null, null, stranger.UserId, null, job.RowVersion)), HttpStatusCode.BadRequest, "validation_failed");
        var jobs = await user.GetAsync<PagedResult<JobListItemDto>>($"{user.C}/jobs?status=Completed");
        Assert.Equal(job.Id, Assert.Single(jobs.Items).Id);
    }
}

[Collection(ApiCollection.Name)]
public class TenantIsolationTests(ApiFactory api)
{
    [Fact]
    public async Task Another_company_cannot_read_or_modify_records()
    {
        var a = await api.RegisterAsync();
        await a.CreateCompanyAsync("Firma A");
        var customer = await a.CreateCustomerAsync();
        var q = await a.CreateQuotationAsync(customer.Id);
        var sent = await a.SendAsync(q.Id, false, SendMode.Manual);
        await a.PostAsync<QuotationDto>($"{a.C}/quotations/{q.Id}/accept", new DecisionRequest(null));
        var job = await a.PostAsync<JobDto>($"{a.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, null, null));
        var template = await a.PostAsync<TemplateDto>($"{a.C}/templates", new UpsertTemplateRequest("T", null, null, null, null, null, []));

        var b = await api.RegisterAsync();
        await b.CreateCompanyAsync("Firma B");

        // 1) Using A's company id in the route: membership check fails.
        foreach (var url in new[] { $"{a.C}", $"{a.C}/customers", $"{a.C}/customers/{customer.Id}", $"{a.C}/quotations/{q.Id}", $"{a.C}/quotations/{q.Id}/pdf", $"{a.C}/jobs/{job.Id}", $"{a.C}/export", $"{a.C}/dashboard" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await b.RawGetAsync(url)).StatusCode);
        }

        // 2) Using B's own company id with A's record ids: the tenant filter hides them.
        foreach (var url in new[] { $"{b.C}/customers/{customer.Id}", $"{b.C}/quotations/{q.Id}", $"{b.C}/quotations/{q.Id}/pdf", $"{b.C}/quotations/{q.Id}/events", $"{b.C}/jobs/{job.Id}", $"{b.C}/templates/{template.Id}" })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await b.RawGetAsync(url)).StatusCode);
        }

        await ProblemAssert.HasAsync(await b.RawPutAsync($"{b.C}/customers/{customer.Id}", new UpsertCustomerRequest(CustomerType.Private, null, null, null, "Hack", null, null, null, null, null, null, false, null, null, null, null, null, null, false, null)), HttpStatusCode.NotFound);
        await ProblemAssert.HasAsync(await b.RawPostAsync($"{b.C}/quotations/{q.Id}/cancel", new CancelRequest(null)), HttpStatusCode.NotFound);
        await ProblemAssert.HasAsync(await b.RawPostAsync($"{b.C}/quotations", new CreateQuotationRequest(customer.Id, "x", null, null, null, null, null, null, null, null, null, null)), HttpStatusCode.NotFound);
        await ProblemAssert.HasAsync(await b.RawPostAsync($"{b.C}/quotations/lookup-by-token", new LookupByTokenRequest(ApiFactory.ExtractPublicToken(sent.PublicUrl!))), HttpStatusCode.NotFound);
        Assert.Equal(0, (await b.GetAsync<PagedResult<QuotationListItemDto>>($"{b.C}/quotations")).TotalCount);
        Assert.Equal(0, (await b.GetAsync<PagedResult<CustomerListItemDto>>($"{b.C}/customers?status=all")).TotalCount);
        var csv = Encoding.UTF8.GetString(await (await b.RawGetAsync($"{b.C}/quotations/export.csv")).Content.ReadAsByteArrayAsync());
        Assert.DoesNotContain(q.Number, csv, StringComparison.Ordinal);

        // A still sees everything and the lookup works for the owner company.
        Assert.Equal(q.Id, (await a.PostAsync<LookupByTokenResponse>($"{a.C}/quotations/lookup-by-token", new LookupByTokenRequest(ApiFactory.ExtractPublicToken(sent.PublicUrl!)))).QuotationId);
    }

    [Fact]
    public async Task Fail_closed_without_tenant()
    {
        // Without a resolved tenant, company-owned sets return nothing.
        var count = await api.WithDbAsync(db => db.Customers.CountAsync());
        Assert.Equal(0, count);
    }
}

[Collection(ApiCollection.Name)]
public class DatabaseTests(ApiFactory api)
{
    [Fact]
    public async Task Migrations_are_applied_and_model_has_no_pending_changes()
    {
        var pending = await api.WithDbAsync(db => db.Database.GetPendingMigrationsAsync());
        Assert.Empty(pending);
        Assert.False(await api.WithDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges())));
        Assert.NotEmpty(await api.WithDbAsync(db => db.Database.GetAppliedMigrationsAsync()));
    }

    [Fact]
    public async Task Health_endpoints_and_security_headers()
    {
        var client = api.CreateClient();
        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal("nosniff", ready.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", ready.Headers.GetValues("X-Frame-Options").Single());
        var problem = await client.GetAsync("/api/v1/me");
        Assert.Equal(HttpStatusCode.Unauthorized, problem.StatusCode);
        Assert.DoesNotContain("   at ", await problem.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }
}

/// <summary>The complete business scenario from the requirements, end to end through the HTTP API.</summary>
[Collection(ApiCollection.Name)]
public class BusinessWorkflowTests(ApiFactory api)
{
    [Fact]
    public async Task Company_to_job_with_isolation_and_export()
    {
        // 1. Create a company
        var owner = await api.RegisterAsync("Inhaberin");
        await owner.CreateCompanyAsync("Workflow Elektro GmbH");

        // 2. Create a customer
        var customerEmail = $"kunde-{Guid.NewGuid():N}@test.example";
        var customer = await owner.CreateCustomerAsync(customerEmail, "Workflow Kunde AG");

        // 3. Create a quotation with multiple line items, 4. validate totals
        var q = await owner.CreateQuotationAsync(customer.Id);
        Assert.Equal(3, q.LineItems.Count);
        Assert.Equal(180.32m, q.Totals.NetTotal);
        Assert.Equal([31.91m, 0.86m], q.Totals.TaxGroups.Select(g => g.TaxAmount));
        Assert.Equal(213.09m, q.Totals.GrossTotal);

        // 5. Generate and inspect the PDF
        using (var draft = PdfDocument.Open(await (await owner.RawGetAsync($"{owner.C}/quotations/{q.Id}/pdf")).Content.ReadAsByteArrayAsync()))
        {
            var text = string.Join(' ', draft.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
            Assert.Contains("Workflow Kunde AG", text);
            Assert.Contains("213,09", text);
        }

        // 6. Send via the test email provider
        await owner.SendAsync(q.Id);
        await api.RunJobsAsync();
        var mail = Assert.Single(ApiFactory.EmailsTo(customerEmail));

        // 7. Verify status and event history
        var afterSend = await owner.GetAsync<QuotationDto>($"{owner.C}/quotations/{q.Id}");
        Assert.Equal(QuotationStatus.Sent, afterSend.Status);
        var events = await owner.GetAsync<List<QuotationEventDto>>($"{owner.C}/quotations/{q.Id}/events");
        Assert.Contains(events, e => e.Type == QuotationEventType.Sent);
        Assert.Contains(events, e => e.Type == QuotationEventType.EmailHandedOff);
        Assert.Contains(await owner.GetAsync<List<FollowUpDto>>($"{owner.C}/quotations/{q.Id}/follow-ups"), f => f.Status == FollowUpStatus.Scheduled);

        // 8. Open the public page from the emailed link, 9. accept as the customer
        var token = ApiFactory.ExtractPublicToken(mail.BodyText);
        var anon = api.CreateClient();
        Assert.True((await anon.GetFromJsonAsync<PublicQuotationDto>($"/api/v1/public/quotations/{token}", ApiFactory.Json))!.CanDecide);
        (await anon.PostAsJsonAsync($"/api/v1/public/quotations/{token}/accept", new PublicAcceptRequest("Max Workflow", true, null), ApiFactory.Json)).EnsureSuccessStatusCode();

        // 10. Reminders are cancelled
        Assert.DoesNotContain(await owner.GetAsync<List<FollowUpDto>>($"{owner.C}/quotations/{q.Id}/follow-ups"), f => f.Status == FollowUpStatus.Scheduled);

        // 11. Convert to a job, 12. the job references the accepted quotation
        var job = await owner.PostAsync<JobDto>($"{owner.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, owner.UserId, null));
        Assert.Equal(q.Id, job.QuotationId);
        Assert.Equal(customer.Id, job.CustomerId);

        // 13. Another company cannot access the records
        var other = await api.RegisterAsync();
        await other.CreateCompanyAsync("Fremdfirma");
        Assert.Equal(HttpStatusCode.NotFound, (await other.RawGetAsync($"{other.C}/quotations/{q.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.RawGetAsync($"{other.C}/jobs/{job.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.RawGetAsync($"{owner.C}/customers/{customer.Id}")).StatusCode);

        // 14. Export the relevant records
        var quotationsCsv = Encoding.UTF8.GetString(await (await owner.RawGetAsync($"{owner.C}/quotations/export.csv")).Content.ReadAsByteArrayAsync());
        Assert.Contains($"{q.Number};", quotationsCsv, StringComparison.Ordinal);
        Assert.Contains("Angenommen", quotationsCsv, StringComparison.Ordinal);
        var jobsCsv = Encoding.UTF8.GetString(await (await owner.RawGetAsync($"{owner.C}/jobs/export.csv")).Content.ReadAsByteArrayAsync());
        Assert.Contains(job.Number, jobsCsv, StringComparison.Ordinal);
        var full = await owner.RawGetAsync($"{owner.C}/export");
        Assert.Equal(HttpStatusCode.OK, full.StatusCode);
        Assert.Contains("Workflow Kunde AG", await full.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var dashboard = await owner.GetAsync<DashboardDto>($"{owner.C}/dashboard");
        Assert.Equal(1, dashboard.AcceptedCount);
        Assert.Equal(100m, dashboard.ConversionRatePercent);
        Assert.Equal(1, dashboard.OpenJobsCount);
    }
}
