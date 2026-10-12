using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Customers;

namespace AngebotPilot.Domain.Quotations;

public sealed class Quotation : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid CustomerId { get; set; }

    public Customer? Customer { get; set; }

    /// <summary>Document number, unique per company, e.g. AN-2026-0001 or AN-2026-0001-R1.</summary>
    public required string Number { get; set; }

    public required string Title { get; set; }

    public QuotationStatus Status { get; private set; } = QuotationStatus.Draft;

    public DateOnly IssueDate { get; set; }

    public DateOnly ValidUntil { get; set; }

    public TaxMode TaxMode { get; set; }

    public string? IntroText { get; set; }

    public string? ClosingText { get; set; }

    public string? Terms { get; set; }

    public string? PaymentTerms { get; set; }

    /// <summary>Internal note, never shown to the customer.</summary>
    public string? InternalNotes { get; set; }

    public string Currency { get; set; } = "EUR";

    public decimal SubtotalBeforeDiscount { get; private set; }

    public decimal DiscountTotal { get; private set; }

    public decimal NetTotal { get; private set; }

    public decimal TaxTotal { get; private set; }

    public decimal GrossTotal { get; private set; }

    // Recipient snapshot. Refreshed while the quotation is a draft and frozen when it is sent,
    // so historical documents do not change when the customer record changes.
    public string RecipientName { get; set; } = string.Empty;

    public string? RecipientContact { get; set; }

    public string? RecipientAddress { get; set; }

    public string? RecipientEmail { get; set; }

    public string? RecipientVatId { get; set; }

    public Guid? RootQuotationId { get; set; }

    public Guid? PreviousRevisionId { get; set; }

    public int RevisionNumber { get; set; }

    public Guid? SourceTemplateId { get; set; }

    /// <summary>Stored PDF that was generated when the quotation was sent.</summary>
    public Guid? SentPdfFileId { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public DateTimeOffset? SentAt { get; private set; }

    public Guid? SentByUserId { get; private set; }

    public DateTimeOffset? DecidedAt { get; private set; }

    public ActorType? DecidedByActor { get; private set; }

    public Guid? DecidedByUserId { get; private set; }

    /// <summary>Name the customer typed when deciding on the public page, or the note of the user who recorded it.</summary>
    public string? DecisionName { get; private set; }

    public string? DecisionNote { get; private set; }

    public DateTimeOffset? ExpiredAt { get; private set; }

    public DateTimeOffset? CancelledAt { get; private set; }

    public string? CancellationReason { get; private set; }

    public DateTimeOffset? DeletedAt { get; set; }

    public List<QuotationLineItem> LineItems { get; set; } = [];

    public List<QuotationEvent> Events { get; set; } = [];

    public byte[] RowVersion { get; set; } = [];

    public bool IsDraft => Status == QuotationStatus.Draft;

    public void EnsureEditable()
    {
        if (Status != QuotationStatus.Draft)
        {
            throw new DomainException("quotation_not_editable", "Nur Entwürfe können bearbeitet werden. Erstellen Sie eine Revision, um ein versendetes Angebot zu ändern.");
        }
    }

    public void ReplaceLineItems(IEnumerable<QuotationLineItem> items)
    {
        EnsureEditable();
        var list = items.ToList();
        if (list.Count > QuotationCalculator.MaxLineItems)
        {
            throw new DomainException("too_many_line_items", $"Ein Angebot darf höchstens {QuotationCalculator.MaxLineItems} Positionen enthalten.");
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

        var totals = QuotationCalculator.Calculate(
            LineItems.Select(i => new LineInput(i.Quantity, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)),
            TaxMode);
        SubtotalBeforeDiscount = totals.SubtotalBeforeDiscount;
        DiscountTotal = totals.DiscountTotal;
        NetTotal = totals.NetTotal;
        TaxTotal = totals.TaxTotal;
        GrossTotal = totals.GrossTotal;
    }

    public QuotationTotals CalculateTotals() => QuotationCalculator.Calculate(
        LineItems.Select(i => new LineInput(i.Quantity, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)),
        TaxMode);

    /// <summary>Transitions a draft to <see cref="QuotationStatus.Sent"/>. Re-sending a sent quotation keeps its status.</summary>
    /// <returns><c>true</c> when the status changed.</returns>
    public bool MarkSent(DateTimeOffset now, Guid userId, DateOnly today)
    {
        if (Status == QuotationStatus.Sent)
        {
            return false;
        }

        QuotationTransitions.Ensure(Status, QuotationStatus.Sent);
        if (LineItems.Count == 0)
        {
            throw new DomainException("quotation_empty", "Ein Angebot ohne Positionen kann nicht versendet werden.");
        }

        if (ValidUntil < today)
        {
            throw new DomainException("quotation_validity_in_past", "Das Gültigkeitsdatum liegt in der Vergangenheit.");
        }

        Status = QuotationStatus.Sent;
        SentAt = now;
        SentByUserId = userId;
        UpdatedAt = now;
        return true;
    }

    public void Accept(DateTimeOffset now, ActorType actor, Guid? userId, string? name, string? note, DateOnly today)
    {
        if (actor == ActorType.Customer && Status == QuotationStatus.Sent && ValidUntil < today)
        {
            throw new DomainException("quotation_expired", "Dieses Angebot ist abgelaufen und kann nicht mehr angenommen werden.");
        }

        // A user may record a late acceptance (e.g. by phone) on an expired quotation; customers may not.
        var allowedFrom = actor == ActorType.User && Status == QuotationStatus.Expired;
        if (!allowedFrom)
        {
            QuotationTransitions.Ensure(Status, QuotationStatus.Accepted);
        }

        Decide(QuotationStatus.Accepted, now, actor, userId, name, note);
    }

    public void Reject(DateTimeOffset now, ActorType actor, Guid? userId, string? name, string? note)
    {
        QuotationTransitions.Ensure(Status, QuotationStatus.Rejected);
        Decide(QuotationStatus.Rejected, now, actor, userId, name, note);
    }

    public void Expire(DateTimeOffset now)
    {
        QuotationTransitions.Ensure(Status, QuotationStatus.Expired);
        Status = QuotationStatus.Expired;
        ExpiredAt = now;
        UpdatedAt = now;
    }

    public void Cancel(DateTimeOffset now, string? reason)
    {
        QuotationTransitions.Ensure(Status, QuotationStatus.Cancelled);
        Status = QuotationStatus.Cancelled;
        CancelledAt = now;
        CancellationReason = reason;
        UpdatedAt = now;
    }

    public bool IsPastValidity(DateOnly today) => ValidUntil < today;

    public bool CanBeRevised => Status is QuotationStatus.Sent or QuotationStatus.Rejected or QuotationStatus.Expired;

    public QuotationEvent AddEvent(QuotationEventType type, DateTimeOffset now, ActorType actor, Guid? userId, string? details = null)
    {
        var e = new QuotationEvent
        {
            CompanyId = CompanyId,
            QuotationId = Id,
            Type = type,
            OccurredAt = now,
            ActorType = actor,
            ActorUserId = userId,
            Details = details,
        };
        Events.Add(e);
        return e;
    }

    private void Decide(QuotationStatus status, DateTimeOffset now, ActorType actor, Guid? userId, string? name, string? note)
    {
        Status = status;
        DecidedAt = now;
        DecidedByActor = actor;
        DecidedByUserId = userId;
        DecisionName = name;
        DecisionNote = note;
        UpdatedAt = now;
    }
}

public sealed class QuotationLineItem : Entity
{
    public Guid QuotationId { get; set; }

    public int Position { get; set; }

    public required string Title { get; set; }

    public string? Description { get; set; }

    public decimal Quantity { get; set; }

    public string Unit { get; set; } = "Stk.";

    public decimal UnitPriceNet { get; set; }

    public decimal DiscountPercent { get; set; }

    /// <summary>Snapshot of the rate at the time the line was saved.</summary>
    public decimal TaxRatePercent { get; set; }

    public decimal LineTotalBeforeDiscount { get; set; }

    public decimal LineDiscount { get; set; }

    public decimal LineNet { get; set; }
}

public sealed class QuotationEvent : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid QuotationId { get; set; }

    public QuotationEventType Type { get; set; }

    public DateTimeOffset OccurredAt { get; set; }

    public ActorType ActorType { get; set; }

    public Guid? ActorUserId { get; set; }

    /// <summary>Short, non-sensitive description (no tokens, no secrets).</summary>
    public string? Details { get; set; }
}

