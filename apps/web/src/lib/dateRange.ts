import { addDaysIso, todayIso } from '@angebotpilot/api-contracts';
import { tr } from './i18n';

export type DatePreset = 'month' | 'last30' | 'last90' | 'year' | 'custom';

/** Labels in the current UI language (getters, resolved on access). */
export const datePresetLabel: Record<DatePreset, string> = {
  get month() {
    return tr('Dieser Monat', 'This month');
  },
  get last30() {
    return tr('Letzte 30 Tage', 'Last 30 days');
  },
  get last90() {
    return tr('Letzte 90 Tage', 'Last 90 days');
  },
  get year() {
    return tr('Dieses Jahr', 'This year');
  },
  get custom() {
    return tr('Benutzerdefiniert', 'Custom');
  },
};

export interface DateRange {
  from: string;
  to: string;
}

/** Resolves a preset to an inclusive ISO date range relative to today. */
export function rangeForPreset(preset: Exclude<DatePreset, 'custom'>, today: string = todayIso()): DateRange {
  const [y, m] = today.split('-');
  switch (preset) {
    case 'month':
      return { from: `${y}-${m}-01`, to: today };
    case 'last30':
      return { from: addDaysIso(today, -29), to: today };
    case 'last90':
      return { from: addDaysIso(today, -89), to: today };
    case 'year':
      return { from: `${y}-01-01`, to: today };
  }
}
