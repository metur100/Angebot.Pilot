using System.Net;
using System.Net.Http.Json;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;

namespace AngebotPilot.IntegrationTests.Infrastructure;

/// <summary>An authenticated API client with helpers for common business setup.</summary>
public sealed class TestUser(ApiFactory factory, HttpClient client, string email, Guid userId, string refreshToken)
{
    public HttpClient Client { get; } = client;

    public string Email { get; } = email;

    public Guid UserId { get; } = userId;

    public string RefreshToken { get; } = refreshToken;

    public Guid CompanyId { get; private set; }

    public string C => $"/api/v1/companies/{CompanyId}";

    public async Task<CompanyDto> CreateCompanyAsync(string name = "Testfirma GmbH", TaxMode mode = TaxMode.Standard)
    {
        var company = await PostAsync<CompanyDto>("/api/v1/companies", new CreateCompanyRequest(name, "Teststraße 1", "50667", "Köln", "DE", "firma@test.example", null, null, mode, "AN"));
        CompanyId = company.Id;
        return company;
    }

    public void UseCompany(Guid companyId) => CompanyId = companyId;

    public Task<CustomerDto> CreateCustomerAsync(string? email = null, string company = "Kunde AG") =>
        PostAsync<CustomerDto>($"{C}/customers", new UpsertCustomerRequest(CustomerType.Business, company, "Frau", "Erika", "Musterfrau",
            email ?? $"kunde-{Guid.NewGuid():N}@test.example", null, "Kundenweg 2", "10115", "Berlin", "DE", false, null, null, null, null, null, null, false, null));

    public Task<QuotationDto> CreateQuotationAsync(Guid customerId, params LineItemInput[] items) =>
        PostAsync<QuotationDto>($"{C}/quotations", new CreateQuotationRequest(customerId, "Testangebot", null, null, null, TaxMode.Standard, "Einleitung", "Schluss", null, null, "intern", items.Length == 0 ? DefaultItems : items));

    public static readonly LineItemInput[] DefaultItems =
    [
        new("Montage", "Arbeitszeit", 2.5m, "Std.", 48m, 10, 19),
        new("Material", null, 3, "Stk.", 19.99m, 0, 19),
        new("Fachbuch", null, 1, "Stk.", 12.35m, 0, 7),
    ];

    public Task<SendQuotationResponse> SendAsync(Guid quotationId, bool followUps = true, SendMode mode = SendMode.Email) =>
        PostAsync<SendQuotationResponse>($"{C}/quotations/{quotationId}/send", new SendQuotationRequest(mode, null, null, null, true, true, followUps));

    public async Task<T> GetAsync<T>(string url)
    {
        var response = await Client.GetAsync(url);
        await EnsureAsync(response, url);
        return (await response.Content.ReadFromJsonAsync<T>(ApiFactory.Json))!;
    }

    public async Task<T> PostAsync<T>(string url, object? body = null)
    {
        var response = await Client.PostAsJsonAsync(url, body ?? new { }, ApiFactory.Json);
        await EnsureAsync(response, url);
        return (await response.Content.ReadFromJsonAsync<T>(ApiFactory.Json))!;
    }

    public async Task<T> PutAsync<T>(string url, object body)
    {
        var response = await Client.PutAsJsonAsync(url, body, ApiFactory.Json);
        await EnsureAsync(response, url);
        return (await response.Content.ReadFromJsonAsync<T>(ApiFactory.Json))!;
    }

    public Task<HttpResponseMessage> RawPostAsync(string url, object? body = null) => Client.PostAsJsonAsync(url, body ?? new { }, ApiFactory.Json);

    public Task<HttpResponseMessage> RawPutAsync(string url, object body) => Client.PutAsJsonAsync(url, body, ApiFactory.Json);

    public Task<HttpResponseMessage> RawGetAsync(string url) => Client.GetAsync(url);

    public ApiFactory Factory => factory;

    private static async Task EnsureAsync(HttpResponseMessage response, string url)
    {
        if (!response.IsSuccessStatusCode)
        {
            Assert.Fail($"{response.RequestMessage?.Method} {url} → {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        }
    }
}

public static class ProblemAssert
{
    public static async Task HasAsync(HttpResponseMessage response, HttpStatusCode status, string? code = null)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"Expected {(int)status} but got {(int)response.StatusCode}: {body}");
        if (code is not null)
        {
            Assert.Contains($"\"code\":\"{code}\"", body.Replace(" ", string.Empty, StringComparison.Ordinal), StringComparison.Ordinal);
        }
    }
}
