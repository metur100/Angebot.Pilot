using System.Globalization;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Quotations;
using Microsoft.Extensions.Logging;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using L = AngebotPilot.Infrastructure.Pdf.QuotationPdfRenderer;

namespace AngebotPilot.Infrastructure.Pdf;

/// <summary>
/// Renders invoices and cancellation invoices with the same layout as quotations. Final documents are PDF/A-3b and
/// get the CII e-invoice embedded as <c>factur-x.xml</c> (ZUGFeRD 2.x / Factur-X, profile EN 16931).
/// </summary>
public sealed class InvoicePdfRenderer(ILogger<InvoicePdfRenderer> logger) : IInvoicePdfRenderer
{
    private const string FacturXNamespace = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";

    public byte[] Render(PdfInvoice model)
    {
        L.EnsureInitialised();
        var inv = model.Invoice;
        var c = model.Company;
        var brand = L.IsHex(c.BrandColor) ? c.BrandColor : "#2F45D8";
        var totals = inv.CalculateTotals();
        var items = inv.LineItems.OrderBy(i => i.Position).ToList();
        var hasDiscount = items.Any(i => i.DiscountPercent > 0);
        var showTaxColumn = inv.TaxMode == TaxMode.Standard && items.Select(i => i.TaxRatePercent).Distinct().Count() > 1;
        var storno = inv.IsCancellation;
        var docLabel = storno ? "Stornorechnung" : "Rechnung";

        var document = Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginTop(16, Unit.Millimetre);
                page.MarginBottom(14, Unit.Millimetre);
                page.MarginHorizontal(20, Unit.Millimetre);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(t => t.FontFamily(L.Font).FontSize(9.5f).FontColor("#232833").LineHeight(1.35f).DisableFontFeature(FontFeatures.ContextualAlternates));

                if (model.IsDraftPreview)
                {
                    page.Background().AlignCenter().AlignMiddle().Rotate(-35).Text("ENTWURF").FontFamily(L.Font).FontSize(110).Bold().FontColor("#EEF0F3");
                }

                page.Header().Element(h => L.Header(h, c, brand));
                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem(10).Column(addr =>
                        {
                            addr.Item().Text(L.SenderLine(c)).FontSize(7).FontColor("#6B7485").Underline();
                            addr.Item().PaddingTop(6).Text(inv.RecipientName).SemiBold();
                            if (!string.IsNullOrWhiteSpace(inv.RecipientContact) && inv.RecipientContact != inv.RecipientName)
                            {
                                addr.Item().Text(inv.RecipientContact);
                            }

                            foreach (var line in (inv.RecipientAddress ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries))
                            {
                                addr.Item().Text(line);
                            }
                        });
                        row.ConstantItem(8, Unit.Millimetre);
                        row.RelativeItem(9).Border(0.6f).BorderColor("#E2E5EA").Background("#FBFCFD").Padding(9).Column(info =>
                        {
                            L.InfoLine(info, storno ? "Storno-Nr." : "Rechnungsnummer", inv.Number ?? "wird vergeben", bold: true);
                            L.InfoLine(info, storno ? "Datum" : "Rechnungsdatum", L.Date(inv.IssueDate));
                            if (ServicePeriod(inv) is { } period)
                            {
                                L.InfoLine(info, inv.ServiceDateTo is { } to && to != inv.ServiceDateFrom ? "Leistungszeitraum" : "Leistungsdatum", period);
                            }

                            if (!storno)
                            {
                                L.InfoLine(info, "Fällig am", L.Date(inv.DueDate));
                            }

                            if (storno && inv.CancelledInvoiceNumber is not null)
                            {
                                L.InfoLine(info, "Zu Rechnung", inv.CancelledInvoiceNumber);
                            }

                            if (!string.IsNullOrWhiteSpace(inv.BuyerReference))
                            {
                                L.InfoLine(info, "Ihre Referenz", inv.BuyerReference!);
                            }

                            if (!string.IsNullOrWhiteSpace(inv.QuotationNumber))
                            {
                                L.InfoLine(info, "Angebot", inv.QuotationNumber!);
                            }

                            if (!string.IsNullOrWhiteSpace(inv.RecipientVatId))
                            {
                                L.InfoLine(info, "USt-IdNr. Kunde", inv.RecipientVatId!);
                            }
                        });
                    });

                    var heading = inv.Number is null ? $"{docLabel} (Entwurf)" : $"{docLabel} {inv.Number}";
                    col.Item().PaddingTop(22).Text(heading).FontSize(17).Bold().FontColor("#141821");
                    col.Item().PaddingTop(2).Text(inv.Title).FontSize(11).SemiBold().FontColor(brand);

                    if (!string.IsNullOrWhiteSpace(inv.IntroText))
                    {
                        col.Item().PaddingTop(12).Text(inv.RecipientContact is { Length: > 0 } contact ? $"Guten Tag {contact}," : "Sehr geehrte Damen und Herren,");
                        col.Item().PaddingTop(6).Text(inv.IntroText);
                    }

                    col.Item().PaddingTop(14).Element(e => L.LineItems(e, items, hasDiscount, showTaxColumn, brand, negate: storno));
                    var grossLabel = storno ? "Stornobetrag" : inv.TaxMode == TaxMode.Standard ? "Rechnungsbetrag brutto" : "Rechnungsbetrag";
                    col.Item().PaddingTop(8).AlignRight().Width(80, Unit.Millimetre).Element(e => L.Totals(e, inv.TaxMode, totals, brand, grossLabel, negate: storno));

                    var notes = L.TaxNotes(inv.TaxMode).ToList();
                    if (notes.Count > 0)
                    {
                        col.Item().PaddingTop(10).Column(n =>
                        {
                            foreach (var note in notes)
                            {
                                n.Item().Text(note).FontSize(8.5f).FontColor("#4D5566");
                            }
                        });
                    }

                    if (!storno)
                    {
                        col.Item().PaddingTop(14).Column(t =>
                        {
                            t.Item().Text("Zahlung").SemiBold().FontSize(9);
                            var target = string.IsNullOrWhiteSpace(c.Iban) ? string.Empty : " auf das unten genannte Konto";
                            t.Item().Text($"Bitte überweisen Sie den Rechnungsbetrag von {L.Eur(totals.GrossTotal)} bis zum {L.Date(inv.DueDate)} ohne Abzug unter Angabe der Rechnungsnummer{target}.").FontSize(9);
                            if (!string.IsNullOrWhiteSpace(inv.PaymentTerms))
                            {
                                t.Item().PaddingTop(4).Text(inv.PaymentTerms).FontSize(9);
                            }
                        });
                    }

                    if (!string.IsNullOrWhiteSpace(inv.ClosingText))
                    {
                        col.Item().PaddingTop(14).Text(inv.ClosingText);
                    }

                    col.Item().PaddingTop(10).Text("Mit freundlichen Grüßen");
                    col.Item().Text(c.Name).SemiBold();

                    if (model.GiroCode is not null && !model.IsDraftPreview)
                    {
                        col.Item().PaddingTop(16).ShowEntire().Border(0.6f).BorderColor("#E2E5EA").Padding(10).Row(r =>
                        {
                            r.ConstantItem(24, Unit.Millimetre).Height(24, Unit.Millimetre).Svg(QrSvg(model.GiroCode));
                            r.ConstantItem(5, Unit.Millimetre);
                            r.RelativeItem().AlignMiddle().Column(t =>
                            {
                                t.Item().Text("Bequem bezahlen mit GiroCode").SemiBold().FontColor(brand);
                                t.Item().Text("Scannen Sie den Code mit Ihrer Banking-App. Empfänger, IBAN, Betrag und Verwendungszweck werden automatisch übernommen.")
                                    .FontSize(8.5f).FontColor("#4D5566");
                            });
                        });
                    }
                });

                page.Footer().Element(f => L.Footer(f, c));
            });
        });

        if (model.IsDraftPreview)
        {
            return document.GeneratePdf();
        }

        return document.WithMetadata(new DocumentMetadata
        {
            Title = inv.Number is null ? docLabel : $"{docLabel} {inv.Number}",
            Author = c.Name,
            Subject = inv.Title,
            Creator = "AngebotPilot",
            Producer = "AngebotPilot",
            Language = "de-DE",
            CreationDate = (inv.IssuedAt ?? DateTimeOffset.UtcNow).UtcDateTime,
            ModifiedDate = (inv.IssuedAt ?? DateTimeOffset.UtcNow).UtcDateTime,
        }).WithSettings(new DocumentSettings { PDFA_Conformance = PDFA_Conformance.PDFA_3B }).GeneratePdf();
    }

    public byte[]? EmbedEInvoice(byte[] pdf, byte[] xml, DateTimeOffset documentDate)
    {
        var dir = Path.Combine(Path.GetTempPath(), "angebotpilot-einvoice-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(dir);
            var input = Path.Combine(dir, "input.pdf");
            var xmlPath = Path.Combine(dir, "factur-x.xml");
            var output = Path.Combine(dir, "output.pdf");
            File.WriteAllBytes(input, pdf);
            File.WriteAllBytes(xmlPath, xml);
            DocumentOperation
                .LoadFile(input)
                .AddAttachment(new DocumentOperation.DocumentAttachment
                {
                    Key = "factur-x.xml",
                    FilePath = xmlPath,
                    AttachmentName = "factur-x.xml",
                    MimeType = "text/xml",
                    Description = "Factur-X/ZUGFeRD-Rechnungsdaten (EN 16931)",
                    Relationship = DocumentOperation.DocumentAttachmentRelationship.Alternative,
                    CreationDate = documentDate.UtcDateTime,
                    ModificationDate = documentDate.UtcDateTime,
                })
                .ExtendMetadata(FacturXMetadata)
                .Save(output);
            return File.ReadAllBytes(output);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            logger.LogWarning(ex, "Could not embed the e-invoice into the PDF");
            return null;
        }
        finally
        {
            try
            {
                Directory.Delete(dir, recursive: true);
            }
            catch (IOException)
            {
                // Best effort; the operating system cleans the temp folder.
            }
        }
    }

    private static string? ServicePeriod(Invoice inv) => inv.ServiceDateFrom switch
    {
        null => null,
        { } from when inv.ServiceDateTo is { } to && to != from => $"{L.Date(from)} – {L.Date(to)}",
        { } from => L.Date(from),
    };

    private static string QrSvg(string payload)
    {
        using var generator = new QRCodeGenerator();
        // EPC069-12 requires error correction level M and UTF-8.
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.M, forceUtf8: true);
        return new SvgQRCode(data).GetGraphic(4, "#141821", "#FFFFFF", drawQuietZones: false);
    }

    /// <summary>XMP for Factur-X/ZUGFeRD: the fx properties plus the PDF/A extension schema that declares them.</summary>
    private static readonly string FacturXMetadata = $"""
        <rdf:Description xmlns:fx="{FacturXNamespace}" rdf:about="">
          <fx:DocumentType>INVOICE</fx:DocumentType>
          <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
          <fx:Version>1.0</fx:Version>
          <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
        </rdf:Description>
        <rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
          <pdfaExtension:schemas>
            <rdf:Bag>
              <rdf:li rdf:parseType="Resource">
                <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                <pdfaSchema:namespaceURI>{FacturXNamespace}</pdfaSchema:namespaceURI>
                <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                <pdfaSchema:property>
                  <rdf:Seq>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>DocumentType</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>Version</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description>
                    </rdf:li>
                    <rdf:li rdf:parseType="Resource">
                      <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                      <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                      <pdfaProperty:category>external</pdfaProperty:category>
                      <pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description>
                    </rdf:li>
                  </rdf:Seq>
                </pdfaSchema:property>
              </rdf:li>
            </rdf:Bag>
          </pdfaExtension:schemas>
        </rdf:Description>
        """;
}