public static class QuotationTransitions
{
    private static readonly Dictionary<QuotationStatus, QuotationStatus[]> Allowed = new()
    {
        [QuotationStatus.Draft] = [QuotationStatus.Sent, QuotationStatus.Cancelled],
        [QuotationStatus.Sent] = [QuotationStatus.Accepted, QuotationStatus.Rejected, QuotationStatus.Expired, QuotationStatus.Cancelled],
        [QuotationStatus.Accepted] = [],
        [QuotationStatus.Rejected] = [],
        [QuotationStatus.Expired] = [],
        [QuotationStatus.Cancelled] = [],
    };

    public static bool CanTransition(QuotationStatus from, QuotationStatus to) => Allowed[from].Contains(to);

    public static IReadOnlyList<QuotationStatus> AllowedTargets(QuotationStatus from) => Allowed[from];

    public static void Ensure(QuotationStatus from, QuotationStatus to)
    {
        if (!CanTransition(from, to))
        {
            throw new DomainException(
                "invalid_status_transition",
                $"Der Status kann nicht von „{StatusLabel(from)}“ zu „{StatusLabel(to)}“ geändert werden.");
        }
    }

    public static string StatusLabel(QuotationStatus status) => status switch
    {
        QuotationStatus.Draft => "Entwurf",
        QuotationStatus.Sent => "Versendet",
        QuotationStatus.Accepted => "Angenommen",
        QuotationStatus.Rejected => "Abgelehnt",
        QuotationStatus.Expired => "Abgelaufen",
        QuotationStatus.Cancelled => "Storniert",
        _ => status.ToString(),
    };
}

/// <summary>Access token for the public customer page. Only the SHA-256 hash of the token is stored.</summary>
public sealed class PublicQuotationAccess : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid QuotationId { get; set; }

    public Quotation? Quotation { get; set; }

    public required string TokenHash { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public DateTimeOffset? FirstOpenedAt { get; set; }

    public DateTimeOffset? LastOpenedAt { get; set; }

    public int OpenCount { get; set; }

    public bool IsUsable(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}
