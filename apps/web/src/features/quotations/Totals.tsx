import { formatPercent, type TaxMode, type TotalsDto } from '@angebotpilot/api-contracts';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { formatEur } from '@/lib/format';

export const taxModeDocumentNote: Record<TaxMode, string | null> = {
  Standard: null,
  SmallBusiness: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  ReverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer schuldet der Leistungsempfänger.',
};

function Row({ label, value, strong, testId }: { label: ReactNode; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-6 py-1', strong && 'mt-1.5 border-t border-neutral-200 pt-2.5')}>
      <dt className={cx(strong ? 'text-[15px] font-semibold text-neutral-900' : 'text-neutral-600')}>{label}</dt>
      <dd
        data-testid={testId}
        className={cx('tabular whitespace-nowrap', strong ? 'text-[17px] font-semibold text-neutral-900' : 'text-neutral-800')}
      >
        {value}
      </dd>
    </div>
  );
}

interface TotalsListProps {
  totals: TotalsDto;
  taxMode: TaxMode;
  className?: string;
  /** Cancellation invoices (Stornorechnung): amounts are shown negated. */
  negate?: boolean;
}

/** "1.234,50 €" or, negated, "− 1.234,50 €" (true minus sign). */
export function signedEur(value: number, negate = false): string {
  return negate && value !== 0 ? `− ${formatEur(value)}` : formatEur(value);
}

/** Totals breakdown: subtotal, discount, net, VAT per rate, gross. */
export function TotalsList({ totals, taxMode, className, negate = false }: TotalsListProps) {
  const vat = taxMode === 'Standard';
  const eur = (value: number) => signedEur(value, negate);
  return (
    <dl className={cx('text-sm', className)}>
      {totals.discountTotal > 0 && (
        <>
          <Row label="Summe vor Rabatt" value={eur(totals.subtotalBeforeDiscount)} testId="totals-subtotal" />
          <Row label="Rabatt" value={`${negate ? '+' : '−'} ${formatEur(totals.discountTotal)}`} testId="totals-discount" />
        </>
      )}
      <Row label="Nettobetrag" value={eur(totals.netTotal)} testId="totals-net" />
      {vat &&
        totals.taxGroups.map((group) => (
          <Row
            key={group.ratePercent}
            label={
              <>
                USt. {formatPercent(group.ratePercent)}
                <span className="ml-1 text-neutral-500">auf {formatEur(group.netAmount)}</span>
              </>
            }
            value={eur(group.taxAmount)}
            testId={`totals-vat-${group.ratePercent}`}
          />
        ))}
      <Row label={vat ? 'Gesamtbetrag (brutto)' : 'Gesamtbetrag'} value={eur(totals.grossTotal)} strong testId="totals-gross" />
      {taxModeDocumentNote[taxMode] && <p className="mt-2 text-xs text-neutral-500">{taxModeDocumentNote[taxMode]}</p>}
    </dl>
  );
}
