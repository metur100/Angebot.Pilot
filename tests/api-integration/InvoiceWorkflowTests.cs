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
public class InvoiceWorkflowTests(ApiFactory api)
{
    [Fact]
    public async Task Job_to_paid_invoice_to_cancellation()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Elektro Rechnung GmbH");
        await SetTaxNumberAsync(user);
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await user.SendAsync(q.Id, false, SendMode.Manual);
        await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/accept", new DecisionRequest(null));
        var job = await user.PostAsync<JobDto>($"{user.C}/quotations/{q.Id}/convert-to-job", new ConvertToJobRequest(null, null, null, null, null, null));
        await user.PostAsync<JobDto>($"{user.C}/jobs/{job.Id}/status", new ChangeJobStatusRequest(JobStatus.Completed));
        var year = api.Clock.GetUtcNow().Year;

        // Draft from the job: line items and totals come from the accepted quotation.
        var draft = await user.PostAsync<InvoiceDto>($"{user.C}/jobs/{job.Id}/invoice");
        Assert.Null(draft.Number);
        Assert.Equal(InvoiceStatus.Draft, draft.Status);
        Assert.Equal(job.Id, draft.JobId);
        Assert.Equal(q.Number, draft.QuotationNumber);
        Assert.Equal(3, draft.LineItems.Count);
        Assert.Equal(q.Totals.GrossTotal, draft.Totals.GrossTotal);
        Assert.Empty(draft.IssueProblems);
        Assert.Contains("issue", draft.AllowedActions);
        Assert.Single((await user.GetAsync<JobDto>($"{user.C}/jobs/{job.Id}")).Invoices);

        // Issuing assigns the number and freezes the invoice.
        var invoice = await user.PostAsync<InvoiceDto>($"{user.C}/invoices/{draft.Id}/issue");
        Assert.Equal($"RE-{year}-0001", invoice.Number);
        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
        Assert.True(invoice.HasEInvoice);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/invoices/{invoice.Id}/issue"), HttpStatusCode.Conflict, "invoice_not_editable");
        await ProblemAssert.HasAsync(await user.RawPutAsync($"{user.C}/invoices/{invoice.Id}", Update(invoice)), HttpStatusCode.Conflict, "invoice_not_editable");
        await ProblemAssert.HasAsync(await user.Client.DeleteAsync($"{user.C}/invoices/{invoice.Id}"), HttpStatusCode.Conflict, "invoice_not_deletable");

        // The PDF is a hybrid ZUGFeRD invoice; the XML is the same e-invoice.
        var pdfBytes = await user.Client.GetByteArrayAsync($"{user.C}/invoices/{invoice.Id}/pdf");
        var xml = await user.Client.GetByteArrayAsync($"{user.C}/invoices/{invoice.Id}/xml");
        using (var pdf = PdfDocument.Open(pdfBytes))
        {
            Assert.Contains(invoice.Number!, string.Join(' ', pdf.GetPage(1).GetWords().Select(w => w.Text)));
            Assert.True(pdf.Advanced.TryGetEmbeddedFiles(out var files));
            Assert.Equal(xml, Assert.Single(files!).Bytes.ToArray());
        }

        var xmlText = Encoding.UTF8.GetString(xml);
        Assert.Contains("urn:cen.eu:en16931:2017", xmlText, StringComparison.Ordinal);
        Assert.Contains($"<ram:ID>{invoice.Number}</ram:ID>", xmlText, StringComparison.Ordinal);
        Assert.Equal(pdfBytes, await user.Client.GetByteArrayAsync($"{user.C}/invoices/{invoice.Id}/pdf")); // frozen, not re-rendered

        // Sending attaches the PDF.
        var sent = await user.PostAsync<SendInvoiceResponse>($"{user.C}/invoices/{invoice.Id}/send", new SendInvoiceRequest(SendMode.Email, null, null, null));
        Assert.NotNull(sent.EmailDeliveryId);
        Assert.NotNull(sent.Invoice.SentAt);
        await api.RunJobsAsync();
        var mail = Assert.Single(ApiFactory.EmailsTo(customer.Email!), m => m.Subject.Contains(invoice.Number!, StringComparison.Ordinal));
        Assert.Contains($"Rechnung_{invoice.Number}.pdf", mail.Attachments);
        Assert.Contains("ZUGFeRD", mail.BodyText, StringComparison.Ordinal);
        var deliveries = await user.GetAsync<List<EmailDeliveryDto>>($"{user.C}/invoices/{invoice.Id}/deliveries");
        Assert.Equal(EmailStatus.HandedOff, Assert.Single(deliveries).Status);

