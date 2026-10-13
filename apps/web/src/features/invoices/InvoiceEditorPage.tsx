import { addDaysIso, ApiError, type CompanySettingsDto, type InvoiceDto, type TaxRateDto } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileCheck2, Lock, RefreshCw, Save } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useCompany, useCompanySettings, useTaxRates } from '@/app/company';
import { UnsavedChangesGuard } from '@/components/domain/Common';
import { TAX_DISCLAIMER, taxModeExplanation, taxModeShort } from '@/components/domain/TaxMode';
import { InvoiceStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { HelpPopover } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { CustomerPicker } from '@/features/quotations/CustomerPicker';
import { LineItemsEditor, type LineItemValue } from '@/features/quotations/LineItemsEditor';
import { defaultTaxRateOf, liveTotals } from '@/features/quotations/QuotationEditorPage';
import { TotalsList } from '@/features/quotations/Totals';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, hasFieldErrors, isConflict } from '@/lib/errors';
import { daysUntil, formatEur } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { isAdminRole } from '@/lib/roles';
import {
  dueDateFollowsIssueDate,
  invoiceFormFields,
  invoiceRequest,
  invoiceSchema,
  invoiceToForm,
  newInvoiceDefaults,
  type InvoiceFormInput,
  type InvoiceFormOutput,
} from './schema';
import { daysText, invoiceName, useInvalidateInvoice } from './shared';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SaveMode = 'stay' | 'issue';

interface EditorFormProps {
  invoice: InvoiceDto | null;
  initial: InvoiceFormInput;
  taxRates: TaxRateDto[];
  settings: CompanySettingsDto;
}

