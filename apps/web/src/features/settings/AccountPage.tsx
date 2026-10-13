import { ApiError, passwordSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Download, MailWarning, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth, useUser } from '@/app/auth';
import { LanguageSwitcher, ThemeSwitcher } from '@/components/layout/Preferences';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { PasswordHints, PasswordInput } from '@/features/auth/AuthLayout';
import { api } from '@/lib/api';
import { downloadBlob, fileStamp } from '@/lib/download';
import { errorMessage, UserFacingError } from '@/lib/errors';
import { tr } from '@/lib/i18n';

function ProfileCard() {
  const user = useUser();
  const { setUser } = useAuth();
  const [name, setName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => api.me.update({ displayName: name.trim() }),
    onSuccess: (me) => {
      setUser(me);
      toast.success(tr('Profil gespeichert', 'Profile saved'));
    },
  });
  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () =>
      toast.success(
        tr('Bestätigungs-E-Mail gesendet', 'Confirmation email sent'),
        tr(`Bitte prüfen Sie Ihr Postfach (${user.email}).`, `Please check your inbox (${user.email}).`),
      ),
    onError: (e) => toast.error(tr('Senden fehlgeschlagen', 'Sending failed'), errorMessage(e)),
  });
  const nameError = name.trim().length < 2 ? tr('Bitte Ihren Namen angeben.', 'Please enter your name.') : undefined;
  return (
    <Card>
      <CardHeader title={tr('Profil', 'Profile')} />
      <CardBody className="space-y-4">
        {save.isError && (
          <Alert tone="danger" live>
            {errorMessage(save.error)}
          </Alert>
        )}
        <Field label={tr('Name', 'Name')} error={nameError} required className="sm:max-w-md">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
        </Field>
        <div>
          <p className="text-[13px] font-medium text-neutral-800">{tr('E-Mail-Adresse', 'Email address')}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-900">{user.email}</span>
            {user.emailVerified ? (
              <Badge tone="success" icon={CircleCheck}>
                {tr('Bestätigt', 'Confirmed')}
              </Badge>
            ) : (
              <>
                <Badge tone="warning" icon={MailWarning}>
                  {tr('Nicht bestätigt', 'Not confirmed')}
                </Badge>
                <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                  {tr('Bestätigungs-E-Mail erneut senden', 'Resend confirmation email')}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <Button variant="primary" disabled={Boolean(nameError) || name.trim() === user.displayName} loading={save.isPending} onClick={() => save.mutate()}>
          {tr('Speichern', 'Save')}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** UI language and colour scheme (per user / per browser). */
function AppearanceCard() {
  return (
    <Card>
      <CardHeader title={tr('Darstellung', 'Appearance')} />
      <CardBody className="divide-y divide-neutral-100 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-neutral-900">{tr('Sprache', 'Language')}</p>
            <p className="text-[13px] text-neutral-500">
              {tr(
                'Gilt für die Oberfläche und E-Mails an Sie. Dokumente für Kunden bleiben deutsch.',
                'Used for the interface and emails to you. Documents for your customers stay in German.',
              )}
            </p>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-neutral-900">{tr('Farbschema', 'Theme')}</p>
            <p className="text-[13px] text-neutral-500">
              {tr('System folgt der Einstellung Ihres Geräts. Gilt für diesen Browser.', 'System follows your device setting. Applies to this browser.')}
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </CardBody>
    </Card>
  );
}

const passwordForm = z
  .object({
    currentPassword: z.string().min(1, { error: () => tr('Bitte aktuelles Passwort eingeben.', 'Please enter your current password.') }),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    error: () => tr('Die Passwörter stimmen nicht überein.', 'The passwords do not match.'),
  });
type PasswordValues = z.infer<typeof passwordForm>;

function PasswordCard() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordForm), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const newPassword = useWatch({ control, name: 'newPassword' });
  const onSubmit = handleSubmit(async ({ currentPassword, newPassword: next }) => {
    setFormError(null);
    try {
      await api.me.changePassword({ currentPassword, newPassword: next });
      reset();
      toast.success(
        tr('Passwort geändert', 'Password changed'),
        tr('Andere Sitzungen wurden aus Sicherheitsgründen abgemeldet.', 'Other sessions were signed out for security reasons.'),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const fieldErrors = error.fieldErrors;
        if (fieldErrors.newPassword?.length) setError('newPassword', { message: fieldErrors.newPassword.join(' ') });
        else setError('currentPassword', { message: error.problem.detail ?? tr('Das aktuelle Passwort ist nicht korrekt.', 'The current password is incorrect.') }, { shouldFocus: true });
        return;
      }
      setFormError(errorMessage(error));
    }
  });
  return (
    <Card>
      <CardHeader title={tr('Passwort ändern', 'Change password')} />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="space-y-4 sm:max-w-md">
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <Field label={tr('Aktuelles Passwort', 'Current password')} error={errors.currentPassword?.message} required>
            <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
          </Field>
          <Field label={tr('Neues Passwort', 'New password')} error={errors.newPassword?.message} required>
            <PasswordInput autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <PasswordHints password={newPassword} />
          <Field label={tr('Neues Passwort wiederholen', 'Repeat new password')} error={errors.confirm?.message} required>
            <PasswordInput autoComplete="new-password" {...register('confirm')} />
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {tr('Passwort ändern', 'Change password')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function DataCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const exportData = useMutation({
    mutationFn: () => api.me.export(),
    onSuccess: (blob) => {
      downloadBlob(blob, tr(`angebotpilot-meine-daten-${fileStamp()}.json`, `angebotpilot-my-data-${fileStamp()}.json`));
      toast.success(tr('Export erstellt', 'Export created'));
    },
    onError: (e) => toast.error(tr('Export fehlgeschlagen', 'Export failed'), errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title={tr('Daten & Konto', 'Data & account')} />
      <CardBody className="divide-y divide-neutral-100 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-neutral-900">{tr('Meine Daten exportieren', 'Export my data')}</p>
            <p className="text-[13px] text-neutral-500">
              {tr(
                'Ihre persönlichen Kontodaten und Mitgliedschaften als JSON-Datei (Art. 15/20 DSGVO).',
                'Your personal account data and memberships as a JSON file (Art. 15/20 GDPR).',
              )}
            </p>
          </div>
          <Button icon={Download} loading={exportData.isPending} onClick={() => exportData.mutate()}>
            {tr('Exportieren', 'Export')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-danger-text">{tr('Konto löschen', 'Delete account')}</p>
            <p className="text-[13px] text-neutral-500">
              {tr(
                'Entfernt Ihr Konto und alle Ihre Mitgliedschaften. Firmendaten bleiben für die übrigen Teammitglieder erhalten.',
                'Removes your account and all your memberships. Company data is kept for the remaining team members.',
              )}
            </p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
            {tr('Konto löschen …', 'Delete account …')}
          </Button>
        </div>
      </CardBody>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPassword('');
        }}
        title={tr('Konto endgültig löschen?', 'Permanently delete your account?')}
        confirmLabel={tr('Konto löschen', 'Delete account')}
        variant="danger"
        confirmDisabled={!password}
        onConfirm={async () => {
          try {
            await api.me.delete({ password });
          } catch (error) {
            if (error instanceof ApiError && error.code === 'sole_owner') {
              throw new UserFacingError(
                tr(
                  'Sie sind einzige:r Inhaber:in einer Firma mit weiteren Mitgliedern. Übertragen Sie zuerst die Inhaberrolle unter „Team“ oder löschen Sie die Firma.',
                  'You are the sole owner of a company with other members. First transfer the owner role under “Team” or delete the company.',
                ),
              );
            }
            throw error;
          }
          toast.success(tr('Konto gelöscht', 'Account deleted'));
          await logout();
          void navigate('/login', { replace: true });
        }}
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <ul className="list-disc space-y-1 pl-5">
            <li>{tr('Sie verlieren sofort den Zugriff auf alle Firmen.', 'You immediately lose access to all companies.')}</li>
            <li>
              {tr(
                'Firmen, deren einzige:r Inhaber:in Sie ohne weitere Mitglieder sind, werden mit allen Daten gelöscht.',
                'Companies of which you are the sole owner without other members are deleted with all their data.',
              )}
            </li>
            <li>
              {tr(
                'Dieser Schritt kann nicht rückgängig gemacht werden. Exportieren Sie wichtige Daten vorher.',
                'This cannot be undone. Export any important data first.',
              )}
            </li>
          </ul>
          <Field label={tr('Zur Bestätigung Ihr Passwort eingeben', 'Enter your password to confirm')}>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </ConfirmDialog>
    </Card>
  );
}

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <ProfileCard />
      <AppearanceCard />
      <PasswordCard />
      <DataCard />
    </div>
  );
}
