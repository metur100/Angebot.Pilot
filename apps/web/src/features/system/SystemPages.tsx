import { Compass, RefreshCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { BrandLogo } from '@/components/layout/Brand';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useDocumentTitle } from '@/lib/hooks';

function SystemLayout({ icon: Icon, title, children, actions }: { icon: typeof Compass; title: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-6 py-12 text-center">
      <BrandLogo size="lg" className="mb-10" />
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 shadow-sm">
        <Icon aria-hidden size={22} />
      </div>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <div className="mt-2 max-w-md text-sm text-neutral-600">{children}</div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
    </main>
  );
}

export function NotFoundPage() {
  useDocumentTitle('Seite nicht gefunden');
  return (
    <SystemLayout
      icon={Compass}
      title="Seite nicht gefunden"
      actions={
        <ButtonLink to="/" variant="primary">
          Zur Startseite
        </ButtonLink>
      }
    >
      Die aufgerufene Adresse existiert nicht (mehr). Prüfen Sie den Link oder kehren Sie zur Startseite zurück.
    </SystemLayout>
  );
}

/** Global error boundary for render errors and failed lazy route loads. */
export function RouteErrorPage() {
  const error = useRouteError();
  useDocumentTitle('Fehler');
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
  return (
    <SystemLayout
      icon={TriangleAlert}
      title={chunkFailed ? 'Neue Version verfügbar' : 'Etwas ist schiefgelaufen'}
      actions={
        <>
          <Button variant="primary" icon={RefreshCw} onClick={() => window.location.reload()}>
            Seite neu laden
          </Button>
          <ButtonLink to="/">Zur Startseite</ButtonLink>
        </>
      }
    >
      {chunkFailed
        ? 'Die Anwendung wurde aktualisiert oder die Verbindung ist unterbrochen. Bitte laden Sie die Seite neu.'
        : 'Ein unerwarteter Fehler ist aufgetreten. Ihre gespeicherten Daten sind nicht betroffen. Bitte laden Sie die Seite neu.'}
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-neutral-100 p-3 text-left text-xs text-neutral-700">{error.stack ?? error.message}</pre>
      )}
    </SystemLayout>
  );
}
