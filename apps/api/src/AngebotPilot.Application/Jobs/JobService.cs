using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Customers;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Jobs;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Jobs;

public sealed record JobListQuery(string? Search, IReadOnlyList<JobStatus>? Statuses, Guid? AssignedUserId, Guid? CustomerId, string? Sort, int Page = 1, int PageSize = 25);

public sealed class JobService(IAppDbContext db, BillingService billing, IAuditLog audit, TimeProvider clock)
{
    private static readonly JobStatus[] AllStatuses = Enum.GetValues<JobStatus>();

    public async Task<PagedResult<JobListItemDto>> ListAsync(JobListQuery query, CancellationToken ct)
    {
        var (page, size) = Paging.Normalize(query.Page, query.PageSize);
        var q = db.Jobs.AsNoTracking().AsQueryable();
        if (query.Statuses is { Count: > 0 } statuses)
        {
            q = q.Where(j => statuses.Contains(j.Status));
        }

        if (query.AssignedUserId is { } assigned)
        {
            q = q.Where(j => j.AssignedUserId == assigned);
        }

        if (query.CustomerId is { } customerId)
        {
            q = q.Where(j => j.CustomerId == customerId);
        }

        if (Text.Clean(query.Search) is { } search)
        {
            var pattern = $"%{Paging.EscapeLike(search)}%";
            q = q.Where(j => EF.Functions.Like(j.Number, pattern, "\\") || EF.Functions.Like(j.Title, pattern, "\\")
                || EF.Functions.Like(j.Quotation!.Number, pattern, "\\") || EF.Functions.Like(j.Quotation!.RecipientName, pattern, "\\"));
        }

        q = query.Sort switch
        {
            "dueDate" => q.OrderBy(j => j.DueDate == null).ThenBy(j => j.DueDate),
            "-dueDate" => q.OrderByDescending(j => j.DueDate),
            "createdAt" => q.OrderBy(j => j.CreatedAt),
            "number" => q.OrderBy(j => j.Number),
            "-number" => q.OrderByDescending(j => j.Number),
            _ => q.OrderByDescending(j => j.CreatedAt),
        };
        var total = await q.CountAsync(ct);
        var items = await Project(q.Skip((page - 1) * size).Take(size)).ToListAsync(ct);
        return new PagedResult<JobListItemDto>(items, page, size, total);
    }

    public async Task<IReadOnlyList<JobListItemDto>> ForCustomerAsync(Guid customerId, CancellationToken ct) =>
        await Project(db.Jobs.AsNoTracking().Where(j => j.CustomerId == customerId).OrderByDescending(j => j.CreatedAt)).ToListAsync(ct);

    public async Task<JobDto> GetAsync(Guid id, CancellationToken ct)
    {
        var j = await db.Jobs.AsNoTracking().Include(x => x.Quotation).Include(x => x.Customer).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new NotFoundException("Der Auftrag wurde nicht gefunden.");
        var assignee = j.AssignedUserId is { } uid ? await db.Users.AsNoTracking().Where(u => u.Id == uid).Select(u => u.DisplayName).FirstOrDefaultAsync(ct) : null;
        return new JobDto(
            j.Id, j.Number, j.Title, j.Description, j.Status, j.CustomerId, j.Customer?.DisplayName ?? j.Quotation!.RecipientName, j.QuotationId, j.Quotation!.Number,
            j.Quotation.NetTotal, j.Quotation.GrossTotal, j.PlannedStartDate, j.DueDate, j.AssignedUserId, assignee, j.Notes, j.CreatedAt, j.UpdatedAt,
            j.StartedAt, j.CompletedAt, j.CancelledAt, AllStatuses.Where(s => Job.CanTransition(j.Status, s)).ToList(), RowVersions.Encode(j.RowVersion));
    }

    public async Task<JobDto> UpdateAsync(CurrentMember member, Guid id, UpdateJobRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var job = await LoadAsync(id, ct);
        db.SetOriginalRowVersion(job, RowVersions.Decode(request.RowVersion));
        if (request.AssignedUserId is { } assignee && assignee != job.AssignedUserId
            && !await db.Memberships.AnyAsync(m => m.CompanyId == member.CompanyId && m.UserId == assignee && m.Status == MembershipStatus.Active, ct))
        {
            throw new FluentValidation.ValidationException([new FluentValidation.Results.ValidationFailure("assignedUserId", "Die Person ist kein aktives Mitglied der Firma.")]);
        }

        job.Title = request.Title.Trim();
        job.Description = Text.Clean(request.Description);
        job.PlannedStartDate = request.PlannedStartDate;
        job.DueDate = request.DueDate;
        job.AssignedUserId = request.AssignedUserId;
        job.Notes = Text.Clean(request.Notes);
        job.UpdatedAt = clock.GetUtcNow();
        audit.Record(member.CompanyId, member.UserId, "job.updated", "Job", job.Id, job.Number);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<JobDto> ChangeStatusAsync(CurrentMember member, Guid id, JobStatus status, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var job = await LoadAsync(id, ct);
        job.ChangeStatus(status, clock.GetUtcNow());
        audit.Record(member.CompanyId, member.UserId, "job.status_changed", "Job", job.Id, $"{job.Number}: {status}");
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task<byte[]> ExportCsvAsync(CurrentMember member, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var rows = await Project(db.Jobs.AsNoTracking().OrderBy(j => j.Number)).ToListAsync(ct);
        audit.Record(member.CompanyId, member.UserId, "job.exported", "Job", null, $"{rows.Count} Aufträge");
        await db.SaveChangesAsync(ct);
        return Csv.Write(
            ["Nummer", "Titel", "Status", "Kunde", "Angebot", "Geplanter Start", "Fällig", "Zuständig", "Auftragswert netto (EUR)"],
            rows.Select(r => new[]
            {
                r.Number, r.Title, StatusLabel(r.Status), r.CustomerName, r.QuotationNumber, Csv.Date(r.PlannedStartDate), Csv.Date(r.DueDate), r.AssignedUserName, Csv.Money(r.NetValue),
            }));
    }

    public static string StatusLabel(JobStatus status) => status switch
    {
        JobStatus.Open => "Offen",
        JobStatus.InProgress => "In Arbeit",
        JobStatus.Completed => "Abgeschlossen",
        JobStatus.Cancelled => "Storniert",
        _ => status.ToString(),
    };

    private IQueryable<JobListItemDto> Project(IQueryable<Job> q) =>
        q.Select(j => new JobListItemDto(
            j.Id, j.Number, j.Title, j.Status, j.CustomerId, j.Quotation!.RecipientName, j.QuotationId, j.Quotation.Number, j.PlannedStartDate, j.DueDate,
            j.AssignedUserId, db.Users.Where(u => u.Id == j.AssignedUserId).Select(u => u.DisplayName).FirstOrDefault(), j.Quotation.NetTotal, j.CreatedAt));

    private async Task<Job> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Jobs.FirstOrDefaultAsync(j => j.Id == id, ct) ?? throw new NotFoundException("Der Auftrag wurde nicht gefunden.");
}
