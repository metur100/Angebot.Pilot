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
      toast.success('Einladung angenommen', preview.data ? `Willkommen bei ${preview.data.companyName}!` : undefined);
      void navigate('/dashboard', { replace: true });
    },
  });

  const here = `/invite?token=${encodeURIComponent(token)}`;

  if (!token) {
    return (
      <AuthLayout title="Einladung" compact>
        <Alert tone="warning">Dieser Einladungslink ist unvollständig. Bitte öffnen Sie den Link direkt aus der E-Mail.</Alert>
      </AuthLayout>
    );
  }

  if (preview.isPending || status === 'loading') {
    return (
      <AuthLayout title="Einladung" compact>
        <Spinner label="Einladung wird geladen …" />
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout title="Einladung nicht gefunden" compact>
        <Alert tone="danger" title="Diese Einladung ist ungültig oder abgelaufen.">
          Bitten Sie die Person, die Sie eingeladen hat, um eine neue Einladung. ({errorMessage(preview.error)})
        </Alert>
        <ButtonLink to="/" size="lg" className="mt-6 w-full">
          Zur Startseite
        </ButtonLink>
      </AuthLayout>
    );
  }

  const invitation = preview.data;
  const emailMismatch = user && user.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <AuthLayout title="Sie wurden eingeladen" compact>
      <div className="rounded-lg border border-neutral-200 bg-neutral-25 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Building2 aria-hidden size={20} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-neutral-900">{invitation.companyName}</p>
            <p className="mt-0.5 text-neutral-600">
              Rolle: <strong className="font-medium text-neutral-800">{roleLabel[invitation.role]}</strong>
            </p>
            <p className="text-neutral-600">Eingeladen: {invitation.email}</p>
            <p className="mt-1 text-xs text-neutral-500">Gültig bis {formatDateTime(invitation.expiresAt)}</p>
          </div>
        </div>
      </div>

      {status === 'authenticated' && user ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Angemeldet als <strong className="font-medium text-neutral-900">{user.email}</strong>.
          </p>
          {emailMismatch && (
            <Alert tone="warning" icon={TriangleAlert}>
              Die Einladung wurde an {invitation.email} gesendet. Wenn Sie sie mit einem anderen Konto annehmen möchten, kann das abgelehnt
              werden. Melden Sie sich ggf. mit der eingeladenen Adresse an.
            </Alert>
          )}
          {accept.isError && (
            <Alert tone="danger" live>
              {errorMessage(accept.error)}
            </Alert>
          )}
          <Button variant="primary" size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
            Einladung annehmen
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              void logout().then(() => navigate(`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`));
            }}
          >
            Mit anderem Konto anmelden
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-neutral-600">Melden Sie sich an oder erstellen Sie ein Konto, um die Einladung anzunehmen.</p>
          <ButtonLink
            to={`/login?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}
            variant="primary"
            size="lg"
            className="w-full"
          >
            Anmelden und annehmen
          </ButtonLink>
          <ButtonLink
            to={`/registrieren?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invitation.email)}`}
            size="lg"
            className="w-full"
          >
            Neues Konto erstellen
          </ButtonLink>
        </div>
      )}
    </AuthLayout>
  );
}
