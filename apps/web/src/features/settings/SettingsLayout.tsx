import { BellRing, Building2, CreditCard, Lock, Palette, UserRound, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useCompany } from '@/app/company';
import { PageHeader } from '@/components/ui/Page';
import { cx } from '@/lib/cx';

interface SettingsSection {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Read-only for employees. */
  restricted: boolean;
}

const sections: SettingsSection[] = [
  { to: 'firma', label: 'Firma', icon: Building2, restricted: true },
  { to: 'dokumente', label: 'Branding & Dokumente', icon: Palette, restricted: true },
  { to: 'benachrichtigungen', label: 'Erinnerungen', icon: BellRing, restricted: true },
  { to: 'abo', label: 'Abo & Tarif', icon: CreditCard, restricted: true },
  { to: 'konto', label: 'Mein Konto', icon: UserRound, restricted: false },
];

export default function SettingsLayout() {
  const { can, membership } = useCompany();
  const { pathname } = useLocation();
  const readOnly = !can.manageCompany;
  const active = sections.find((section) => pathname.startsWith(`/einstellungen/${section.to}`));

  return (
    <>
      <PageHeader
        title="Einstellungen"
        documentTitle={active ? `${active.label} – Einstellungen` : 'Einstellungen'}
        description={`Firma, Dokumente, Erinnerungen, Abo und Ihr persönliches Konto für ${membership.companyName}.`}
      />
      <div className="grid gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        <div className="min-w-0">
          <nav aria-label="Einstellungsbereiche" className="-mx-4 sm:mx-0 lg:sticky lg:top-6">
            <ul className="flex gap-1 overflow-x-auto border-b border-neutral-200 px-4 [scrollbar-width:none] sm:px-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0">
              {sections.map((section) => {
                const locked = readOnly && section.restricted;
                return (
                  <li key={section.to} className="shrink-0">
                    <NavLink
                      to={section.to}
                      className={({ isActive }) =>
                        cx(
                          'flex items-center gap-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500',
                          // Mobile: underline tabs. Desktop: vertical list with filled active item.
                          '-mb-px h-10 border-b-2 px-3 lg:mb-0 lg:h-9 lg:rounded-md lg:border-b-0 lg:px-3',
                          isActive
                            ? 'border-brand-600 text-neutral-900 lg:bg-white lg:shadow-sm lg:ring-1 lg:ring-neutral-200'
                            : 'border-transparent text-neutral-600 hover:text-neutral-900 lg:hover:bg-neutral-100',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <section.icon aria-hidden size={16} className={cx('hidden shrink-0 lg:block', isActive ? 'text-brand-600' : 'text-neutral-400')} />
                          <span className="lg:min-w-0 lg:flex-1 lg:truncate">{section.label}</span>
                          {locked && (
                            <>
                              <Lock aria-hidden size={13} className="shrink-0 text-neutral-400" />
                              <span className="sr-only">(nur lesen)</span>
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
            {readOnly && (
              <p className="mt-3 flex items-start gap-2 px-4 text-[13px] leading-[18px] text-neutral-600 sm:px-0 lg:mt-4">
                <Lock aria-hidden size={13} className="mt-[3px] shrink-0" />
                <span>
                  Als Mitarbeiter:in können Sie Firma, Branding, Erinnerungen und Abo nur ansehen. Ihr eigenes Konto verwalten Sie unter
                  „Mein Konto“.
                </span>
              </p>
            )}
          </nav>
        </div>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  );
}
