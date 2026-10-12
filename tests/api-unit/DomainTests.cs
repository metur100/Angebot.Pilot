using AngebotPilot.Domain;
using AngebotPilot.Domain.Billing;
using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Companies;
using AngebotPilot.Domain.FollowUps;
using AngebotPilot.Domain.Jobs;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.UnitTests;

public class QuotationCalculatorTests
{
    [Fact]
    public void Groups_vat_per_rate_and_rounds_commercially()
    {
        // Same case as packages/api-contracts/test/money.test.ts – client previews must equal server totals.
        var totals = QuotationCalculator.Calculate(
        [
            new LineInput(3, 19.99m, 0, 19),
            new LineInput(2.5m, 48m, 10, 19),
            new LineInput(1, 12.35m, 0, 7),
        ], TaxMode.Standard);

        Assert.Equal(192.32m, totals.SubtotalBeforeDiscount);
        Assert.Equal(12.00m, totals.DiscountTotal);
        Assert.Equal(180.32m, totals.NetTotal);
        Assert.Equal(2, totals.TaxGroups.Count);
        Assert.Equal(new TaxGroup(19m, 167.97m, 31.91m), totals.TaxGroups[0]);
        Assert.Equal(new TaxGroup(7m, 12.35m, 0.86m), totals.TaxGroups[1]);
        Assert.Equal(32.77m, totals.TaxTotal);
        Assert.Equal(213.09m, totals.GrossTotal);
    }

    [Theory]
    [InlineData(1, 0.125, 0, 0.13)]
    [InlineData(3, 0.335, 0, 1.01)]
    [InlineData(1, 10, 33.333, 6.67)]
    [InlineData(0.001, 0.01, 0, 0.00)]
    [InlineData(1000000, 0.01, 0, 10000.00)]
    public void Line_net_uses_half_away_from_zero(decimal qty, decimal price, decimal discount, decimal expectedNet)
    {
        Assert.Equal(expectedNet, QuotationCalculator.CalculateLine(qty, price, discount).Net);
    }

    [Fact]
    public void Vat_is_rounded_once_per_rate_not_per_line()
    {
        // 3 lines of 0.05 net at 19 %: per line 0.0095 → 0.01 each (0.03); per group 0.15 × 19 % = 0.0285 → 0.03.
        // Lines of 0.10: per-line would be 0.02 × 3 = 0.06, per-group 0.30 × 19 % = 0.057 → 0.06.
        var totals = QuotationCalculator.Calculate([new LineInput(1, 0.33m, 0, 19), new LineInput(1, 0.33m, 0, 19), new LineInput(1, 0.33m, 0, 19)], TaxMode.Standard);
        Assert.Equal(0.99m, totals.NetTotal);
        Assert.Equal(0.19m, totals.TaxTotal); // 0.99 × 0.19 = 0.1881 → 0.19 (per line would be 3 × 0.06 = 0.18)
    }

    [Theory]
    [InlineData(TaxMode.SmallBusiness)]
    [InlineData(TaxMode.ReverseCharge)]
    public void Special_tax_modes_charge_no_vat(TaxMode mode)
    {
        var totals = QuotationCalculator.Calculate([new LineInput(2, 100m, 0, 19), new LineInput(1, 50m, 0, 7)], mode);
        Assert.Equal(0m, totals.TaxTotal);
        Assert.Equal(250m, totals.GrossTotal);
        Assert.Single(totals.TaxGroups);
    }

    [Fact]
    public void Full_discount_results_in_zero_line()
    {
        var line = QuotationCalculator.CalculateLine(4, 25m, 100);
        Assert.Equal(100m, line.BeforeDiscount);
        Assert.Equal(100m, line.Discount);
        Assert.Equal(0m, line.Net);
    }

    [Fact]
    public void Decimal_arithmetic_avoids_binary_floating_point_errors()
    {
        var totals = QuotationCalculator.Calculate([new LineInput(3, 0.1m, 0, 0)], TaxMode.Standard);
        Assert.Equal(0.3m, totals.NetTotal);
    }

    [Fact]
    public void Empty_quotation_totals_are_zero()
    {
        var totals = QuotationCalculator.Calculate([], TaxMode.Standard);
        Assert.Equal(0m, totals.GrossTotal);
        Assert.Empty(totals.TaxGroups);
    }

