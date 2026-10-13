using System.Globalization;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Files;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.Invoices;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AngebotPilot.Application.Invoices;

/// <summary>Builds the customer-facing documents of an invoice: the PDF (with embedded e-invoice) and the e-invoice XML.</summary>
public sealed class InvoiceDocuments(IAppDbContext db, FileService files, IInvoicePdfRenderer renderer, ILogger<InvoiceDocuments> logger)
{
    public async Task<byte[]> PreviewAsync(Invoice invoice, CancellationToken ct)
    {
        var seller = await SellerAsync(invoice.CompanyId, ct);
        return renderer.Render(new PdfInvoice(invoice, seller, IsDraftPreview: invoice.IsDraft, GiroCode(invoice, seller)));
    }

    /// <summary>Renders the final documents of an issued invoice. The PDF is a hybrid ZUGFeRD invoice whenever the host supports embedding.</summary>
    public async Task<(byte[] Pdf, byte[] Xml)> FinalAsync(Invoice invoice, DateTimeOffset now, CancellationToken ct)
    {
        var seller = await SellerAsync(invoice.CompanyId, ct);
        var pdf = renderer.Render(new PdfInvoice(invoice, seller, IsDraftPreview: false, GiroCode(invoice, seller)));
        var xml = EInvoiceWriter.Write(invoice, seller);
        var hybrid = renderer.EmbedEInvoice(pdf, xml, invoice.IssuedAt ?? now);
        if (hybrid is null)
        {
            logger.LogWarning("Embedding the e-invoice into the PDF of invoice {InvoiceId} failed; the XML is stored separately", invoice.Id);
        }

        return (hybrid ?? pdf, xml);
    }

    public async Task<PdfCompany> SellerAsync(Guid companyId, CancellationToken ct)
    {
        var company = await db.Companies.AsNoTracking().Include(c => c.Settings).FirstAsync(c => c.Id == companyId, ct);
        var logo = company.LogoFileId is { } logoId ? await files.ReadAllAsync(company.Id, logoId, ct) : null;
        var s = company.Settings!;

        // Invoices always state the bank account when one is configured, independent of the quotation setting.
        var hasIban = !string.IsNullOrWhiteSpace(s.Iban);
        return new PdfCompany(
            company.Name, company.AddressLine1, company.AddressLine2, company.PostalCode, company.City, company.Country, company.Email, company.Phone,
            company.Website, company.VatId, company.TaxNumber, company.BrandColor, logo,
            hasIban ? s.BankAccountHolder ?? company.Name : null, hasIban ? s.Iban : null, hasIban ? s.Bic : null, hasIban ? s.BankName : null);
    }

    /// <summary>Requirements of § 14 Abs. 4 UStG that depend on the company profile.</summary>
    public static IReadOnlyList<string> CompanyProblems(Company company, TaxMode taxMode)
    {
        var problems = new List<string>();
        if (string.IsNullOrWhiteSpace(company.AddressLine1) || string.IsNullOrWhiteSpace(company.PostalCode) || string.IsNullOrWhiteSpace(company.City))
        {
            problems.Add(Loc.T("Bitte die vollständige Anschrift Ihrer Firma hinterlegen (Einstellungen → Firma).", "Please enter your company's full address (Settings → Company)."));
        }

        if (string.IsNullOrWhiteSpace(company.TaxNumber) && string.IsNullOrWhiteSpace(company.VatId))
        {
            problems.Add(Loc.T("Bitte Steuernummer oder USt-IdNr. Ihrer Firma hinterlegen (Einstellungen → Firma).", "Please enter your company's tax number or VAT ID (Settings → Company)."));
        }

        if (taxMode == TaxMode.ReverseCharge && string.IsNullOrWhiteSpace(company.VatId))
        {
            problems.Add(Loc.T("Für § 13b UStG ist die USt-IdNr. Ihrer Firma erforderlich.", "§ 13b UStG requires your company's VAT ID."));
        }

        return problems;
    }

    public static string PdfFileName(Invoice invoice) => invoice.Number is null
        ? "Rechnung_Entwurf.pdf"
        : $"{(invoice.IsCancellation ? "Stornorechnung" : "Rechnung")}_{invoice.Number}.pdf";

    public static string XmlFileName(Invoice invoice) =>
        $"{(invoice.IsCancellation ? "Stornorechnung" : "Rechnung")}_{invoice.Number}.xml";

    /// <summary>
    /// EPC069-12 QR code ("GiroCode") for a SEPA credit transfer of the open amount, readable by German banking apps.
    /// Only for issued, payable invoices in EUR with an IBAN.
    /// </summary>
    public static string? GiroCode(Invoice invoice, PdfCompany seller)
    {
        if (invoice.IsCancellation || invoice.Number is null || string.IsNullOrWhiteSpace(seller.Iban) || invoice.Currency != "EUR"
            || invoice.GrossTotal <= 0 || invoice.GrossTotal > 999_999_999.99m)
        {
            return null;
        }

        var name = (seller.BankAccountHolder ?? seller.Name).Trim();
        if (name.Length > 70)
        {
            name = name[..70];
        }

        var text = $"{invoice.Number} {invoice.RecipientName}".Trim();
        if (text.Length > 140)
        {
            text = text[..140];
        }

        return string.Join('\n',
            "BCD", "002", "1", "SCT", seller.Bic ?? string.Empty, name, seller.Iban!.Replace(" ", string.Empty, StringComparison.Ordinal),
            "EUR" + invoice.GrossTotal.ToString("0.00", CultureInfo.InvariantCulture), string.Empty, string.Empty, text);
    }
}
