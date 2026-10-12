namespace AngebotPilot.Domain.Quotations;

public readonly record struct LineInput(decimal Quantity, decimal UnitPriceNet, decimal DiscountPercent, decimal TaxRatePercent);

public sealed record TaxGroup(decimal RatePercent, decimal NetAmount, decimal TaxAmount);

public sealed record QuotationTotals(
    decimal SubtotalBeforeDiscount,
    decimal DiscountTotal,
    decimal NetTotal,
    IReadOnlyList<TaxGroup> TaxGroups,
    decimal TaxTotal,
    decimal GrossTotal);

/// <summary>
/// Monetary calculation rules. All arithmetic uses <see cref="decimal"/>.
/// <list type="number">
/// <item>Line gross-before-discount = round(quantity × unit price, 2).</item>
/// <item>Line discount = round(line gross-before-discount × discount% / 100, 2).</item>
/// <item>Line net = line gross-before-discount − line discount.</item>
/// <item>Net total = Σ line net.</item>
/// <item>VAT is calculated once per tax rate on the summed net of that rate: round(Σ net × rate / 100, 2).</item>
/// <item>Gross total = net total + Σ VAT.</item>
/// </list>
/// Rounding is commercial rounding (half away from zero), as is customary in Germany.
/// Under <see cref="TaxMode.SmallBusiness"/> and <see cref="TaxMode.ReverseCharge"/> no VAT is charged.
/// </summary>
public static class QuotationCalculator
{
    public const decimal MaxQuantity = 1_000_000m;
    public const decimal MaxUnitPrice = 10_000_000m;
    public const int MaxLineItems = 200;

    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static (decimal BeforeDiscount, decimal Discount, decimal Net) CalculateLine(decimal quantity, decimal unitPriceNet, decimal discountPercent)
    {
        ValidateLine(quantity, unitPriceNet, discountPercent);
        var beforeDiscount = Round(quantity * unitPriceNet);
        var discount = Round(beforeDiscount * discountPercent / 100m);
        return (beforeDiscount, discount, beforeDiscount - discount);
    }

    public static QuotationTotals Calculate(IEnumerable<LineInput> lines, TaxMode taxMode)
    {
        decimal subtotal = 0, discountTotal = 0, netTotal = 0;
        var netByRate = new SortedDictionary<decimal, decimal>();

        foreach (var line in lines)
        {
            if (line.TaxRatePercent is < 0 or > 100)
            {
                throw new ArgumentOutOfRangeException(nameof(lines), "Der Steuersatz muss zwischen 0 und 100 % liegen.");
            }

            var (before, discount, net) = CalculateLine(line.Quantity, line.UnitPriceNet, line.DiscountPercent);
            subtotal += before;
            discountTotal += discount;
            netTotal += net;

            var rate = taxMode == TaxMode.Standard ? line.TaxRatePercent : 0m;
            netByRate[rate] = netByRate.GetValueOrDefault(rate) + net;
        }

        var groups = netByRate
            .OrderByDescending(kv => kv.Key)
            .Select(kv => new TaxGroup(kv.Key, kv.Value, Round(kv.Value * kv.Key / 100m)))
            .ToList();
        var taxTotal = groups.Sum(g => g.TaxAmount);

        return new QuotationTotals(subtotal, discountTotal, netTotal, groups, taxTotal, netTotal + taxTotal);
    }

    private static void ValidateLine(decimal quantity, decimal unitPriceNet, decimal discountPercent)
    {
        if (quantity <= 0 || quantity > MaxQuantity)
        {
            throw new ArgumentOutOfRangeException(nameof(quantity), "Die Menge muss größer als 0 sein.");
        }

        if (unitPriceNet < 0 || unitPriceNet > MaxUnitPrice)
        {
            throw new ArgumentOutOfRangeException(nameof(unitPriceNet), "Der Einzelpreis darf nicht negativ sein.");
        }

        if (discountPercent is < 0 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(discountPercent), "Der Rabatt muss zwischen 0 und 100 % liegen.");
        }
    }
}
