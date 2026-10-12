using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Background;
using AngebotPilot.Infrastructure.Billing;
using AngebotPilot.Infrastructure.Email;
using AngebotPilot.Infrastructure.Pdf;
using AngebotPilot.Infrastructure.Persistence;
using AngebotPilot.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AngebotPilot.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is not configured.");
        services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connectionString, sql =>
        {
            sql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName);
            sql.CommandTimeout(30);
        }));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IDistributedLock, SqlServerDistributedLock>();
        services.AddSingleton<IQuotationPdfRenderer, QuotationPdfRenderer>();

        // Object storage
        var storage = configuration.GetSection(StorageOptions.Section).Get<StorageOptions>() ?? new StorageOptions();
        switch (storage.Provider.ToUpperInvariant())
        {
            case "S3":
                services.AddSingleton<IFileStorageService>(_ => new S3FileStorage(storage));
                break;
            case "MEMORY":
                services.AddSingleton<IFileStorageService, InMemoryFileStorage>();
                break;
            default:
                var root = Path.IsPathRooted(storage.LocalRoot) ? storage.LocalRoot : Path.Combine(environment.ContentRootPath, storage.LocalRoot);
                services.AddSingleton<IFileStorageService>(_ => new LocalFileStorage(root));
                break;
        }

        // Email
        var email = configuration.GetSection(EmailOptions.Section).Get<EmailOptions>() ?? new EmailOptions();
        services.AddSingleton(email);
        if (string.Equals(email.Provider, "Smtp", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(email.SmtpHost))
            {
                throw new InvalidOperationException("Email:Provider=Smtp requires Email:SmtpHost.");
            }

            services.AddSingleton<IEmailSender, SmtpEmailSender>();
        }
        else
        {
            if (environment.IsProduction())
            {
                // Production without SMTP keeps working, but nothing is delivered; logged loudly.
                services.AddSingleton<IEmailSender>(sp =>
                {
                    sp.GetRequiredService<ILoggerFactory>().CreateLogger("Email").LogWarning(
                        "Email:Provider is not 'Smtp' in Production. Emails are captured in memory only and NOT delivered.");
                    return new CaptureEmailSender(email, sp.GetRequiredService<TimeProvider>());
                });
            }
            else
            {
                services.AddSingleton<IEmailSender, CaptureEmailSender>();
            }
        }

        // Billing
        var billing = configuration.GetSection(BillingOptions.Section).Get<BillingOptions>() ?? new BillingOptions();
        services.AddSingleton(billing);
        services.AddSingleton<IBillingProvider, MockBillingProvider>();
        return services;
    }
}
