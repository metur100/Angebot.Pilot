using System.Globalization;
using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Customers;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.Domain.Invoices;

/// <summary>
/// An invoice (Rechnung) or a cancellation invoice (Stornorechnung).
/// <para>
/// Drafts are freely editable and have no number. <see cref="Issue"/> assigns the next number of the gap-free
/// per-company sequence and freezes the document (GoBD): from then on content and amounts never change; an
/// issued invoice can only be paid or reversed by a cancellation invoice.
/// </para>
/// </summary>
public sealed class Invoice : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid CustomerId { get; set; }

    public Customer? Customer { get; set; }

    /// <summary>Document number such as RE-2026-0001; assigned when the invoice is issued, <c>null</c> for drafts.</summary>
    public string? Number { get; private set; }

    public InvoiceKind Kind { get; set; } = InvoiceKind.Invoice;

    public InvoiceStatus Status { get; private set; } = InvoiceStatus.Draft;

    public required string Title { get; set; }

    public DateOnly IssueDate { get; set; }

    /// <summary>Date of supply (Leistungsdatum, § 14 Abs. 4 Nr. 6 UStG), or start of the service period.</summary>
    public DateOnly? ServiceDateFrom { get; set; }

    /// <summary>End of the service period (Leistungszeitraum); <c>null</c> for a single date.</summary>
    public DateOnly? ServiceDateTo { get; set; }

    public DateOnly DueDate { get; set; }

    public TaxMode TaxMode { get; set; }

    public string? IntroText { get; set; }

    public string? ClosingText { get; set; }

    public string? PaymentTerms { get; set; }

    /// <summary>Order number or reference of the buyer (e.g. Leitweg-ID); printed and written to the e-invoice.</summary>
    public string? BuyerReference { get; set; }

    /// <summary>Internal note, never shown to the customer.</summary>
    public string? InternalNotes { get; set; }

    public string Currency { get; set; } = "EUR";

    public decimal SubtotalBeforeDiscount { get; private set; }

    public decimal DiscountTotal { get; private set; }

    public decimal NetTotal { get; private set; }

    public decimal TaxTotal { get; private set; }

    public decimal GrossTotal { get; private set; }

    // Recipient snapshot, refreshed while the invoice is a draft and frozen when it is issued.
    public string RecipientName { get; set; } = string.Empty;

    public string? RecipientContact { get; set; }

    public string? RecipientAddress { get; set; }

    public string? RecipientStreet { get; set; }

    public string? RecipientPostalCode { get; set; }

    public string? RecipientCity { get; set; }

    public string RecipientCountry { get; set; } = "DE";

    public string? RecipientEmail { get; set; }

    public string? RecipientVatId { get; set; }

    public Guid? QuotationId { get; set; }

    public string? QuotationNumber { get; set; }

    public Guid? JobId { get; set; }

    public string? JobNumber { get; set; }

    /// <summary>For a cancellation invoice: the invoice it reverses.</summary>
    public Guid? CancelledInvoiceId { get; set; }

    public string? CancelledInvoiceNumber { get; set; }

    public DateOnly? CancelledInvoiceIssueDate { get; set; }

    /// <summary>For a cancelled invoice: the cancellation invoice that reversed it.</summary>
    public Guid? CancellationInvoiceId { get; private set; }

    /// <summary>The issued PDF (PDF/A-3 with the embedded e-invoice), stored once and never regenerated.</summary>
    public Guid? PdfFileId { get; set; }

    /// <summary>The issued e-invoice XML (UN/CEFACT CII, EN 16931).</summary>
    public Guid? XmlFileId { get; set; }

    public decimal PaidAmount { get; private set; }

    /// <summary>Date of the payment that settled the invoice in full.</summary>
    public DateOnly? PaidOn { get; private set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public DateTimeOffset? IssuedAt { get; private set; }

    public Guid? IssuedByUserId { get; private set; }

    public DateTimeOffset? SentAt { get; private set; }

    public DateTimeOffset? CancelledAt { get; private set; }

    public string? CancellationReason { get; private set; }

    public DateTimeOffset? LastReminderAt { get; private set; }

    public int ReminderCount { get; private set; }

    public DateTimeOffset? DeletedAt { get; set; }

    public List<InvoiceLineItem> LineItems { get; set; } = [];

    public List<InvoiceEvent> Events { get; set; } = [];

    public List<InvoicePayment> Payments { get; set; } = [];

    public byte[] RowVersion { get; set; } = [];

    public bool IsDraft => Status == InvoiceStatus.Draft;

    public bool IsCancellation => Kind == InvoiceKind.Cancellation;

    /// <summary>Still expected to be paid (issued, not fully paid, not cancelled).</summary>
    public bool IsOpen => Kind == InvoiceKind.Invoice && Status is InvoiceStatus.Issued or InvoiceStatus.PartiallyPaid;

    public decimal OpenAmount => IsOpen ? GrossTotal - PaidAmount : 0m;

    public bool IsOverdue(DateOnly today) => IsOpen && DueDate < today;

    public int DaysOverdue(DateOnly today) => IsOverdue(today) ? today.DayNumber - DueDate.DayNumber : 0;

    public void EnsureEditable()
    {
        if (Status != InvoiceStatus.Draft)
        {
            throw new DomainException("invoice_not_editable", Loc.T(
                "Gestellte Rechnungen können nicht mehr geändert werden. Stornieren Sie die Rechnung und erstellen Sie eine neue.",
                "Issued invoices can no longer be changed. Cancel the invoice and create a new one."));
        }
    }

    public void ReplaceLineItems(IEnumerable<InvoiceLineItem> items)
    {
        EnsureEditable();
        var list = items.ToList();
        if (list.Count > QuotationCalculator.MaxLineItems)
        {
            throw new DomainException("too_many_line_items", Loc.T(
                $"Eine Rechnung darf höchstens {QuotationCalculator.MaxLineItems} Positionen enthalten.",
                $"An invoice may contain at most {QuotationCalculator.MaxLineItems} line items."));
        }

        LineItems.Clear();
        var position = 1;
        foreach (var item in list)
        {
            item.Position = position++;
            LineItems.Add(item);
        }

        Recalculate();
    }

    public void Recalculate()
    {
        foreach (var item in LineItems)
        {
            var (before, discount, net) = QuotationCalculator.CalculateLine(item.Quantity, item.UnitPriceNet, item.DiscountPercent);
            item.LineTotalBeforeDiscount = before;
            item.LineDiscount = discount;
            item.LineNet = net;
        }

        var totals = CalculateTotals();
        SubtotalBeforeDiscount = totals.SubtotalBeforeDiscount;
        DiscountTotal = totals.DiscountTotal;
        NetTotal = totals.NetTotal;
        TaxTotal = totals.TaxTotal;
        GrossTotal = totals.GrossTotal;
    }

    public QuotationTotals CalculateTotals() => QuotationCalculator.Calculate(
        LineItems.Select(i => new LineInput(i.Quantity, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)),
        TaxMode);

    /// <summary>Checks the document-level requirements for issuing (§ 14 UStG) and returns a message (request language) for every gap.</summary>
    public IReadOnlyList<string> IssueProblems(DateOnly today)
    {
        var problems = new List<string>();
        if (LineItems.Count == 0)
        {
            problems.Add(Loc.T("Die Rechnung enthält keine Positionen.", "The invoice has no line items."));
        }
        else if (Kind == InvoiceKind.Invoice && NetTotal <= 0)
        {
            problems.Add(Loc.T("Der Rechnungsbetrag muss größer als 0 € sein.", "The invoice amount must be greater than €0."));
        }

        if (ServiceDateFrom is null)
        {
            problems.Add(Loc.T("Bitte das Leistungsdatum bzw. den Leistungszeitraum angeben (§ 14 UStG).", "Please enter the service date or service period (§ 14 UStG)."));
        }
        else if (ServiceDateTo is { } to && to < ServiceDateFrom)
        {
            problems.Add(Loc.T("Das Ende des Leistungszeitraums liegt vor dem Beginn.", "The end of the service period is before its start."));
        }

        if (IssueDate > today)
        {
            problems.Add(Loc.T("Das Rechnungsdatum darf nicht in der Zukunft liegen.", "The invoice date must not be in the future."));
        }

        if (DueDate < IssueDate)
        {
            problems.Add(Loc.T("Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.", "The due date must not be before the invoice date."));
        }

        if (string.IsNullOrWhiteSpace(RecipientName) || string.IsNullOrWhiteSpace(RecipientStreet) || string.IsNullOrWhiteSpace(RecipientCity))
        {
            problems.Add(Loc.T("Beim Kunden fehlen Name oder vollständige Rechnungsanschrift (Straße, PLZ, Ort).", "The customer's name or full billing address (street, postal code, city) is missing."));
        }

        if (TaxMode == TaxMode.ReverseCharge && string.IsNullOrWhiteSpace(RecipientVatId))
        {
            problems.Add(Loc.T(
                "Für die Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG) ist die USt-IdNr. des Kunden erforderlich.",
                "The reverse charge procedure (§ 13b UStG) requires the customer's VAT ID."));
        }

        return problems;
    }

    /// <summary>Finalises the invoice: assigns the number and freezes the content.</summary>
    public void Issue(string number, DateTimeOffset now, Guid? userId, DateOnly today)
    {
        EnsureEditable();
        var problems = IssueProblems(today);
        if (problems.Count > 0)
        {
            throw new DomainException("invoice_incomplete", string.Join(" ", problems));
        }

        Number = number;
        Status = InvoiceStatus.Issued;
        IssuedAt = now;
        IssuedByUserId = userId;
        UpdatedAt = now;
    }

    public void MarkSent(DateTimeOffset now)
    {
        if (Status == InvoiceStatus.Draft)
        {
            throw new DomainException("invoice_not_issued", Loc.T(
                "Bitte stellen Sie die Rechnung zuerst (Rechnungsnummer vergeben), bevor Sie sie versenden.",
                "Please issue the invoice first (this assigns the invoice number) before sending it."));
        }

        SentAt ??= now;
        UpdatedAt = now;
    }

    public void RecordPayment(InvoicePayment payment, DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("invoice_not_payable", Status == InvoiceStatus.Paid
                ? Loc.T("Diese Rechnung ist bereits vollständig bezahlt.", "This invoice has already been paid in full.")
                : Loc.T("Zahlungen können nur für gestellte, offene Rechnungen erfasst werden.", "Payments can only be recorded for issued, open invoices."));
        }

        if (payment.Amount <= 0)
        {
            throw new DomainException("invalid_payment_amount", Loc.T("Der Zahlbetrag muss größer als 0 € sein.", "The payment amount must be greater than €0."));
        }

        if (payment.Amount > OpenAmount)
        {
            throw new DomainException("payment_exceeds_open_amount", Loc.T(
                $"Der Betrag übersteigt den offenen Betrag von {OpenAmount.ToString("#,##0.00", CultureInfo.GetCultureInfo("de-DE"))} €.",
                $"The amount exceeds the open amount of €{OpenAmount.ToString("#,##0.00", CultureInfo.InvariantCulture)}."));
        }

        payment.CompanyId = CompanyId;
        payment.InvoiceId = Id;
        Payments.Add(payment);
        ApplyPayments(now);
    }

    public void RemovePayment(InvoicePayment payment, DateTimeOffset now)
    {
        if (Status is not (InvoiceStatus.PartiallyPaid or InvoiceStatus.Paid))
        {
            throw new DomainException("payment_not_removable", Loc.T("Zahlungen stornierter Rechnungen können nicht mehr geändert werden.", "Payments of cancelled invoices can no longer be changed."));
        }

        Payments.Remove(payment);
        ApplyPayments(now);
    }

    /// <summary>Marks this invoice as reversed by <paramref name="cancellationInvoiceId"/>.</summary>
    public void Cancel(Guid cancellationInvoiceId, DateTimeOffset now, string? reason)
    {
        if (Kind != InvoiceKind.Invoice || Status is InvoiceStatus.Draft or InvoiceStatus.Cancelled)
        {
            throw new DomainException("invoice_not_cancellable", Status == InvoiceStatus.Draft
                ? Loc.T("Entwürfe werden gelöscht, nicht storniert.", "Drafts are deleted, not cancelled.")
                : Loc.T("Diese Rechnung kann nicht storniert werden.", "This invoice cannot be cancelled."));
        }

        Status = InvoiceStatus.Cancelled;
        CancellationInvoiceId = cancellationInvoiceId;
        CancelledAt = now;
        CancellationReason = reason;
        UpdatedAt = now;
    }

    public void MarkReminderSent(DateTimeOffset now)
    {
        if (!IsOpen)
        {
            throw new DomainException("invoice_not_open", Loc.T("Zahlungserinnerungen sind nur für offene Rechnungen möglich.", "Payment reminders are only possible for open invoices."));
        }

        ReminderCount++;
        LastReminderAt = now;
        UpdatedAt = now;
    }

    public InvoiceEvent AddEvent(InvoiceEventType type, DateTimeOffset now, ActorType actor, Guid? userId, string? details = null)
    {
        var e = new InvoiceEvent
        {
            CompanyId = CompanyId,
            InvoiceId = Id,
            Type = type,
            OccurredAt = now,
            ActorType = actor,
            ActorUserId = userId,
            Details = details is { Length: > 500 } ? details[..500] : details,
        };
        Events.Add(e);
        return e;
    }

    public static string StatusLabel(InvoiceStatus status) => status switch
    {
        InvoiceStatus.Draft => "Entwurf",
        InvoiceStatus.Issued => "Offen",
        InvoiceStatus.PartiallyPaid => "Teilweise bezahlt",
        InvoiceStatus.Paid => "Bezahlt",
        InvoiceStatus.Cancelled => "Storniert",
        _ => status.ToString(),
    };

    private void ApplyPayments(DateTimeOffset now)
    {
        PaidAmount = Payments.Sum(p => p.Amount);
        if (PaidAmount >= GrossTotal)
        {
            Status = InvoiceStatus.Paid;
            PaidOn = Payments.Max(p => p.PaidOn);
        }
        else
        {
            Status = PaidAmount > 0 ? InvoiceStatus.PartiallyPaid : InvoiceStatus.Issued;
            PaidOn = null;
        }

        UpdatedAt = now;
    }
}

public sealed class InvoiceLineItem : Entity, IDocumentLineItem
{
    public Guid InvoiceId { get; set; }

    public int Position { get; set; }

    public required string Title { get; set; }

    public string? Description { get; set; }

    public decimal Quantity { get; set; }

    public string Unit { get; set; } = "Stk.";

    public decimal UnitPriceNet { get; set; }

    public decimal DiscountPercent { get; set; }

    public decimal TaxRatePercent { get; set; }

    public decimal LineTotalBeforeDiscount { get; set; }

    public decimal LineDiscount { get; set; }

    public decimal LineNet { get; set; }
}

public sealed class InvoiceEvent : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid InvoiceId { get; set; }

    public InvoiceEventType Type { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public ActorType ActorType { get; set; }

    public Guid? ActorUserId { get; set; }

    public string? Details { get; set; }
}

public sealed class InvoicePayment : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid InvoiceId { get; set; }

    public decimal Amount { get; set; }

    public DateOnly PaidOn { get; set; }

    /// <summary>Free text such as "Überweisung", "Bar", "PayPal".</summary>
    public string? Method { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid CreatedByUserId { get; set; }
}
