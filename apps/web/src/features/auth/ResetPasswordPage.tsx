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
import { AuthLayout, PasswordHints, PasswordInput } from './AuthLayout';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Die Passwörter stimmen nicht überein.' });

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
          ? 'Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.'
          : errorMessage(error),
      );
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Link unvollständig" compact>
        <Alert tone="warning">
          Dieser Link enthält keinen gültigen Code. Bitte öffnen Sie den Link direkt aus der E-Mail oder fordern Sie einen neuen an.
        </Alert>
        <ButtonLink to="/passwort-vergessen" variant="primary" size="lg" className="mt-6 w-full">
          Neuen Link anfordern
        </ButtonLink>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Passwort geändert" compact>
        <Alert tone="success" icon={CircleCheck}>
          Ihr neues Passwort ist gespeichert. Aus Sicherheitsgründen wurden Sie auf allen Geräten abgemeldet.
        </Alert>
        <ButtonLink to="/login" variant="primary" size="lg" className="mt-6 w-full">
          Jetzt anmelden
        </ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Neues Passwort festlegen"
      description="Wählen Sie ein sicheres Passwort, das Sie nirgendwo anders verwenden."
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="danger" live>
            {formError}{' '}
            <Link to="/passwort-vergessen" className="font-medium underline">
              Neuen Link anfordern
            </Link>
          </Alert>
        )}
        <Field label="Neues Passwort" error={errors.password?.message} required>
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <PasswordHints password={password} />
        <Field label="Passwort wiederholen" error={errors.confirm?.message} required>
          <PasswordInput autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Passwort speichern
        </Button>
      </form>
    </AuthLayout>
  );
}
