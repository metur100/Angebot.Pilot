import { taxModeLabel, tr, type TaxMode } from '@angebotpilot/api-contracts';

import type { SheetOption } from './Sheet';

/** Explanations of the tax modes in the current UI language (call at render time). */
export function taxModeDescription(mode: TaxMode): string {
  switch (mode) {
    case 'Standard':
      return tr('Umsatzsteuer wird je Position ausgewiesen (z. B. 19 % oder 7 %).', 'VAT is shown per line item (e.g. 19 % or 7 %).');
    case 'SmallBusiness':
      return tr(
        'Keine Umsatzsteuer im Angebot; Hinweis auf § 19 UStG wird gedruckt.',
        'No VAT on the document; the § 19 UStG notice is printed.',
      );
    case 'ReverseCharge':
      return tr(
        'Netto-Angebot; die Steuer schuldet der Leistungsempfänger (z. B. Bauleistungen an Unternehmen).',
        'Net amounts; the recipient owes the tax (reverse charge, § 13b UStG – e.g. construction work for businesses).',
      );
  }
}

/** Select options for the tax mode (call at render time so labels follow the UI language). */
export function taxModeOptions(): SheetOption<TaxMode>[] {
  return (['Standard', 'SmallBusiness', 'ReverseCharge'] as const).map((value) => ({
    value,
    label: taxModeLabel[value],
    description: taxModeDescription(value),
  }));
}

export function taxDisclaimer(): string {
  return tr(
    'Hinweis: AngebotPilot leistet keine Steuerberatung. Welche Besteuerung für Sie gilt, klären Sie bitte mit Ihrer Steuerberatung.',
    'Note: AngebotPilot does not provide tax advice. Please check with your tax adviser which tax treatment applies to you.',
  );
}