    [Theory]
    [InlineData(0, 10, 0)]
    [InlineData(-1, 10, 0)]
    [InlineData(1, -0.01, 0)]
    [InlineData(1, 10, -1)]
    [InlineData(1, 10, 101)]
    [InlineData(1000001, 1, 0)]
    public void Invalid_lines_are_rejected(decimal qty, decimal price, decimal discount)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => QuotationCalculator.CalculateLine(qty, price, discount));
    }

    [Fact]
    public void Quotation_recalculates_and_stores_line_results()
    {
        var q = NewQuotation();
        q.ReplaceLineItems([Item(2, 50m, 10, 19), Item(1, 20m, 0, 7)]);
        Assert.Equal(90m, q.LineItems[0].LineNet);
        Assert.Equal(1, q.LineItems[0].Position);
        Assert.Equal(2, q.LineItems[1].Position);
        Assert.Equal(110m, q.NetTotal);
        Assert.Equal(17.10m + 1.40m, q.TaxTotal);
        Assert.Equal(128.50m, q.GrossTotal);
    }

    [Fact]
    public void Too_many_line_items_are_rejected()
    {
        var q = NewQuotation();
        var ex = Assert.Throws<DomainException>(() => q.ReplaceLineItems(Enumerable.Range(0, 201).Select(_ => Item(1, 1, 0, 19))));
        Assert.Equal("too_many_line_items", ex.Code);
    }

    internal static Quotation NewQuotation(DateOnly? validUntil = null) => new()
    {
        Id = Guid.NewGuid(),
        CompanyId = Guid.NewGuid(),
        CustomerId = Guid.NewGuid(),
        Number = "AN-2026-0001",
        Title = "Test",
        IssueDate = new DateOnly(2026, 10, 1),
        ValidUntil = validUntil ?? new DateOnly(2026, 10, 31),
    };

    internal static QuotationLineItem Item(decimal qty, decimal price, decimal discount, decimal tax) =>
        new() { Title = "Position", Quantity = qty, UnitPriceNet = price, DiscountPercent = discount, TaxRatePercent = tax, Unit = "Stk." };
}

public class QuotationLifecycleTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 12, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 12);

    public static TheoryData<QuotationStatus, QuotationStatus, bool> Transitions()
    {
        var allowed = new HashSet<(QuotationStatus, QuotationStatus)>
        {
            (QuotationStatus.Draft, QuotationStatus.Sent), (QuotationStatus.Draft, QuotationStatus.Cancelled),
            (QuotationStatus.Sent, QuotationStatus.Accepted), (QuotationStatus.Sent, QuotationStatus.Rejected),
            (QuotationStatus.Sent, QuotationStatus.Expired), (QuotationStatus.Sent, QuotationStatus.Cancelled),
        };
        var data = new TheoryData<QuotationStatus, QuotationStatus, bool>();
        foreach (var from in Enum.GetValues<QuotationStatus>())
        {
            foreach (var to in Enum.GetValues<QuotationStatus>())
            {
                data.Add(from, to, allowed.Contains((from, to)));
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Transitions))]
    public void Transition_table_is_exhaustive(QuotationStatus from, QuotationStatus to, bool expected) =>
        Assert.Equal(expected, QuotationTransitions.CanTransition(from, to));

    [Fact]
    public void Draft_can_be_sent_and_then_accepted_by_customer()
    {
        var q = Sendable();
        Assert.True(q.MarkSent(Now, Guid.NewGuid(), Today));
        Assert.Equal(QuotationStatus.Sent, q.Status);
        Assert.False(q.MarkSent(Now, Guid.NewGuid(), Today)); // resend keeps status
        q.Accept(Now, ActorType.Customer, null, "Max Mustermann", null, Today);
        Assert.Equal(QuotationStatus.Accepted, q.Status);
        Assert.Equal("Max Mustermann", q.DecisionName);
        Assert.Equal(ActorType.Customer, q.DecidedByActor);
    }

    [Fact]
    public void Accepted_quotation_cannot_be_edited_rejected_or_cancelled()
    {
        var q = Sendable();
        q.MarkSent(Now, Guid.NewGuid(), Today);
        q.Accept(Now, ActorType.User, Guid.NewGuid(), null, null, Today);
        Assert.Equal("quotation_not_editable", Assert.Throws<DomainException>(q.EnsureEditable).Code);
        Assert.Throws<DomainException>(() => q.Reject(Now, ActorType.Customer, null, null, null));
        Assert.Throws<DomainException>(() => q.Cancel(Now, null));
        Assert.Throws<DomainException>(() => q.Accept(Now, ActorType.Customer, null, "X", null, Today));
    }

    [Fact]
    public void Customer_cannot_accept_after_validity_but_user_may_record_late_acceptance()
    {
        var q = Sendable(validUntil: Today);
        q.MarkSent(Now, Guid.NewGuid(), Today);
        var later = Today.AddDays(1);
        Assert.Equal("quotation_expired", Assert.Throws<DomainException>(() => q.Accept(Now, ActorType.Customer, null, "X", null, later)).Code);
        q.Expire(Now);
        Assert.Throws<DomainException>(() => q.Accept(Now, ActorType.Customer, null, "X", null, later));
        q.Accept(Now, ActorType.User, Guid.NewGuid(), null, "Telefonisch", later);
        Assert.Equal(QuotationStatus.Accepted, q.Status);
    }

    [Fact]
    public void Empty_or_past_quotations_cannot_be_sent()
    {
        var empty = QuotationCalculatorTests.NewQuotation();
        Assert.Equal("quotation_empty", Assert.Throws<DomainException>(() => empty.MarkSent(Now, Guid.NewGuid(), Today)).Code);
        var past = Sendable(validUntil: Today.AddDays(-1));
        Assert.Equal("quotation_validity_in_past", Assert.Throws<DomainException>(() => past.MarkSent(Now, Guid.NewGuid(), Today)).Code);
    }

    [Fact]
    public void Only_sent_rejected_or_expired_quotations_can_be_revised()
    {
        var q = Sendable();
        Assert.False(q.CanBeRevised);
        q.MarkSent(Now, Guid.NewGuid(), Today);
        Assert.True(q.CanBeRevised);
        q.Reject(Now, ActorType.Customer, null, null, null);
        Assert.True(q.CanBeRevised);
    }

    private static Quotation Sendable(DateOnly? validUntil = null)
    {
        var q = QuotationCalculatorTests.NewQuotation(validUntil);
        q.ReplaceLineItems([QuotationCalculatorTests.Item(1, 100m, 0, 19)]);
        return q;
    }
}

