using System.Globalization;
using System.Text;
using System.Xml.Linq;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Invoices;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Infrastructure.Pdf;
using Microsoft.Extensions.Logging.Abstractions;
using UglyToad.PdfPig;

namespace AngebotPilot.UnitTests;

public class InvoiceDomainTests
{
    private static readonly DateOnly Today = new(2026, 10, 13);

    internal static Invoice NewInvoice(TaxMode mode = TaxMode.Standard)
    {
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            CompanyId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Title = "Treppenhausbeleuchtung",
            IssueDate = Today,
            ServiceDateFrom = Today.AddDays(-3),
            DueDate = Today.AddDays(14),
            TaxMode = mode,
            RecipientName = "Hausverwaltung Lindenhof GmbH",
            RecipientContact = "Frau Petra Lindner",
            RecipientStreet = "Lindenallee 12",
            RecipientPostalCode = "50858",
            RecipientCity = "Köln",
            RecipientAddress = "Lindenallee 12\n50858 Köln",
            RecipientEmail = "p.lindner@lindenhof.example",
        };
        invoice.ReplaceLineItems(
        [
            new InvoiceLineItem { Title = "LED-Wandleuchte mit Bewegungsmelder", Description = "IP44, 3000 K", Quantity = 12, Unit = "Stk.", UnitPriceNet = 89.5m, DiscountPercent = 5, TaxRatePercent = 19 },
            new InvoiceLineItem { Title = "Leitungsverlegung NYM-J 3×1,5 mm²", Quantity = 45, Unit = "m", UnitPriceNet = 6.8m, TaxRatePercent = 19 },
            new InvoiceLineItem { Title = "Montage und Inbetriebnahme", Quantity = 9, Unit = "Std.", UnitPriceNet = 62m, TaxRatePercent = 19 },
        ]);
        return invoice;
    }

    [Fact]
    public void Totals_use_the_quotation_rules()
    {
        var invoice = NewInvoice();
        Assert.Equal(1938.00m, invoice.SubtotalBeforeDiscount);
        Assert.Equal(53.70m, invoice.DiscountTotal);
        Assert.Equal(1884.30m, invoice.NetTotal);
        Assert.Equal(358.02m, invoice.TaxTotal);
        Assert.Equal(2242.32m, invoice.GrossTotal);
    }

    [Fact]
    public void Draft_has_no_number_and_issue_freezes_it()
    {
        var invoice = NewInvoice();
        Assert.Null(invoice.Number);
        Assert.Empty(invoice.IssueProblems(Today));

        invoice.Issue("RE-2026-0001", DateTimeOffset.UtcNow, Guid.NewGuid(), Today);

        Assert.Equal("RE-2026-0001", invoice.Number);
        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
        Assert.True(invoice.IsOpen);
        var ex = Assert.Throws<DomainException>(() => invoice.ReplaceLineItems([]));
        Assert.Equal("invoice_not_editable", ex.Code);
        Assert.Throws<DomainException>(() => invoice.Issue("RE-2026-0002", DateTimeOffset.UtcNow, null, Today));
    }

    [Fact]
    public void Issue_requires_service_date_address_items_and_valid_dates()
    {
        var invoice = new Invoice { Title = "Leer", IssueDate = Today.AddDays(1), DueDate = Today, RecipientName = "X" };
        var problems = invoice.IssueProblems(Today);
        Assert.Contains(problems, p => p.Contains("keine Positionen", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("Leistungsdatum", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("Zukunft", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("Fälligkeitsdatum", StringComparison.Ordinal));
        Assert.Contains(problems, p => p.Contains("Rechnungsanschrift", StringComparison.Ordinal));
        var ex = Assert.Throws<DomainException>(() => invoice.Issue("RE-1", DateTimeOffset.UtcNow, null, Today));
        Assert.Equal("invoice_incomplete", ex.Code);
        Assert.Null(invoice.Number);
    }

    [Fact]
    public void Reverse_charge_requires_the_customer_vat_id()
    {
        var invoice = NewInvoice(TaxMode.ReverseCharge);
        Assert.Contains(invoice.IssueProblems(Today), p => p.Contains("USt-IdNr. des Kunden", StringComparison.Ordinal));
        invoice.RecipientVatId = "ATU12345678";
        Assert.Empty(invoice.IssueProblems(Today));
        Assert.Equal(0m, invoice.TaxTotal);
    }

    [Fact]
    public void Payments_move_the_status_and_cannot_exceed_the_open_amount()
    {
        var invoice = NewInvoice();
        Assert.Throws<DomainException>(() => invoice.RecordPayment(Payment(10m), DateTimeOffset.UtcNow)); // draft
        invoice.Issue("RE-2026-0001", DateTimeOffset.UtcNow, null, Today);

        var first = Payment(1000m);
        invoice.RecordPayment(first, DateTimeOffset.UtcNow);
        Assert.Equal(InvoiceStatus.PartiallyPaid, invoice.Status);
        Assert.Equal(1242.32m, invoice.OpenAmount);

        var ex = Assert.Throws<DomainException>(() => invoice.RecordPayment(Payment(1242.33m), DateTimeOffset.UtcNow));
        Assert.Equal("payment_exceeds_open_amount", ex.Code);
        Assert.Contains("1.242,32", ex.Message, StringComparison.Ordinal);

        invoice.RecordPayment(Payment(1242.32m, Today.AddDays(2)), DateTimeOffset.UtcNow);
        Assert.Equal(InvoiceStatus.Paid, invoice.Status);
        Assert.Equal(Today.AddDays(2), invoice.PaidOn);
        Assert.Equal(0m, invoice.OpenAmount);
        Assert.False(invoice.IsOverdue(Today.AddDays(60)));

        invoice.RemovePayment(first, DateTimeOffset.UtcNow);
        Assert.Equal(InvoiceStatus.PartiallyPaid, invoice.Status);
        Assert.Null(invoice.PaidOn);
    }

    [Fact]
    public void Overdue_is_derived_from_the_due_date()
    {
        var invoice = NewInvoice();
        Assert.False(invoice.IsOverdue(Today.AddDays(30))); // drafts are never overdue
        invoice.Issue("RE-2026-0001", DateTimeOffset.UtcNow, null, Today);
        Assert.False(invoice.IsOverdue(invoice.DueDate));
        Assert.True(invoice.IsOverdue(invoice.DueDate.AddDays(1)));
        Assert.Equal(5, invoice.DaysOverdue(invoice.DueDate.AddDays(5)));
    }

    [Fact]
    public void Cancel_marks_the_invoice_and_only_once()
    {
        var invoice = NewInvoice();
        Assert.Throws<DomainException>(() => invoice.Cancel(Guid.NewGuid(), DateTimeOffset.UtcNow, null)); // draft
        invoice.Issue("RE-2026-0001", DateTimeOffset.UtcNow, null, Today);
        var storno = Guid.NewGuid();
        invoice.Cancel(storno, DateTimeOffset.UtcNow, "Falscher Kunde");
        Assert.Equal(InvoiceStatus.Cancelled, invoice.Status);
        Assert.Equal(storno, invoice.CancellationInvoiceId);
        Assert.False(invoice.IsOpen);
        Assert.Throws<DomainException>(() => invoice.Cancel(Guid.NewGuid(), DateTimeOffset.UtcNow, null));
        Assert.Throws<DomainException>(() => invoice.MarkReminderSent(DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Allowed_actions_depend_on_status_and_role()
    {
        var invoice = NewInvoice();
        Assert.Contains("issue", InvoiceService.AllowedActions(invoice, MembershipRole.Admin));
        Assert.DoesNotContain("issue", InvoiceService.AllowedActions(invoice, MembershipRole.Employee));
        Assert.Contains("edit", InvoiceService.AllowedActions(invoice, MembershipRole.Employee));

        invoice.Issue("RE-2026-0001", DateTimeOffset.UtcNow, null, Today);
        var owner = InvoiceService.AllowedActions(invoice, MembershipRole.Owner);
        Assert.Equal(["duplicate", "send", "recordPayment", "remind", "cancel"], owner);
        Assert.Equal(["duplicate"], InvoiceService.AllowedActions(invoice, MembershipRole.Employee));
    }

    internal static InvoicePayment Payment(decimal amount, DateOnly? paidOn = null) =>
        new() { Id = Guid.NewGuid(), Amount = amount, PaidOn = paidOn ?? Today, CreatedAt = DateTimeOffset.UtcNow };
}

public class EInvoiceTests
{
    private static readonly XNamespace Ram = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100";
    private static readonly XNamespace Rsm = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";

    internal static PdfCompany Seller() => new(
        "Elektro Sommer GmbH", "Industriestraße 4", null, "50735", "Köln", "DE", "rechnung@sommer.example", "0221 987654", null, "DE123456789", "214/5678/9012",
        "#1D4ED8", null, "Elektro Sommer GmbH", "DE89370400440532013000", "COBADEFFXXX", "Commerzbank");

    [Fact]
    public void Writes_an_en16931_cii_invoice_with_consistent_totals()
    {
        var invoice = InvoiceDomainTests.NewInvoice();
        invoice.Issue("RE-2026-0007", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        var doc = XDocument.Parse(Encoding.UTF8.GetString(EInvoiceWriter.Write(invoice, Seller())));

        Assert.Equal("urn:cen.eu:en16931:2017", doc.Descendants(Ram + "GuidelineSpecifiedDocumentContextParameter").Single().Element(Ram + "ID")!.Value);
        var header = doc.Root!.Element(Rsm + "ExchangedDocument")!;
        Assert.Equal("RE-2026-0007", header.Element(Ram + "ID")!.Value);
        Assert.Equal("380", header.Element(Ram + "TypeCode")!.Value);

        var lines = doc.Descendants(Ram + "IncludedSupplyChainTradeLineItem").ToList();
        Assert.Equal(3, lines.Count);
        Assert.Equal("H87", lines[0].Descendants(Ram + "BilledQuantity").Single().Attribute("unitCode")!.Value);
        Assert.Equal("MTR", lines[1].Descendants(Ram + "BilledQuantity").Single().Attribute("unitCode")!.Value);
        Assert.Equal("HUR", lines[2].Descendants(Ram + "BilledQuantity").Single().Attribute("unitCode")!.Value);
        Assert.Equal("53.70", lines[0].Descendants(Ram + "ActualAmount").Single().Value); // 5 % line discount

        // BR-CO-10: sum of line net amounts equals the header line total.
        var lineSum = lines.Sum(l => decimal.Parse(l.Descendants(Ram + "LineTotalAmount").Single().Value, CultureInfo.InvariantCulture));
        var summation = doc.Descendants(Ram + "SpecifiedTradeSettlementHeaderMonetarySummation").Single();
        Assert.Equal(lineSum, decimal.Parse(summation.Element(Ram + "LineTotalAmount")!.Value, CultureInfo.InvariantCulture));
        Assert.Equal("1884.30", summation.Element(Ram + "TaxBasisTotalAmount")!.Value);
        Assert.Equal("358.02", summation.Element(Ram + "TaxTotalAmount")!.Value);
        Assert.Equal("2242.32", summation.Element(Ram + "GrandTotalAmount")!.Value);
        Assert.Equal("2242.32", summation.Element(Ram + "DuePayableAmount")!.Value);

        var tax = doc.Descendants(Ram + "ApplicableHeaderTradeSettlement").Single().Elements(Ram + "ApplicableTradeTax").Single();
        Assert.Equal("S", tax.Element(Ram + "CategoryCode")!.Value);
        Assert.Equal("19", tax.Element(Ram + "RateApplicablePercent")!.Value);

        var seller = doc.Descendants(Ram + "SellerTradeParty").Single();
        Assert.Contains(seller.Descendants(Ram + "ID"), id => id.Attribute("schemeID")?.Value == "VA" && id.Value == "DE123456789");
        Assert.Contains(seller.Descendants(Ram + "ID"), id => id.Attribute("schemeID")?.Value == "FC");
        Assert.Equal("DE89370400440532013000", doc.Descendants(Ram + "IBANID").Single().Value);
        Assert.Equal("58", doc.Descendants(Ram + "SpecifiedTradeSettlementPaymentMeans").Single().Element(Ram + "TypeCode")!.Value);
        Assert.Equal(invoice.DueDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture), doc.Descendants(Ram + "DueDateDateTime").Single().Value);
        Assert.Equal(invoice.ServiceDateFrom!.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture), doc.Descendants(Ram + "ActualDeliverySupplyChainEvent").Single().Value);
        Assert.Equal("Köln", doc.Descendants(Ram + "BuyerTradeParty").Single().Descendants(Ram + "CityName").Single().Value);
    }

    [Fact]
    public void Service_period_small_business_and_reverse_charge_are_encoded()
    {
        var invoice = InvoiceDomainTests.NewInvoice(TaxMode.SmallBusiness);
        invoice.ServiceDateTo = invoice.ServiceDateFrom!.Value.AddDays(10);
        invoice.Issue("RE-2026-0008", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        var doc = XDocument.Parse(Encoding.UTF8.GetString(EInvoiceWriter.Write(invoice, Seller())));
        Assert.Single(doc.Descendants(Ram + "BillingSpecifiedPeriod"));
        Assert.Equal(invoice.ServiceDateTo!.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture), doc.Descendants(Ram + "ActualDeliverySupplyChainEvent").Single().Value);
        var tax = doc.Descendants(Ram + "ApplicableHeaderTradeSettlement").Single().Elements(Ram + "ApplicableTradeTax").Single();
        Assert.Equal("E", tax.Element(Ram + "CategoryCode")!.Value);
        Assert.Contains("§ 19", tax.Element(Ram + "ExemptionReason")!.Value, StringComparison.Ordinal);
        Assert.Equal("0.00", tax.Element(Ram + "CalculatedAmount")!.Value);

        var rc = InvoiceDomainTests.NewInvoice(TaxMode.ReverseCharge);
        rc.RecipientVatId = "ATU12345678";
        rc.Issue("RE-2026-0009", DateTimeOffset.UtcNow, null, rc.IssueDate);
        var rcDoc = XDocument.Parse(Encoding.UTF8.GetString(EInvoiceWriter.Write(rc, Seller())));
        var rcTax = rcDoc.Descendants(Ram + "ApplicableHeaderTradeSettlement").Single().Elements(Ram + "ApplicableTradeTax").Single();
        Assert.Equal("AE", rcTax.Element(Ram + "CategoryCode")!.Value);
        Assert.Equal("VATEX-EU-AE", rcTax.Element(Ram + "ExemptionReasonCode")!.Value);
        Assert.Contains(rcDoc.Descendants(Ram + "BuyerTradeParty").Single().Descendants(Ram + "ID"), id => id.Value == "ATU12345678");
    }

    [Fact]
    public void Cancellation_is_a_credit_note_referencing_the_original()
    {
        var storno = InvoiceDomainTests.NewInvoice();
        storno.Kind = InvoiceKind.Cancellation;
        storno.CancelledInvoiceNumber = "RE-2026-0001";
        storno.CancelledInvoiceIssueDate = new DateOnly(2026, 10, 1);
        storno.Issue("RE-2026-0002", DateTimeOffset.UtcNow, null, storno.IssueDate);
        var doc = XDocument.Parse(Encoding.UTF8.GetString(EInvoiceWriter.Write(storno, Seller())));
        Assert.Equal("381", doc.Root!.Element(Rsm + "ExchangedDocument")!.Element(Ram + "TypeCode")!.Value);
        Assert.Equal("RE-2026-0001", doc.Descendants(Ram + "InvoiceReferencedDocument").Single().Element(Ram + "IssuerAssignedID")!.Value);
        Assert.Empty(doc.Descendants(Ram + "SpecifiedTradeSettlementPaymentMeans"));
        Assert.Equal("2242.32", doc.Descendants(Ram + "GrandTotalAmount").Single().Value); // credit notes carry positive amounts
    }

    [Theory]
    [InlineData("Stk.", "H87")]
    [InlineData("Std.", "HUR")]
    [InlineData("m²", "MTK")]
    [InlineData("pauschal", "LS")]
    [InlineData("kWh", "KWH")]
    [InlineData("Karton", "C62")]
    public void Maps_units_to_un_ece_codes(string unit, string code) => Assert.Equal(code, EInvoiceWriter.UnitCode(unit));

    [Fact]
    public void Girocode_follows_epc069_12()
    {
        var invoice = InvoiceDomainTests.NewInvoice();
        Assert.Null(InvoiceDocuments.GiroCode(invoice, Seller())); // drafts have no number
        invoice.Issue("RE-2026-0007", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        var lines = InvoiceDocuments.GiroCode(invoice, Seller())!.Split('\n');
        Assert.Equal(["BCD", "002", "1", "SCT", "COBADEFFXXX", "Elektro Sommer GmbH", "DE89370400440532013000", "EUR2242.32", "", ""], lines[..10]);
        Assert.StartsWith("RE-2026-0007", lines[10], StringComparison.Ordinal);
    }
}

public class InvoicePdfTests
{
    [Fact]
    public void Renders_invoice_with_legal_details_and_embeds_the_e_invoice()
    {
        var invoice = InvoiceDomainTests.NewInvoice();
        invoice.Issue("RE-2026-0007", DateTimeOffset.UtcNow, null, invoice.IssueDate);
        var seller = EInvoiceTests.Seller();
        var renderer = new InvoicePdfRenderer(NullLogger<InvoicePdfRenderer>.Instance);
        var pdf = renderer.Render(new PdfInvoice(invoice, seller, false, InvoiceDocuments.GiroCode(invoice, seller)));

        using (var doc = PdfDocument.Open(pdf))
        {
            var text = string.Join(' ', doc.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
            Assert.Contains("RE-2026-0007", text);
            Assert.Contains("Rechnungsdatum", text);
            Assert.Contains("Leistungsdatum", text);
            Assert.Contains("Fällig", text);
            Assert.Contains("2.242,32 €", text);
            Assert.Contains("Steuernummer 214/5678/9012", text);
            Assert.Contains("USt-IdNr. DE123456789", text);
            Assert.Contains("GiroCode", text);
            Assert.DoesNotContain("ENTWURF", text);
        }

        var xml = EInvoiceWriter.Write(invoice, seller);
        var hybrid = renderer.EmbedEInvoice(pdf, xml, DateTimeOffset.UtcNow);
        Assert.NotNull(hybrid);
        WriteArtifact("sample-invoice-zugferd.pdf", hybrid!);
        using var embedded = PdfDocument.Open(hybrid!);
        Assert.True(embedded.Advanced.TryGetEmbeddedFiles(out var files));
        var file = Assert.Single(files!);
        Assert.Equal("factur-x.xml", file.Name);
        Assert.Equal(xml, file.Bytes.ToArray());
        var raw = Encoding.Latin1.GetString(hybrid!);
        Assert.Contains("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#", raw, StringComparison.Ordinal);
    }

    [Fact]
    public void Cancellation_invoice_shows_negative_amounts_and_draft_is_watermarked()
    {
        var storno = InvoiceDomainTests.NewInvoice();
        storno.Kind = InvoiceKind.Cancellation;
        storno.CancelledInvoiceNumber = "RE-2026-0001";
        storno.Issue("RE-2026-0002", DateTimeOffset.UtcNow, null, storno.IssueDate);
        var renderer = new InvoicePdfRenderer(NullLogger<InvoicePdfRenderer>.Instance);
        using (var doc = PdfDocument.Open(renderer.Render(new PdfInvoice(storno, EInvoiceTests.Seller(), false, null))))
        {
            var text = string.Join(' ', doc.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
            Assert.Contains("Stornorechnung", text);
            Assert.Contains("−2.242,32 €", text, StringComparison.Ordinal);
            Assert.Contains("RE-2026-0001", text);
        }

        var draft = InvoiceDomainTests.NewInvoice();
        using var draftDoc = PdfDocument.Open(renderer.Render(new PdfInvoice(draft, EInvoiceTests.Seller(), true, null)));
        var draftText = string.Join(' ', draftDoc.GetPages().SelectMany(p => p.GetWords()).Select(w => w.Text));
        Assert.Contains("ENTWURF", string.Concat(draftDoc.GetPage(1).Letters.Select(l => l.Value)), StringComparison.Ordinal);
        Assert.Contains("(Entwurf)", draftText);
    }

    /// <summary>Produces hybrid PDFs for every tax treatment and the cancellation invoice (checked with an external ZUGFeRD validator).</summary>
    [Fact]
    public void Every_variant_produces_a_hybrid_pdf()
    {
        var renderer = new InvoicePdfRenderer(NullLogger<InvoicePdfRenderer>.Instance);
        var seller = EInvoiceTests.Seller();

        var smallBusiness = InvoiceDomainTests.NewInvoice(TaxMode.SmallBusiness);
        smallBusiness.ServiceDateTo = smallBusiness.ServiceDateFrom!.Value.AddDays(20);
        var reverseCharge = InvoiceDomainTests.NewInvoice(TaxMode.ReverseCharge);
        reverseCharge.RecipientVatId = "ATU12345678";
        reverseCharge.RecipientCountry = "AT";
        var mixedRates = InvoiceDomainTests.NewInvoice();
        mixedRates.ReplaceLineItems(
        [
            new InvoiceLineItem { Title = "Fachbuch", Quantity = 2, Unit = "Stk.", UnitPriceNet = 39.9m, TaxRatePercent = 7 },
            new InvoiceLineItem { Title = "Wartung pauschal", Quantity = 1, Unit = "pauschal", UnitPriceNet = 250m, DiscountPercent = 10, TaxRatePercent = 19 },
            new InvoiceLineItem { Title = "Photovoltaik-Modul", Quantity = 4, Unit = "Stk.", UnitPriceNet = 120m, TaxRatePercent = 0 },
        ]);
        var storno = InvoiceDomainTests.NewInvoice();
        storno.Kind = InvoiceKind.Cancellation;
        storno.CancelledInvoiceNumber = "RE-2026-0001";
        storno.CancelledInvoiceIssueDate = storno.IssueDate.AddDays(-5);

        var n = 20;
        foreach (var (name, invoice) in new[] { ("small-business", smallBusiness), ("reverse-charge", reverseCharge), ("mixed-rates", mixedRates), ("cancellation", storno) })
        {
            invoice.Issue($"RE-2026-00{n++}", DateTimeOffset.UtcNow, null, invoice.IssueDate);
            var pdf = renderer.Render(new PdfInvoice(invoice, seller, false, InvoiceDocuments.GiroCode(invoice, seller)));
            var hybrid = renderer.EmbedEInvoice(pdf, EInvoiceWriter.Write(invoice, seller), DateTimeOffset.UtcNow);
            Assert.NotNull(hybrid);
            WriteArtifact($"sample-invoice-{name}.pdf", hybrid!);
        }
    }

    private static void WriteArtifact(string name, byte[] content)
    {
        var dir = Environment.GetEnvironmentVariable("TEST_ARTIFACTS_DIR");
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, name), content);
        }
    }
}
