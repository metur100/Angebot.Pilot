import { companySchema, type TaxMode } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useAuth, useUser } from '@/app/auth';
import { COMPANY_KEY } from '@/app/company';
import { TaxModePicker } from '@/components/domain/TaxMode';
import { LegalFooter } from '@/features/auth/AuthLayout';
import { BrandLogo } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, hasFieldErrors } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/hooks';

type CompanyInput = z.input<typeof companySchema>;
type CompanyOutput = z.output<typeof companySchema>;

const fields = ['name', 'addressLine1', 'postalCode', 'city', 'email', 'phone', 'vatId', 'defaultTaxMode', 'quotationPrefix'];
const emptyToNull = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

export default function OnboardingPage() {
  useDocumentTitle('Firma anlegen');
  const user = useUser();
  const { reloadUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const additional = params.get('neu') === '1';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompanyInput, unknown, CompanyOutput>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '',
      addressLine1: '',
      postalCode: '',
      city: '',
      email: user.email,
      phone: '',
      vatId: '',
      defaultTaxMode: 'Standard',
      quotationPrefix: 'AN',
    },
  });

  if (user.companies.length > 0 && !additional) return <Navigate to="/dashboard" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const company = await api.companies.create({
        name: values.name.trim(),
        addressLine1: emptyToNull(values.addressLine1),
        postalCode: emptyToNull(values.postalCode),
        city: emptyToNull(values.city),
        country: 'DE',
        email: emptyToNull(values.email),
        phone: emptyToNull(values.phone),
        vatId: emptyToNull(values.vatId),
        defaultTaxMode: values.defaultTaxMode,
        quotationPrefix: emptyToNull(values.quotationPrefix),
      });
      try {
        window.localStorage.setItem(COMPANY_KEY, company.id);
      } catch {
        // ignore
      }
      await reloadUser();
      await queryClient.invalidateQueries();
      toast.success('Firma angelegt', `${company.name} ist bereit. Legen Sie jetzt Ihren ersten Kunden an.`);
      void navigate('/dashboard', { replace: true });
    } catch (error) {
      const rest = applyServerErrors(error, setError, fields);
      if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
    }
  });

  return (
    <div className="min-h-dvh bg-neutral-50">
      <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-5 sm:px-8">
        <BrandLogo />
        {additional ? (
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
            <ArrowLeft aria-hidden size={15} /> Zurück
          </Link>
        ) : (
          <Button variant="ghost" size="sm" icon={LogOut} onClick={() => void logout().then(() => navigate('/login'))}>
            Abmelden
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-[680px] px-4 py-10 sm:px-6">
        <p className="text-[13px] font-semibold text-brand-700">{additional ? 'Weitere Firma' : 'Willkommen, ' + user.displayName.split(' ')[0]}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.015em] text-neutral-900">Legen Sie Ihre Firma an</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Diese Angaben erscheinen im Briefkopf Ihrer Angebote. Sie können alles später unter Einstellungen ändern.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-8">
          <Card>
            <CardBody className="space-y-6 py-6">
              {formError && (
                <Alert tone="danger" live>
                  {formError}
                </Alert>
              )}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-neutral-900">Firmendaten</h2>
                <Field label="Firmenname" error={errors.name?.message} required>
                  <Input autoComplete="organization" placeholder="z. B. Elektro Berger GmbH" {...register('name')} />
                </Field>
                <Field label="Straße und Hausnummer" error={errors.addressLine1?.message} optional>
                  <Input autoComplete="street-address" {...register('addressLine1')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                  <Field label="PLZ" error={errors.postalCode?.message} optional>
                    <Input inputMode="numeric" autoComplete="postal-code" {...register('postalCode')} />
                  </Field>
                  <Field label="Ort" error={errors.city?.message} optional>
                    <Input autoComplete="address-level2" {...register('city')} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="E-Mail für Kunden" error={errors.email?.message} optional>
                    <Input type="email" autoComplete="email" {...register('email')} />
                  </Field>
                  <Field label="Telefon" error={errors.phone?.message} optional>
                    <Input type="tel" autoComplete="tel" {...register('phone')} />
                  </Field>
                </div>
                <Field label="USt-IdNr." error={errors.vatId?.message} optional hint="Format z. B. DE123456789. Kann später ergänzt werden.">
                  <Input placeholder="DE123456789" {...register('vatId', { setValueAs: (v: string) => v.toUpperCase().replace(/\s/g, '') })} />
                </Field>
              </section>

              <section className="space-y-4 border-t border-neutral-100 pt-6">
                <h2 className="text-sm font-semibold text-neutral-900">Steuern & Nummern</h2>
                <Controller
                  control={control}
                  name="defaultTaxMode"
                  render={({ field }) => (
                    <TaxModePicker
                      name="defaultTaxMode"
                      legend="Standard-Besteuerung für neue Angebote"
                      value={field.value}
                      onChange={(mode: TaxMode) => field.onChange(mode)}
                    />
                  )}
                />
                <Field
                  label="Präfix für Angebotsnummern"
                  error={errors.quotationPrefix?.message}
                  hint="1–8 Großbuchstaben oder Ziffern. Beispiel: AN → AN-2026-0001."
                  className="sm:max-w-[260px]"
                >
                  <Input {...register('quotationPrefix', { setValueAs: (v: string) => v.toUpperCase() })} />
                </Field>
              </section>
            </CardBody>
            <CardFooter>
              <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full sm:w-auto">
                Firma anlegen und loslegen
              </Button>
            </CardFooter>
          </Card>
        </form>
        <LegalFooter className="mt-10 justify-center" />
      </main>
    </div>
  );
}
