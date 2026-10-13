import { emailSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: emailSchema });

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await api.auth.forgotPassword({ email });
      setSentTo(email);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title={tr('E-Mail unterwegs', 'Email on its way')} compact>
        <Alert tone="success" icon={MailCheck} title={tr('Bitte prüfen Sie Ihr Postfach', 'Please check your inbox')}>
          {tr('Falls ein Konto für ', 'If an account exists for ')}
          <strong>{sentTo}</strong>
          {tr(
            ' existiert, haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet. Der Link ist aus Sicherheitsgründen nur kurze Zeit gültig. Schauen Sie auch im Spam-Ordner nach.',
            ', we have sent you a link to reset your password. For security reasons the link is only valid for a short time. Please also check your spam folder.',
          )}
        </Alert>
        <ButtonLink to="/login" className="mt-6 w-full" size="lg">
          {tr('Zurück zur Anmeldung', 'Back to sign in')}
        </ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={tr('Passwort vergessen?', 'Forgot password?')}
      description={tr(
        'Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen können.',
        'Enter your email address. We will send you a link to set a new password.',
      )}
      footer={
        <Link to="/login" className="font-medium text-brand-600 dark:text-brand-700 hover:text-brand-700 dark:hover:text-brand-800 hover:underline">
          {tr('Zurück zur Anmeldung', 'Back to sign in')}
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Field label={tr('E-Mail-Adresse', 'Email address')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" className="h-10" {...register('email')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          {tr('Link anfordern', 'Request link')}
        </Button>
      </form>
    </AuthLayout>
  );
}