public class FollowUpPlannerTests
{
    private static readonly TimeZoneInfo Berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");

    private static CompanySettings Settings(bool first = true, int firstDays = 5, bool second = false, int secondDays = 12, bool expiry = true, int expiryDays = 3) => new()
    {
        FirstReminderEnabled = first,
        FirstReminderAfterDays = firstDays,
        SecondReminderEnabled = second,
        SecondReminderAfterDays = secondDays,
        ExpiryReminderEnabled = expiry,
        ExpiryReminderDaysBefore = expiryDays,
    };

    [Fact]
    public void Plans_reminders_at_nine_local_time()
    {
        var sentAt = new DateTimeOffset(2026, 6, 1, 14, 30, 0, TimeSpan.Zero); // summer time (UTC+2)
        var plan = FollowUpPlanner.Plan(Settings(second: true), sentAt, new DateOnly(2026, 7, 1), Berlin);

        Assert.Collection(plan,
            p => { Assert.Equal(FollowUpKind.FirstReminder, p.Kind); Assert.Equal(new DateTimeOffset(2026, 6, 6, 7, 0, 0, TimeSpan.Zero), p.DueAt); },
            p => { Assert.Equal(FollowUpKind.SecondReminder, p.Kind); Assert.Equal(new DateTimeOffset(2026, 6, 13, 7, 0, 0, TimeSpan.Zero), p.DueAt); },
            p => { Assert.Equal(FollowUpKind.ExpiryReminder, p.Kind); Assert.Equal(new DateTimeOffset(2026, 6, 28, 7, 0, 0, TimeSpan.Zero), p.DueAt); });
    }

