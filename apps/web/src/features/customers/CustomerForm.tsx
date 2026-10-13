import { customerSchema, type CustomerDto, type CustomerType, type UpsertCustomerRequest } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { RadioCards, Switch } from '@/components/ui/Choice';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { applyServerErrors, errorMessage, hasFieldErrors, isConflict } from '@/lib/errors';

export type CustomerFormInput = z.input<typeof customerSchema>;
type CustomerFormOutput = z.output<typeof customerSchema>;

const knownFields = [
  'type', 'companyName', 'salutation', 'firstName', 'lastName', 'email', 'phone', 'billingStreet', 'billingPostalCode', 'billingCity',
  'billingCountry', 'hasServiceAddress', 'serviceStreet', 'servicePostalCode', 'serviceCity', 'serviceCountry', 'vatId', 'notes', 'followUpOptOut',
];

export const countries: [string, string][] = [
  ['DE', 'Deutschland'],
  ['AT', 'Österreich'],
  ['CH', 'Schweiz'],
  ['LU', 'Luxemburg'],
  ['NL', 'Niederlande'],
  ['BE', 'Belgien'],
  ['FR', 'Frankreich'],
  ['DK', 'Dänemark'],
  ['PL', 'Polen'],
  ['CZ', 'Tschechien'],
  ['IT', 'Italien'],
  ['ES', 'Spanien'],
];

export function countryName(code: string | null | undefined) {
  if (!code) return '';
  return countries.find(([c]) => c === code)?.[1] ?? code;
}

export function formatAddress(street: string | null, postalCode: string | null, city: string | null, country: string | null) {
  const line2 = [postalCode, city].filter(Boolean).join(' ');
  const parts = [street, line2, country && country !== 'DE' ? countryName(country) : null].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

const n = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);

export function toCustomerRequest(values: CustomerFormOutput, rowVersion?: string | null): UpsertCustomerRequest {
  const business = values.type === 'Business';
  return {
    type: values.type,
    companyName: business ? n(values.companyName) : null,
    salutation: n(values.salutation),
    firstName: n(values.firstName),
    lastName: n(values.lastName),
    email: n(values.email),
    phone: n(values.phone),
    billingStreet: n(values.billingStreet),
    billingPostalCode: n(values.billingPostalCode),
    billingCity: n(values.billingCity),
    billingCountry: values.billingCountry || 'DE',
    hasServiceAddress: values.hasServiceAddress,
    serviceStreet: values.hasServiceAddress ? n(values.serviceStreet) : null,
    servicePostalCode: values.hasServiceAddress ? n(values.servicePostalCode) : null,
    serviceCity: values.hasServiceAddress ? n(values.serviceCity) : null,
    serviceCountry: values.hasServiceAddress ? n(values.serviceCountry) || 'DE' : null,
    vatId: business ? n(values.vatId) : null,
    notes: n(values.notes),
    followUpOptOut: values.followUpOptOut,
    rowVersion: rowVersion ?? null,
  };
}

export function customerDefaults(customer?: CustomerDto | null, type: CustomerType = 'Business'): CustomerFormInput {
  return {
    type: customer?.type ?? type,
    companyName: customer?.companyName ?? '',
    salutation: customer?.salutation ?? '',
    firstName: customer?.firstName ?? '',
    lastName: customer?.lastName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    billingStreet: customer?.billingStreet ?? '',
    billingPostalCode: customer?.billingPostalCode ?? '',
    billingCity: customer?.billingCity ?? '',
    billingCountry: customer?.billingCountry ?? 'DE',
    hasServiceAddress: customer?.hasServiceAddress ?? false,
    serviceStreet: customer?.serviceStreet ?? '',
    servicePostalCode: customer?.servicePostalCode ?? '',
    serviceCity: customer?.serviceCity ?? '',
    serviceCountry: customer?.serviceCountry ?? 'DE',
    vatId: customer?.vatId ?? '',
    notes: customer?.notes ?? '',
    followUpOptOut: customer?.followUpOptOut ?? false,
  };
}

