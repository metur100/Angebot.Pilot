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
import { currentIntlLocale, tr } from '@/lib/i18n';

export type CustomerFormInput = z.input<typeof customerSchema>;
type CustomerFormOutput = z.output<typeof customerSchema>;

const knownFields = [
  'type', 'companyName', 'salutation', 'firstName', 'lastName', 'email', 'phone', 'billingStreet', 'billingPostalCode', 'billingCity',
  'billingCountry', 'hasServiceAddress', 'serviceStreet', 'servicePostalCode', 'serviceCity', 'serviceCountry', 'vatId', 'notes', 'followUpOptOut',
];

/** ISO 3166-1 alpha-2 codes offered in country selects (stored as the value), DACH first. */
export const countryCodes = ['DE', 'AT', 'CH', 'LU', 'NL', 'BE', 'FR', 'DK', 'PL', 'CZ', 'IT', 'ES'] as const;

/** Country name in the current UI language (Intl.DisplayNames), falling back to the code. */
export function countryName(code: string | null | undefined) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([currentIntlLocale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** [code, name] pairs for country selects, names in the current UI language. Call at render time. */
export function countryOptions(): [string, string][] {
  return countryCodes.map((code) => [code, countryName(code)]);
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
      <Section
        compact={compact}
        title={tr('Kundenart', 'Customer type')}
        description={tr('Geschäftskunden erhalten Firmenname und USt-IdNr. auf dem Angebot.', 'Business customers get their company name and VAT ID on the quotation.')}
      >
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <RadioCards<CustomerType>
              name={`${id}-type`}
              legend={tr('Kundenart', 'Customer type')}
              hideLegend
              value={field.value}
              onChange={field.onChange}
              options={[
                {
                  value: 'Business',
                  label: tr('Geschäftskunde', 'Business customer'),
                  description: tr('Firma, Verein, Behörde', 'Company, association, public authority'),
                  icon: <Building2 aria-hidden size={18} className="mt-0.5 text-neutral-500" />,
                },
                {
                  value: 'Private',
                  label: tr('Privatkunde', 'Private customer'),
                  description: tr('Privatperson oder Haushalt', 'Private person or household'),
                  icon: <UserRound aria-hidden size={18} className="mt-0.5 text-neutral-500" />,
                },
              ]}
            />
          )}
        />
      </Section>

      <Section compact={compact} title={business ? tr('Firma & Ansprechpartner', 'Company & contact person') : tr('Person', 'Person')}>
        {business && (
          <Field label={tr('Firmenname', 'Company name')} error={errors.companyName?.message} required>
            <Input autoComplete="organization" {...register('companyName')} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[140px_1fr_1fr]">
          <Field label={tr('Anrede', 'Salutation')} error={errors.salutation?.message} optional>
            {/* Stored values stay German: they are used in the salutation of German customer documents. */}
            <Select {...register('salutation')}>
              <option value="">–</option>
              <option value="Frau">{tr('Frau', 'Ms')}</option>
              <option value="Herr">{tr('Herr', 'Mr')}</option>
              <option value="Divers">{tr('Divers', 'Mx')}</option>
            </Select>
          </Field>
          <Field label={tr('Vorname', 'First name')} error={errors.firstName?.message} optional>
            <Input autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field label={tr('Nachname', 'Last name')} error={errors.lastName?.message} required={!business} optional={business}>
            <Input autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={tr('E-Mail', 'Email')}
            error={errors.email?.message}
            optional
            hint={tr('Für den Versand von Angeboten und Erinnerungen.', 'For sending quotations and reminders.')}
          >
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label={tr('Telefon', 'Phone')} error={errors.phone?.message} optional>
            <Input type="tel" autoComplete="tel" {...register('phone')} />
          </Field>
        </div>
        {business && (
          <Field
            label={tr('USt-IdNr.', 'VAT ID (USt-IdNr.)')}
            error={errors.vatId?.message}
            optional
            hint={tr('Wichtig z. B. bei Reverse Charge (§ 13b UStG).', 'Important e.g. for reverse charge (§ 13b UStG).')}
          >
            <Input placeholder="DE123456789" className="sm:max-w-[260px]" {...register('vatId')} />
          </Field>
        )}
      </Section>

      <Section compact={compact} title={tr('Rechnungsadresse', 'Billing address')}>
        <Field label={tr('Straße und Hausnummer', 'Street and house number')} error={errors.billingStreet?.message} optional>
          <Input autoComplete="street-address" {...register('billingStreet')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr_200px]">
          <Field label={tr('PLZ', 'Postcode')} error={errors.billingPostalCode?.message} optional>
            <Input autoComplete="postal-code" {...register('billingPostalCode')} />
          </Field>
          <Field label={tr('Ort', 'City')} error={errors.billingCity?.message} optional>
            <Input autoComplete="address-level2" {...register('billingCity')} />
          </Field>
          <Field label={tr('Land', 'Country')} error={errors.billingCountry?.message}>
            <Select {...register('billingCountry')}>
              {countryOptions().map(([code, name]) => (
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
              label={tr('Abweichende Leistungsadresse', 'Different service address')}
              description={tr('z. B. Baustelle oder Objekt, an dem die Arbeiten ausgeführt werden.', 'e.g. the site or property where the work is carried out.')}
            />
          )}
        />
        {hasServiceAddress && (
          <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-25 p-4">
            <Field label={tr('Straße und Hausnummer (Leistungsort)', 'Street and house number (service location)')} error={errors.serviceStreet?.message}>
              <Input {...register('serviceStreet')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[120px_1fr_200px]">
              <Field label={tr('PLZ', 'Postcode')} error={errors.servicePostalCode?.message}>
                <Input {...register('servicePostalCode')} />
              </Field>
              <Field label={tr('Ort', 'City')} error={errors.serviceCity?.message}>
                <Input {...register('serviceCity')} />
              </Field>
              <Field label={tr('Land', 'Country')} error={errors.serviceCountry?.message}>
                <Select {...register('serviceCountry')}>
                  {countryOptions().map(([code, name]) => (
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

      <Section compact={compact} title={tr('Notizen & Erinnerungen', 'Notes & reminders')}>
        <Field
          label={tr('Interne Notizen', 'Internal notes')}
          error={errors.notes?.message}
          optional
          hint={tr('Nur intern sichtbar – erscheint nie auf Angeboten.', 'Only visible internally – never appears on quotations.')}
        >
          <Textarea rows={3} {...register('notes')} />
        </Field>
        <Controller
          control={control}
          name="followUpOptOut"
          render={({ field }) => (
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label={tr('Keine automatischen Erinnerungen', 'No automatic reminders')}
              description={tr('Dieser Kunde erhält keine Nachfass-E-Mails zu offenen Angeboten.', 'This customer receives no follow-up emails about open quotations.')}
            />
          )}
        />
      </Section>
    </form>
  );
}
