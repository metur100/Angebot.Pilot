import { loginSchema, type LoginForm } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Choice';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ApiError } from '@angebotpilot/api-contracts';
import { errorMessage } from '@/lib/errors';
import { AuthLayout, PasswordInput } from './AuthLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const [remember, setRemember] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: params.get('email') ?? '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values, remember);
      // <PublicOnly> redirects to ?next= or the dashboard once authenticated.
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        setFormError(error.problem.detail ?? 'E-Mail-Adresse oder Passwort ist falsch.');
      } else {
        setFormError(errorMessage(error));
      }
    }
  });

  const next = params.get('next');
  const registerHref = next ? `/registrieren?next=${encodeURIComponent(next)}` : '/registrieren';

  return (
    <AuthLayout
      title="Anmelden"
      description="Willkommen zurück. Melden Sie sich mit Ihrer E-Mail-Adresse an."
      footer={
        <>
          Noch kein Konto?{' '}
          <Link to={registerHref} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            Jetzt kostenlos registrieren
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Field label="E-Mail-Adresse" error={errors.email?.message}>
          <Input type="email" autoComplete="email" className="h-10" {...register('email')} />
        </Field>
        <Field
          label="Passwort"
          error={errors.password?.message}
          labelAside={
            <Link to="/passwort-vergessen" className="text-[13px] font-medium text-brand-600 hover:text-brand-700 hover:underline">
              Passwort vergessen?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </Field>
        <Checkbox
          label="Angemeldet bleiben"
          description="Nur auf eigenen Geräten aktivieren. Sonst endet die Sitzung, wenn Sie den Browser-Tab schließen."
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Anmelden
        </Button>
      </form>
    </AuthLayout>
  );
}
