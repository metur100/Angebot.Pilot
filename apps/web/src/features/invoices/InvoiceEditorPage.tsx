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
import { tr } from '@/lib/i18n';
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
      toast.info(tr('Aktuelle Fassung geladen', 'Latest version loaded'));
    },
    onError: (error) => toast.error(tr('Neu laden fehlgeschlagen', 'Reload failed'), errorMessage(error)),
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
          toast.success(isNew ? tr('Entwurf angelegt', 'Draft created') : tr('Entwurf gespeichert', 'Draft saved'), `${saved.title} · ${formatEur(saved.totals.grossTotal)}`);
          if (mode === 'issue' || isNew) {
            bypassGuard.current = true;
            void navigate(mode === 'issue' ? `/rechnungen/${saved.id}?stellen=1` : `/rechnungen/${saved.id}/bearbeiten`, { replace: isNew && mode === 'stay' });
          }
        } catch (error) {
          if (isConflict(error)) {
            setConflictOpen(true);
          } else if (error instanceof ApiError && error.code === 'invoice_not_editable') {
            toast.error(tr('Nicht mehr bearbeitbar', 'Can no longer be edited'), errorMessage(error));
            bypassGuard.current = true;
            void navigate(`/rechnungen/${invoice?.id ?? ''}`);
          } else {
            const rest = applyServerErrors(error, setError, invoiceFormFields);
            if (rest.length > 0 || !hasFieldErrors(error)) {
              setFormError(rest.join(' ') || errorMessage(error));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              toast.error(tr('Bitte prüfen Sie die markierten Felder.', 'Please check the highlighted fields.'));
            }
          }
        } finally {
          setSaving(null);
        }
      },
      () => {
        toast.error(tr('Bitte prüfen Sie die markierten Felder.', 'Please check the highlighted fields.'));
      },
    )();

  const title = isNew ? tr('Neue Rechnung', 'New invoice') : tr('Rechnungsentwurf bearbeiten', 'Edit invoice draft');
  const source = invoice?.jobNumber
    ? tr(`Aus Auftrag ${invoice.jobNumber}`, `From job ${invoice.jobNumber}`)
    : invoice?.quotationNumber
      ? tr(`Aus Angebot ${invoice.quotationNumber}`, `From quotation ${invoice.quotationNumber}`)
      : null;

  return (
    <>
      <PageHeader
        title={title}
        back={isNew ? { to: '/rechnungen', label: tr('Rechnungen', 'Invoices') } : { to: `/rechnungen/${invoice.id}`, label: invoiceName(invoice) }}
        meta={<InvoiceStatusBadge status="Draft" />}
        description={
          source ? (
            <>
              {source} · {tr('Die Rechnungsnummer wird beim Stellen vergeben.', 'The invoice number is assigned when the invoice is issued.')}
            </>
          ) : (
            tr(
              'Die Rechnungsnummer wird beim Stellen vergeben – bis dahin können Sie den Entwurf beliebig ändern.',
              'The invoice number is assigned when the invoice is issued – until then you can change the draft as you like.',
            )
          )
        }
        actions={
          !isNew && (
            <ButtonLink to={`/rechnungen/${invoice.id}/pdf`} icon={Eye}>
              {tr('PDF-Vorschau', 'PDF preview')}
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
          <Alert tone="danger" live title={tr('Speichern nicht möglich', 'Unable to save')}>
            {formError}
          </Alert>
        )}

        <Card>
          <CardHeader title={tr('Kunde & Eckdaten', 'Customer & key details')} />
          <CardBody className="grid gap-5 lg:grid-cols-2">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <CustomerPicker
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.customerId?.message}
                  documentLabel={tr('diese Rechnung', 'this invoice')}
                />
              )}
            />
            <div className="min-w-0 space-y-4">
              <Field label={tr('Betreff', 'Subject')} error={errors.title?.message} required>
                <Input placeholder={tr('z. B. Elektroinstallation Backstube', 'e.g. Electrical installation, bakery')} {...register('title')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr('Rechnungsdatum', 'Invoice date')} error={errors.issueDate?.message} required>
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
                  label={tr('Fällig am', 'Due date')}
                  error={errors.dueDate?.message}
                  required
                  hint={
                    paymentTerm !== null && paymentTerm >= 0
                      ? tr(
                          `Zahlungsziel: ${daysText(paymentTerm)}${!dueFollows && paymentTerm !== paymentDays ? ` (Standard: ${daysText(paymentDays)})` : ''}`,
                          `Payment terms: ${daysText(paymentTerm)}${!dueFollows && paymentTerm !== paymentDays ? ` (default: ${daysText(paymentDays)})` : ''}`,
                        )
                      : undefined
                  }
                >
                  <Input type="date" {...register('dueDate', { onChange: () => setDueFollows(false) })} />
                </Field>
              </div>
              <div className="space-y-2">
                {servicePeriod ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tr('Leistung von', 'Service from')} error={errors.serviceDateFrom?.message} required>
                      <Input type="date" {...register('serviceDateFrom')} />
                    </Field>
                    <Field label={tr('Leistung bis', 'Service until')} error={errors.serviceDateTo?.message} required>
                      <Input type="date" {...register('serviceDateTo')} />
                    </Field>
                  </div>
                ) : (
                  <Field
                    label={tr('Leistungsdatum', 'Service date')}
                    error={errors.serviceDateFrom?.message}
                    hint={tr(
                      'Pflichtangabe auf Rechnungen (§ 14 UStG), z. B. der Tag der Fertigstellung.',
                      'Mandatory on invoices (§ 14 UStG), e.g. the day the work was completed.',
                    )}
                  >
                    <Input type="date" {...register('serviceDateFrom')} />
                  </Field>
                )}
                <Checkbox
                  label={tr('Leistungszeitraum angeben', 'Specify a service period')}
                  description={tr(
                    'Für Leistungen über mehrere Tage, z. B. Wartungsverträge oder längere Baustellen.',
                    'For work spanning several days, e.g. maintenance contracts or longer construction projects.',
                  )}
                  {...register('servicePeriod')}
                />
              </div>
              <Field
                label={tr('Besteuerung', 'Taxation')}
                error={errors.taxMode?.message}
                labelAside={
                  <HelpPopover label={tr('Erklärung zur Besteuerung', 'About taxation')}>
                    <p className="font-medium text-neutral-900">{taxModeShort[taxMode]}</p>
                    <p className="mt-1">{taxModeExplanation[taxMode]}</p>
                    <p className="mt-2 text-neutral-500">{TAX_DISCLAIMER}</p>
                  </HelpPopover>
                }
              >
                <Select {...register('taxMode')}>
                  <option value="Standard">{tr('Regelbesteuerung (USt. je Position)', 'Standard taxation (VAT per line item)')}</option>
                  <option value="SmallBusiness">{tr('Kleinunternehmerregelung (§ 19 UStG)', 'Small business scheme (§ 19 UStG)')}</option>
                  <option value="ReverseCharge">{tr('Reverse Charge (§ 13b UStG)', 'Reverse charge (§ 13b UStG)')}</option>
                </Select>
              </Field>
              <Field
                label={tr('Ihre Referenz / Bestellnummer', 'Your reference / order number')}
                error={errors.buyerReference?.message}
                optional
                hint={tr(
                  'Bestellnummer oder Referenz Ihres Kunden. Erscheint auf der Rechnung und in der E-Rechnung.',
                  "Your customer's order number or reference. Appears on the invoice and in the e-invoice.",
                )}
              >
                <Input maxLength={100} placeholder={tr('z. B. Bestellung 4500-2291', 'e.g. Order 4500-2291')} {...register('buyerReference')} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={tr('Einleitung', 'Introduction')}
            description={tr(
              'Erscheint vor den Positionen, z. B. Anrede und Dank für den Auftrag.',
              'Appears before the line items, e.g. greeting and thanks for the order. The invoice document is in German.',
            )}
          />
          <CardBody>
            <Field label={tr('Einleitungstext', 'Introduction text')} hideLabel error={errors.introText?.message}>
              <Textarea rows={3} placeholder="Sehr geehrte Damen und Herren, vielen Dank für Ihren Auftrag …" {...register('introText')} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={tr('Positionen', 'Line items')}
            description={tr('Mengen und Preise akzeptieren deutsche Schreibweise, z. B. 1.234,56.', 'Quantities and prices accept amounts such as 1,234.56.')}
          />
          <CardBody>
            <LineItemsEditor control={control} register={register} taxRates={taxRates} defaultTaxRate={defaultTaxRateOf(taxRates)} vatEnabled={taxMode === 'Standard'} />
            <div className="mt-5 flex justify-end">
              <div className="w-full rounded-lg border border-neutral-200 bg-neutral-25 px-4 py-3 sm:w-[380px]" aria-live="polite" data-testid="totals-panel">
                <TotalsList totals={showServerTotals && serverTotals ? serverTotals : totals} taxMode={taxMode} />
                <p className="mt-2 text-xs text-neutral-500">
                  {showServerTotals
                    ? tr('Gespeichert – Beträge vom Server berechnet.', 'Saved – amounts calculated by the server.')
                    : tr(
                        'Live-Vorschau. Verbindlich sind die beim Speichern vom Server berechneten Beträge.',
                        'Live preview. The amounts calculated by the server when saving are binding.',
                      )}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={tr('Abschluss & Zahlung', 'Closing & payment')} />
          <CardBody className="space-y-4">
            <Field label={tr('Schlusstext', 'Closing text')} error={errors.closingText?.message} optional>
              <Textarea rows={3} {...register('closingText')} />
            </Field>
            <Field
              label={tr('Zahlungshinweis', 'Payment note')}
              error={errors.paymentTerms?.message}
              optional
              hint={tr(
                'Der Satz „Bitte überweisen Sie den Betrag von … bis zum …“ mit Ihrer Bankverbindung wird automatisch ergänzt. Hier nur Zusätze, z. B. Skonto.',
                'The German sentence “Bitte überweisen Sie den Betrag von … bis zum …” (please transfer … by …) with your bank details is added automatically. Only add extras here, e.g. an early payment discount.',
              )}
            >
              {/* Example of German document text: the invoice itself is always German. */}
              <Textarea rows={2} placeholder="z. B. Bei Zahlung innerhalb von 7 Tagen gewähren wir 2 % Skonto." {...register('paymentTerms')} />
            </Field>
          </CardBody>
        </Card>

        <Card className="border-dashed bg-neutral-25">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Lock aria-hidden size={15} className="text-neutral-500" /> {tr('Interne Notizen', 'Internal notes')}
              </span>
            }
            description={tr('Nur intern – erscheint weder im PDF noch in der E-Rechnung.', 'Internal only – appears neither in the PDF nor in the e-invoice.')}
          />
          <CardBody>
            <Field label={tr('Interne Notizen (nur intern)', 'Internal notes (internal only)')} hideLabel error={errors.internalNotes?.message}>
              <Textarea
                rows={2}
                placeholder={tr('z. B. Aufmaß liegt im Ordner Baustelle', 'e.g. measurements are in the site folder')}
                {...register('internalNotes')}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-500">{taxMode === 'Standard' ? tr('Gesamt brutto', 'Total gross') : tr('Gesamtbetrag', 'Total amount')}</p>
              <p className="text-lg leading-6 font-semibold text-neutral-900 tabular" data-testid="sticky-gross">
                {formatEur((showServerTotals && serverTotals ? serverTotals : totals).grossTotal)}
              </p>
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <span className="mr-1 hidden text-[13px] text-neutral-500 md:inline" aria-live="polite">
                {isDirty ? tr('Ungespeicherte Änderungen', 'Unsaved changes') : isNew ? '' : tr('Alle Änderungen gespeichert', 'All changes saved')}
              </span>
              {!canIssue && (
                <span className="mr-1 hidden max-w-[220px] text-[13px] leading-[18px] text-neutral-500 xl:inline">
                  {tr('Stellen dürfen nur Inhaber:innen und Administrator:innen.', 'Only owners and administrators can issue invoices.')}
                </span>
              )}
              <Button type="submit" variant={canIssue ? 'secondary' : 'primary'} icon={Save} loading={saving === 'stay'} disabled={saving !== null}>
                <span className="sm:hidden">{tr('Speichern', 'Save')}</span>
                <span className="hidden sm:inline">{tr('Entwurf speichern', 'Save draft')}</span>
              </Button>
              {canIssue && (
                <Button variant="primary" icon={FileCheck2} loading={saving === 'issue'} disabled={saving !== null} onClick={() => void save('issue')}>
                  <span className="sm:hidden">{tr('Stellen …', 'Issue …')}</span>
                  <span className="hidden sm:inline">{tr('Speichern & Rechnung stellen …', 'Save & issue invoice …')}</span>
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
        title={tr('Die Rechnung wurde zwischenzeitlich geändert', 'The invoice has been changed in the meantime')}
        description={tr(
          'Jemand anderes hat diesen Entwurf gespeichert, während Sie ihn bearbeitet haben. Ihre Änderungen wurden nicht gespeichert.',
          'Someone else saved this draft while you were editing it. Your changes have not been saved.',
        )}
        footer={
          <>
            <Button onClick={() => setConflictOpen(false)}>{tr('Weiter bearbeiten', 'Keep editing')}</Button>
            <Button variant="primary" icon={RefreshCw} loading={reload.isPending} onClick={() => reload.mutate()}>
              {tr('Aktuelle Fassung laden', 'Load latest version')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          {tr(
            'Beim Neuladen gehen Ihre ungespeicherten Änderungen verloren. Kopieren Sie wichtige Texte ggf. vorher heraus.',
            'Reloading discards your unsaved changes. Copy any important text out first if needed.',
          )}
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
          title={tr('Nur Entwürfe können bearbeitet werden', 'Only drafts can be edited')}
          actions={
            <ButtonLink to={`/rechnungen/${i.id}`} variant="primary">
              {tr('Zur Rechnung', 'Go to invoice')}
            </ButtonLink>
          }
        >
          {tr(
            'Diese Rechnung wurde bereits gestellt und ist damit festgeschrieben (GoBD). Für Korrekturen stornieren Sie sie in der Rechnungsansicht und erstellen eine neue Rechnung – z. B. über „Kopieren“.',
            'This invoice has already been issued and is therefore locked (GoBD). To correct it, cancel it in the invoice view and create a new invoice – e.g. with “Copy”.',
          )}{' '}
          <Link to={`/rechnungen/${i.id}`}>{tr('Rechnung öffnen', 'Open invoice')}</Link>
        </Alert>
      </>
    );
  }

  const initial = invoice.data ? invoiceToForm(invoice.data) : newInvoiceDefaults(settings.data, taxRates.data, params.get('kunde') ?? '');

  return <EditorForm key={invoice.data?.id ?? 'new'} invoice={invoice.data ?? null} initial={initial} taxRates={taxRates.data} settings={settings.data} />;
}
