import { addDaysIso, todayIso } from '@angebotpilot/api-contracts';

export type DatePreset = 'month' | 'last30' | 'last90' | 'year' | 'custom';

export const datePresetLabel: Record<DatePreset, string> = {
  month: 'Dieser Monat',
  last30: 'Letzte 30 Tage',
  last90: 'Letzte 90 Tage',
  year: 'Dieses Jahr',
  custom: 'Benutzerdefiniert',
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
