import { formatPercent, formatQuantity, type TaxMode, type TotalsDto } from '@angebotpilot/api-contracts';
import { cx } from '@/lib/cx';
import { formatEur } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { documentFormat, signedEur, TotalsList } from './Totals';

export interface DocumentLine {
  position: number;
  title: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  discountPercent: number;
  taxRatePercent: number;
  lineNet: number;
}

export interface DocumentData {
  number: string;
  title: string;
  issueDate: string;
  validUntil: string;
  taxMode: TaxMode;
  companyName: string;
  companyAddress: string | null;
  companyContact: string | null;
  brandColor: string;
  logoUrl?: string | null;
  recipientName: string;
  recipientAddress: string | null;
  introText: string | null;
  closingText: string | null;
  terms: string | null;
  paymentTerms: string | null;
  lines: DocumentLine[];
  totals: TotalsDto;
  isDraft?: boolean;
  footer?: string | null;
}

/**
 * Line items table shared by the HTML preview, the public customer page and invoices (negate: cancellation invoices).
 * asDocument: inside the customer document – German headers and number formatting regardless of the UI language.
 */
export function DocumentLineItems({
  lines,
  taxMode,
  brandColor,
  negate = false,
  asDocument = false,
}: {
  lines: DocumentLine[];
  taxMode: TaxMode;
  brandColor?: string;
  negate?: boolean;
  asDocument?: boolean;
}) {
  const showVat = taxMode === 'Standard';
  const hasDiscount = lines.some((l) => l.discountPercent > 0);
  const t = (de: string, en: string) => (asDocument ? de : tr(de, en));
  const money = asDocument ? documentFormat.eur : formatEur;
  const quantity = asDocument ? documentFormat.quantity : formatQuantity;
  const percent = asDocument ? documentFormat.percent : formatPercent;
  return (
    <>
      {/* Table on wide screens */}
      <table className="hidden w-full border-collapse text-[13px] sm:table">
        <thead>
          <tr className="border-b-2 text-left text-xs text-neutral-500" style={{ borderColor: brandColor }}>
            <th scope="col" className="w-10 py-2 pr-2 font-medium">{t('Pos.', 'No.')}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{t('Bezeichnung', 'Item')}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium whitespace-nowrap">{t('Menge', 'Quantity')}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium whitespace-nowrap">{t('Einzelpreis', 'Unit price')}</th>
            {hasDiscount && <th scope="col" className="py-2 pr-3 text-right font-medium">{t('Rabatt', 'Discount')}</th>}
            {showVat && <th scope="col" className="py-2 pr-3 text-right font-medium">{t('USt.', 'VAT')}</th>}
            <th scope="col" className="py-2 text-right font-medium whitespace-nowrap">{t('Gesamt netto', 'Net total')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.position} className="border-b border-neutral-100 align-top">
              <td className="py-2.5 pr-2 text-neutral-500 tabular">{line.position}</td>
              <td className="py-2.5 pr-3">
                <p className="font-medium text-neutral-900">{line.title}</p>
                {line.description && <p className="mt-0.5 whitespace-pre-line text-neutral-600">{line.description}</p>}
              </td>
              <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">
                {quantity(line.quantity)} {line.unit}
              </td>
              <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">{money(line.unitPriceNet)}</td>
              {hasDiscount && (
                <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">{line.discountPercent > 0 ? percent(line.discountPercent) : '–'}</td>
              )}
              {showVat && <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular">{percent(line.taxRatePercent)}</td>}
              <td className="py-2.5 text-right font-medium whitespace-nowrap tabular">{signedEur(line.lineNet, negate, money)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Stacked list on phones */}
      <ul className="divide-y divide-neutral-100 border-t-2 sm:hidden" style={{ borderColor: brandColor }}>
        {lines.map((line) => (
          <li key={line.position} className="py-3 text-sm">
            <div className="flex justify-between gap-3">
              <p className="font-medium text-neutral-900">
                <span className="mr-1.5 text-neutral-500 tabular">{line.position}.</span>
                {line.title}
              </p>
              <p className="font-medium whitespace-nowrap tabular">{signedEur(line.lineNet, negate, money)}</p>
            </div>
            {line.description && <p className="mt-0.5 whitespace-pre-line text-[13px] text-neutral-600">{line.description}</p>}
            <p className="mt-1 text-[13px] text-neutral-500 tabular">
              {quantity(line.quantity)} {line.unit} × {money(line.unitPriceNet)}
              {line.discountPercent > 0 && ` · −${percent(line.discountPercent)}`}
              {showVat && ` · ${t('USt.', 'VAT')} ${percent(line.taxRatePercent)}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** HTML rendition of the quotation document in A4 proportions (styled like the server PDF). */
export function QuotationDocument({ data, className }: { data: DocumentData; className?: string }) {
  return (
    <article
      lang="de"
      data-theme="light"
      aria-label={`Angebot ${data.number}`}
      className={cx('relative mx-auto w-full max-w-[820px] bg-white shadow-md ring-1 ring-neutral-200 sm:ap-a4', className)}
    >
      <div className="h-1.5" style={{ background: data.brandColor }} />
      {data.isDraft && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-[30deg] text-[96px] font-bold tracking-widest text-neutral-100 select-none sm:text-[120px]">ENTWURF</span>
        </div>
      )}
      <div className="relative px-6 py-8 sm:px-[8%] sm:py-[7%]">
        <header className="flex flex-col-reverse justify-between gap-6 sm:flex-row">
          <div className="min-w-0 text-sm">
            <p className="text-[11px] text-neutral-500">{[data.companyName, data.companyAddress?.replace(/\n/g, ', ')].filter(Boolean).join(' · ')}</p>
            <p className="mt-3 font-medium text-neutral-900">{data.recipientName}</p>
            {data.recipientAddress && <p className="whitespace-pre-line text-neutral-700">{data.recipientAddress}</p>}
          </div>
          <div className="shrink-0 sm:text-right">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt={`Logo ${data.companyName}`} className="max-h-14 max-w-[200px] object-contain sm:ml-auto" />
            ) : (
              <p className="text-lg font-semibold" style={{ color: data.brandColor }}>
                {data.companyName}
              </p>
            )}
            {data.companyAddress && <p className="mt-2 text-xs whitespace-pre-line text-neutral-500">{data.companyAddress}</p>}
            {data.companyContact && <p className="mt-1 text-xs whitespace-pre-line text-neutral-500">{data.companyContact}</p>}
          </div>
        </header>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider uppercase" style={{ color: data.brandColor }}>
              Angebot
            </p>
            <h2 className="mt-1 text-xl font-semibold text-neutral-900">{data.title || 'Ohne Betreff'}</h2>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[13px]">
            <dt className="text-neutral-500">Angebotsnr.</dt>
            <dd className="text-right font-medium tabular">{data.number}</dd>
            <dt className="text-neutral-500">Datum</dt>
            <dd className="text-right tabular">{documentFormat.date(data.issueDate)}</dd>
            <dt className="text-neutral-500">Gültig bis</dt>
            <dd className="text-right tabular">{documentFormat.date(data.validUntil)}</dd>
          </dl>
        </div>

        {data.introText && <p className="mt-6 text-sm whitespace-pre-line text-neutral-800">{data.introText}</p>}

        <div className="mt-6">
          <DocumentLineItems lines={data.lines} taxMode={data.taxMode} brandColor={data.brandColor} asDocument />
        </div>

        <div className="mt-4 flex justify-end">
          <TotalsList totals={data.totals} taxMode={data.taxMode} className="w-full sm:w-[340px]" asDocument />
        </div>

        {data.closingText && <p className="mt-8 text-sm whitespace-pre-line text-neutral-800">{data.closingText}</p>}
        {(data.paymentTerms || data.terms) && (
          <div className="mt-6 space-y-3 text-[13px] text-neutral-600">
            {data.paymentTerms && (
              <div>
                <p className="font-medium text-neutral-800">Zahlungsbedingungen</p>
                <p className="whitespace-pre-line">{data.paymentTerms}</p>
              </div>
            )}
            {data.terms && (
              <div>
                <p className="font-medium text-neutral-800">Bedingungen</p>
                <p className="whitespace-pre-line">{data.terms}</p>
              </div>
            )}
          </div>
        )}
        {data.footer && <p className="mt-10 border-t border-neutral-200 pt-3 text-[11px] whitespace-pre-line text-neutral-500">{data.footer}</p>}
      </div>
    </article>
  );
}
