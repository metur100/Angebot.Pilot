import { roleLabel } from '@angebotpilot/api-contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, TriangleAlert } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { COMPANY_KEY } from '@/app/company';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { AuthLayout } from './AuthLayout';

export default function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.invitations.preview(token),
    enabled: token.length > 0,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => api.invitations.accept({ token }),
    onSuccess: (me) => {
      setUser(me);
      const joined = me.companies.find((c) => c.companyName === preview.data?.companyName);
      if (joined) {
        try {
          window.localStorage.setItem(COMPANY_KEY, joined.companyId);
        } catch {
          // ignore
        }
      }
      toast.success(
        tr('Einladung angenommen', 'Invitation accepted'),
        preview.data ? tr(`Willkommen bei ${preview.data.companyName}!`, `Welcome to ${preview.data.companyName}!`) : undefined,
      );
      void navigate('/dashboard', { replace: true });
    },
  });

  const here = `/invite?token=${encodeURIComponent(token)}`;

  if (!token) {
    return (
      <AuthLayout title={tr('Einladung', 'Invitation')} compact>
        <Alert tone="warning">
          {tr(
            'Dieser Einladungslink ist unvollständig. Bitte öffnen Sie den Link direkt aus der E-Mail.',
            'This invitation link is incomplete. Please open the link directly from the email.',
          )}
        </Alert>
      </AuthLayout>
    );
  }

  if (preview.isPending || status === 'loading') {
    return (
      <AuthLayout title={tr('Einladung', 'Invitation')} compact>
        <Spinner label={tr('Einladung wird geladen …', 'Loading invitation …')} />
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout title={tr('Einladung nicht gefunden', 'Invitation not found')} compact>
        <Alert tone="danger" title={tr('Diese Einladung ist ungültig oder abgelaufen.', 'This invitation is invalid or has expired.')}>
          {tr(
            'Bitten Sie die Person, die Sie eingeladen hat, um eine neue Einladung.',
            'Ask the person who invited you for a new invitation.',
          )}{' '}
          ({errorMessage(preview.error)})
        </Alert>
        <ButtonLink to="/" size="lg" className="mt-6 w-full">
          {tr('Zur Startseite', 'Go to home page')}
        </ButtonLink>
      </AuthLayout>
    );
  }

  const invitation = preview.data;
  const emailMismatch = user && user.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <AuthLayout title={tr('Sie wurden eingeladen', 'You have been invited')} compact>
      <div className="rounded-lg border border-neutral-200 bg-neutral-25 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:text-brand-700">
            <Building2 aria-hidden size={20} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-neutral-900">{invitation.companyName}</p>
            <p className="mt-0.5 text-neutral-600">
              {tr('Rolle:', 'Role:')} <strong className="font-medium text-neutral-800">{roleLabel[invitation.role]}</strong>
            </p>
            <p className="text-neutral-600">{tr(`Eingeladen: ${invitation.email}`, `Invited: ${invitation.email}`)}</p>
            <p className="mt-1 text-xs text-neutral-500">{tr(`Gültig bis ${formatDateTime(invitation.expiresAt)}`, `Valid until ${formatDateTime(invitation.expiresAt)}`)}</p>
          </div>
        </div>
      </div>

      {status === 'authenticated' && user ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-neutral-600">
            {tr('Angemeldet als', 'Signed in as')} <strong className="font-medium text-neutral-900">{user.email}</strong>.
          </p>
          {emailMismatch && (
            <Alert tone="warning" icon={TriangleAlert}>
              {tr(
                `Die Einladung wurde an ${invitation.email} gesendet. Wenn Sie sie mit einem anderen Konto annehmen möchten, kann das abgelehnt werden. Melden Sie sich ggf. mit der eingeladenen Adresse an.`,
                `The invitation was sent to ${invitation.email}. Accepting it with a different account may be refused. If necessary, sign in with the invited address.`,
              )}
            </Alert>
          )}
          {accept.isError && (
            <Alert tone="danger" live>
              {errorMessage(accept.error)}
            </Alert>
          )}
          <Button variant="primary" size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
            {tr('Einladung annehmen', 'Accept invitation')}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              void logout().then(() => navigate(`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`));
            }}
          >
            {tr('Mit anderem Konto anmelden', 'Sign in with a different account')}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-neutral-600">
            {tr('Melden Sie sich an oder erstellen Sie ein Konto, um die Einladung anzunehmen.', 'Sign in or create an account to accept the invitation.')}
          </p>
          <ButtonLink
            to={`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {tr('Anmelden und annehmen', 'Sign in and accept')}
          </ButtonLink>
          <ButtonLink
            to={`/registrieren?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}
            size="lg"
            className="w-full"
          >
            {tr('Neues Konto erstellen', 'Create new account')}
          </ButtonLink>
        </div>
      )}
    </AuthLayout>
  );
}
