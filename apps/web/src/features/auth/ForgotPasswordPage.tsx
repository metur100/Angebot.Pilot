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
      <AuthLayout title="E-Mail unterwegs" compact>
        <Alert tone="success" icon={MailCheck} title="Bitte prüfen Sie Ihr Postfach">
          Falls ein Konto für <strong>{sentTo}</strong> existiert, haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet. Der
          Link ist aus Sicherheitsgründen nur kurze Zeit gültig. Schauen Sie auch im Spam-Ordner nach.
        </Alert>
        <ButtonLink to="/login" className="mt-6 w-full" size="lg">
          Zurück zur Anmeldung
        </ButtonLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Passwort vergessen?"
      description="Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen können."
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
          Zurück zur Anmeldung
        </Link>
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
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          Link anfordern
        </Button>
      </form>
    </AuthLayout>
  );
}
