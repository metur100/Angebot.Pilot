using System.Globalization;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;
using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace AngebotPilot.Infrastructure.Pdf;

/// <summary>
/// Renders quotations as vector PDFs with QuestPDF (Community licence: free for organisations below USD 1M annual
/// gross revenue – see docs/architecture/ARCHITECTURE.md). Fonts are embedded (Inter, SIL OFL), so output is identical on every host.
/// </summary>
public sealed class QuotationPdfRenderer : IQuotationPdfRenderer
{
    private const string Font = "Inter";
    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-DE");
    private static readonly object InitLock = new();
    private static bool _initialised;

    public QuotationPdfRenderer() => EnsureInitialised();

    public static void EnsureInitialised()
    {
        lock (InitLock)
        {
            if (_initialised)
            {
                return;
            }

            QuestPDF.Settings.License = LicenseType.Community;
            QuestPDF.Settings.UseSystemFonts = false;
            var assembly = typeof(QuotationPdfRenderer).Assembly;
            foreach (var name in assembly.GetManifestResourceNames().Where(n => n.EndsWith(".ttf", StringComparison.OrdinalIgnoreCase)))
            {
                using var stream = assembly.GetManifestResourceStream(name)!;
                QuestPDF.Drawing.FontManager.RegisterFontFromStream(stream);
            }

            _initialised = true;
        }
    }

