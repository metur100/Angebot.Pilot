import { formatPercent, type TaxMode, type TotalsDto } from '@angebotpilot/api-contracts';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { formatEur } from '@/lib/format';
import { tr } from '@/lib/i18n';

/** Tax notes printed on the (German) customer document. */
export const taxModeDocumentNote: Record<TaxMode, string | null> = {
  Standard: null,
  SmallBusiness: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  ReverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer schuldet der Leistungsempfänger.',
};

/** The same notes in the UI language (app screens). */
function taxModeUiNote(taxMode: TaxMode): string | null {
  switch (taxMode) {
    case 'SmallBusiness':
      return tr('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', 'No VAT is charged under § 19 UStG (small business).');
    case 'ReverseCharge':
      return tr(
        'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). Die Umsatzsteuer schuldet der Leistungsempfänger.',
        'Reverse charge (§ 13b UStG): the recipient of the service is liable for the VAT.',
      );
    default:
      return null;
  }
}

// German formatting for the customer document: it mirrors the German PDF regardless of the UI language.
const documentEurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const documentDecimalFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const documentPercentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const documentFormat = {
  /** 1234.5 → "1.234,50 €" */
  eur: (value: number | null | undefined) => documentEurFormat.format(value ?? 0),
  /** 2.5 → "2,5" */
  quantity: (value: number) => documentDecimalFormat.format(value),
  /** 19 → "19 %" */
  percent: (value: number) => `${documentPercentFormat.format(value)} %`,
  /** "2026-10-12" → "12.10.2026" */
  date: (isoDate: string | null | undefined) => {
    if (!isoDate) return '–';
    const [y, m, d] = isoDate.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  },
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
  /** Inside the customer document: German labels and German number formatting regardless of the UI language. */
  asDocument?: boolean;
}

/** "1.234,50 €" or, negated, "− 1.234,50 €" (true minus sign). */
export function signedEur(value: number, negate = false, format: (value: number) => string = formatEur): string {
  return negate && value !== 0 ? `− ${format(value)}` : format(value);
}

/** Totals breakdown: subtotal, discount, net, VAT per rate, gross. */
export function TotalsList({ totals, taxMode, className, negate = false, asDocument = false }: TotalsListProps) {
  const vat = taxMode === 'Standard';
  const money = asDocument ? documentFormat.eur : formatEur;
  const percent = asDocument ? documentFormat.percent : formatPercent;
  // Document texts stay German; app screens follow the UI language.
  const t = (de: string, en: string) => (asDocument ? de : tr(de, en));
  const eur = (value: number) => signedEur(value, negate, money);
  const note = asDocument ? taxModeDocumentNote[taxMode] : taxModeUiNote(taxMode);
  return (
    <dl className={cx('text-sm', className)}>
      {totals.discountTotal > 0 && (
        <>
          <Row label={t('Summe vor Rabatt', 'Subtotal before discount')} value={eur(totals.subtotalBeforeDiscount)} testId="totals-subtotal" />
          <Row label={t('Rabatt', 'Discount')} value={`${negate ? '+' : '−'} ${money(totals.discountTotal)}`} testId="totals-discount" />
        </>
      )}
      <Row label={t('Nettobetrag', 'Net amount')} value={eur(totals.netTotal)} testId="totals-net" />
      {vat &&
        totals.taxGroups.map((group) => (
          <Row
            key={group.ratePercent}
            label={
              <>
                {t('USt.', 'VAT')} {percent(group.ratePercent)}
                <span className="ml-1 text-neutral-500">
                  {t('auf', 'on')} {money(group.netAmount)}
                </span>
              </>
            }
            value={eur(group.taxAmount)}
            testId={`totals-vat-${group.ratePercent}`}
          />
        ))}
      <Row
        label={vat ? t('Gesamtbetrag (brutto)', 'Total (gross)') : t('Gesamtbetrag', 'Total')}
        value={eur(totals.grossTotal)}
        strong
        testId="totals-gross"
      />
      {note && <p className="mt-2 text-xs text-neutral-500">{note}</p>}
    </dl>
  );
}
