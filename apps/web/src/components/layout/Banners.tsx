import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailWarning, RefreshCw, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
import { networkStatus, useNetworkStatus } from '@/lib/networkStatus';

/** Shown when the browser is offline or the API cannot be reached. */
export function NetworkBanner() {
  const state = useNetworkStatus();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  if (state === 'online') return null;
  const retry = async () => {
    setRetrying(true);
    networkStatus.setApiUnreachable(false);
    await queryClient.refetchQueries({ type: 'active' });
    setRetrying(false);
  };
  return (
    <div role="alert" className="no-print border-b border-warning-border bg-warning-bg">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <WifiOff aria-hidden size={18} className="shrink-0 text-warning-text" />
        <p className="min-w-0 flex-1 text-sm text-neutral-800">
          <strong className="font-semibold">{state === 'offline' ? tr('Sie sind offline.', 'You are offline.') : tr('Keine Verbindung zum Server.', 'No connection to the server.')}</strong>{' '}
          {tr(
            'Änderungen können gerade nicht gespeichert werden. Bitte prüfen Sie Ihre Internetverbindung.',
            'Changes cannot be saved right now. Please check your internet connection.',
          )}
        </p>
        <Button size="sm" icon={RefreshCw} loading={retrying} onClick={retry}>
          {tr('Erneut versuchen', 'Try again')}
        </Button>
      </div>
    </div>
  );
}

/** Reminds users to verify their email address (sending by email requires it). */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () =>
      toast.success(
        tr('Bestätigungs-E-Mail gesendet', 'Confirmation email sent'),
        tr(`Bitte prüfen Sie Ihr Postfach (${user?.email ?? ''}).`, `Please check your inbox (${user?.email ?? ''}).`),
      ),
    onError: (error) => toast.error(tr('E-Mail konnte nicht gesendet werden', 'Could not send the email'), errorMessage(error)),
  });
  if (!user || user.emailVerified) return null;
  return (
    <div className="no-print border-b border-info-border bg-info-bg">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <MailWarning aria-hidden size={18} className="shrink-0 text-info-text" />
        <p className="min-w-0 flex-1 text-sm text-neutral-800">
          <strong className="font-semibold">{tr('Bitte bestätigen Sie Ihre E-Mail-Adresse.', 'Please confirm your email address.')}</strong>{' '}
          {tr('Erst danach können Sie Angebote per E-Mail versenden.', 'Only then can you send quotations by email.')}
        </p>
        <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
          {tr('Bestätigungs-E-Mail erneut senden', 'Resend confirmation email')}
        </Button>
      </div>
    </div>
  );
}
