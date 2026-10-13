using System.Globalization;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.Application.Invoices;

/// <summary>
/// Writes the structured e-invoice as UN/CEFACT Cross Industry Invoice (CII D16B) following EN 16931
/// (ZUGFeRD 2.x / Factur-X profile "EN 16931"). This is the format accepted for German B2B e-invoices
/// (§ 14 UStG as amended by the Wachstumschancengesetz). The same XML is embedded into the PDF.
/// Element order follows the CII schema, which is sequence-based.
/// </summary>
public static class EInvoiceWriter
{
    public const string FileName = "factur-x.xml";

    private static readonly XNamespace Rsm = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";
    private static readonly XNamespace Ram = "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100";
    private static readonly XNamespace Qdt = "urn:un:unece:uncefact:data:standard:QualifiedDataType:100";
    private static readonly XNamespace Udt = "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100";

    public static byte[] Write(Invoice invoice, PdfCompany seller)
    {
        if (invoice.Number is null)
        {
            throw new InvalidOperationException("Only issued invoices have an e-invoice.");
        }

        var totals = invoice.CalculateTotals();
        var items = invoice.LineItems.OrderBy(i => i.Position).ToList();

        var doc = new XDocument(
            new XDeclaration("1.0", "UTF-8", null),
            new XElement(Rsm + "CrossIndustryInvoice",
                new XAttribute(XNamespace.Xmlns + "rsm", Rsm),
                new XAttribute(XNamespace.Xmlns + "ram", Ram),
                new XAttribute(XNamespace.Xmlns + "qdt", Qdt),
                new XAttribute(XNamespace.Xmlns + "udt", Udt),
                new XElement(Rsm + "ExchangedDocumentContext",
                    new XElement(Ram + "GuidelineSpecifiedDocumentContextParameter",
                        new XElement(Ram + "ID", "urn:cen.eu:en16931:2017"))),
                ExchangedDocument(invoice),
                new XElement(Rsm + "SupplyChainTradeTransaction",
                    items.Select(i => LineItem(invoice, i)),
                    HeaderAgreement(invoice, seller),
                    HeaderDelivery(invoice),
                    HeaderSettlement(invoice, seller, totals))));

        var settings = new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = true };
        using var ms = new MemoryStream();
        using (var writer = XmlWriter.Create(ms, settings))
        {
            doc.Save(writer);
        }