function EditorForm({ invoice, initial, taxRates, settings }: EditorFormProps) {
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = useInvalidateInvoice();
  const bypassGuard = useRef(false);
  const [rowVersion, setRowVersion] = useState(invoice?.rowVersion ?? null);
  const [serverTotals, setServerTotals] = useState(invoice?.totals ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const isNew = !invoice;
  const canIssue = isAdminRole(role);
  const paymentDays = settings.invoicePaymentDays;
  // The due date follows the Rechnungsdatum (+ payment term) until the user picks a due date manually.
  const [dueFollows, setDueFollows] = useState(() => isNew || dueDateFollowsIssueDate(initial.issueDate, initial.dueDate, paymentDays));

  const form = useForm<InvoiceFormInput, unknown, InvoiceFormOutput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: initial,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitted },
  } = form;

  const taxMode = useWatch({ control, name: 'taxMode' });
  const lineItems = useWatch({ control, name: 'lineItems' }) as LineItemValue[] | undefined;
  const issueDate = useWatch({ control, name: 'issueDate' });
  const dueDate = useWatch({ control, name: 'dueDate' });
  const servicePeriod = useWatch({ control, name: 'servicePeriod' });
  const totals = useMemo(() => liveTotals(lineItems, taxMode), [lineItems, taxMode]);
  const showServerTotals = !isDirty && serverTotals !== null;
  const paymentTerm = issueDate && dueDate && ISO_DATE.test(issueDate) && ISO_DATE.test(dueDate) ? daysUntil(dueDate, issueDate) : null;

  const reload = useMutation({
    mutationFn: () => api.invoices.get(companyId, invoice!.id),
    onSuccess: (fresh) => {
      queryClient.setQueryData(qk.invoice(companyId, fresh.id), fresh);
      reset(invoiceToForm(fresh));
      setRowVersion(fresh.rowVersion);
      setServerTotals(fresh.totals);
      setConflictOpen(false);
      setFormError(null);
      toast.info('Aktuelle Fassung geladen');
    },
    onError: (error) => toast.error('Neu laden fehlgeschlagen', errorMessage(error)),
  });

  const save = (mode: SaveMode) =>
    handleSubmit(
      async (values) => {
        setFormError(null);
        setSaving(mode);
        try {
          const body = invoiceRequest(values);
          const saved = isNew
            ? await api.invoices.create(companyId, body)
            : await api.invoices.update(companyId, invoice.id, { ...body, rowVersion: rowVersion ?? invoice.rowVersion });
          invalidate(saved);
          reset(invoiceToForm(saved));
          setRowVersion(saved.rowVersion);
          setServerTotals(saved.totals);
          toast.success(isNew ? 'Entwurf angelegt' : 'Entwurf gespeichert', `${saved.title} · ${formatEur(saved.totals.grossTotal)}`);
          if (mode === 'issue' || isNew) {
            bypassGuard.current = true;
            void navigate(mode === 'issue' ? `/rechnungen/${saved.id}?stellen=1` : `/rechnungen/${saved.id}/bearbeiten`, { replace: isNew && mode === 'stay' });
          }
        } catch (error) {
          if (isConflict(error)) {
            setConflictOpen(true);
          } else if (error instanceof ApiError && error.code === 'invoice_not_editable') {
            toast.error('Nicht mehr bearbeitbar', errorMessage(error));
            bypassGuard.current = true;
            void navigate(`/rechnungen/${invoice?.id ?? ''}`);
          } else {
            const rest = applyServerErrors(error, setError, invoiceFormFields);
            if (rest.length > 0 || !hasFieldErrors(error)) {
              setFormError(rest.join(' ') || errorMessage(error));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              toast.error('Bitte prüfen Sie die markierten Felder.');
            }
          }
        } finally {
          setSaving(null);
        }
      },
      () => {
        toast.error('Bitte prüfen Sie die markierten Felder.');
      },
    )();

  const title = isNew ? 'Neue Rechnung' : 'Rechnungsentwurf bearbeiten';
  const source = invoice?.jobNumber ? `Aus Auftrag ${invoice.jobNumber}` : invoice?.quotationNumber ? `Aus Angebot ${invoice.quotationNumber}` : null;

  return (
    <>
      <PageHeader
        title={title}
        back={isNew ? { to: '/rechnungen', label: 'Rechnungen' } : { to: `/rechnungen/${invoice.id}`, label: invoiceName(invoice) }}
        meta={<InvoiceStatusBadge status="Draft" />}
        description={
          source ? (
            <>
              {source} · Die Rechnungsnummer wird beim Stellen vergeben.
            </>
          ) : (
            'Die Rechnungsnummer wird beim Stellen vergeben – bis dahin können Sie den Entwurf beliebig ändern.'
          )
        }
        actions={
          !isNew && (
            <ButtonLink to={`/rechnungen/${invoice.id}/pdf`} icon={Eye}>
              PDF-Vorschau
            </ButtonLink>
          )
        }
      />

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save('stay');
        }}
        className="space-y-6"
        aria-label={title}
      >
        {formError && (
          <Alert tone="danger" live title="Speichern nicht möglich">
            {formError}
          </Alert>
        )}

        <Card>
          <CardHeader title="Kunde & Eckdaten" />
          <CardBody className="grid gap-5 lg:grid-cols-2">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <CustomerPicker value={field.value} onChange={field.onChange} error={errors.customerId?.message} documentLabel="diese Rechnung" />
              )}
            />
            <div className="min-w-0 space-y-4">
              <Field label="Betreff" error={errors.title?.message} required>
                <Input placeholder="z. B. Elektroinstallation Backstube" {...register('title')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rechnungsdatum" error={errors.issueDate?.message} required>
                  <Input
                    type="date"
                    {...register('issueDate', {
                      onChange: (event: { target: { value: string } }) => {
                        const value = event.target.value;
                        if (dueFollows && ISO_DATE.test(value)) {
                          setValue('dueDate', addDaysIso(value, paymentDays), { shouldDirty: true, shouldValidate: isSubmitted });
                        }
                      },
                    })}
                  />
                </Field>
                <Field
                  label="Fällig am"
                  error={errors.dueDate?.message}
                  required
                  hint={
                    paymentTerm !== null && paymentTerm >= 0
                      ? `Zahlungsziel: ${daysText(paymentTerm)}${!dueFollows && paymentTerm !== paymentDays ? ` (Standard: ${daysText(paymentDays)})` : ''}`
                      : undefined
                  }
                >
                  <Input type="date" {...register('dueDate', { onChange: () => setDueFollows(false) })} />
                </Field>
              </div>
              <div className="space-y-2">
                {servicePeriod ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Leistung von" error={errors.serviceDateFrom?.message} required>
                      <Input type="date" {...register('serviceDateFrom')} />
                    </Field>
                    <Field label="Leistung bis" error={errors.serviceDateTo?.message} required>
                      <Input type="date" {...register('serviceDateTo')} />
                    </Field>
                  </div>
                ) : (
                  <Field
                    label="Leistungsdatum"
                    error={errors.serviceDateFrom?.message}
                    hint="Pflichtangabe auf Rechnungen (§ 14 UStG), z. B. der Tag der Fertigstellung."
                  >
                    <Input type="date" {...register('serviceDateFrom')} />
                  </Field>
                )}
                <Checkbox
                  label="Leistungszeitraum angeben"
                  description="Für Leistungen über mehrere Tage, z. B. Wartungsverträge oder längere Baustellen."
                  {...register('servicePeriod')}
                />
              </div>
              <Field
                label="Besteuerung"
                error={errors.taxMode?.message}
                labelAside={
                  <HelpPopover label="Erklärung zur Besteuerung">
                    <p className="font-medium text-neutral-900">{taxModeShort[taxMode]}</p>
                    <p className="mt-1">{taxModeExplanation[taxMode]}</p>
                    <p className="mt-2 text-neutral-500">{TAX_DISCLAIMER}</p>
                  </HelpPopover>
                }
              >
                <Select {...register('taxMode')}>
                  <option value="Standard">Regelbesteuerung (USt. je Position)</option>
                  <option value="SmallBusiness">Kleinunternehmerregelung (§ 19 UStG)</option>
                  <option value="ReverseCharge">Reverse Charge (§ 13b UStG)</option>
                </Select>
              </Field>
              <Field
                label="Ihre Referenz / Bestellnummer"
                error={errors.buyerReference?.message}
                optional
                hint="Bestellnummer oder Referenz Ihres Kunden. Erscheint auf der Rechnung und in der E-Rechnung."
              >
                <Input maxLength={100} placeholder="z. B. Bestellung 4500-2291" {...register('buyerReference')} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Einleitung" description="Erscheint vor den Positionen, z. B. Anrede und Dank für den Auftrag." />
          <CardBody>
            <Field label="Einleitungstext" hideLabel error={errors.introText?.message}>
              <Textarea rows={3} placeholder="Sehr geehrte Damen und Herren, vielen Dank für Ihren Auftrag …" {...register('introText')} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Positionen" description="Mengen und Preise akzeptieren deutsche Schreibweise, z. B. 1.234,56." />
          <CardBody>
            <LineItemsEditor control={control} register={register} taxRates={taxRates} defaultTaxRate={defaultTaxRateOf(taxRates)} vatEnabled={taxMode === 'Standard'} />
            <div className="mt-5 flex justify-end">
              <div className="w-full rounded-lg border border-neutral-200 bg-neutral-25 px-4 py-3 sm:w-[380px]" aria-live="polite" data-testid="totals-panel">
                <TotalsList totals={showServerTotals && serverTotals ? serverTotals : totals} taxMode={taxMode} />
                <p className="mt-2 text-xs text-neutral-500">
                  {showServerTotals
                    ? 'Gespeichert – Beträge vom Server berechnet.'
                    : 'Live-Vorschau. Verbindlich sind die beim Speichern vom Server berechneten Beträge.'}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Abschluss & Zahlung" />
          <CardBody className="space-y-4">
            <Field label="Schlusstext" error={errors.closingText?.message} optional>
              <Textarea rows={3} {...register('closingText')} />
            </Field>
            <Field
              label="Zahlungshinweis"
              error={errors.paymentTerms?.message}
              optional
              hint="Der Satz „Bitte überweisen Sie den Betrag von … bis zum …“ mit Ihrer Bankverbindung wird automatisch ergänzt. Hier nur Zusätze, z. B. Skonto."
            >
              <Textarea rows={2} placeholder="z. B. Bei Zahlung innerhalb von 7 Tagen gewähren wir 2 % Skonto." {...register('paymentTerms')} />
            </Field>
          </CardBody>
        </Card>

        <Card className="border-dashed bg-neutral-25">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Lock aria-hidden size={15} className="text-neutral-500" /> Interne Notizen
              </span>
            }
            description="Nur intern – erscheint weder im PDF noch in der E-Rechnung."
          />
          <CardBody>
            <Field label="Interne Notizen (nur intern)" hideLabel error={errors.internalNotes?.message}>
              <Textarea rows={2} placeholder="z. B. Aufmaß liegt im Ordner Baustelle" {...register('internalNotes')} />
            </Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-500">{taxMode === 'Standard' ? 'Gesamt brutto' : 'Gesamtbetrag'}</p>
              <p className="text-lg leading-6 font-semibold text-neutral-900 tabular" data-testid="sticky-gross">
                {formatEur((showServerTotals && serverTotals ? serverTotals : totals).grossTotal)}
              </p>
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <span className="mr-1 hidden text-[13px] text-neutral-500 md:inline" aria-live="polite">
                {isDirty ? 'Ungespeicherte Änderungen' : isNew ? '' : 'Alle Änderungen gespeichert'}
              </span>
              {!canIssue && (
                <span className="mr-1 hidden max-w-[220px] text-[13px] leading-[18px] text-neutral-500 xl:inline">
                  Stellen dürfen nur Inhaber:innen und Administrator:innen.
                </span>
              )}
              <Button type="submit" variant={canIssue ? 'secondary' : 'primary'} icon={Save} loading={saving === 'stay'} disabled={saving !== null}>
                <span className="sm:hidden">Speichern</span>
                <span className="hidden sm:inline">Entwurf speichern</span>
              </Button>
              {canIssue && (
                <Button variant="primary" icon={FileCheck2} loading={saving === 'issue'} disabled={saving !== null} onClick={() => void save('issue')}>
                  <span className="sm:hidden">Stellen …</span>
                  <span className="hidden sm:inline">Speichern & Rechnung stellen …</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      <UnsavedChangesGuard when={isDirty && saving === null} bypass={bypassGuard} />
      <Dialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title="Die Rechnung wurde zwischenzeitlich geändert"
        description="Jemand anderes hat diesen Entwurf gespeichert, während Sie ihn bearbeitet haben. Ihre Änderungen wurden nicht gespeichert."
        footer={
          <>
            <Button onClick={() => setConflictOpen(false)}>Weiter bearbeiten</Button>
            <Button variant="primary" icon={RefreshCw} loading={reload.isPending} onClick={() => reload.mutate()}>
              Aktuelle Fassung laden
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          Beim Neuladen gehen Ihre ungespeicherten Änderungen verloren. Kopieren Sie wichtige Texte ggf. vorher heraus.
        </p>
      </Dialog>
    </>
  );
}

export default function InvoiceEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { companyId } = useCompany();
  const settings = useCompanySettings();
  const taxRates = useTaxRates();
  const invoice = useQuery({ queryKey: qk.invoice(companyId, id ?? ''), queryFn: () => api.invoices.get(companyId, id!), enabled: Boolean(id) });

  const failed = settings.error ?? taxRates.error ?? (id ? invoice.error : null);
  if (failed) {
    return (
      <ErrorState
        error={failed}
        onRetry={() => {
          void settings.refetch();
          void taxRates.refetch();
          if (id) void invoice.refetch();
        }}
      />
    );
  }
  if (!settings.data || !taxRates.data || (id && !invoice.data)) return <PageSkeleton rows={10} />;

  if (invoice.data && invoice.data.status !== 'Draft') {
    const i = invoice.data;
    return (
      <>
        <PageHeader title={invoiceName(i)} back={{ to: `/rechnungen/${i.id}`, label: invoiceName(i) }} />
        <Alert
          tone="info"
          title="Nur Entwürfe können bearbeitet werden"
          actions={
            <ButtonLink to={`/rechnungen/${i.id}`} variant="primary">
              Zur Rechnung
            </ButtonLink>
          }
        >
          Diese Rechnung wurde bereits gestellt und ist damit festgeschrieben (GoBD). Für Korrekturen stornieren Sie sie in der Rechnungsansicht
          und erstellen eine neue Rechnung – z. B. über „Kopieren“. <Link to={`/rechnungen/${i.id}`}>Rechnung öffnen</Link>
        </Alert>
      </>
    );
  }

  const initial = invoice.data ? invoiceToForm(invoice.data) : newInvoiceDefaults(settings.data, taxRates.data, params.get('kunde') ?? '');

  return <EditorForm key={invoice.data?.id ?? 'new'} invoice={invoice.data ?? null} initial={initial} taxRates={taxRates.data} settings={settings.data} />;
}
