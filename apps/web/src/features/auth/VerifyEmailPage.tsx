import { CircleCheck, CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { ButtonLink } from '@/components/ui/Button';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
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
    token ? { kind: 'pending' } : { kind: 'error', message: tr('Der Link enthält keinen Bestätigungscode.', 'The link does not contain a confirmation code.') },
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
  const targetLabel = status === 'authenticated' ? tr('Weiter zum Dashboard', 'Continue to dashboard') : tr('Zur Anmeldung', 'Go to sign in');

  return (
    <AuthLayout title={tr('E-Mail-Adresse bestätigen', 'Confirm email address')} compact>
      {state.kind === 'pending' && <Spinner label={tr('Ihre E-Mail-Adresse wird bestätigt …', 'Confirming your email address …')} />}
      {state.kind === 'done' && (
        <>
          <Alert tone="success" icon={CircleCheck} title={tr('Vielen Dank!', 'Thank you!')}>
            {tr('Ihre E-Mail-Adresse ist bestätigt. Sie können jetzt Angebote per E-Mail versenden.', 'Your email address is confirmed. You can now send quotations by email.')}
          </Alert>
          <ButtonLink to={target} variant="primary" size="lg" className="mt-6 w-full">
            {targetLabel}
          </ButtonLink>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <Alert tone="danger" icon={CircleX} title={tr('Bestätigung nicht möglich', 'Confirmation not possible')}>
            {state.message}{' '}
            {tr(
              'Möglicherweise ist der Link abgelaufen oder wurde bereits verwendet. Nach der Anmeldung können Sie eine neue Bestätigungs-E-Mail anfordern.',
              'The link may have expired or already been used. After signing in you can request a new confirmation email.',
            )}
          </Alert>
          <ButtonLink to={target} size="lg" className="mt-6 w-full">
            {targetLabel}
          </ButtonLink>
        </>
      )}
    </AuthLayout>
  );
}
