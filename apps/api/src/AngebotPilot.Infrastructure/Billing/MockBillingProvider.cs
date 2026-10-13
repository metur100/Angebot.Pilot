using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Domain;

namespace AngebotPilot.Infrastructure.Billing;

public sealed class BillingOptions
{
    public const string Section = "Billing";

    /// <summary>Only "mock" exists until a real provider (e.g. Stripe, Paddle) is integrated.</summary>
    public string Provider { get; set; } = "mock";

    /// <summary>Development/test only: lets the mock provider activate plans without payment.</summary>
    public bool MockAllowsSelfService { get; set; }

    /// <summary>HMAC secret used to sign and verify webhook payloads.</summary>
    public string WebhookSecret { get; set; } = string.Empty;
}

/// <summary>
/// Clearly labelled mock provider. It never takes payments. With <see cref="BillingOptions.MockAllowsSelfService"/>
/// (development/tests) it issues a signed webhook that goes through the normal verification path; otherwise plan
/// changes are refused until a real provider is configured.
/// </summary>
public sealed class MockBillingProvider(BillingOptions options, TimeProvider clock) : IBillingProvider
{
    public const string SignatureHeader = "X-Mock-Signature";

    public string Name => "mock";

    public bool IsLive => false;

    public Task<BillingCheckout> StartCheckoutAsync(Guid companyId, SubscriptionPlan plan, string customerEmail, CancellationToken cancellationToken)
    {
        if (!options.MockAllowsSelfService)
        {
            throw new ConflictException("billing_unavailable", "Die Online-Bezahlung ist noch nicht verfügbar. Während der Pilotphase richten wir Tarife auf Anfrage ein.");
        }

        var payload = JsonSerializer.Serialize(new MockEvent(
            $"mock_evt_{Guid.NewGuid():N}", "subscription.activated", companyId, plan, SubscriptionStatus.Active, clock.GetUtcNow().AddMonths(1),
            $"mock_cus_{companyId:N}", $"mock_sub_{companyId:N}"));
        return Task.FromResult(new BillingCheckout(null, true, payload, new Dictionary<string, string> { [SignatureHeader] = Sign(payload) }));
    }

    public BillingWebhook? VerifyAndParseWebhook(string payload, IReadOnlyDictionary<string, string> headers)
    {
        // The mock provider never accepts external webhooks unless self-service is explicitly enabled (development/tests).
        if (!options.MockAllowsSelfService || string.IsNullOrEmpty(options.WebhookSecret) || !headers.TryGetValue(SignatureHeader, out var signature))
        {
            return null;
        }

        var expected = Convert.FromHexString(Sign(payload));
        byte[] actual;
        try
        {
            actual = Convert.FromHexString(signature);
        }
        catch (FormatException)
        {
            return null;
        }

        if (!CryptographicOperations.FixedTimeEquals(expected, actual))
        {
            return null;
        }

        var evt = JsonSerializer.Deserialize<MockEvent>(payload);
        return evt is null ? null : new BillingWebhook(evt.Id, evt.Type, evt.CompanyId, evt.Plan, evt.Status, evt.CurrentPeriodEnd, evt.CustomerId, evt.SubscriptionId);
    }

    public string Sign(string payload)
    {
        if (string.IsNullOrEmpty(options.WebhookSecret))
        {
            throw new InvalidOperationException("Billing:WebhookSecret is not configured.");
        }

        return Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(options.WebhookSecret), Encoding.UTF8.GetBytes(payload)));
    }

    private sealed record MockEvent(string Id, string Type, Guid CompanyId, SubscriptionPlan Plan, SubscriptionStatus Status, DateTimeOffset CurrentPeriodEnd, string CustomerId, string SubscriptionId);
}
