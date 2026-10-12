using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;
using AngebotPilot.Infrastructure.Pdf;
using UglyToad.PdfPig;

namespace AngebotPilot.UnitTests;

public class PdfRendererTests
{
    private static PdfCompany Company(byte[]? logo = null) => new(
        "Müller & Söhne Elektrotechnik", "Hauptstraße 1", null, "50667", "Köln", "DE", "info@mueller.example", "0221 123", null, "DE123456789", null,
        "#2F45D8", logo, "Müller & Söhne", "DE89370400440532013000", "COBADEFFXXX", "Beispielbank");

    [Fact]
    public void Renders_german_text_euro_amounts_and_totals()
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.RecipientName = "Bäckerei Größe GmbH";
        q.RecipientAddress = "Grüner Weg 3\n50672 Köln";
        q.IntroText = "Gerne unterbreiten wir Ihnen folgendes Angebot für die Überprüfung.";
        q.ReplaceLineItems(
        [
            new QuotationLineItem { Title = "Prüfung ortsveränderlicher Geräte", Quantity = 25, Unit = "Stk.", UnitPriceNet = 6.9m, TaxRatePercent = 19 },
            new QuotationLineItem { Title = "Fachbuch Elektrosicherheit", Quantity = 1, Unit = "Stk.", UnitPriceNet = 39.9m, TaxRatePercent = 7, DiscountPercent = 10 },
        ]);

        var pdf = new QuotationPdfRenderer().Render(new PdfQuotation(q, Company(), "https://app.example/#/q/abc", false));

        using var doc = PdfDocument.Open(pdf);
        var text = string.Join(' ', doc.GetPages().Select(Words));
        WriteArtifact("sample-quotation.pdf", pdf);
        Assert.Contains("Angebot", text);
        Assert.Contains("AN-2026-0001", text);
        Assert.Contains("Bäckerei", text);
        Assert.Contains("Größe", text);
        Assert.Contains("Überprüfung", text);
        Assert.Contains("172,50 €", text); // 25 × 6,90
        Assert.Contains("35,91 €", text); // 39,90 − 10 %
        Assert.Contains("208,41 €", text); // net total
        Assert.Contains("USt. 19 %", text);
        Assert.Contains("USt. 7 %", text);
        Assert.Contains(QuotationCalculator.Calculate(q.LineItems.Select(i => new LineInput(i.Quantity, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)), TaxMode.Standard).GrossTotal.ToString("#,##0.00", System.Globalization.CultureInfo.GetCultureInfo("de-DE")) + " €", text);
        Assert.Contains("Seite 1 von 1", text);
        Assert.Contains("IBAN DE89 3704", text);
        Assert.DoesNotContain("ENTWURF", text);
    }

    [Fact]
    public void Long_quotations_span_multiple_numbered_pages()
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.RecipientName = "Kunde";
        q.ReplaceLineItems(Enumerable.Range(1, 80).Select(i => new QuotationLineItem
        {
            Title = $"Position {i}", Description = "Ausführliche Beschreibung der Leistung mit Material und Montage.", Quantity = i, Unit = "Std.", UnitPriceNet = 10m, TaxRatePercent = 19,
        }));

        var pdf = new QuotationPdfRenderer().Render(new PdfQuotation(q, Company(), null, false));
        using var doc = PdfDocument.Open(pdf);
        Assert.True(doc.NumberOfPages >= 3);
        var last = Words(doc.GetPage(doc.NumberOfPages));
        Assert.Contains($"Seite {doc.NumberOfPages} von {doc.NumberOfPages}", last);
        Assert.Contains("Gesamtbetrag", last);
    }

    [Fact]
    public void Draft_preview_is_watermarked_and_small_business_note_is_shown()
    {
        var q = QuotationCalculatorTests.NewQuotation();
        q.RecipientName = "Kunde";
        q.TaxMode = TaxMode.SmallBusiness;
        q.ReplaceLineItems([QuotationCalculatorTests.Item(1, 100m, 0, 19)]);
        var pdf = new QuotationPdfRenderer().Render(new PdfQuotation(q, Company(Png1x1), null, true));
        using var doc = PdfDocument.Open(pdf);
        var text = Words(doc.GetPage(1));
        Assert.Contains("ENTWURF", string.Concat(doc.GetPage(1).Letters.Select(l => l.Value)));
        Assert.Contains("§ 19 UStG", text);
        Assert.DoesNotContain("USt. 19 %", text);
    }

    /// <summary>Keeps the rendered PDF for visual inspection when TEST_ARTIFACTS_DIR is set (e.g. screenshots of the PDF).</summary>
    private static void WriteArtifact(string name, byte[] content)
    {
        var dir = Environment.GetEnvironmentVariable("TEST_ARTIFACTS_DIR");
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, name), content);
        }
    }

    private static string Words(UglyToad.PdfPig.Content.Page page) => string.Join(' ', page.GetWords().Select(w => w.Text));

    // Minimal valid PNG (1×1 transparent pixel) to exercise logo rendering.
    private static readonly byte[] Png1x1 = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
}
