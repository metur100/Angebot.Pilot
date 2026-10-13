import { localeNames, locales, type Locale } from '@angebotpilot/api-contracts';
import { Languages, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { tr, useLocale } from '@/lib/i18n';
import { useTheme, type ThemePreference } from '@/lib/theme';

/**
 * Switches the UI language. Signed in, the choice is also saved on the user profile (the server sends account
 * emails in it, and it follows the user to other devices); signed out, it is remembered in this browser only.
 */
export function useChangeLanguage() {
  const { setLanguage } = useLocale();
  const { status, user, setUser } = useAuth();
  return async (locale: Locale) => {
    setLanguage(locale);
    if (status !== 'authenticated' || !user || user.language === locale) return;
    try {
      setUser(await api.me.update({ displayName: user.displayName, language: locale }));
    } catch (error) {
      toast.error(tr('Sprache konnte nicht im Profil gespeichert werden', 'Could not save the language to your profile'), errorMessage(error));
    }
  };
}

export const themeOptions = (): { value: ThemePreference; label: string; icon: LucideIcon }[] => [
  { value: 'system', label: tr('System', 'System'), icon: Monitor },
  { value: 'light', label: tr('Hell', 'Light'), icon: Sun },
  { value: 'dark', label: tr('Dunkel', 'Dark'), icon: Moon },
];

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon; lang?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** Small segmented control (a group of toggle buttons; the pressed one is the current value). */
function Segmented<T extends string>({ label, value, options, onChange, size = 'md', className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-md border border-neutral-300 bg-neutral-50 p-0.5', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
              selected ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200' : 'text-neutral-600 hover:text-neutral-900',
            )}
          >
            {option.icon && <option.icon aria-hidden size={size === 'sm' ? 13 : 14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Deutsch | English" switch. Language names are shown in their own language. */
export function LanguageSwitcher({ size, className }: { size?: 'sm' | 'md'; className?: string }) {
  const { locale } = useLocale();
  const changeLanguage = useChangeLanguage();
  return (
    <Segmented
      label={tr('Sprache', 'Language')}
      value={locale}
      size={size}
      className={className}
      options={locales.map((value) => ({ value, label: localeNames[value], lang: value }))}
      onChange={(value) => void changeLanguage(value)}
    />
  );
}

/** System / Light / Dark switch. */
export function ThemeSwitcher({ size, className }: { size?: 'sm' | 'md'; className?: string }) {
  const { preference, setPreference } = useTheme();
  return <Segmented label={tr('Farbschema', 'Theme')} value={preference} size={size} className={className} options={themeOptions()} onChange={setPreference} />;
}

/** Compact language + theme controls for signed-out pages (login, public quotation page). */
export function PreferenceBar({ className }: { className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-center gap-2', className)}>
      <Languages aria-hidden size={14} className="text-neutral-500" />
      <LanguageSwitcher size="sm" />
      <ThemeSwitcher size="sm" />
    </div>
  );
}
