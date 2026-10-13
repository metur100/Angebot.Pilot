import { ApiError, passwordSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Download, MailWarning, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth, useUser } from '@/app/auth';
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

function ProfileCard() {
  const user = useUser();
  const { setUser } = useAuth();
  const [name, setName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => api.me.update({ displayName: name.trim() }),
    onSuccess: (me) => {
      setUser(me);
      toast.success('Profil gespeichert');
    },
  });
  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () => toast.success('Bestätigungs-E-Mail gesendet', `Bitte prüfen Sie Ihr Postfach (${user.email}).`),
    onError: (e) => toast.error('Senden fehlgeschlagen', errorMessage(e)),
  });
  const nameError = name.trim().length < 2 ? 'Bitte Ihren Namen angeben.' : undefined;
  return (
    <Card>
      <CardHeader title="Profil" />
      <CardBody className="space-y-4">
        {save.isError && (
          <Alert tone="danger" live>
            {errorMessage(save.error)}
          </Alert>
        )}
        <Field label="Name" error={nameError} required className="sm:max-w-md">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
        </Field>
        <div>
          <p className="text-[13px] font-medium text-neutral-800">E-Mail-Adresse</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-900">{user.email}</span>
            {user.emailVerified ? (
              <Badge tone="success" icon={CircleCheck}>Bestätigt</Badge>
            ) : (
              <>
                <Badge tone="warning" icon={MailWarning}>Nicht bestätigt</Badge>
                <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
                  Bestätigungs-E-Mail erneut senden
                </Button>
              </>
            )}
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <Button variant="primary" disabled={Boolean(nameError) || name.trim() === user.displayName} loading={save.isPending} onClick={() => save.mutate()}>
          Speichern
        </Button>
      </CardFooter>
    </Card>
  );
}

const passwordForm = z
  .object({ currentPassword: z.string().min(1, 'Bitte aktuelles Passwort eingeben.'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Die Passwörter stimmen nicht überein.' });
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
      toast.success('Passwort geändert', 'Andere Sitzungen wurden aus Sicherheitsgründen abgemeldet.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const fieldErrors = error.fieldErrors;
        if (fieldErrors.newPassword?.length) setError('newPassword', { message: fieldErrors.newPassword.join(' ') });
        else setError('currentPassword', { message: error.problem.detail ?? 'Das aktuelle Passwort ist nicht korrekt.' }, { shouldFocus: true });
        return;
      }
      setFormError(errorMessage(error));
    }
  });
  return (
    <Card>
      <CardHeader title="Passwort ändern" />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="space-y-4 sm:max-w-md">
          {formError && (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          )}
          <Field label="Aktuelles Passwort" error={errors.currentPassword?.message} required>
            <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
          </Field>
          <Field label="Neues Passwort" error={errors.newPassword?.message} required>
            <PasswordInput autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <PasswordHints password={newPassword} />
          <Field label="Neues Passwort wiederholen" error={errors.confirm?.message} required>
            <PasswordInput autoComplete="new-password" {...register('confirm')} />
          </Field>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Passwort ändern
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
      downloadBlob(blob, `angebotpilot-meine-daten-${fileStamp()}.json`);
      toast.success('Export erstellt');
    },
    onError: (e) => toast.error('Export fehlgeschlagen', errorMessage(e)),
  });
  return (
    <Card>
      <CardHeader title="Daten & Konto" />
      <CardBody className="divide-y divide-neutral-100 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-neutral-900">Meine Daten exportieren</p>
            <p className="text-[13px] text-neutral-500">Ihre persönlichen Kontodaten und Mitgliedschaften als JSON-Datei (Art. 15/20 DSGVO).</p>
          </div>
          <Button icon={Download} loading={exportData.isPending} onClick={() => exportData.mutate()}>
            Exportieren
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-danger-text">Konto löschen</p>
            <p className="text-[13px] text-neutral-500">Entfernt Ihr Konto und alle Ihre Mitgliedschaften. Firmendaten bleiben für die übrigen Teammitglieder erhalten.</p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
            Konto löschen …
          </Button>
        </div>
      </CardBody>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPassword('');
        }}
        title="Konto endgültig löschen?"
        confirmLabel="Konto löschen"
        variant="danger"
        confirmDisabled={!password}
        onConfirm={async () => {
          try {
            await api.me.delete({ password });
          } catch (error) {
            if (error instanceof ApiError && error.code === 'sole_owner') {
              throw new UserFacingError(
                'Sie sind einzige:r Inhaber:in einer Firma mit weiteren Mitgliedern. Übertragen Sie zuerst die Inhaberrolle unter „Team“ oder löschen Sie die Firma.',
              );
            }
            throw error;
          }
          toast.success('Konto gelöscht');
          await logout();
          void navigate('/login', { replace: true });
        }}
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <ul className="list-disc space-y-1 pl-5">
            <li>Sie verlieren sofort den Zugriff auf alle Firmen.</li>
            <li>Firmen, deren einzige:r Inhaber:in Sie ohne weitere Mitglieder sind, werden mit allen Daten gelöscht.</li>
            <li>Dieser Schritt kann nicht rückgängig gemacht werden. Exportieren Sie wichtige Daten vorher.</li>
          </ul>
          <Field label="Zur Bestätigung Ihr Passwort eingeben">
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
      <PasswordCard />
      <DataCard />
    </div>
  );
}
