import { taxModeLabel, type TaxMode } from '@angebotpilot/api-contracts';

import type { SheetOption } from './Sheet';

export const taxModeDescriptions: Record<TaxMode, string> = {
  Standard: 'Umsatzsteuer wird je Position ausgewiesen (z. B. 19 % oder 7 %).',
  SmallBusiness: 'Keine Umsatzsteuer im Angebot; Hinweis auf § 19 UStG wird gedruckt.',
  ReverseCharge: 'Netto-Angebot; die Steuer schuldet der Leistungsempfänger (z. B. Bauleistungen an Unternehmen).',
};

export const taxModeOptions: SheetOption<TaxMode>[] = (['Standard', 'SmallBusiness', 'ReverseCharge'] as const).map((value) => ({
  value,
  label: taxModeLabel[value],
  description: taxModeDescriptions[value],
}));

export const TAX_DISCLAIMER =
  'Hinweis: AngebotPilot leistet keine Steuerberatung. Welche Besteuerung für Sie gilt, klären Sie bitte mit Ihrer Steuerberatung.';
