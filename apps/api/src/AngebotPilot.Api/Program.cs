using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using AngebotPilot.Api.Endpoints;
using AngebotPilot.Api.Infrastructure;
using AngebotPilot.Application;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Auth;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Emails;
using AngebotPilot.Infrastructure;
using AngebotPilot.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Server.IIS;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((ctx, services, log) => log
    .ReadFrom.Configuration(ctx.Configuration)
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .Enrich.With<RemoveRequestPathEnricher>()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"));

var config = builder.Configuration;
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<AppOptions>(config.GetSection(AppOptions.Section));
builder.Services.Configure<AuthOptions>(config.GetSection(AuthOptions.Section));
builder.Services.Configure<JwtOptions>(config.GetSection(JwtOptions.Section));
var jobsOptions = config.GetSection(JobsOptions.Section).Get<JobsOptions>() ?? new JobsOptions();
builder.Services.AddSingleton(jobsOptions);

builder.Services.AddApplication();
builder.Services.AddInfrastructure(config, builder.Environment);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();
builder.Services.AddSingleton<EmailDispatchSignal>();
builder.Services.AddSingleton<IEmailDispatchSignal>(sp => sp.GetRequiredService<EmailDispatchSignal>());
if (jobsOptions.EnableHostedScheduler)
{
    builder.Services.AddHostedService<BackgroundJobsService>();
}

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});

var jwt = config.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = jwt.CreateKey(),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = "name",
    };
});
builder.Services.AddAuthorization();

var allowedOrigins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition").SetPreflightMaxAge(TimeSpan.FromHours(1));
    if (config.GetValue<string>("Auth:WebRefreshTransport") == "Cookie")
    {
        p.AllowCredentials();
    }
}));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.ContentType = "application/problem+json";
        await ctx.HttpContext.Response.WriteAsJsonAsync(
            new { status = 429, code = "rate_limited", title = "Zu viele Anfragen", detail = "Bitte warten Sie einen Moment und versuchen Sie es erneut." }, ct);
    };
    var scale = config.GetValue("RateLimits:Scale", 1);
    static string Ip(HttpContext h) => h.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    o.AddPolicy("auth", h => RateLimitPartition.GetSlidingWindowLimiter(Ip(h), _ => new SlidingWindowRateLimiterOptions { PermitLimit = 20 * scale, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6 }));
    o.AddPolicy("password-reset", h => RateLimitPartition.GetFixedWindowLimiter(Ip(h), _ => new FixedWindowRateLimiterOptions { PermitLimit = 5 * scale, Window = TimeSpan.FromMinutes(15) }));
    o.AddPolicy("public", h => RateLimitPartition.GetSlidingWindowLimiter(Ip(h), _ => new SlidingWindowRateLimiterOptions { PermitLimit = 60 * scale, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6 }));
    o.AddPolicy("send", h => RateLimitPartition.GetFixedWindowLimiter(h.User.FindFirst("sub")?.Value ?? Ip(h), _ => new FixedWindowRateLimiterOptions { PermitLimit = 30 * scale, Window = TimeSpan.FromMinutes(10) }));
    o.AddPolicy("upload", h => RateLimitPartition.GetFixedWindowLimiter(h.User.FindFirst("sub")?.Value ?? Ip(h), _ => new FixedWindowRateLimiterOptions { PermitLimit = 20 * scale, Window = TimeSpan.FromMinutes(10) }));
    o.AddPolicy("jobs", _ => RateLimitPartition.GetFixedWindowLimiter("jobs", _ => new FixedWindowRateLimiterOptions { PermitLimit = 12 * scale, Window = TimeSpan.FromMinutes(1) }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(h =>
        RateLimitPartition.GetSlidingWindowLimiter(h.User.FindFirst("sub")?.Value ?? Ip(h), _ => new SlidingWindowRateLimiterOptions { PermitLimit = 600 * scale, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6 }));
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.Configure<IISServerOptions>(o => o.MaxRequestBodySize = 4 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 4 * 1024 * 1024);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
    o.ForwardLimit = 1;
});

var app = builder.Build();

// CLI: `dotnet AngebotPilot.Api.dll migrate` applies migrations; `seed-demo` creates the labelled demo company (non-production only).
if (args.Contains("migrate") || args.Contains("seed-demo"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (args.Contains("migrate"))
    {
        await db.Database.MigrateAsync();
        Log.Information("Database migrated");
    }

    if (args.Contains("seed-demo"))
    {
        if (app.Environment.IsProduction() && !args.Contains("--allow-production-demo"))
        {
            Log.Error("Refusing to seed demo data in Production");
            return 1;
        }

        await DemoSeeder.SeedAsync(scope.ServiceProvider);
    }

    return 0;
}

if (config.GetValue("Database:MigrateOnStartup", false))
{
    // Only additive migrations are applied automatically (see docs/architecture/DATABASE.md).
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

// Only behind a trusted reverse proxy; otherwise clients could spoof their IP for rate limiting.
if (config.GetValue("Network:TrustForwardedHeaders", false))
{
    app.UseForwardedHeaders();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseSerilogRequestLogging(o =>
{
    // Never log query strings: public tokens may appear there.
    o.MessageTemplate = "HTTP {RequestMethod} {RequestPathTemplate} responded {StatusCode} in {Elapsed:0} ms";
    o.EnrichDiagnosticContext = (diag, http) => diag.Set("RequestPathTemplate", ProblemExceptionHandler.RouteOf(http));
    o.GetMessageTemplateProperties = (http, _, elapsed, status) =>
    [
        new LogEventProperty("RequestMethod", new ScalarValue(http.Request.Method)),
        new LogEventProperty("StatusCode", new ScalarValue(status)),
        new LogEventProperty("Elapsed", new ScalarValue(elapsed)),
    ];
});
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(o => o.SwaggerEndpoint("/openapi/v1.json", "AngebotPilot API v1"));
}

app.MapGet("/", () => Results.Ok(new { service = "AngebotPilot API", docs = "/health" })).ExcludeFromDescription();
app.MapApi();
await app.RunAsync();
return 0;

/// <summary>Entry point marker for WebApplicationFactory in integration tests.</summary>
public partial class Program;
