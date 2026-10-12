using System.Threading.Channels;
using AngebotPilot.Application.Background;
using AngebotPilot.Application.Emails;

namespace AngebotPilot.Api.Infrastructure;

public sealed class JobsOptions
{
    public const string Section = "Jobs";

    /// <summary>Runs the in-process scheduler. Keep enabled; on hosts that recycle idle apps also configure the external trigger.</summary>
    public bool EnableHostedScheduler { get; set; } = true;

    public TimeSpan Interval { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>Shared secret for POST /api/internal/jobs/run (min. 32 characters). Leave empty to disable the endpoint.</summary>
    public string? TriggerSecret { get; set; }
}

/// <summary>Wakes the hosted dispatcher when an email was queued, so customers do not wait for the next interval.</summary>
public sealed class EmailDispatchSignal : IEmailDispatchSignal
{
    private readonly Channel<bool> _channel = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });

    public ChannelReader<bool> Reader => _channel.Reader;

    public void Notify() => _channel.Writer.TryWrite(true);
}

/// <summary>
/// In-process scheduler. It is a convenience, not the only mechanism: all state lives in the database, and an
/// external scheduler can call the authenticated jobs endpoint when the host has unloaded the application.
/// </summary>
public sealed class BackgroundJobsService(IServiceScopeFactory scopes, EmailDispatchSignal signal, JobsOptions options, ILogger<BackgroundJobsService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        var nextFullRun = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var runner = scope.ServiceProvider.GetRequiredService<JobRunner>();
                if (DateTimeOffset.UtcNow >= nextFullRun)
                {
                    var result = await runner.RunAllAsync(stoppingToken);
                    nextFullRun = DateTimeOffset.UtcNow + options.Interval;
                    if (result.EmailsHandedOff + result.FollowUpsQueued + result.QuotationsExpired + result.EmailsFailed > 0)
                    {
                        logger.LogInformation("Scheduled jobs: {@Result}", result);
                    }
                }
                else
                {
                    await runner.DispatchOnlyAsync(stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Scheduled job run failed");
            }

            using var wait = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            wait.CancelAfter(options.Interval);
            try
            {
                await signal.Reader.ReadAsync(wait.Token);
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                // Interval elapsed.
            }
        }
    }
}

/// <summary>Removes raw request paths (which can contain public quotation tokens) from every log event.</summary>
public sealed class RemoveRequestPathEnricher : Serilog.Core.ILogEventEnricher
{
    public void Enrich(Serilog.Events.LogEvent logEvent, Serilog.Core.ILogEventPropertyFactory propertyFactory)
    {
        logEvent.RemovePropertyIfPresent("RequestPath");
        logEvent.RemovePropertyIfPresent("QueryString");
    }
}
