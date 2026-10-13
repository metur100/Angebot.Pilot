import { RefreshCw, WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { BrandLogo } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { useAuth } from './auth';

export function FullScreenLoader({ label = 'AngebotPilot wird geladen …' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-neutral-50">
      <BrandLogo size="lg" />
      <Spinner label={label} />
    </div>
  );
}

function OfflineScreen() {
  const { retry } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 text-center">
      <BrandLogo size="lg" className="mb-8" />
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-warning-border bg-warning-bg text-warning-text">
        <WifiOff aria-hidden size={20} />
      </div>
      <h1 className="text-lg font-semibold text-neutral-900">Keine Verbindung zum Server</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-600">
        Ihre Sitzung konnte nicht wiederhergestellt werden, weil der Server nicht erreichbar ist. Bitte prüfen Sie Ihre
        Internetverbindung.
      </p>
      <Button className="mt-5" icon={RefreshCw} onClick={retry}>
        Erneut versuchen
      </Button>
    </div>
  );
}

/** Only for signed-in users; others are sent to the login page and come back afterwards. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'offline') return <OfflineScreen />;
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

/** Sanitises the ?next= parameter to an in-app path. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

/** Login/registration pages: signed-in users go straight to the app. */
export function PublicOnly() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'offline') return <OfflineScreen />;
  return <Navigate to={status === 'authenticated' ? '/dashboard' : '/login'} replace />;
}