        return ms.ToArray();
    }

    /// <summary>UN/ECE Recommendation 20 unit code for the free-text units used in the editor.</summary>
    public static string UnitCode(string? unit)
    {
        var u = (unit ?? string.Empty).Trim().TrimEnd('.').ToLowerInvariant();
        return u switch
        {
            "stk" or "stück" or "st" or "stck" => "H87",
            "std" or "h" or "stunde" or "stunden" => "HUR",
            "min" or "minute" or "minuten" => "MIN",
            "tag" or "tage" or "tg" => "DAY",
            "woche" or "wochen" or "wo" => "WEE",
            "monat" or "monate" or "mon" or "mt" => "MON",
            "jahr" or "jahre" => "ANN",
            "m" or "lfm" or "lfd. m" or "meter" => "MTR",
            "m²" or "m2" or "qm" => "MTK",
            "m³" or "m3" or "cbm" => "MTQ",
            "km" => "KMT",
            "kg" => "KGM",
            "g" => "GRM",
            "t" => "TNE",
            "l" or "liter" => "LTR",
            "kwh" => "KWH",
            "psch" or "pauschal" or "pausch" or "pauschale" => "LS",
            "satz" or "set" => "SET",
            "paar" => "PR",
            "pkg" or "paket" => "PK",
            _ => "C62",
        };
    }

    private static XElement ExchangedDocument(Invoice invoice)
    {
        var e = new XElement(Rsm + "ExchangedDocument",
            new XElement(Ram + "ID", invoice.Number),
            // 380 = commercial invoice, 381 = credit note (used for the cancellation invoice, amounts stay positive).
            new XElement(Ram + "TypeCode", invoice.IsCancellation ? "381" : "380"),
            new XElement(Ram + "IssueDateTime", Date102(Udt, invoice.IssueDate)));
        if (invoice.IsCancellation)
        {
            e.Add(Note($"Stornorechnung zu Rechnung {invoice.CancelledInvoiceNumber}"));
        }

        if (invoice.TaxMode == TaxMode.SmallBusiness)
        {
            e.Add(Note("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung)."));
        }

        return e;
    }

    private static XElement Note(string text) => new(Ram + "IncludedNote", new XElement(Ram + "Content", text));

    private static XElement LineItem(Invoice invoice, InvoiceLineItem item)
    {
        var settlement = new XElement(Ram + "SpecifiedLineTradeSettlement", Tax(invoice.TaxMode, item.TaxRatePercent, null, null));
        if (item.LineDiscount > 0)
        {
            settlement.Add(new XElement(Ram + "SpecifiedTradeAllowanceCharge",
                new XElement(Ram + "ChargeIndicator", new XElement(Udt + "Indicator", "false")),
                new XElement(Ram + "CalculationPercent", Percent(item.DiscountPercent)),
                new XElement(Ram + "BasisAmount", Money(item.LineTotalBeforeDiscount)),
                new XElement(Ram + "ActualAmount", Money(item.LineDiscount)),
                new XElement(Ram + "Reason", "Rabatt")));
        }

        settlement.Add(new XElement(Ram + "SpecifiedTradeSettlementLineMonetarySummation", new XElement(Ram + "LineTotalAmount", Money(item.LineNet))));

        var product = new XElement(Ram + "SpecifiedTradeProduct", new XElement(Ram + "Name", item.Title));
        if (!string.IsNullOrWhiteSpace(item.Description))
        {
            product.Add(new XElement(Ram + "Description", item.Description));
        }

        return new XElement(Ram + "IncludedSupplyChainTradeLineItem",
            new XElement(Ram + "AssociatedDocumentLineDocument", new XElement(Ram + "LineID", item.Position.ToString(CultureInfo.InvariantCulture))),
            product,
            new XElement(Ram + "SpecifiedLineTradeAgreement",
                new XElement(Ram + "NetPriceProductTradePrice", new XElement(Ram + "ChargeAmount", Price(item.UnitPriceNet)))),
            new XElement(Ram + "SpecifiedLineTradeDelivery",
                new XElement(Ram + "BilledQuantity", new XAttribute("unitCode", UnitCode(item.Unit)), Quantity(item.Quantity))),
            settlement);
    }

    private static XElement HeaderAgreement(Invoice invoice, PdfCompany seller)
    {
        var e = new XElement(Ram + "ApplicableHeaderTradeAgreement");
        if (!string.IsNullOrWhiteSpace(invoice.BuyerReference))
        {
            e.Add(new XElement(Ram + "BuyerReference", invoice.BuyerReference));
        }

        var sellerParty = new XElement(Ram + "SellerTradeParty", new XElement(Ram + "Name", seller.Name));
        if (!string.IsNullOrWhiteSpace(seller.Phone) || !string.IsNullOrWhiteSpace(seller.Email))
        {
            var contact = new XElement(Ram + "DefinedTradeContact", new XElement(Ram + "PersonName", seller.Name));
            if (!string.IsNullOrWhiteSpace(seller.Phone))
            {
                contact.Add(new XElement(Ram + "TelephoneUniversalCommunication", new XElement(Ram + "CompleteNumber", seller.Phone)));
            }

            if (!string.IsNullOrWhiteSpace(seller.Email))
            {
                contact.Add(new XElement(Ram + "EmailURIUniversalCommunication", new XElement(Ram + "URIID", seller.Email)));
            }

            sellerParty.Add(contact);
        }

        sellerParty.Add(Address(seller.PostalCode, seller.AddressLine1, seller.AddressLine2, seller.City, seller.Country));
        if (!string.IsNullOrWhiteSpace(seller.Email))
        {
            sellerParty.Add(new XElement(Ram + "URIUniversalCommunication", new XElement(Ram + "URIID", new XAttribute("schemeID", "EM"), seller.Email)));
        }

        if (!string.IsNullOrWhiteSpace(seller.VatId))
        {
            sellerParty.Add(new XElement(Ram + "SpecifiedTaxRegistration", new XElement(Ram + "ID", new XAttribute("schemeID", "VA"), seller.VatId)));
        }

        if (!string.IsNullOrWhiteSpace(seller.TaxNumber))
        {
            sellerParty.Add(new XElement(Ram + "SpecifiedTaxRegistration", new XElement(Ram + "ID", new XAttribute("schemeID", "FC"), seller.TaxNumber)));
        }

        var buyerParty = new XElement(Ram + "BuyerTradeParty", new XElement(Ram + "Name", invoice.RecipientName));
        if (!string.IsNullOrWhiteSpace(invoice.RecipientContact) && invoice.RecipientContact != invoice.RecipientName)
        {
            buyerParty.Add(new XElement(Ram + "DefinedTradeContact", new XElement(Ram + "PersonName", invoice.RecipientContact)));
        }

        buyerParty.Add(Address(invoice.RecipientPostalCode, invoice.RecipientStreet, null, invoice.RecipientCity, invoice.RecipientCountry));
        if (!string.IsNullOrWhiteSpace(invoice.RecipientEmail))
        {
            buyerParty.Add(new XElement(Ram + "URIUniversalCommunication", new XElement(Ram + "URIID", new XAttribute("schemeID", "EM"), invoice.RecipientEmail)));
        }

        if (!string.IsNullOrWhiteSpace(invoice.RecipientVatId))
        {
            buyerParty.Add(new XElement(Ram + "SpecifiedTaxRegistration", new XElement(Ram + "ID", new XAttribute("schemeID", "VA"), invoice.RecipientVatId)));
        }

        e.Add(sellerParty, buyerParty);
        return e;
    }

    private static XElement HeaderDelivery(Invoice invoice)
    {
        var e = new XElement(Ram + "ApplicableHeaderTradeDelivery");
        // Date of supply (BT-72). For a service period (BG-14, written in the settlement) this is the end of the period,
        // which also keeps the mandatory delivery element from being empty.
        if ((invoice.ServiceDateTo ?? invoice.ServiceDateFrom) is { } date)
        {
            e.Add(new XElement(Ram + "ActualDeliverySupplyChainEvent", new XElement(Ram + "OccurrenceDateTime", Date102(Udt, date))));
        }

        return e;
    }

    private static XElement HeaderSettlement(Invoice invoice, PdfCompany seller, QuotationTotals totals)
    {
        var e = new XElement(Ram + "ApplicableHeaderTradeSettlement");
        if (!invoice.IsCancellation)
        {
            e.Add(new XElement(Ram + "PaymentReference", invoice.Number));
        }

        e.Add(new XElement(Ram + "InvoiceCurrencyCode", invoice.Currency));

        if (!invoice.IsCancellation && !string.IsNullOrWhiteSpace(seller.Iban))
        {
            var account = new XElement(Ram + "PayeePartyCreditorFinancialAccount", new XElement(Ram + "IBANID", seller.Iban));
            if (!string.IsNullOrWhiteSpace(seller.BankAccountHolder))
            {
                account.Add(new XElement(Ram + "AccountName", seller.BankAccountHolder));
            }

            var means = new XElement(Ram + "SpecifiedTradeSettlementPaymentMeans",
                new XElement(Ram + "TypeCode", "58"), // SEPA credit transfer
                account);
            if (!string.IsNullOrWhiteSpace(seller.Bic))
            {
                means.Add(new XElement(Ram + "PayeeSpecifiedCreditorFinancialInstitution", new XElement(Ram + "BICID", seller.Bic)));
            }

            e.Add(means);
        }

        foreach (var group in totals.TaxGroups)
        {
            e.Add(Tax(invoice.TaxMode, group.RatePercent, group.NetAmount, group.TaxAmount));
        }

        if (invoice.ServiceDateFrom is { } from && invoice.ServiceDateTo is { } to && to != from)
        {
            e.Add(new XElement(Ram + "BillingSpecifiedPeriod",
                new XElement(Ram + "StartDateTime", Date102(Udt, from)),
                new XElement(Ram + "EndDateTime", Date102(Udt, to))));
        }

        if (!invoice.IsCancellation)
        {
            var terms = new XElement(Ram + "SpecifiedTradePaymentTerms",
                new XElement(Ram + "Description", string.IsNullOrWhiteSpace(invoice.PaymentTerms)
                    ? $"Zahlbar bis zum {invoice.DueDate.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture)} ohne Abzug."
                    : invoice.PaymentTerms),
                new XElement(Ram + "DueDateDateTime", Date102(Udt, invoice.DueDate)));
            e.Add(terms);
        }

        e.Add(new XElement(Ram + "SpecifiedTradeSettlementHeaderMonetarySummation",
            new XElement(Ram + "LineTotalAmount", Money(totals.NetTotal)),
            new XElement(Ram + "ChargeTotalAmount", Money(0)),
            new XElement(Ram + "AllowanceTotalAmount", Money(0)),
            new XElement(Ram + "TaxBasisTotalAmount", Money(totals.NetTotal)),
            new XElement(Ram + "TaxTotalAmount", new XAttribute("currencyID", invoice.Currency), Money(totals.TaxTotal)),
            new XElement(Ram + "GrandTotalAmount", Money(totals.GrossTotal)),
            new XElement(Ram + "TotalPrepaidAmount", Money(0)),
            new XElement(Ram + "DuePayableAmount", Money(totals.GrossTotal))));

        if (invoice.IsCancellation && invoice.CancelledInvoiceNumber is not null)
        {
            var reference = new XElement(Ram + "InvoiceReferencedDocument", new XElement(Ram + "IssuerAssignedID", invoice.CancelledInvoiceNumber));
            if (invoice.CancelledInvoiceIssueDate is { } original)
            {
                reference.Add(new XElement(Ram + "FormattedIssueDateTime", Date102(Qdt, original)));
            }

            e.Add(reference);
        }

        return e;
    }

    /// <summary>VAT breakdown (header, with amounts) or line VAT (amounts <c>null</c>).</summary>
    private static XElement Tax(TaxMode mode, decimal rate, decimal? basis, decimal? amount)
    {
        var (category, reason, reasonCode) = mode switch
        {
            TaxMode.SmallBusiness => ("E", "Kleinunternehmer gemäß § 19 UStG", (string?)null),
            TaxMode.ReverseCharge => ("AE", "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)", "VATEX-EU-AE"),
            _ when rate == 0 => ("Z", (string?)null, (string?)null),
            _ => ("S", (string?)null, (string?)null),
        };
        var effectiveRate = mode == TaxMode.Standard ? rate : 0m;

        var e = new XElement(Ram + "ApplicableTradeTax");
        if (amount is not null)
        {
            e.Add(new XElement(Ram + "CalculatedAmount", Money(amount.Value)));
        }

        e.Add(new XElement(Ram + "TypeCode", "VAT"));
        if (basis is not null && reason is not null)
        {
            e.Add(new XElement(Ram + "ExemptionReason", reason));
        }

        if (basis is not null)
        {
            e.Add(new XElement(Ram + "BasisAmount", Money(basis.Value)));
        }

        e.Add(new XElement(Ram + "CategoryCode", category));
        if (basis is not null && reasonCode is not null)
        {
            e.Add(new XElement(Ram + "ExemptionReasonCode", reasonCode));
        }

        e.Add(new XElement(Ram + "RateApplicablePercent", Percent(effectiveRate)));
        return e;
    }

    private static XElement Address(string? postalCode, string? line1, string? line2, string? city, string? country)
    {
        var e = new XElement(Ram + "PostalTradeAddress");
        if (!string.IsNullOrWhiteSpace(postalCode))
        {
            e.Add(new XElement(Ram + "PostcodeCode", postalCode));
        }

        if (!string.IsNullOrWhiteSpace(line1))
        {
            e.Add(new XElement(Ram + "LineOne", line1));
        }

        if (!string.IsNullOrWhiteSpace(line2))
        {
            e.Add(new XElement(Ram + "LineTwo", line2));
        }

        if (!string.IsNullOrWhiteSpace(city))
        {
            e.Add(new XElement(Ram + "CityName", city));
        }

        e.Add(new XElement(Ram + "CountryID", string.IsNullOrWhiteSpace(country) ? "DE" : country.Trim().ToUpperInvariant()));
        return e;
    }

    private static XElement Date102(XNamespace ns, DateOnly date) =>
        new(ns + "DateTimeString", new XAttribute("format", "102"), date.ToString("yyyyMMdd", CultureInfo.InvariantCulture));

    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);

    private static string Price(decimal value) => value.ToString("0.00##", CultureInfo.InvariantCulture);

    private static string Percent(decimal value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string Quantity(decimal value) => value.ToString("0.####", CultureInfo.InvariantCulture);
}