    [Fact]
    public void Uses_winter_time_offset()
    {
        var sentAt = new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero);
        var plan = FollowUpPlanner.Plan(Settings(expiry: false), sentAt, new DateOnly(2026, 12, 2), Berlin);
        Assert.Equal(new DateTimeOffset(2026, 11, 7, 8, 0, 0, TimeSpan.Zero), Assert.Single(plan).DueAt);
    }

    [Fact]
    public void Skips_reminders_after_validity_and_too_close_together()
    {
        var sentAt = new DateTimeOffset(2026, 6, 1, 8, 0, 0, TimeSpan.Zero);
        // Valid 6 days: first reminder on day 5 (Jun 6), expiry reminder 3 days before (Jun 4) → expiry first, first reminder 2 days later.
        var plan = FollowUpPlanner.Plan(Settings(second: true), sentAt, new DateOnly(2026, 6, 7), Berlin);
        Assert.Equal([FollowUpKind.ExpiryReminder, FollowUpKind.FirstReminder], plan.Select(p => p.Kind));

        // Valid 2 days: everything would be too close to the original email or after validity.
        Assert.Empty(FollowUpPlanner.Plan(Settings(second: true), sentAt, new DateOnly(2026, 6, 2), Berlin));
    }

    [Fact]
    public void Disabled_settings_plan_nothing()
    {
        var plan = FollowUpPlanner.Plan(Settings(first: false, expiry: false), DateTimeOffset.UtcNow, DateOnly.FromDateTime(DateTime.UtcNow).AddDays(30), Berlin);
        Assert.Empty(plan);
    }

    [Fact]
    public void Minimum_gap_between_messages_is_enforced()
    {
        var sentAt = new DateTimeOffset(2026, 3, 1, 8, 0, 0, TimeSpan.Zero);
        var plan = FollowUpPlanner.Plan(Settings(firstDays: 5, second: true, secondDays: 6), sentAt, new DateOnly(2026, 4, 30), Berlin);
        Assert.DoesNotContain(plan, p => p.Kind == FollowUpKind.SecondReminder);
        for (var i = 1; i < plan.Count; i++)
        {
            Assert.True(plan[i].DueAt - plan[i - 1].DueAt >= FollowUpPlanner.MinimumGap);
        }
    }

    [Fact]
    public void Cancelling_only_affects_scheduled_entries()
    {
        var f = new FollowUpSchedule { Status = FollowUpStatus.Queued };
        f.Cancel(DateTimeOffset.UtcNow, "x");
        Assert.Equal(FollowUpStatus.Queued, f.Status);
        var g = new FollowUpSchedule { Status = FollowUpStatus.Scheduled };
        g.Cancel(DateTimeOffset.UtcNow, "Angebot angenommen");
        Assert.Equal(FollowUpStatus.Cancelled, g.Status);
        Assert.Equal("Angebot angenommen", g.StatusReason);
    }
}

public class JobLifecycleTests
{
    [Fact]
    public void Job_status_changes_record_timestamps()
    {
        var job = new Job { Number = "AU-2026-0001", Title = "Test" };
        var t1 = DateTimeOffset.UtcNow;
        job.ChangeStatus(JobStatus.InProgress, t1);
        Assert.Equal(t1, job.StartedAt);
        job.ChangeStatus(JobStatus.Completed, t1.AddHours(2));
        Assert.Equal(t1.AddHours(2), job.CompletedAt);
        job.ChangeStatus(JobStatus.InProgress, t1.AddHours(3));
        Assert.Null(job.CompletedAt);
        Assert.Equal(t1, job.StartedAt);
    }

    [Fact]
    public void Completed_job_cannot_be_cancelled_directly()
    {
        var job = new Job { Number = "AU-2026-0001", Title = "Test" };
        job.ChangeStatus(JobStatus.Completed, DateTimeOffset.UtcNow);
        Assert.Throws<DomainException>(() => job.ChangeStatus(JobStatus.Cancelled, DateTimeOffset.UtcNow));
    }
}

public class EntitlementTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 12, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Trial_grants_full_access_until_it_ends()
    {
        Assert.Equal(EntitlementState.Full, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.Trialing, TrialEndsAt = Now.AddDays(1) }, Now));
        Assert.Equal(EntitlementState.ReadOnly, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.Trialing, TrialEndsAt = Now.AddSeconds(-1) }, Now));
    }

    [Fact]
    public void Past_due_keeps_access_only_during_grace_period()
    {
        Assert.Equal(EntitlementState.Full, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.PastDue, GraceUntil = Now.AddDays(2) }, Now));
        Assert.Equal(EntitlementState.ReadOnly, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.PastDue, GraceUntil = Now.AddDays(-1) }, Now));
    }

    [Fact]
    public void Missing_or_expired_subscription_is_read_only()
    {
        Assert.Equal(EntitlementState.ReadOnly, Entitlements.Evaluate(null, Now));
        Assert.Equal(EntitlementState.ReadOnly, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.Expired }, Now));
        Assert.Equal(EntitlementState.Full, Entitlements.Evaluate(new Subscription { Status = SubscriptionStatus.Canceled, CurrentPeriodEnd = Now.AddDays(3) }, Now));
    }

    [Fact]
    public void Plan_limits_are_defined_for_every_plan()
    {
        foreach (var plan in Enum.GetValues<SubscriptionPlan>())
        {
            var limits = PlanCatalog.For(plan);
            Assert.True(limits.MaxActiveMembers >= 1);
            Assert.True(limits.MaxEmailsPerDay > 0);
        }

        Assert.Equal(1, PlanCatalog.For(SubscriptionPlan.Starter).MaxActiveMembers);
    }
}
