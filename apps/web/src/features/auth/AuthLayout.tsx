import { BellRing, FileCheck2, Hammer } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { BrandLogo } from '@/components/layout/Brand';
import { controlBase, useFieldControl } from '@/components/ui/Field';
import { cx } from '@/lib/cx';
import { legalLinks } from '@/lib/env';
import { useDocumentTitle } from '@/lib/hooks';

const benefits = [
  { icon: FileCheck2, title: 'Angebote in Minuten', text: 'Positionen, Vorlagen und Summen inkl. USt. – sauber als PDF.' },
  { icon: BellRing, title: 'Automatisch nachfassen', text: 'Freundliche Erinnerungen, bis Ihr Kunde entschieden hat.' },
  { icon: Hammer, title: 'Vom Angebot zum Auftrag', text: 'Online annehmen lassen und mit einem Klick zum Auftrag machen.' },
];

export function LegalFooter({ className }: { className?: string }) {
  return (
    <nav aria-label="Rechtliches" className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-600', className)}>
      <a href={legalLinks.home} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
        AngebotPilot
      </a>
      <a href={legalLinks.impressum} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
        Impressum
      </a>
      <a href={legalLinks.datenschutz} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
        Datenschutz
      </a>
      <a href={legalLinks.agb} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
        AGB
      </a>
    </nav>
  );
}

interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the marketing panel (e.g. for status pages). */
  compact?: boolean;
}

export function AuthLayout({ title, description, children, footer, compact }: AuthLayoutProps) {
  useDocumentTitle(title);
  return (
    <div className="flex min-h-dvh bg-white">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-10">
        <header>
          <a href={legalLinks.home} className="inline-block rounded" aria-label="AngebotPilot Startseite">
            <BrandLogo />
          </a>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-neutral-900">{title}</h1>
            {description && <p className="mt-2 text-sm text-neutral-600">{description}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-sm text-neutral-600">{footer}</div>}
          </div>
        </main>
        <LegalFooter />
      </div>
      {!compact && (
        <aside className="relative hidden w-[44%] max-w-[640px] overflow-hidden border-l border-neutral-200 bg-neutral-50 lg:flex lg:flex-col lg:justify-center lg:px-14">
          <div aria-hidden className="absolute -top-32 -right-32 size-[420px] rounded-full bg-brand-100/60 blur-3xl" />
          <div className="relative">
            <p className="text-[13px] font-semibold tracking-wide text-brand-700 uppercase">Für Handwerk & Dienstleister</p>
            <p className="mt-3 max-w-md text-[26px] leading-[34px] font-semibold tracking-[-0.02em] text-neutral-900">
              Weniger Papierkram. Mehr Zusagen.
            </p>
            <ul className="mt-9 space-y-6">
              {benefits.map((b) => (
                <li key={b.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-brand-600 shadow-sm">
                    <b.icon aria-hidden size={19} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-neutral-900">{b.title}</span>
                    <span className="mt-0.5 block text-sm text-neutral-600">{b.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-[13px] text-neutral-600">Für Elektrobetriebe, Reinigungsfirmen, Hausmeisterdienste, Webdesign und Beratung.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

/** Password input with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const a11y = useFieldControl(props);
  return (
    <div className="relative">
      <input ref={ref} type={visible ? 'text' : 'password'} className={cx(controlBase, 'h-10 pr-10', className)} {...props} {...a11y} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
        aria-pressed={visible}
        className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        {visible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
      </button>
    </div>
  );
});

/** Live password requirement checklist (mirrors passwordSchema). */
export function PasswordHints({ password }: { password: string }) {
  const checks = [
    { ok: password.length >= 10, label: 'Mindestens 10 Zeichen' },
    { ok: /[A-Za-zÄÖÜäöüß]/.test(password), label: 'Mindestens ein Buchstabe' },
    { ok: /\d/.test(password), label: 'Mindestens eine Ziffer' },
  ];
  const bonus = (password.length >= 14 ? 1 : 0) + (/[^A-Za-z0-9]/.test(password) ? 1 : 0) + (/[a-z]/.test(password) && /[A-Z]/.test(password) ? 1 : 0);
  const passed = checks.filter((c) => c.ok).length;
  const score = passed < 3 ? passed : 3 + bonus; // 0..6
  const strength = score <= 2 ? 'schwach' : score <= 3 ? 'ausreichend' : score <= 4 ? 'gut' : 'stark';
  const bar = score <= 2 ? 'bg-danger-solid' : score <= 3 ? 'bg-warning-solid' : 'bg-success-solid';
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
          <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: `${Math.max(8, (score / 6) * 100)}%` }} />
        </div>
        <span className="w-20 text-right text-xs text-neutral-600">{password ? `Stärke: ${strength}` : ''}</span>
      </div>
      <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-1">
        {checks.map((c) => (
          <li key={c.label} className={cx('flex items-center gap-2', c.ok ? 'text-success-text' : 'text-neutral-500')}>
            <span aria-hidden className={cx('inline-block size-1.5 rounded-full', c.ok ? 'bg-success-solid' : 'bg-neutral-300')} />
            {c.label}
            <span className="sr-only">{c.ok ? '(erfüllt)' : '(nicht erfüllt)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
