import { onLocaleChange, type TaxMode } from '@angebotpilot/api-contracts';
import { RadioCards } from '@/components/ui/Choice';
import { tr } from '@/lib/i18n';

/** Short tax mode names in the current UI language (getters, resolved on access). */
export const taxModeShort: Record<TaxMode, string> = {
  get Standard() {
    return tr('Regelbesteuerung', 'Standard taxation');
  },
  get SmallBusiness() {
    return tr('Kleinunternehmer (§ 19 UStG)', 'Small business (§ 19 UStG)');
  },
  get ReverseCharge() {
    return tr('Reverse Charge (§ 13b UStG)', 'Reverse charge (§ 13b UStG)');
  },
};

export const taxModeExplanation: Record<TaxMode, string> = {
  get Standard() {
    return tr(
      'Umsatzsteuer wird je Position ausgewiesen (z. B. 19 % oder 7 %). Das ist der Regelfall.',
      'VAT is shown per line item (e.g. 19 % or 7 %). This is the usual case.',
    );
  },
  get SmallBusiness() {
    return tr(
      'Als Kleinunternehmer nach § 19 UStG weisen Sie keine Umsatzsteuer aus. Auf dem Angebot erscheint ein entsprechender Hinweis.',
      'As a small business under § 19 UStG you do not charge VAT. The quotation shows a corresponding note.',
    );
  },
  get ReverseCharge() {
    return tr(
      'Bei bestimmten Leistungen an Unternehmer (z. B. Bauleistungen) schuldet der Leistungsempfänger die Umsatzsteuer (§ 13b UStG). Es wird keine USt. ausgewiesen, aber ein Hinweis gedruckt.',
      'For certain services to businesses (e.g. construction work) the recipient owes the VAT (§ 13b UStG). No VAT is shown, but a note is printed.',
    );
  },
};

const taxDisclaimer = () =>
  tr(
    'AngebotPilot ersetzt keine Steuerberatung. Klären Sie im Zweifel mit Ihrer Steuerberatung, welche Regelung für Sie gilt.',
    'AngebotPilot does not replace tax advice. If in doubt, check with your tax adviser which rules apply to you.',
  );

/** Tax advice disclaimer in the current UI language (live binding, updated when the language changes). */
export let TAX_DISCLAIMER = taxDisclaimer();
onLocaleChange(() => {
  TAX_DISCLAIMER = taxDisclaimer();
});

/** Whether VAT is shown on documents for this tax mode. */
export const showsVat = (mode: TaxMode) => mode === 'Standard';

export function TaxModePicker({
  value,
  onChange,
  name = 'taxMode',
  legend = tr('Besteuerung', 'Taxation'),
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