        // Payments: partial, overpayment rejected, remainder → paid.
        var today = DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime);
        var partial = await user.PostAsync<InvoiceDto>($"{user.C}/invoices/{invoice.Id}/payments", new RecordPaymentRequest(50m, today, "Überweisung", null));
        Assert.Equal(InvoiceStatus.PartiallyPaid, partial.Status);
        Assert.Equal(invoice.Totals.GrossTotal - 50m, partial.OpenAmount);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/invoices/{invoice.Id}/payments", new RecordPaymentRequest(partial.OpenAmount + 0.01m, today, null, null)),
            HttpStatusCode.Conflict, "payment_exceeds_open_amount");
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/invoices/{invoice.Id}/payments", new RecordPaymentRequest(1m, today.AddDays(1), null, null)),
            HttpStatusCode.BadRequest);
        var paid = await user.PostAsync<InvoiceDto>($"{user.C}/invoices/{invoice.Id}/payments", new RecordPaymentRequest(partial.OpenAmount, today, null, null));
        Assert.Equal(InvoiceStatus.Paid, paid.Status);
        Assert.Equal(2, paid.Payments.Count);
        Assert.DoesNotContain("recordPayment", paid.AllowedActions);
        var dashboard = await user.GetAsync<DashboardDto>($"{user.C}/dashboard");
        Assert.Equal(invoice.Totals.GrossTotal, dashboard.PaymentsReceived);
        Assert.Equal(invoice.Totals.NetTotal, dashboard.InvoicedNet);
        Assert.Equal(0, dashboard.OpenInvoicesCount);

        // Cancellation creates a numbered Stornorechnung and nets the period to zero.
        var cancelled = await user.PostAsync<InvoiceDto>($"{user.C}/invoices/{invoice.Id}/cancel", new CancelRequest("Falsche Anschrift"));
        Assert.Equal(InvoiceStatus.Cancelled, cancelled.Status);
        Assert.Equal($"RE-{year}-0002", cancelled.CancellationInvoiceNumber);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/invoices/{invoice.Id}/cancel", new CancelRequest(null)), HttpStatusCode.Conflict, "invoice_not_cancellable");
        var storno = await user.GetAsync<InvoiceDto>($"{user.C}/invoices/{cancelled.CancellationInvoiceId}");
        Assert.Equal(InvoiceKind.Cancellation, storno.Kind);
        Assert.Equal(invoice.Number, storno.CancelledInvoiceNumber);
        Assert.Contains("Falsche Anschrift", storno.IntroText, StringComparison.Ordinal);
        Assert.Equal(0m, (await user.GetAsync<DashboardDto>($"{user.C}/dashboard")).InvoicedNet);
        Assert.Contains("CancellationCreated", (await user.Client.GetStringAsync($"{user.C}/invoices/{invoice.Id}/events")), StringComparison.Ordinal);

        var list = await user.GetAsync<PagedResult<InvoiceListItemDto>>($"{user.C}/invoices");
        Assert.Equal(2, list.TotalCount);
        Assert.Equal(2, (await user.GetAsync<PagedResult<InvoiceListItemDto>>($"{user.C}/invoices?status=Cancelled")).TotalCount); // original + Stornorechnung
        Assert.Empty((await user.GetAsync<PagedResult<InvoiceListItemDto>>($"{user.C}/invoices?status=Issued,PartiallyPaid")).Items); // a Stornorechnung is never "open"
        var csv = await user.Client.GetStringAsync($"{user.C}/invoices/export.csv");
        Assert.Contains("Stornorechnung", csv, StringComparison.Ordinal);
        Assert.Contains("-" + invoice.Totals.GrossTotal.ToString("0.00", System.Globalization.CultureInfo.GetCultureInfo("de-DE")), csv, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Manual_invoice_requires_complete_data_and_numbers_are_gap_free()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Lückenlos GmbH");
        var customer = await user.CreateCustomerAsync();
        var year = api.Clock.GetUtcNow().Year;

        var draft = await CreateManualAsync(user, customer.Id);
        Assert.Equal("Rechnung", draft.Title);
        Assert.Contains(draft.IssueProblems, p => p.Contains("Steuernummer", StringComparison.Ordinal));
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/invoices/{draft.Id}/issue"), HttpStatusCode.Conflict, "invoice_incomplete");

        // A failed or deleted draft never consumes a number.
        var deleted = await user.Client.DeleteAsync($"{user.C}/invoices/{draft.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        await SetTaxNumberAsync(user);

        var drafts = new List<InvoiceDto>();
        for (var i = 0; i < 4; i++)
        {
            drafts.Add(await CreateManualAsync(user, customer.Id));
        }

        var responses = await Task.WhenAll(drafts.Select(d => user.RawPostAsync($"{user.C}/invoices/{d.Id}/issue")));
        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var numbers = (await Task.WhenAll(responses.Select(async r => (await r.Content.ReadFromJsonAsync<InvoiceDto>(ApiFactory.Json))!.Number!))).Order().ToList();
        Assert.Equal(Enumerable.Range(1, 4).Select(n => $"RE-{year}-{n:0000}"), numbers);

        // Reverse charge needs the customer's VAT ID.
        var rc = await CreateManualAsync(user, customer.Id);
        rc = await user.PutAsync<InvoiceDto>($"{user.C}/invoices/{rc.Id}", Update(rc) with { TaxMode = TaxMode.ReverseCharge });
        Assert.Contains(rc.IssueProblems, p => p.Contains("USt-IdNr. des Kunden", StringComparison.Ordinal));
        Assert.Contains(rc.IssueProblems, p => p.Contains("USt-IdNr. Ihrer Firma", StringComparison.Ordinal));
        Assert.Equal(0m, rc.Totals.TaxTotal);
    }

    [Fact]
    public async Task Employees_prepare_drafts_but_cannot_issue_and_tenants_are_isolated()
    {
        var owner = await api.RegisterAsync();
        await owner.CreateCompanyAsync("Rollen GmbH");
        await SetTaxNumberAsync(owner);
        var customer = await owner.CreateCustomerAsync();
        var employee = await api.RegisterAsync();
        await owner.PostAsync<InvitationDto>($"{owner.C}/invitations", new CreateInvitationRequest(employee.Email, MembershipRole.Employee));
        await api.RunJobsAsync();
        var token = ApiFactory.ExtractToken(ApiFactory.EmailsTo(employee.Email).Last(m => m.Subject.StartsWith("Einladung", StringComparison.Ordinal)).BodyText, "invite?token=");
        var me = await employee.PostAsync<MeDto>("/api/v1/invitations/accept", new AcceptInvitationRequest(token));
        employee.UseCompany(Assert.Single(me.Companies).CompanyId);

        var draft = await CreateManualAsync(employee, customer.Id);
        Assert.DoesNotContain("issue", draft.AllowedActions);
        await ProblemAssert.HasAsync(await employee.RawPostAsync($"{employee.C}/invoices/{draft.Id}/issue"), HttpStatusCode.Forbidden);
        var issued = await owner.PostAsync<InvoiceDto>($"{owner.C}/invoices/{draft.Id}/issue");
        var today = DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime);
        await ProblemAssert.HasAsync(await employee.RawPostAsync($"{employee.C}/invoices/{issued.Id}/payments", new RecordPaymentRequest(1m, today, null, null)), HttpStatusCode.Forbidden);
        await ProblemAssert.HasAsync(await employee.RawPostAsync($"{employee.C}/invoices/{issued.Id}/cancel", new CancelRequest(null)), HttpStatusCode.Forbidden);
        Assert.Equal(issued.Number, (await employee.GetAsync<InvoiceDto>($"{employee.C}/invoices/{issued.Id}")).Number);

        var stranger = await api.RegisterAsync();
        await stranger.CreateCompanyAsync("Fremdfirma");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.RawGetAsync($"{stranger.C}/invoices/{issued.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.RawGetAsync($"{stranger.C}/invoices/{issued.Id}/pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.RawGetAsync($"{owner.C}/invoices/{issued.Id}")).StatusCode);
        Assert.Empty((await stranger.GetAsync<PagedResult<InvoiceListItemDto>>($"{stranger.C}/invoices")).Items);
    }

    [Fact]
    public async Task Overdue_invoices_get_one_automatic_reminder_when_enabled()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync("Mahnwesen GmbH");
        await SetTaxNumberAsync(user);
        var settings = await user.GetAsync<CompanySettingsDto>($"{user.C}/settings");
        Assert.Equal("RE", settings.InvoicePrefix);
        Assert.Equal(14, settings.InvoicePaymentDays);
        await user.PutAsync<CompanySettingsDto>($"{user.C}/settings", settings with { InvoiceReminderEnabled = true, InvoiceReminderAfterDays = 7, InvoicePrefix = "RG" });
        var customer = await user.CreateCustomerAsync();
        var draft = await CreateManualAsync(user, customer.Id);
        var invoice = await user.PostAsync<InvoiceDto>($"{user.C}/invoices/{draft.Id}/issue");
        Assert.StartsWith("RG-", invoice.Number, StringComparison.Ordinal);
        await user.PostAsync<SendInvoiceResponse>($"{user.C}/invoices/{invoice.Id}/send", new SendInvoiceRequest(SendMode.Email, null, null, null));

        var today = DateOnly.FromDateTime(api.Clock.GetUtcNow().UtcDateTime);
        await api.WithDbAsync(db => db.Invoices.IgnoreQueryFilters().Where(i => i.Id == invoice.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.DueDate, today.AddDays(-3))));
        Assert.Equal(0, (await api.RunJobsAsync()).PaymentRemindersQueued); // only 3 of 7 days overdue

        await api.WithDbAsync(db => db.Invoices.IgnoreQueryFilters().Where(i => i.Id == invoice.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.DueDate, today.AddDays(-10))));
        var overdue = await user.GetAsync<InvoiceDto>($"{user.C}/invoices/{invoice.Id}");
        Assert.True(overdue.IsOverdue);
        Assert.Equal(10, overdue.DaysOverdue);
        var dashboard = await user.GetAsync<DashboardDto>($"{user.C}/dashboard");
        Assert.Equal(1, dashboard.OverdueInvoicesCount);
        Assert.Equal(invoice.Id, Assert.Single(dashboard.OverdueInvoices).Id);
        Assert.Single((await user.GetAsync<PagedResult<InvoiceListItemDto>>($"{user.C}/invoices?overdue=true")).Items);

        Assert.Equal(1, (await api.RunJobsAsync()).PaymentRemindersQueued);
        Assert.Equal(0, (await api.RunJobsAsync()).PaymentRemindersQueued); // only once
        var reminder = Assert.Single(ApiFactory.EmailsTo(customer.Email!), m => m.Subject.StartsWith("Zahlungserinnerung", StringComparison.Ordinal));
        Assert.Contains($"Rechnung_{invoice.Number}.pdf", reminder.Attachments);
        Assert.Equal(1, (await user.GetAsync<InvoiceDto>($"{user.C}/invoices/{invoice.Id}")).ReminderCount);
    }

    [Fact]
    public async Task Quotation_must_be_accepted_to_be_invoiced()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var q = await user.CreateQuotationAsync(customer.Id);
        await ProblemAssert.HasAsync(await user.RawPostAsync($"{user.C}/quotations/{q.Id}/invoice"), HttpStatusCode.Conflict, "quotation_not_accepted");
        await user.SendAsync(q.Id, false, SendMode.Manual);
        await user.PostAsync<QuotationDto>($"{user.C}/quotations/{q.Id}/accept", new DecisionRequest(null));
        var draft = await user.PostAsync<InvoiceDto>($"{user.C}/quotations/{q.Id}/invoice");
        Assert.Equal(q.Id, draft.QuotationId);
        Assert.Equal(draft.Id, Assert.Single((await user.GetAsync<QuotationDto>($"{user.C}/quotations/{q.Id}")).Invoices).Id);
        Assert.Single(await user.GetAsync<List<InvoiceListItemDto>>($"{user.C}/customers/{customer.Id}/invoices"));
    }

    [Fact]
    public async Task Deleting_a_customer_with_invoices_anonymises_instead()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var customer = await user.CreateCustomerAsync();
        var draft = await CreateManualAsync(user, customer.Id);
        await user.Client.DeleteAsync($"{user.C}/invoices/{draft.Id}"); // even a deleted draft keeps the customer reference
        var response = await user.Client.DeleteAsync($"{user.C}/customers/{customer.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("anonymized", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    private static Task<InvoiceDto> CreateManualAsync(TestUser user, Guid customerId) =>
        user.PostAsync<InvoiceDto>($"{user.C}/invoices", new CreateInvoiceRequest(customerId, null, null, null, null, null, null, null, null, null, null, null, TestUser.DefaultItems));

    private static UpdateInvoiceRequest Update(InvoiceDto i) => new(
        i.CustomerId, i.Title, i.IssueDate, i.ServiceDateFrom, i.ServiceDateTo, i.DueDate, i.TaxMode, i.IntroText, i.ClosingText, i.PaymentTerms, i.BuyerReference, i.InternalNotes,
        i.LineItems.Select(l => new LineItemInput(l.Title, l.Description, l.Quantity, l.Unit, l.UnitPriceNet, l.DiscountPercent, l.TaxRatePercent)).ToList(), i.RowVersion);

    private static async Task SetTaxNumberAsync(TestUser user)
    {
        var c = await user.GetAsync<CompanyDto>(user.C);
        await user.PutAsync<CompanyDto>(user.C, new UpdateCompanyRequest(c.Name, c.AddressLine1, c.AddressLine2, c.PostalCode, c.City, c.Country, c.Email, c.Phone, c.Website,
            c.VatId, "214/5678/9012", c.BrandColor, c.TimeZone, c.Language, c.RowVersion));
    }
}
