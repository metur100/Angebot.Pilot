import { ApiError, registerSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Choice';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { legalLinks } from '@/lib/env';
import { applyServerErrors, errorMessage, hasFieldErrors } from '@/lib/errors';
import { AuthLayout, PasswordHints, PasswordInput } from './AuthLayout';

type RegisterInput = z.input<typeof registerSchema>;
type RegisterOutput = z.output<typeof registerSchema>;

export default function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: params.get('email') ?? '', password: '', acceptTerms: false as unknown as true },
  });
  const password = useWatch({ control, name: 'password' }) ?? '';

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerAccount(values);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_taken') {
        setError('email', { message: 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melden Sie sich an.' }, { shouldFocus: true });
        return;
      }
      const rest = applyServerErrors(error, setError, ['displayName', 'email', 'password', 'acceptTerms']);
      if (rest.length > 0 || !hasFieldErrors(error)) {
        setFormError(rest.join(' ') || errorMessage(error));
      }
    }
  });

  const next = params.get('next');
  return (
    <AuthLayout
      title="Konto erstellen"
      description="Starten Sie mit einer kostenlosen Testphase. Für den Test sind keine Zahlungsdaten nötig."
      footer={
        <>
          Bereits registriert?{' '}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Anmelden
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
        <Field label="Ihr Name" error={errors.displayName?.message} required>
          <Input autoComplete="name" className="h-10" placeholder="Vor- und Nachname" {...register('displayName')} />
        </Field>
        <Field label="E-Mail-Adresse" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" className="h-10" {...register('email')} />
        </Field>
        <Field label="Passwort" error={errors.password?.message} required>
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </Field>
        <PasswordHints password={password} />
        <Checkbox
          label={
            <>
              Ich akzeptiere die{' '}
              <a href={legalLinks.agb} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline">
                AGB
              </a>{' '}
              und habe die{' '}
              <a href={legalLinks.datenschutz} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 underline">
                Datenschutzerklärung
              </a>{' '}
              gelesen.
            </>
          }
          error={errors.acceptTerms?.message}
          {...register('acceptTerms')}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Konto erstellen
        </Button>
      </form>
    </AuthLayout>
  );
}
