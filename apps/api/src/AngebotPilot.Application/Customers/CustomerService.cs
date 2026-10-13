using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Application.Quotations;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Customers;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Customers;

public sealed record CustomerListQuery(string? Search, CustomerType? Type, string? Status, string? Sort, int Page = 1, int PageSize = 25);

public sealed class CustomerService(IAppDbContext db, BillingService billing, IAuditLog audit, TimeProvider clock)
{
    public async Task<PagedResult<CustomerListItemDto>> ListAsync(CustomerListQuery query, CancellationToken ct)
    {
        var (page, size) = Paging.Normalize(query.Page, query.PageSize);
        var q = db.Customers.AsNoTracking().AsQueryable();
        q = query.Status switch
        {
            "archived" => q.Where(c => c.ArchivedAt != null),
            "all" => q,
            _ => q.Where(c => c.ArchivedAt == null),
        };
        if (query.Type is not null)
        {
            q = q.Where(c => c.Type == query.Type);
        }

        if (Text.Clean(query.Search) is { } search)
        {
            var pattern = $"%{Paging.EscapeLike(search)}%";
            q = q.Where(c => EF.Functions.Like(c.CompanyName ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(c.FirstName ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(c.LastName ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(c.Email ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(c.BillingCity ?? string.Empty, pattern, "\\")
                || EF.Functions.Like(c.Phone ?? string.Empty, pattern, "\\"));
        }

        q = query.Sort switch
        {
            "-name" => q.OrderByDescending(c => c.CompanyName ?? c.LastName).ThenByDescending(c => c.FirstName),
            "createdAt" => q.OrderBy(c => c.CreatedAt),
            "-createdAt" => q.OrderByDescending(c => c.CreatedAt),
            _ => q.OrderBy(c => c.CompanyName ?? c.LastName).ThenBy(c => c.FirstName),
        };

        var total = await q.CountAsync(ct);
        var rows = await q.Skip((page - 1) * size).Take(size)
            .Select(c => new
            {
                Customer = c,
                QuotationCount = db.Quotations.Count(x => x.CustomerId == c.Id && x.DeletedAt == null),
                AcceptedValue = db.Quotations.Where(x => x.CustomerId == c.Id && x.Status == QuotationStatus.Accepted).Sum(x => (decimal?)x.NetTotal) ?? 0m,
            })
            .ToListAsync(ct);
        var items = rows.Select(r => new CustomerListItemDto(
            r.Customer.Id, r.Customer.Type, r.Customer.DisplayName, r.Customer.Type == CustomerType.Business ? r.Customer.ContactPerson : null,
            r.Customer.Email, r.Customer.Phone, r.Customer.BillingCity, r.Customer.ArchivedAt is not null, r.QuotationCount, r.AcceptedValue, r.Customer.CreatedAt)).ToList();
        return new PagedResult<CustomerListItemDto>(items, page, size, total);
    }

    public async Task<CustomerDto> GetAsync(Guid id, CancellationToken ct) => ToDto(await LoadAsync(id, ct, tracking: false));

    public async Task<CustomerDto> CreateAsync(CurrentMember member, UpsertCustomerRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var customer = new Customer { CompanyId = member.CompanyId, CreatedAt = now };
        Apply(customer, request, now);
        db.Customers.Add(customer);
        audit.Record(member.CompanyId, member.UserId, "customer.created", "Customer", customer.Id, customer.DisplayName);
        await db.SaveChangesAsync(ct);
        return ToDto(customer);
    }

    public async Task<CustomerDto> UpdateAsync(CurrentMember member, Guid id, UpsertCustomerRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var customer = await LoadAsync(id, ct);
        if (customer.AnonymizedAt is not null)
        {
            throw new ConflictException("customer_anonymized", "Anonymisierte Kunden können nicht bearbeitet werden.");
        }

        if (request.RowVersion is not null)
        {
            db.SetOriginalRowVersion(customer, RowVersions.Decode(request.RowVersion));
        }

        var now = clock.GetUtcNow();
        var wasOptedOut = customer.FollowUpOptOut;
        Apply(customer, request, now);
        if (!wasOptedOut && customer.FollowUpOptOut)
        {
            await FollowUpCanceller.CancelForCustomerAsync(db, customer.Id, now, "Kunde wünscht keine Erinnerungen", ct);
        }

        audit.Record(member.CompanyId, member.UserId, "customer.updated", "Customer", customer.Id, customer.DisplayName);
        await db.SaveChangesAsync(ct);
        return ToDto(customer);
    }

    public async Task<CustomerDto> SetArchivedAsync(CurrentMember member, Guid id, bool archived, CancellationToken ct)
    {
        var customer = await LoadAsync(id, ct);
        var now = clock.GetUtcNow();
        customer.ArchivedAt = archived ? (customer.ArchivedAt ?? now) : null;
        customer.UpdatedAt = now;
        audit.Record(member.CompanyId, member.UserId, archived ? "customer.archived" : "customer.unarchived", "Customer", customer.Id, null);
        await db.SaveChangesAsync(ct);
        return ToDto(customer);
    }

    /// <summary>
    /// Deletes the customer if no documents reference it. Otherwise personal data is erased (anonymised) while the
    /// quotations and jobs are kept, because commercial documents may be subject to statutory retention periods.
    /// </summary>
    public async Task<string> DeleteAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var customer = await LoadAsync(id, ct);
        var hasDocuments = await db.Quotations.IgnoreQueryFilters().AnyAsync(q => q.CustomerId == id, ct)
            || await db.Jobs.AnyAsync(j => j.CustomerId == id, ct)
            || await db.Invoices.IgnoreQueryFilters().AnyAsync(i => i.CustomerId == id, ct);
        var now = clock.GetUtcNow();
        if (!hasDocuments)
        {
            db.Customers.Remove(customer);
            audit.Record(member.CompanyId, member.UserId, "customer.deleted", "Customer", id, null);
            await db.SaveChangesAsync(ct);
            return "deleted";
        }

        customer.Anonymize(now);
        await FollowUpCanceller.CancelForCustomerAsync(db, id, now, "Kunde anonymisiert", ct);
        // Drafts are not commercial documents yet; remove their personal snapshot as well.
        await db.Quotations.Where(q => q.CustomerId == id && q.Status == QuotationStatus.Draft)
            .ExecuteUpdateAsync(s => s.SetProperty(q => q.RecipientEmail, (string?)null).SetProperty(q => q.RecipientContact, (string?)null).SetProperty(q => q.RecipientAddress, (string?)null), ct);
        await db.Invoices.Where(i => i.CustomerId == id && i.Status == InvoiceStatus.Draft)
            .ExecuteUpdateAsync(s => s.SetProperty(i => i.RecipientEmail, (string?)null).SetProperty(i => i.RecipientContact, (string?)null).SetProperty(i => i.RecipientAddress, (string?)null)
                .SetProperty(i => i.RecipientStreet, (string?)null).SetProperty(i => i.RecipientPostalCode, (string?)null).SetProperty(i => i.RecipientCity, (string?)null), ct);
        audit.Record(member.CompanyId, member.UserId, "customer.anonymized", "Customer", id, null);
        await db.SaveChangesAsync(ct);
        return "anonymized";
    }

    public async Task<byte[]> ExportCsvAsync(CurrentMember member, CancellationToken ct)
    {
        member.Require(MembershipRole.Admin);
        var customers = await db.Customers.AsNoTracking().OrderBy(c => c.CompanyName ?? c.LastName).ToListAsync(ct);
        audit.Record(member.CompanyId, member.UserId, "customer.exported", "Customer", null, $"{customers.Count} Kunden");
        await db.SaveChangesAsync(ct);
        return Csv.Write(
            ["Typ", "Firma", "Anrede", "Vorname", "Nachname", "E-Mail", "Telefon", "Straße", "PLZ", "Ort", "Land", "USt-IdNr.", "Archiviert", "Erstellt"],
            customers.Select(c => new[]
            {
                c.Type == CustomerType.Business ? "Geschäftskunde" : "Privatkunde", c.CompanyName, c.Salutation, c.FirstName, c.LastName, c.Email, c.Phone,
                c.BillingStreet, c.BillingPostalCode, c.BillingCity, c.BillingCountry, c.VatId, c.ArchivedAt is null ? "nein" : "ja",
                c.CreatedAt.ToString("dd.MM.yyyy", System.Globalization.CultureInfo.InvariantCulture),
            }));
    }

    public static CustomerDto ToDto(Customer c) => new(
        c.Id, c.Type, c.DisplayName, c.CompanyName, c.Salutation, c.FirstName, c.LastName, c.Email, c.Phone, c.BillingStreet, c.BillingPostalCode,
        c.BillingCity, c.BillingCountry, c.HasServiceAddress, c.ServiceStreet, c.ServicePostalCode, c.ServiceCity, c.ServiceCountry, c.VatId, c.Notes,
        c.FollowUpOptOut, c.ArchivedAt is not null, c.AnonymizedAt is not null, c.CreatedAt, c.UpdatedAt, RowVersions.Encode(c.RowVersion));

    private async Task<Customer> LoadAsync(Guid id, CancellationToken ct, bool tracking = true)
    {
        var q = tracking ? db.Customers : db.Customers.AsNoTracking();
        return await q.FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException("Der Kunde wurde nicht gefunden.");
    }

    private static void Apply(Customer c, UpsertCustomerRequest r, DateTimeOffset now)
    {
        c.Type = r.Type;
        c.CompanyName = Text.Clean(r.CompanyName);
        c.Salutation = Text.Clean(r.Salutation);
        c.FirstName = Text.Clean(r.FirstName);
        c.LastName = Text.Clean(r.LastName);
        c.Email = Text.Clean(r.Email);
        c.Phone = Text.Clean(r.Phone);
        c.BillingStreet = Text.Clean(r.BillingStreet);
        c.BillingPostalCode = Text.Clean(r.BillingPostalCode);
        c.BillingCity = Text.Clean(r.BillingCity);
        c.BillingCountry = Text.Upper(r.BillingCountry) ?? "DE";
        c.HasServiceAddress = r.HasServiceAddress;
        c.ServiceStreet = r.HasServiceAddress ? Text.Clean(r.ServiceStreet) : null;
        c.ServicePostalCode = r.HasServiceAddress ? Text.Clean(r.ServicePostalCode) : null;
        c.ServiceCity = r.HasServiceAddress ? Text.Clean(r.ServiceCity) : null;
        c.ServiceCountry = r.HasServiceAddress ? Text.Upper(r.ServiceCountry) ?? "DE" : null;
        c.VatId = Text.Upper(r.VatId);
        c.Notes = Text.Clean(r.Notes);
        if (r.FollowUpOptOut && !c.FollowUpOptOut)
        {
            c.FollowUpOptOutAt = now;
        }

        c.FollowUpOptOut = r.FollowUpOptOut;
        c.UpdatedAt = now;
    }
}

public static class Paging
{
    public static (int Page, int Size) Normalize(int page, int size) => (Math.Max(1, page), Math.Clamp(size <= 0 ? 25 : size, 1, 100));

    public static string EscapeLike(string value) => value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[");
}
