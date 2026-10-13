import { emailSchema, type CompanyDto } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '@/app/auth';
import { useCompany, useCompanyDetails } from '@/app/company';
import { Restricted } from '@/components/domain/Common';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { countries } from '@/features/customers/CustomerForm';
import { api } from '@/lib/api';
import { downloadBlob, fileStamp } from '@/lib/download';
import { applyServerErrors, errorMessage, hasFieldErrors, isConflict } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { OWNER_ONLY_HINT } from '@/lib/roles';
import { companyToRequest, ConflictAlert, emptyToNull, FormSection, ReadOnlyNotice } from './shared';

const optional = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`);

const schema = z.object({
  name: z.string().trim().min(2, 'Bitte Firmennamen angeben.').max(200),
  addressLine1: optional(200),
  addressLine2: optional(200),
  postalCode: z.string().trim().regex(/^(\d{4,5})?$/, 'Bitte gültige Postleitzahl angeben.'),
  city: optional(100),
  country: z.string().length(2),
  email: emailSchema.or(z.literal('')),
  phone: optional(50),
  website: optional(200),
  vatId: z.string().trim().regex(/^([A-Z]{2}[A-Z0-9]{2,13})?$/, 'Format z. B. DE123456789.'),
  taxNumber: optional(30),
  timeZone: z.string().min(1),
  language: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

const fields = Object.keys(schema.shape);

const knownTimeZones: [string, string][] = [
  ['Europe/Berlin', 'Europa/Berlin'],
  ['Europe/Vienna', 'Europa/Wien'],
  ['Europe/Zurich', 'Europa/Zürich'],
];
/** Known zones plus the stored value, so the select never shows an empty entry. */
function timeZoneOptions(current: string): [string, string][] {
  return knownTimeZones.some(([v]) => v === current) || !current ? knownTimeZones : [...knownTimeZones, [current, current]];
}
function languageOptions(current: string): [string, string][] {
  const value = current || 'de-DE';
  return [[value, value.toLowerCase().startsWith('de') ? 'Deutsch' : value]];
}

function toForm(c: CompanyDto): FormValues {
  return {
    name: c.name,
    addressLine1: c.addressLine1 ?? '',
    addressLine2: c.addressLine2 ?? '',
    postalCode: c.postalCode ?? '',
    city: c.city ?? '',
    country: c.country || 'DE',
    email: c.email ?? '',
    phone: c.phone ?? '',
    website: c.website ?? '',
    vatId: c.vatId ?? '',
    taxNumber: c.taxNumber ?? '',
    timeZone: c.timeZone || 'Europe/Berlin',
    language: c.language || 'de-DE',
  };
}

function ProfileForm({ company, readOnly }: { company: CompanyDto; readOnly: boolean }) {
  const { companyId } = useCompany();
  const { reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(company) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const updated = await api.companies.update(
        companyId,
        companyToRequest(company, {
          name: values.name.trim(),
          addressLine1: emptyToNull(values.addressLine1),
          addressLine2: emptyToNull(values.addressLine2),
          postalCode: emptyToNull(values.postalCode),
          city: emptyToNull(values.city),
          country: values.country,
          email: emptyToNull(values.email),
          phone: emptyToNull(values.phone),
          website: emptyToNull(values.website),
          vatId: emptyToNull(values.vatId),
          taxNumber: emptyToNull(values.taxNumber),
          timeZone: values.timeZone,
          language: values.language,
        }),
      );
      queryClient.setQueryData(qk.company(companyId), updated);
      reset(toForm(updated));
      if (updated.name !== company.name) void reloadUser().catch(() => undefined);
      toast.success('Firmendaten gespeichert');
    } catch (error) {
      if (isConflict(error)) {
        setConflict(true);
        return;
      }
      const rest = applyServerErrors(error, setError, fields);
      if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
    }
  });

  return (
    <Card>
      <CardHeader title="Firmenprofil" description="Erscheint im Briefkopf und in der Fußzeile Ihrer Angebote." />
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className="min-w-0">
          <CardBody className="space-y-6 py-6">
            {conflict && (
              <ConflictAlert
                onReload={async () => {
                  const fresh = await queryClient.fetchQuery({ queryKey: qk.company(companyId), queryFn: () => api.companies.get(companyId), staleTime: 0 });
                  reset(toForm(fresh));
                  setConflict(false);
                }}
              />
            )}
            {formError && (
              <Alert tone="danger" live>
                {formError}
              </Alert>
            )}
            <FormSection title="Name & Anschrift">
              <Field label="Firmenname" error={errors.name?.message} required>
                <Input autoComplete="organization" {...register('name')} />
              </Field>
              <Field label="Straße und Hausnummer" error={errors.addressLine1?.message} optional>
                <Input {...register('addressLine1')} />
              </Field>
              <Field label="Adresszusatz" error={errors.addressLine2?.message} optional>
                <Input {...register('addressLine2')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[120px_1fr_200px]">
                <Field label="PLZ" error={errors.postalCode?.message} optional>
                  <Input inputMode="numeric" {...register('postalCode')} />
                </Field>
                <Field label="Ort" error={errors.city?.message} optional>
                  <Input {...register('city')} />
                </Field>
                <Field label="Land" error={errors.country?.message}>
                  <Select {...register('country')}>
                    {countries.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </FormSection>
            <FormSection title="Kontakt">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="E-Mail" error={errors.email?.message} optional>
                  <Input type="email" {...register('email')} />
                </Field>
                <Field label="Telefon" error={errors.phone?.message} optional>
                  <Input type="tel" {...register('phone')} />
                </Field>
              </div>
              <Field label="Website" error={errors.website?.message} optional>
                <Input type="url" placeholder="https://" {...register('website')} />
              </Field>
            </FormSection>
            <FormSection title="Steuern" description="Pflichtangaben auf Angeboten und Rechnungen.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="USt-IdNr." error={errors.vatId?.message} optional>
                  <Input placeholder="DE123456789" {...register('vatId', { setValueAs: (v: string) => v.toUpperCase().replace(/\s/g, '') })} />
                </Field>
                <Field label="Steuernummer" error={errors.taxNumber?.message} optional>
                  <Input {...register('taxNumber')} />
                </Field>
              </div>
            </FormSection>
            <FormSection title="Region">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Zeitzone" hint="Für Datumsangaben, Fristen und Erinnerungen.">
                  <Select {...register('timeZone')}>
                    {timeZoneOptions(company.timeZone).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sprache der Dokumente">
                  <Select {...register('language')}>
                    {languageOptions(company.language).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </FormSection>
          </CardBody>
          {!readOnly && (
            <CardFooter>
              <Button onClick={() => reset(toForm(company))} disabled={!isDirty || isSubmitting}>
                Verwerfen
              </Button>
              <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>
                Speichern
              </Button>
            </CardFooter>
          )}
        </fieldset>
      </form>
    </Card>
  );
}

function DangerZone({ company }: { company: CompanyDto }) {
  const { companyId, can } = useCompany();
  const { reloadUser } = useAuth();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState('');
  const [open, setOpen] = useState(false);
  const exportData = useMutation({
    mutationFn: () => api.companies.export(companyId),
    onSuccess: (blob) => {
      downloadBlob(blob, `firma-export-${fileStamp()}.json`);
      toast.success('Export erstellt');
    },
    onError: (error) => toast.error('Export fehlgeschlagen', errorMessage(error)),
  });

  return (
    <Card className="border-danger-border">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2 text-danger-text">
            <TriangleAlert aria-hidden size={16} /> Gefahrenzone
          </span>
        }
        description="Datenexport und endgültiges Löschen der Firma. Nur für Inhaber:innen."
      />
      <CardBody className="divide-y divide-neutral-100 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-medium text-neutral-900">Firmendaten exportieren</p>
            <p className="text-[13px] text-neutral-500">Alle Kunden, Angebote, Aufträge und Einstellungen als JSON-Datei (Art. 20 DSGVO).</p>
          </div>
          <Restricted allowed={can.ownerActions} hint={OWNER_ONLY_HINT}>
            <Button icon={Download} loading={exportData.isPending} disabled={!can.ownerActions} onClick={() => exportData.mutate()}>
              Exportieren
            </Button>
          </Restricted>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-medium text-neutral-900">Firma löschen</p>
            <p className="text-[13px] text-neutral-500">Löscht die Firma mit allen Kunden, Angeboten, Aufträgen und Teamzugängen. Nicht umkehrbar.</p>
          </div>
          <Restricted allowed={can.ownerActions} hint={OWNER_ONLY_HINT}>
            <Button variant="danger" icon={Trash2} disabled={!can.ownerActions} onClick={() => setOpen(true)}>
              Firma löschen …
            </Button>
          </Restricted>
        </div>
      </CardBody>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmName('');
        }}
        title={`„${company.name}“ endgültig löschen?`}
        confirmLabel="Endgültig löschen"
        variant="danger"
        confirmDisabled={confirmName.trim() !== company.name}
        onConfirm={async () => {
          await api.companies.delete(companyId, { confirmName: confirmName.trim() });
          toast.success('Firma gelöscht', company.name);
          await reloadUser();
          void navigate('/dashboard', { replace: true });
        }}
      >
        <div className="space-y-3 text-sm text-neutral-700">
          <ul className="list-disc space-y-1 pl-5">
            <li>Alle Kunden, Angebote, PDFs, Aufträge und Vorlagen dieser Firma werden gelöscht.</li>
            <li>Alle Teammitglieder verlieren den Zugriff, offene Kundenlinks funktionieren nicht mehr.</li>
            <li>Gesetzliche Aufbewahrungspflichten liegen bei Ihnen: Exportieren Sie Ihre Daten vorher.</li>
          </ul>
          <Field label={`Zur Bestätigung den Firmennamen eingeben: ${company.name}`}>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </ConfirmDialog>
    </Card>
  );
}

export default function CompanySettingsPage() {
  const { can } = useCompany();
  const company = useCompanyDetails();
  if (company.isPending) return <PageSkeleton />;
  if (company.isError) return <ErrorState error={company.error} onRetry={() => void company.refetch()} />;
  const readOnly = !can.manageCompany;
  return (
    <div className="space-y-6">
      {readOnly && <ReadOnlyNotice />}
      <ProfileForm key={company.data.rowVersion} company={company.data} readOnly={readOnly} />
      <DangerZone company={company.data} />
    </div>
  );
}
