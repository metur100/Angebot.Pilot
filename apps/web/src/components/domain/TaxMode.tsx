import type { TaxMode } from '@angebotpilot/api-contracts';
import { RadioCards } from '@/components/ui/Choice';

export const taxModeShort: Record<TaxMode, string> = {
  Standard: 'Regelbesteuerung',
  SmallBusiness: 'Kleinunternehmer (§ 19 UStG)',
  ReverseCharge: 'Reverse Charge (§ 13b UStG)',
};

export const taxModeExplanation: Record<TaxMode, string> = {
  Standard: 'Umsatzsteuer wird je Position ausgewiesen (z. B. 19 % oder 7 %). Das ist der Regelfall.',
  SmallBusiness:
    'Als Kleinunternehmer nach § 19 UStG weisen Sie keine Umsatzsteuer aus. Auf dem Angebot erscheint ein entsprechender Hinweis.',
  ReverseCharge:
    'Bei bestimmten Leistungen an Unternehmer (z. B. Bauleistungen) schuldet der Leistungsempfänger die Umsatzsteuer (§ 13b UStG). Es wird keine USt. ausgewiesen, aber ein Hinweis gedruckt.',
};

export const TAX_DISCLAIMER =
  'AngebotPilot ersetzt keine Steuerberatung. Klären Sie im Zweifel mit Ihrer Steuerberatung, welche Regelung für Sie gilt.';

/** Whether VAT is shown on documents for this tax mode. */
export const showsVat = (mode: TaxMode) => mode === 'Standard';

export function TaxModePicker({
  value,
  onChange,
  name = 'taxMode',
  legend = 'Besteuerung',
  columns = 1,
  disabled,
}: {
  value: TaxMode;
  onChange: (value: TaxMode) => void;
  name?: string;
  legend?: string;
  columns?: 1 | 3;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <RadioCards<TaxMode>
        name={name}
        legend={legend}
        value={value}
        onChange={onChange}
        columns={columns}
        disabled={disabled}
        options={(['Standard', 'SmallBusiness', 'ReverseCharge'] as const).map((mode) => ({
          value: mode,
          label: taxModeShort[mode],
          description: taxModeExplanation[mode],
        }))}
      />
      <p className="text-[13px] text-neutral-500">{TAX_DISCLAIMER}</p>
    </div>
  );
}
