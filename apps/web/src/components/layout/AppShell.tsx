import { roleLabel } from '@angebotpilot/api-contracts';
import {
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  Hammer,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Settings,
  UserRound,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useUser } from '@/app/auth';
import { useCompany, useCompanyDetails } from '@/app/company';
import { ButtonLink } from '@/components/ui/Button';
import { PageSkeleton } from '@/components/ui/Feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { cx } from '@/lib/cx';
import { legalLinks } from '@/lib/env';
import { NetworkBanner, VerifyEmailBanner } from './Banners';
import { BrandLogo } from './Brand';
import { NotificationBell } from './NotificationBell';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const mainNav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/angebote', label: 'Angebote', icon: FileText },
  { to: '/kunden', label: 'Kunden', icon: Users },
  { to: '/auftraege', label: 'Aufträge', icon: Hammer },
  { to: '/vorlagen', label: 'Vorlagen', icon: LayoutTemplate },
];

const secondaryNav: NavItem[] = [
  { to: '/team', label: 'Team', icon: UsersRound },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings },
];

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  aria-hidden
                  size={18}
                  strokeWidth={isActive ? 2.25 : 2}
                  className={isActive ? 'text-brand-600' : 'text-neutral-400 group-hover:text-neutral-600'}
                />
                {item.label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Hauptnavigation" className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-5">
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="AngebotPilot – zum Dashboard" className="rounded">
          <BrandLogo />
        </NavLink>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <NavItems items={mainNav} onNavigate={onNavigate} />
        <p className="mt-6 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">Verwaltung</p>
        <NavItems items={secondaryNav} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-neutral-100 px-5 py-4 text-xs text-neutral-500">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <a href={legalLinks.impressum} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
            Impressum
          </a>
          <a href={legalLinks.datenschutz} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
            Datenschutz
          </a>
          <a href={legalLinks.agb} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
            AGB
          </a>
        </div>
        <p className="mt-1.5 text-neutral-500">© {new Date().getFullYear()} AngebotPilot</p>
      </div>
    </nav>
  );
}

function CompanySwitcher() {
  const { membership, memberships, switchCompany } = useCompany();
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[280px] min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-neutral-100"
          aria-label={`Firma: ${membership.companyName}. Firma wechseln`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-semibold text-white">
            {membership.companyName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-neutral-900">{membership.companyName}</span>
          </span>
          <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-neutral-400" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-[280px]">
        <MenuLabel>Ihre Firmen</MenuLabel>
        {memberships.map((m) => (
          <MenuItem
            key={m.companyId}
            icon={m.companyId === membership.companyId ? Check : Building2}
            description={`${roleLabel[m.role]}${m.isDemo ? ' · Demo' : ''}`}
            onSelect={() => {
              if (m.companyId !== membership.companyId) {
                switchCompany(m.companyId);
                void navigate('/dashboard');
              }
            }}
          >
            {m.companyName}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={Plus} onSelect={() => void navigate('/onboarding?neu=1')}>
          Weitere Firma anlegen
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`Benutzermenü für ${user.displayName}`}
          className="flex size-9 items-center justify-center rounded-full hover:bg-neutral-100"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {initials || '?'}
          </span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-[260px]">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-neutral-900">{user.displayName}</p>
          <p className="truncate text-xs text-neutral-500">{user.email}</p>
        </div>
        <MenuSeparator />
        <MenuItem icon={UserRound} onSelect={() => void navigate('/einstellungen/konto')}>
          Mein Konto
        </MenuItem>
        <MenuItem icon={Settings} onSelect={() => void navigate('/einstellungen')}>
          Einstellungen
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={LogOut}
          onSelect={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          Abmelden
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { membership } = useCompany();
  useCompanyDetails();

  return (
    <div className="min-h-dvh bg-neutral-50">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only z-[70] rounded-md bg-white px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Inhalt springen
      </a>

      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[240px] border-r border-neutral-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      <RadixDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="ap-overlay fixed inset-0 z-40 bg-neutral-900/40 lg:hidden" />
          <RadixDialog.Content className="ap-sheet fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-white shadow-lg focus:outline-none lg:hidden">
            <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Hauptnavigation von AngebotPilot</RadixDialog.Description>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Navigation schließen"
                className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
              >
                <X aria-hidden size={18} />
              </button>
            </RadixDialog.Close>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <div className="flex min-h-dvh flex-col lg:pl-[240px]">
        <header className="no-print sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Navigation öffnen"
              className="inline-flex size-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 lg:hidden"
            >
              <MenuIcon aria-hidden size={20} />
            </button>
            <CompanySwitcher />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <ButtonLink to="/angebote/neu" variant="primary" size="sm" icon={Plus} className="hidden sm:inline-flex">
                Neues Angebot
              </ButtonLink>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>
        <NetworkBanner />
        <VerifyEmailBanner />
        {membership.isDemo && (
          <div className="no-print border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-center text-[13px] text-neutral-700">
            Sie arbeiten in einer <strong className="font-semibold">Demo-Firma</strong> mit Beispieldaten.
          </div>
        )}
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