function Section({ title, description, children, compact }: { title: string; description?: string; children: ReactNode; compact?: boolean }) {
  if (compact) {
    return (
      <section className="space-y-4 border-t border-neutral-100 pt-5 first:border-t-0 first:pt-0">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {children}
      </section>
    );
  }
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0 md:grid-cols-[200px_1fr]">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {description && <p className="mt-1 text-[13px] text-neutral-500">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

interface CustomerFormProps {
  customer?: CustomerDto | null;
  id: string;
  onSubmit: (request: UpsertCustomerRequest) => Promise<unknown>;
  /** Compact layout for dialogs (no section side titles). */
  compact?: boolean;
  onConflict?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Create/edit form for customers (Business vs Private with conditional fields). Submit via a button with form={id}. */
export function CustomerForm({ customer, id, onSubmit, compact, onConflict }: CustomerFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CustomerFormInput, unknown, CustomerFormOutput>({
    resolver: zodResolver(customerSchema),
    defaultValues: customerDefaults(customer),
  });
  const type = useWatch({ control, name: 'type' });
  const hasServiceAddress = useWatch({ control, name: 'hasServiceAddress' });
  const business = type === 'Business';

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(toCustomerRequest(values, customer?.rowVersion));
    } catch (error) {
      if (isConflict(error)) {
        onConflict?.();
        setFormError(errorMessage(error));
        return;
      }
      const rest = applyServerErrors(error, setError, knownFields);
      if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
    }
  });


  return (
    <form
      id={id}
      onSubmit={(event) => {
        // The form may be rendered in a dialog portal inside another form: keep the submit event local.
        event.stopPropagation();
        void submit(event);
      }}
      noValidate className="space-y-6">
      {formError && (
        <Alert tone="danger" live>
          {formError}
        </Alert>
      )}
      <Section compact={compact} title="Kundenart" description="Geschäftskunden erhalten Firmenname und USt-IdNr. auf dem Angebot.">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <RadioCards<CustomerType>
              name={`${id}-type`}
              legend="Kundenart"
              hideLegend
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'Business', label: 'Geschäftskunde', description: 'Firma, Verein, Behörde', icon: <Building2 aria-hidden size={18} className="mt-0.5 text-neutral-500" /> },
                { value: 'Private', label: 'Privatkunde', description: 'Privatperson oder Haushalt', icon: <UserRound aria-hidden size={18} className="mt-0.5 text-neutral-500" /> },
              ]}
            />
          )}
        />
      </Section>

      <Section compact={compact} title={business ? 'Firma & Ansprechpartner' : 'Person'}>
        {business && (
          <Field label="Firmenname" error={errors.companyName?.message} required>
            <Input autoComplete="organization" {...register('companyName')} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[140px_1fr_1fr]">
          <Field label="Anrede" error={errors.salutation?.message} optional>
            <Select {...register('salutation')}>
              <option value="">–</option>
              <option value="Frau">Frau</option>
              <option value="Herr">Herr</option>
              <option value="Divers">Divers</option>
            </Select>
          </Field>
          <Field label="Vorname" error={errors.firstName?.message} optional>
            <Input autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field label="Nachname" error={errors.lastName?.message} required={!business} optional={business}>
            <Input autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-Mail" error={errors.email?.message} optional hint="Für den Versand von Angeboten und Erinnerungen.">
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Telefon" error={errors.phone?.message} optional>
            <Input type="tel" autoComplete="tel" {...register('phone')} />
          </Field>
        </div>
        {business && (
          <Field label="USt-IdNr." error={errors.vatId?.message} optional hint="Wichtig z. B. bei Reverse Charge (§ 13b UStG).">
            <Input placeholder="DE123456789" className="sm:max-w-[260px]" {...register('vatId')} />
          </Field>
        )}
      </Section>

      <Section compact={compact} title="Rechnungsadresse">
        <Field label="Straße und Hausnummer" error={errors.billingStreet?.message} optional>
          <Input autoComplete="street-address" {...register('billingStreet')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr_200px]">
          <Field label="PLZ" error={errors.billingPostalCode?.message} optional>
            <Input autoComplete="postal-code" {...register('billingPostalCode')} />
          </Field>
          <Field label="Ort" error={errors.billingCity?.message} optional>
            <Input autoComplete="address-level2" {...register('billingCity')} />
          </Field>
          <Field label="Land" error={errors.billingCountry?.message}>
            <Select {...register('billingCountry')}>
              {countries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Controller
          control={control}
          name="hasServiceAddress"
          render={({ field }) => (
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label="Abweichende Leistungsadresse"
              description="z. B. Baustelle oder Objekt, an dem die Arbeiten ausgeführt werden."
            />
          )}
        />
        {hasServiceAddress && (
          <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-25 p-4">
            <Field label="Straße und Hausnummer (Leistungsort)" error={errors.serviceStreet?.message}>
              <Input {...register('serviceStreet')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[120px_1fr_200px]">
              <Field label="PLZ" error={errors.servicePostalCode?.message}>
                <Input {...register('servicePostalCode')} />
              </Field>
              <Field label="Ort" error={errors.serviceCity?.message}>
                <Input {...register('serviceCity')} />
              </Field>
              <Field label="Land" error={errors.serviceCountry?.message}>
                <Select {...register('serviceCountry')}>
                  {countries.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section compact={compact} title="Notizen & Erinnerungen">
        <Field label="Interne Notizen" error={errors.notes?.message} optional hint="Nur intern sichtbar – erscheint nie auf Angeboten.">
          <Textarea rows={3} {...register('notes')} />
        </Field>
        <Controller
          control={control}
          name="followUpOptOut"
          render={({ field }) => (
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label="Keine automatischen Erinnerungen"
              description="Dieser Kunde erhält keine Nachfass-E-Mails zu offenen Angeboten."
            />
          )}
        />
      </Section>
    </form>
  );
}
