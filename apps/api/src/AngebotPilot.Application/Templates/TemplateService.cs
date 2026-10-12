using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Billing;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain.Quotations;
using AngebotPilot.Domain.Templates;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Templates;

/// <summary>Reusable quotation templates. Creating a quotation copies the template; later edits never change the template.</summary>
public sealed class TemplateService(IAppDbContext db, BillingService billing, IAuditLog audit, TimeProvider clock)
{
    public async Task<IReadOnlyList<TemplateListItemDto>> ListAsync(CancellationToken ct)
    {
        var templates = await db.Templates.AsNoTracking().Include(t => t.LineItems).Where(t => t.ArchivedAt == null).OrderBy(t => t.Name).ToListAsync(ct);
        return templates.Select(t => new TemplateListItemDto(
            t.Id, t.Name, t.Description, t.LineItems.Count,
            t.LineItems.Sum(i => QuotationCalculator.CalculateLine(i.Quantity, i.UnitPriceNet, i.DiscountPercent).Net), t.UpdatedAt)).ToList();
    }

    public async Task<TemplateDto> GetAsync(Guid id, CancellationToken ct) => ToDto(await LoadAsync(id, ct));

    public async Task<TemplateDto> CreateAsync(CurrentMember member, UpsertTemplateRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var now = clock.GetUtcNow();
        var template = new QuotationTemplate { CompanyId = member.CompanyId, Name = request.Name.Trim(), CreatedAt = now };
        Apply(template, request, now);
        db.Templates.Add(template);
        audit.Record(member.CompanyId, member.UserId, "template.created", "Template", template.Id, template.Name);
        await db.SaveChangesAsync(ct);
        return ToDto(template);
    }

    public async Task<TemplateDto> UpdateAsync(CurrentMember member, Guid id, UpsertTemplateRequest request, CancellationToken ct)
    {
        await billing.EnsureWritableAsync(member.CompanyId, ct);
        var template = await LoadAsync(id, ct);
        // Required relationship: removed items are deleted as orphans on save.
        foreach (var item in template.LineItems.ToList())
        {
            template.LineItems.Remove(item);
        }

        Apply(template, request, clock.GetUtcNow());
        audit.Record(member.CompanyId, member.UserId, "template.updated", "Template", template.Id, template.Name);
        await db.SaveChangesAsync(ct);
        return ToDto(template);
    }

    public async Task DeleteAsync(CurrentMember member, Guid id, CancellationToken ct)
    {
        var template = await LoadAsync(id, ct);
        // Archived instead of deleted: quotations keep their SourceTemplateId reference.
        template.ArchivedAt = clock.GetUtcNow();
        audit.Record(member.CompanyId, member.UserId, "template.deleted", "Template", template.Id, template.Name);
        await db.SaveChangesAsync(ct);
    }

    public static TemplateDto ToDto(QuotationTemplate t) => new(
        t.Id, t.Name, t.Description, t.IntroText, t.ClosingText, t.Terms, t.TaxMode,
        t.LineItems.OrderBy(i => i.Position).Select(i => new TemplateLineItemDto(i.Id, i.Position, i.Title, i.Description, i.Quantity, i.Unit, i.UnitPriceNet, i.DiscountPercent, i.TaxRatePercent)).ToList(),
        t.UpdatedAt);

    private static void Apply(QuotationTemplate t, UpsertTemplateRequest r, DateTimeOffset now)
    {
        t.Name = r.Name.Trim();
        t.Description = Text.Clean(r.Description);
        t.IntroText = Text.Clean(r.IntroText);
        t.ClosingText = Text.Clean(r.ClosingText);
        t.Terms = Text.Clean(r.Terms);
        t.TaxMode = r.TaxMode;
        t.UpdatedAt = now;
        var position = 1;
        foreach (var i in r.LineItems)
        {
            t.LineItems.Add(new TemplateLineItem
            {
                Position = position++,
                Title = i.Title.Trim(),
                Description = Text.Clean(i.Description),
                Quantity = i.Quantity,
                Unit = i.Unit.Trim(),
                UnitPriceNet = i.UnitPriceNet,
                DiscountPercent = i.DiscountPercent,
                TaxRatePercent = i.TaxRatePercent,
            });
        }
    }

    private async Task<QuotationTemplate> LoadAsync(Guid id, CancellationToken ct) =>
        await db.Templates.Include(t => t.LineItems).FirstOrDefaultAsync(t => t.Id == id && t.ArchivedAt == null, ct)
            ?? throw new NotFoundException("Die Vorlage wurde nicht gefunden.");
}
