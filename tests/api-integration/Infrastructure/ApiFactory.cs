using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using AngebotPilot.Application.Background;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Infrastructure.Email;
using AngebotPilot.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace AngebotPilot.IntegrationTests.Infrastructure;

/// <summary>
/// Hosts the real API against a throw-away SQL Server database (LocalDB by default, or TEST_SQLSERVER_CONNECTION
/// for CI with a SQL Server container). Storage is in-memory, emails are captured, the clock is controllable.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string JobsSecret = "integration-test-jobs-secret-0123456789abcdef";
    private readonly string _databaseName = $"AngebotPilot_Test_{Guid.NewGuid():N}";

    public FakeTimeProvider Clock { get; } = new(DateTimeOffset.UtcNow);

    public string ConnectionString { get; }

    public ApiFactory()
    {
        var server = Environment.GetEnvironmentVariable("TEST_SQLSERVER_CONNECTION")
            ?? "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";
        ConnectionString = new SqlConnectionStringBuilder(server) { InitialCatalog = _databaseName }.ConnectionString;
    }

    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-which-is-long-enough-123456");
        builder.UseSetting("Billing:WebhookSecret", "integration-test-webhook-secret");
        builder.UseSetting("Billing:MockAllowsSelfService", "true");
        builder.UseSetting("Jobs:EnableHostedScheduler", "false");
        builder.UseSetting("Jobs:TriggerSecret", JobsSecret);
        builder.UseSetting("Storage:Provider", "Memory");
        builder.UseSetting("Email:Provider", "Capture");
        builder.UseSetting("Email:CaptureDirectory", string.Empty);
        builder.UseSetting("RateLimits:Scale", "1000");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("App:WebBaseUrl", "https://web.test/#");
        builder.UseSetting("Cors:AllowedOrigins:0", "https://web.test");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }

    public async Task InitializeAsync()
    {
        // Starting the host applies all migrations to the fresh database.
        using var client = CreateClient();
        var response = await client.GetAsync("/health/ready");
        response.EnsureSuccessStatusCode();
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var connection = new SqlConnection(new SqlConnectionStringBuilder(ConnectionString) { InitialCatalog = "master" }.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"IF DB_ID('{_databaseName}') IS NOT NULL BEGIN ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]; END";
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>Runs all scheduled work (expiry, follow-ups, email dispatch, cleanup) like the hosted scheduler would.</summary>
    public async Task<JobRunResult> RunJobsAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<JobRunner>().RunAllAsync(default);
    }

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public static IReadOnlyList<CapturedEmail> EmailsTo(string address) =>
        CaptureEmailSender.All.Where(m => string.Equals(m.To, address, StringComparison.OrdinalIgnoreCase)).OrderBy(m => m.CreatedAt).ToList();

    public async Task<TestUser> RegisterAsync(string? name = null, bool verify = true)
    {
        var email = $"user-{Guid.NewGuid():N}@test.example";
        var client = CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(email, "Sicheres-Passwort-1", name ?? "Test Nutzer", true), Json);
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var user = new TestUser(this, client, email, auth.User.Id, auth.RefreshToken!);
        if (verify)
        {
            await RunJobsAsync();
            var token = ExtractToken(EmailsTo(email).Last(m => m.Subject.Contains("bestätigen", StringComparison.Ordinal)).BodyText, "verify-email?token=");
            (await client.PostAsJsonAsync("/api/v1/auth/verify-email", new VerifyEmailRequest(token), Json)).EnsureSuccessStatusCode();
        }

        return user;
    }

    public static string ExtractToken(string body, string marker)
    {
        var start = body.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"'{marker}' not found in email body");
        start += marker.Length;
        var end = start;
        while (end < body.Length && (char.IsAsciiLetterOrDigit(body[end]) || body[end] is '-' or '_'))
        {
            end++;
        }

        return body[start..end];
    }

    public static string ExtractPublicToken(string body) => ExtractToken(body, "/q/");

    public async Task<int> CountAsync<TEntity>(Func<IQueryable<TEntity>, IQueryable<TEntity>> filter)
        where TEntity : class =>
        await WithDbAsync(db => filter(db.Set<TEntity>().IgnoreQueryFilters()).CountAsync());
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
