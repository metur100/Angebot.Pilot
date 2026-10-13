using AngebotPilot.Domain.Common;

namespace AngebotPilot.Domain.Billing;

public sealed class Subscription : Entity
{
    public Guid CompanyId { get; set; }

    public SubscriptionPlan Plan { get; set; }

    public SubscriptionStatus Status { get; set; }

    public DateTimeOffset? TrialEndsAt { get; set; }

    public DateTimeOffset? CurrentPeriodEnd { get; set; }

    /// <summary>After a failed payment the company keeps access until this time.</summary>
    public DateTimeOffset? GraceUntil { get; set; }

    public bool CancelAtPeriodEnd { get; set; }

    public string? Provider { get; set; }

    public string? ProviderCustomerId { get; set; }

    public string? ProviderSubscriptionId { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];
}

/// <summary>Stores processed webhook ids so a provider retry is applied only once.</summary>
public sealed class BillingWebhookEvent : Entity
{
    public required string Provider { get; set; }

    public required string ProviderEventId { get; set; }

    public required string EventType { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }

    public DateTimeOffset? ProcessedAt { get; set; }
}

public sealed record PlanLimits(
    SubscriptionPlan Plan,
    string Name,
    decimal MonthlyPriceEur,
    int MaxActiveMembers,
    int? MaxQuotationsPerMonth,
    int MaxEmailsPerDay,
    bool FollowUpAutomation,
    bool Templates)
{
    /// <summary>Plan name in the request language (only the trial has a translated name).</summary>
    public string DisplayName => Plan == SubscriptionPlan.Trial ? Loc.T(Name, "Trial") : Name;
}

public static class PlanCatalog
{
    public static readonly TimeSpan TrialLength = TimeSpan.FromDays(30);
    public static readonly TimeSpan GracePeriod = TimeSpan.FromDays(7);

    public static readonly IReadOnlyList<PlanLimits> All =
    [
        new(SubscriptionPlan.Trial, "Testphase", 0m, 3, 30, 50, true, true),
        new(SubscriptionPlan.Starter, "Starter", 19m, 1, 100, 100, true, true),
        new(SubscriptionPlan.Team, "Team", 49m, 5, null, 300, true, true),
        new(SubscriptionPlan.Business, "Business", 99m, 20, null, 1000, true, true),
    ];

    public static PlanLimits For(SubscriptionPlan plan) => All.First(p => p.Plan == plan);
}

public enum EntitlementState
{
    Full = 0,
    ReadOnly = 1,
}

/// <summary>Server-side entitlement decisions. Billing state never comes from the client.</summary>
public static class Entitlements
{
    public static EntitlementState Evaluate(Subscription? subscription, DateTimeOffset now)
    {
        if (subscription is null)
        {
            return EntitlementState.ReadOnly;
        }

        return subscription.Status switch
        {
            SubscriptionStatus.Trialing => subscription.TrialEndsAt > now ? EntitlementState.Full : EntitlementState.ReadOnly,
            SubscriptionStatus.Active => subscription.CurrentPeriodEnd is null || subscription.CurrentPeriodEnd > now
                ? EntitlementState.Full
                : (subscription.GraceUntil > now ? EntitlementState.Full : EntitlementState.ReadOnly),
            SubscriptionStatus.PastDue => subscription.GraceUntil > now ? EntitlementState.Full : EntitlementState.ReadOnly,
            SubscriptionStatus.Canceled => subscription.CurrentPeriodEnd > now ? EntitlementState.Full : EntitlementState.ReadOnly,
            _ => EntitlementState.ReadOnly,
        };
    }

    public static PlanLimits EffectiveLimits(Subscription? subscription) =>
        PlanCatalog.For(subscription?.Plan ?? SubscriptionPlan.Trial);
}
