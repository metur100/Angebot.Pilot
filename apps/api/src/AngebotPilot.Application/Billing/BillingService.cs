using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Billing;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Billing;

/// <summary>Subscription state and server-side entitlement checks. Billing state is only changed by verified provider events.</summary>
public sealed class BillingService(IAppDbContext db, IBillingProvider provider, IAuditLog audit, TimeProvider clock)
{
    public static Subscription NewTrial(Guid companyId, DateTimeOffset now) => new()
    {
        CompanyId = companyId,
        Plan = SubscriptionPlan.Trial,
        Status = SubscriptionStatus.Trialing,
        TrialEndsAt = now + PlanCatalog.TrialLength,
        Provider = "none",
        UpdatedAt = now,
    };

    public async Task<SubscriptionDto> GetAsync(Guid companyId, CancellationToken ct)
    {
        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);
        var now = clock.GetUtcNow();
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var members = await db.Memberships.CountAsync(m => m.CompanyId == companyId && m.Status == MembershipStatus.Active, ct);
        var quotations = await db.Quotations.CountAsync(q => q.CreatedAt >= monthStart && q.RevisionNumber == 0, ct);
        var limits = Entitlements.EffectiveLimits(sub);
        return new SubscriptionDto(
            sub?.Plan ?? SubscriptionPlan.Trial,
            limits.Name,
            sub?.Status ?? SubscriptionStatus.Expired,
            sub?.TrialEndsAt,
            sub?.CurrentPeriodEnd,
            sub?.GraceUntil,
            sub?.CancelAtPeriodEnd ?? false,
            Entitlements.Evaluate(sub, now) == EntitlementState.Full,
            provider.Name,
            provider.IsLive,
            members,
            quotations,
            PlanCatalog.All.Where(p => p.Plan != SubscriptionPlan.Trial)
                .Select(p => new PlanDto(p.Plan, p.Name, p.MonthlyPriceEur, p.MaxActiveMembers, p.MaxQuotationsPerMonth, p.MaxEmailsPerDay)).ToList());
    }

    public async Task<ChangePlanResponse> ChangePlanAsync(CurrentMember member, SubscriptionPlan plan, string email, CancellationToken ct)
    {
        member.Require(MembershipRole.Owner);
        if (plan == SubscriptionPlan.Trial)
        {
            throw new ConflictException("invalid_plan", "Die Testphase kann nicht erneut gewählt werden.");
        }

        var activeMembers = await db.Memberships.CountAsync(m => m.CompanyId == member.CompanyId && m.Status == MembershipStatus.Active, ct);
        if (activeMembers > PlanCatalog.For(plan).MaxActiveMembers)
        {
            throw new ConflictException("plan_too_small", $"Der Tarif erlaubt höchstens {PlanCatalog.For(plan).MaxActiveMembers} aktive Mitglieder. Deaktivieren Sie zuerst Mitglieder.");
        }

        // The provider either returns a checkout URL, or (mock provider only) delivers a signed webhook immediately.
        var checkout = await provider.StartCheckoutAsync(member.CompanyId, plan, email, ct);
        audit.Record(member.CompanyId, member.UserId, "billing.checkout_started", "Subscription", null, $"Tarif {plan} über {provider.Name}");
        await db.SaveChangesAsync(ct);
        if (checkout.ImmediateWebhookPayload is { } payload)
        {
            // Development mock: apply through the same signature verification as a real provider callback.
            await HandleWebhookAsync(payload, checkout.ImmediateWebhookHeaders ?? new Dictionary<string, string>(), ct);
        }

        return new ChangePlanResponse(checkout.RedirectUrl?.ToString(), checkout.ActivatedImmediately, await GetAsync(member.CompanyId, ct));
    }

    /// <summary>Applies a verified webhook exactly once.</summary>
    public async Task<bool> HandleWebhookAsync(string payload, IReadOnlyDictionary<string, string> headers, CancellationToken ct)
    {
        var evt = provider.VerifyAndParseWebhook(payload, headers);
        if (evt is null)
        {
            return false;
        }

        if (await db.BillingWebhookEvents.AnyAsync(e => e.Provider == provider.Name && e.ProviderEventId == evt.ProviderEventId, ct))
        {
            return true;
        }

        var now = clock.GetUtcNow();
        db.BillingWebhookEvents.Add(new BillingWebhookEvent { Provider = provider.Name, ProviderEventId = evt.ProviderEventId, EventType = evt.EventType, ReceivedAt = now, ProcessedAt = now });
        var sub = await db.Subscriptions.FirstOrDefaultAsync(s => s.CompanyId == evt.CompanyId, ct);
        if (sub is null)
        {
            sub = NewTrial(evt.CompanyId, now);
            db.Subscriptions.Add(sub);
        }

        if (evt.Plan is not null)
        {
            sub.Plan = evt.Plan.Value;
        }

        if (evt.Status is not null)
        {
            sub.Status = evt.Status.Value;
            sub.GraceUntil = evt.Status == SubscriptionStatus.PastDue ? now + PlanCatalog.GracePeriod : null;
        }

        sub.CurrentPeriodEnd = evt.CurrentPeriodEnd ?? sub.CurrentPeriodEnd;
        sub.Provider = provider.Name;
        sub.ProviderCustomerId = evt.ProviderCustomerId ?? sub.ProviderCustomerId;
        sub.ProviderSubscriptionId = evt.ProviderSubscriptionId ?? sub.ProviderSubscriptionId;
        sub.UpdatedAt = now;
        audit.Record(evt.CompanyId, null, "billing.webhook_applied", "Subscription", sub.Id, $"{evt.EventType}: {sub.Plan}/{sub.Status}");
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task EnsureWritableAsync(Guid companyId, CancellationToken ct)
    {
        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);
        if (Entitlements.Evaluate(sub, clock.GetUtcNow()) != EntitlementState.Full)
        {
            throw new EntitlementException("subscription_inactive", "Ihre Testphase bzw. Ihr Abonnement ist abgelaufen. Ihre Daten bleiben lesbar; zum Bearbeiten wählen Sie bitte einen Tarif.");
        }
    }

    public async Task EnsureCanAddMemberAsync(Guid companyId, CancellationToken ct)
    {
        await EnsureWritableAsync(companyId, ct);
        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);
        var limits = Entitlements.EffectiveLimits(sub);
        var now = clock.GetUtcNow();
        var active = await db.Memberships.CountAsync(m => m.CompanyId == companyId && m.Status == MembershipStatus.Active, ct);
        var openInvites = await db.Invitations.CountAsync(i => i.CompanyId == companyId && i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now, ct);
        if (active + openInvites >= limits.MaxActiveMembers)
        {
            throw new EntitlementException("member_limit", $"Ihr Tarif „{limits.Name}“ erlaubt höchstens {limits.MaxActiveMembers} aktive Mitglieder (inkl. offener Einladungen).");
        }
    }

    public async Task EnsureQuotationQuotaAsync(Guid companyId, CancellationToken ct)
    {
        await EnsureWritableAsync(companyId, ct);
        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);
        var limits = Entitlements.EffectiveLimits(sub);
        if (limits.MaxQuotationsPerMonth is null)
        {
            return;
        }

        var now = clock.GetUtcNow();
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var count = await db.Quotations.IgnoreQueryFilters().CountAsync(q => q.CompanyId == companyId && q.CreatedAt >= monthStart && q.RevisionNumber == 0, ct);
        if (count >= limits.MaxQuotationsPerMonth)
        {
            throw new EntitlementException("quotation_limit", $"Ihr Tarif „{limits.Name}“ erlaubt {limits.MaxQuotationsPerMonth} neue Angebote pro Monat.");
        }
    }

    public async Task EnsureEmailQuotaAsync(Guid companyId, CancellationToken ct)
    {
        var sub = await db.Subscriptions.AsNoTracking().FirstOrDefaultAsync(s => s.CompanyId == companyId, ct);
        var limits = Entitlements.EffectiveLimits(sub);
        var since = clock.GetUtcNow().AddDays(-1);
        var count = await db.EmailDeliveries.CountAsync(e => e.CompanyId == companyId && e.CreatedAt > since, ct);
        if (count >= limits.MaxEmailsPerDay)
        {
            throw new EntitlementException("email_limit", $"Das tägliche E-Mail-Limit Ihres Tarifs ({limits.MaxEmailsPerDay}) ist erreicht. Bitte versuchen Sie es später erneut.");
        }
    }
}
