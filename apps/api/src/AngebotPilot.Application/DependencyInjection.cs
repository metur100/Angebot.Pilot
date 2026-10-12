using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Auth;
using AngebotPilot.Application.Background;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Companies;
using AngebotPilot.Application.Customers;
using AngebotPilot.Application.Dashboard;
using AngebotPilot.Application.Emails;
using AngebotPilot.Application.Files;
using AngebotPilot.Application.Jobs;
using AngebotPilot.Application.Public;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Application.Templates;
using AngebotPilot.Domain.Users;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace AngebotPilot.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<Validation.RegisterRequestValidator>(includeInternalTypes: true);
        services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<ITenantContext, TenantContext>();
        services.AddScoped<IAuditLog, AuditLog>();
        services.AddScoped<IEmailOutbox, EmailOutbox>();
        services.AddScoped<AuthService>();
        services.AddScoped<CompanyAccess>();
        services.AddScoped<CompanyService>();
        services.AddScoped<ICompanyDeletion>(sp => sp.GetRequiredService<CompanyService>());
        services.AddScoped<BillingService>();
        services.AddScoped<FileService>();
        services.AddScoped<CustomerService>();
        services.AddScoped<DocumentNumbering>();
        services.AddScoped<PublicLinks>();
        services.AddScoped<QuotationPdfFactory>();
        services.AddScoped<NotificationService>();
        services.AddScoped<QuotationService>();
        services.AddScoped<JobService>();
        services.AddScoped<TemplateService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<PublicQuotationService>();
        services.AddScoped<JobRunner>();
        return services;
    }
}
