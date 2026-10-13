import { CircleCheck, CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { ButtonLink } from '@/components/ui/Button';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { AuthLayout } from './AuthLayout';

// One request per token, even when React StrictMode mounts the page twice (tokens are single-use).
const attempts = new Map<string, Promise<void>>();

function verifyOnce(token: string) {
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = api.auth.verifyEmail({ token });
    attempts.set(token, attempt);
  }
  return attempt;
}

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { status, reloadUser } = useAuth();
  const [state, setState] = useState<{ kind: 'pending' } | { kind: 'done' } | { kind: 'error'; message: string }>(
    token ? { kind: 'pending' } : { kind: 'error', message: 'Der Link enthält keinen Bestätigungscode.' },
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyOnce(token)
      .then(() => {
        if (active) setState({ kind: 'done' });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: 'error', message: errorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (state.kind === 'done' && status === 'authenticated') void reloadUser().catch(() => undefined);
  }, [state.kind, status, reloadUser]);

  const target = status === 'authenticated' ? '/dashboard' : '/login';
  const targetLabel = status === 'authenticated' ? 'Weiter zum Dashboard' : 'Zur Anmeldung';

  return (
    <AuthLayout title="E-Mail-Adresse bestätigen" compact>
      {state.kind === 'pending' && <Spinner label="Ihre E-Mail-Adresse wird bestätigt …" />}
      {state.kind === 'done' && (
        <>
          <Alert tone="success" icon={CircleCheck} title="Vielen Dank!">
            Ihre E-Mail-Adresse ist bestätigt. Sie können jetzt Angebote per E-Mail versenden.
          </Alert>
          <ButtonLink to={target} variant="primary" size="lg" className="mt-6 w-full">
            {targetLabel}
          </ButtonLink>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <Alert tone="danger" icon={CircleX} title="Bestätigung nicht möglich">
            {state.message} Möglicherweise ist der Link abgelaufen oder wurde bereits verwendet. Nach der Anmeldung können Sie eine neue
            Bestätigungs-E-Mail anfordern.
          </Alert>
          <ButtonLink to={target} size="lg" className="mt-6 w-full">
            {targetLabel}
          </ButtonLink>
        </>
      )}
    </AuthLayout>
  );
}
