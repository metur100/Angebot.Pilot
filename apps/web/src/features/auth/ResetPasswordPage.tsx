import { ApiError, passwordSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { errorMessage } from '@/lib/errors';
import { api } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { AuthLayout, PasswordHints, PasswordInput } from './AuthLayout';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], error: () => tr('Die Passwörter stimmen nicht überein.', 'The passwords do not match.') });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  const password = useWatch({ control, name: 'password' });

  const onSubmit = handleSubmit(async ({ password: newPassword }) => {
    if (!token) return;
    setFormError(null);
    try {
      await api.auth.resetPassword({ token, newPassword });
      setDone(true);
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 400 && !Object.keys(error.fieldErrors).length
          ? tr('Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.', 'The link is invalid or has expired. Please request a new link.')
          : errorMessage(error),
      );
    }
  });

  if (!token) {
    return (
      <AuthLayout title={tr('Link unvollständig', 'Incomplete link')} compact>
        <Alert tone="warning">
          {tr(
            'Dieser Link enthält keinen gültigen Code. Bitte öffnen Sie den Link direkt aus der E-Mail oder fordern Sie einen neuen an.',
            'This link does not contain a valid code. Please open the link directly from the email or request a new one.',
          )}
        </Alert>
        <ButtonLink to="/passwort-vergessen" variant="primary" size="lg" className="mt-6 w-full">
          {tr('Neuen Link anfordern', 'Request new link')}
        </ButtonLink>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title={tr('Passwort geändert', 'Password changed')} compact>
        <Alert tone="success" icon={CircleCheck}>
          {tr(
            'Ihr neues Passwort ist gespeichert. Aus Sicherheitsgründen wurden Sie auf allen Geräten abgemeldet.',
            'Your new password has been saved. For security reasons you have been signed out on all devices.',
          )}
        </Alert>
        <ButtonLink to="/login" variant="primary" size="lg" className="mt-6 w-full">
          {tr('Jetzt anmelden', 'Sign in now')}
        </ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={tr('Neues Passwort festlegen', 'Set a new password')}
      description={tr('Wählen Sie ein sicheres Passwort, das Sie nirgendwo anders verwenden.', 'Choose a secure password that you do not use anywhere else.')}
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-700 hover:text-brand-700 dark:hover:text-brand-800 hover:underline">
          {tr('Zurück zur Anmeldung', 'Back to sign in')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="danger" live>
            {formError}{' '}
            <Link to="/passwort-vergessen" className="font-medium underline">
              {tr('Neuen Link anfordern', 'Request new link')}
            </Link>
          </Alert>
        )}
        <Field label={tr('Neues Passwort', 'New password')} error={errors.password?.message} required>
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <PasswordHints password={password} />
        <Field label={tr('Passwort wiederholen', 'Repeat password')} error={errors.confirm?.message} required>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {tr('Passwort speichern', 'Save password')}
        </Button>
      </form>
    </AuthLayout>
  );
}