    public byte[] Render(PdfQuotation model)
    {
        var q = model.Quotation;
        var c = model.Company;
        var brand = IsHex(c.BrandColor) ? c.BrandColor : "#2F45D8";
        var totals = q.CalculateTotals();
        var items = q.LineItems.OrderBy(i => i.Position).ToList();
        var hasDiscount = items.Any(i => i.DiscountPercent > 0);
        var showTaxColumn = q.TaxMode == TaxMode.Standard && items.Select(i => i.TaxRatePercent).Distinct().Count() > 1;

        return Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.MarginTop(16, Unit.Millimetre);
                page.MarginBottom(14, Unit.Millimetre);
                page.MarginHorizontal(20, Unit.Millimetre);
                page.PageColor(Colors.White);
                // Contextual alternates would replace "-" in numbers like AN-2026-0001 with an unmapped glyph (breaks copy & search).
                page.DefaultTextStyle(t => t.FontFamily(Font).FontSize(9.5f).FontColor("#232833").LineHeight(1.35f).DisableFontFeature(FontFeatures.ContextualAlternates));

                if (model.IsDraftPreview)
                {
                    page.Background().AlignCenter().AlignMiddle().Rotate(-35).Text("ENTWURF").FontFamily(Font).FontSize(110).Bold().FontColor("#EEF0F3");
                }

                page.Header().Element(h => Header(h, c, brand));
                page.Content().PaddingTop(10).Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem(11).Column(addr =>
                        {
                            addr.Item().Text(SenderLine(c)).FontSize(7).FontColor("#6B7485").Underline();
                            addr.Item().PaddingTop(6).Text(q.RecipientName).SemiBold();
                            if (!string.IsNullOrWhiteSpace(q.RecipientContact) && q.RecipientContact != q.RecipientName)
                            {
                                addr.Item().Text(q.RecipientContact);
                            }

                            foreach (var line in (q.RecipientAddress ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries))
                            {
                                addr.Item().Text(line);
                            }
                        });
                        row.ConstantItem(8, Unit.Millimetre);
                        row.RelativeItem(7).Border(0.6f).BorderColor("#E2E5EA").Background("#FBFCFD").Padding(9).Column(info =>
                        {
                            InfoLine(info, "Angebotsnummer", q.Number, bold: true);
                            InfoLine(info, "Angebotsdatum", Date(q.IssueDate));
                            InfoLine(info, "Gültig bis", Date(q.ValidUntil));
                            if (!string.IsNullOrWhiteSpace(q.RecipientVatId))
                            {
                                InfoLine(info, "USt-IdNr. Kunde", q.RecipientVatId!);
                            }

                            if (q.RevisionNumber > 0)
                            {
                                InfoLine(info, "Revision", q.RevisionNumber.ToString(CultureInfo.InvariantCulture));
                            }
                        });
                    });

                    col.Item().PaddingTop(22).Text($"Angebot {q.Number}").FontSize(17).Bold().FontColor("#141821");
                    col.Item().PaddingTop(2).Text(q.Title).FontSize(11).SemiBold().FontColor(brand);

                    if (!string.IsNullOrWhiteSpace(q.IntroText))
                    {
                        col.Item().PaddingTop(12).Text(q.RecipientContact is { Length: > 0 } contact ? $"Guten Tag {contact}," : "Sehr geehrte Damen und Herren,");
                        col.Item().PaddingTop(6).Text(q.IntroText);
                    }

                    col.Item().PaddingTop(14).Element(e => LineItems(e, items, hasDiscount, showTaxColumn, brand));
                    col.Item().PaddingTop(8).AlignRight().Width(80, Unit.Millimetre).Element(e => Totals(e, q, totals, brand));

                    var notes = TaxNotes(q).ToList();
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

                    if (!string.IsNullOrWhiteSpace(q.PaymentTerms) || !string.IsNullOrWhiteSpace(q.Terms))
                    {
                        col.Item().PaddingTop(14).Column(t =>
                        {
                            if (!string.IsNullOrWhiteSpace(q.PaymentTerms))
                            {
                                t.Item().Text("Zahlungsbedingungen").SemiBold().FontSize(9);
                                t.Item().PaddingBottom(6).Text(q.PaymentTerms).FontSize(9);
                            }

                            if (!string.IsNullOrWhiteSpace(q.Terms))
                            {
                                t.Item().Text("Bedingungen").SemiBold().FontSize(9);
                                t.Item().Text(q.Terms).FontSize(9);
                            }
                        });
                    }

                    if (!string.IsNullOrWhiteSpace(q.ClosingText))
                    {
                        col.Item().PaddingTop(14).Text(q.ClosingText);
                    }

                    col.Item().PaddingTop(10).Text("Mit freundlichen Grüßen");
                    col.Item().Text(c.Name).SemiBold();

                    if (model.PublicUrl is not null)
                    {
                        col.Item().PaddingTop(16).ShowEntire().Border(0.6f).BorderColor("#E2E5EA").Padding(10).Row(r =>
                        {
                            r.ConstantItem(24, Unit.Millimetre).Height(24, Unit.Millimetre).Svg(QrSvg(model.PublicUrl));
                            r.ConstantItem(5, Unit.Millimetre);
                            r.RelativeItem().AlignMiddle().Column(t =>
                            {
                                t.Item().Text("Online ansehen und annehmen").SemiBold().FontColor(brand);
                                t.Item().Text("Scannen Sie den QR-Code oder öffnen Sie den Link aus unserer E-Mail, um das Angebot online anzunehmen oder abzulehnen.").FontSize(8.5f).FontColor("#4D5566");
                            });
                        });
                    }
                });

                page.Footer().Element(f => Footer(f, c));
            });
        }).GeneratePdf();
    }

    private static void Header(IContainer container, PdfCompany c, string brand)
    {
        container.PaddingBottom(6).BorderBottom(2).BorderColor(brand).PaddingBottom(8).Row(row =>
        {
            row.RelativeItem().AlignBottom().Height(16, Unit.Millimetre).Element(left =>
            {
                if (c.Logo is { Length: > 0 })
                {
                    left.AlignLeft().AlignBottom().Image(c.Logo).FitArea();
                }
                else
                {
                    left.AlignBottom().Text(c.Name).FontSize(16).Bold().FontColor(brand);
                }
            });
            row.ConstantItem(70, Unit.Millimetre).AlignRight().AlignBottom().Column(info =>
            {
                info.Item().AlignRight().Text(c.Name).SemiBold().FontSize(8.5f);
                foreach (var line in new[] { c.AddressLine1, c.AddressLine2, Join(" ", c.PostalCode, c.City), c.Phone is null ? null : $"Tel. {c.Phone}", c.Email, c.Website })
                {
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        info.Item().AlignRight().Text(line).FontSize(8).FontColor("#4D5566");
                    }
                }
            });
        });
    }

    private static void LineItems(IContainer container, List<QuotationLineItem> items, bool hasDiscount, bool showTax, string brand)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(cols =>
            {
                cols.ConstantColumn(9, Unit.Millimetre);
                cols.RelativeColumn(5);
                cols.ConstantColumn(17, Unit.Millimetre);
                cols.ConstantColumn(23, Unit.Millimetre);
                if (hasDiscount)
                {
                    cols.ConstantColumn(14, Unit.Millimetre);
                }

                if (showTax)
                {
                    cols.ConstantColumn(12, Unit.Millimetre);
                }

                cols.ConstantColumn(25, Unit.Millimetre);
            });

            table.Header(h =>
            {
                HeaderCell(h.Cell(), "Pos.", false);
                HeaderCell(h.Cell(), "Bezeichnung", false);
                HeaderCell(h.Cell(), "Menge", true);
                HeaderCell(h.Cell(), "Einzelpreis", true);
                if (hasDiscount)
                {
                    HeaderCell(h.Cell(), "Rabatt", true);
                }

                if (showTax)
                {
                    HeaderCell(h.Cell(), "USt.", true);
                }

                HeaderCell(h.Cell(), "Gesamt netto", true);
                h.Cell().ColumnSpan((uint)(5 + (hasDiscount ? 1 : 0) + (showTax ? 1 : 0))).Height(1.2f).Background(brand);
            });

            foreach (var item in items)
            {
                BodyCell(table.Cell()).Text(item.Position.ToString(CultureInfo.InvariantCulture)).FontColor("#6B7485");
                BodyCell(table.Cell()).Column(c =>
                {
                    c.Item().Text(item.Title).SemiBold();
                    if (!string.IsNullOrWhiteSpace(item.Description))
                    {
                        c.Item().PaddingTop(1).Text(item.Description).FontSize(8.5f).FontColor("#4D5566");
                    }
                });
                BodyCell(table.Cell()).AlignRight().Text($"{Quantity(item.Quantity)} {item.Unit}");
                BodyCell(table.Cell()).AlignRight().Text(Eur(item.UnitPriceNet));
                if (hasDiscount)
                {
                    BodyCell(table.Cell()).AlignRight().Text(item.DiscountPercent > 0 ? $"{item.DiscountPercent.ToString("0.##", De)} %" : "–");
                }

                if (showTax)
                {
                    BodyCell(table.Cell()).AlignRight().Text($"{item.TaxRatePercent.ToString("0.##", De)} %");
                }

                BodyCell(table.Cell()).AlignRight().Text(Eur(item.LineNet)).SemiBold();
            }
        });
    }

    private static void Totals(IContainer container, Quotation q, QuotationTotals totals, string brand)
    {
        container.Column(col =>
        {
            if (totals.DiscountTotal > 0)
            {
                TotalLine(col, "Summe vor Rabatt", Eur(totals.SubtotalBeforeDiscount));
                TotalLine(col, "Rabatt", "− " + Eur(totals.DiscountTotal));
            }

            TotalLine(col, "Nettobetrag", Eur(totals.NetTotal));
            if (q.TaxMode == TaxMode.Standard)
            {
                foreach (var group in totals.TaxGroups)
                {
                    TotalLine(col, $"USt. {group.RatePercent.ToString("0.##", De)} % auf {Eur(group.NetAmount)}", Eur(group.TaxAmount));
                }
            }

            col.Item().PaddingTop(4).Background(brand).PaddingVertical(6).PaddingHorizontal(8).Row(r =>
            {
                r.RelativeItem().Text(q.TaxMode == TaxMode.Standard ? "Gesamtbetrag brutto" : "Gesamtbetrag").FontColor(Colors.White).SemiBold();
                r.AutoItem().Text(Eur(totals.GrossTotal)).FontColor(Colors.White).Bold();
            });
        });
    }

    private static void Footer(IContainer container, PdfCompany c)
    {
        container.BorderTop(0.6f).BorderColor("#E2E5EA").PaddingTop(6).Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(a =>
                {
                    a.Item().Text(c.Name).SemiBold().FontSize(7.5f);
                    a.Item().Text(Join(", ", c.AddressLine1, Join(" ", c.PostalCode, c.City))).FontSize(7.5f).FontColor("#6B7485");
                    a.Item().Text(Join(" · ", c.Phone, c.Email)).FontSize(7.5f).FontColor("#6B7485");
                });
                if (!string.IsNullOrWhiteSpace(c.Iban))
                {
                    row.RelativeItem().Column(b =>
                    {
                        b.Item().Text("Bankverbindung").SemiBold().FontSize(7.5f);
                        b.Item().Text(Join(" · ", c.BankAccountHolder, c.BankName)).FontSize(7.5f).FontColor("#6B7485");
                        b.Item().Text($"IBAN {FormatIban(c.Iban)}").FontSize(7.5f).FontColor("#6B7485");
                        if (!string.IsNullOrWhiteSpace(c.Bic))
                        {
                            b.Item().Text($"BIC {c.Bic}").FontSize(7.5f).FontColor("#6B7485");
                        }
                    });
                }

                row.RelativeItem().AlignRight().Column(t =>
                {
                    if (!string.IsNullOrWhiteSpace(c.VatId))
                    {
                        t.Item().AlignRight().Text($"USt-IdNr. {c.VatId}").FontSize(7.5f).FontColor("#6B7485");
                    }

                    if (!string.IsNullOrWhiteSpace(c.TaxNumber))
                    {
                        t.Item().AlignRight().Text($"Steuernummer {c.TaxNumber}").FontSize(7.5f).FontColor("#6B7485");
                    }

                    t.Item().AlignRight().Text(x =>
                    {
                        x.DefaultTextStyle(s => s.FontSize(7.5f).FontColor("#6B7485"));
                        x.Span("Seite ");
                        x.CurrentPageNumber();
                        x.Span(" von ");
                        x.TotalPages();
                    });
                });
            });
        });
    }

    private static IEnumerable<string> TaxNotes(Quotation q) => q.TaxMode switch
    {
        TaxMode.SmallBusiness => ["Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung)."],
        TaxMode.ReverseCharge => ["Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer ist vom Leistungsempfänger anzumelden und abzuführen."],
        _ => [],
    };

    private static void HeaderCell(IContainer cell, string text, bool right)
    {
        var c = cell.PaddingVertical(5).PaddingHorizontal(3);
        (right ? c.AlignRight() : c).Text(text).FontSize(8).SemiBold().FontColor("#4D5566");
    }

    private static IContainer BodyCell(IContainer cell) =>
        cell.BorderBottom(0.5f).BorderColor("#EEF0F3").PaddingVertical(5).PaddingHorizontal(3);

    private static void InfoLine(ColumnDescriptor col, string label, string value, bool bold = false) =>
        col.Item().Row(r =>
        {
            r.RelativeItem().Text(label).FontSize(8.5f).FontColor("#6B7485");
            var v = r.AutoItem().Text(value).FontSize(8.5f);
            if (bold)
            {
                v.SemiBold();
            }
        });

    private static void TotalLine(ColumnDescriptor col, string label, string value) =>
        col.Item().PaddingVertical(2).PaddingHorizontal(8).Row(r =>
        {
            r.RelativeItem().Text(label).FontColor("#4D5566");
            r.AutoItem().Text(value);
        });

    private static string QrSvg(string url)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(url, QRCodeGenerator.ECCLevel.M);
        return new SvgQRCode(data).GetGraphic(4, "#141821", "#FFFFFF", drawQuietZones: false);
    }

    private static string SenderLine(PdfCompany c) => Join(" · ", c.Name, c.AddressLine1, Join(" ", c.PostalCode, c.City));

    private static string Join(string separator, params string?[] parts) =>
        string.Join(separator, parts.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim()));

    private static string Eur(decimal value) => value.ToString("#,##0.00", De) + " €";

    private static string Quantity(decimal value) => value.ToString("#,##0.###", De);

    private static string Date(DateOnly value) => value.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

    private static string FormatIban(string iban) => string.Join(' ', Enumerable.Range(0, (iban.Length + 3) / 4).Select(i => iban.Substring(i * 4, Math.Min(4, iban.Length - (i * 4)))));

    private static bool IsHex(string? color) => color is { Length: 7 } && color[0] == '#' && color[1..].All(Uri.IsHexDigit);
}
