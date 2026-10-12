using AngebotPilot.Domain.Common;
using AngebotPilot.Domain.Companies;

namespace AngebotPilot.Domain.FollowUps;

public sealed class FollowUpSchedule : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public Guid QuotationId { get; set; }

    public FollowUpKind Kind { get; set; }

    public DateTimeOffset DueAt { get; set; }

    public FollowUpStatus Status { get; set; }

    public Guid? EmailDeliveryId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? ProcessedAt { get; set; }

    public string? StatusReason { get; set; }

    public void Cancel(DateTimeOffset now, string reason)
    {
        if (Status != FollowUpStatus.Scheduled)
        {
            return;
        }

        Status = FollowUpStatus.Cancelled;
        ProcessedAt = now;
        StatusReason = reason;
    }
}

public sealed record PlannedFollowUp(FollowUpKind Kind, DateTimeOffset DueAt);

/// <summary>
/// Calculates when reminders are due. Reminders are sent at 09:00 company-local time,
/// never after the quotation's validity date and never closer than <see cref="MinimumGap"/> to the
/// previous message (the original email or an earlier reminder), as an anti-spam safeguard.
/// </summary>
public static class FollowUpPlanner
{
    public static readonly TimeSpan MinimumGap = TimeSpan.FromHours(48);
    public static readonly TimeOnly SendTime = new(9, 0);

    public static IReadOnlyList<PlannedFollowUp> Plan(CompanySettings settings, DateTimeOffset sentAt, DateOnly validUntil, TimeZoneInfo timeZone)
    {
        var sentLocalDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(sentAt, timeZone).DateTime);
        var candidates = new List<PlannedFollowUp>();

        if (settings.FirstReminderEnabled && settings.FirstReminderAfterDays > 0)
        {
            Add(candidates, FollowUpKind.FirstReminder, sentLocalDate.AddDays(settings.FirstReminderAfterDays), validUntil, timeZone);
        }

        if (settings.SecondReminderEnabled && settings.SecondReminderAfterDays > settings.FirstReminderAfterDays)
        {
            Add(candidates, FollowUpKind.SecondReminder, sentLocalDate.AddDays(settings.SecondReminderAfterDays), validUntil, timeZone);
        }

        if (settings.ExpiryReminderEnabled && settings.ExpiryReminderDaysBefore > 0)
        {
            Add(candidates, FollowUpKind.ExpiryReminder, validUntil.AddDays(-settings.ExpiryReminderDaysBefore), validUntil, timeZone);
        }

        var result = new List<PlannedFollowUp>();
        var previous = sentAt;
        foreach (var candidate in candidates.OrderBy(c => c.DueAt))
        {
            if (candidate.DueAt - previous < MinimumGap)
            {
                continue;
            }

            result.Add(candidate);
            previous = candidate.DueAt;
        }

        return result;
    }

    private static void Add(List<PlannedFollowUp> list, FollowUpKind kind, DateOnly localDate, DateOnly validUntil, TimeZoneInfo timeZone)
    {
        if (localDate > validUntil)
        {
            return;
        }

        var local = localDate.ToDateTime(SendTime, DateTimeKind.Unspecified);
        var offset = timeZone.GetUtcOffset(local);
        list.Add(new PlannedFollowUp(kind, new DateTimeOffset(local, offset).ToUniversalTime()));
    }
}
