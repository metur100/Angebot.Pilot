import {
  addDaysIso,
  ApiError,
  calculateTotals,
  quotationSchema,
  todayIso,
  type CompanySettingsDto,
  type LineItemInput,
  type QuotationDto,
  type TaxMode,
  type TaxRateDto,
  type TemplateDto,
} from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileStack, Lock, RefreshCw, Save, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { useCompany, useCompanySettings, useTaxRates } from '@/app/company';
import { UnsavedChangesGuard } from '@/components/domain/Common';
import { TAX_DISCLAIMER, taxModeExplanation, taxModeShort } from '@/components/domain/TaxMode';
import { QuotationStatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { HelpPopover } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, hasFieldErrors, isConflict } from '@/lib/errors';
import { daysUntil, formatEur, plural } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { CustomerPicker } from './CustomerPicker';
import { LineItemsEditor, newLineItem, type LineItemValue } from './LineItemsEditor';
import { TotalsList } from './Totals';

export type QuotationFormInput = z.input<typeof quotationSchema>;
type QuotationFormOutput = z.output<typeof quotationSchema>;

const knownFields = [
  'customerId', 'title', 'issueDate', 'validUntil', 'taxMode', 'introText', 'closingText', 'terms', 'paymentTerms', 'internalNotes', 'lineItems',
];

const nullIfEmpty = (value: string | undefined | null) => (value && value.trim() ? value : null);

export function defaultTaxRateOf(rates: TaxRateDto[] | undefined): number {
  const active = (rates ?? []).filter((r) => !r.isArchived);
  return active.find((r) => r.isDefault)?.ratePercent ?? active[0]?.ratePercent ?? 19;
}

export function quotationToForm(q: QuotationDto): QuotationFormInput {
  return {
    customerId: q.customerId,
    title: q.title,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    taxMode: q.taxMode,
    introText: q.introText ?? '',
    closingText: q.closingText ?? '',
    terms: q.terms ?? '',
    paymentTerms: q.paymentTerms ?? '',
    internalNotes: q.internalNotes ?? '',
    lineItems: [...q.lineItems]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        title: l.title,
        description: l.description ?? '',
        quantity: l.quantity,
        unit: l.unit,
        unitPriceNet: l.unitPriceNet,
        discountPercent: l.discountPercent,
        taxRatePercent: l.taxRatePercent,
      })),
  };
}

export function newQuotationDefaults(settings: CompanySettingsDto, rates: TaxRateDto[], customerId: string, today = todayIso()): QuotationFormInput {
  return {
    customerId,
    title: '',
    issueDate: today,
    validUntil: addDaysIso(today, settings.defaultValidityDays || 30),
    taxMode: settings.defaultTaxMode,
    introText: settings.defaultIntroText ?? '',
    closingText: settings.defaultClosingText ?? '',
    terms: settings.defaultTerms ?? '',
    paymentTerms: settings.paymentTerms ?? '',
    internalNotes: '',
    lineItems: [newLineItem(defaultTaxRateOf(rates)) as QuotationFormInput['lineItems'][number]],
  };
}

export function toLineInputs(items: QuotationFormOutput['lineItems']): LineItemInput[] {
  return items.map((l) => ({
    title: l.title.trim(),
    description: nullIfEmpty(l.description),
    quantity: l.quantity,
    unit: l.unit.trim(),
    unitPriceNet: l.unitPriceNet,
    discountPercent: l.discountPercent,
    taxRatePercent: l.taxRatePercent,
  }));
}

/** Live totals from the (possibly incomplete) form state. Invalid numbers count as 0. */
export function liveTotals(items: LineItemValue[] | undefined, taxMode: TaxMode) {
  const safe = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return calculateTotals(
    (items ?? []).map((l) => ({
      quantity: safe(l.quantity),
      unitPriceNet: safe(l.unitPriceNet),
      discountPercent: safe(l.discountPercent),
      taxRatePercent: safe(l.taxRatePercent),
    })),
    taxMode,
  );
}

type SaveMode = 'stay' | 'close' | 'send';

interface EditorFormProps {
  quotation: QuotationDto | null;
  initial: QuotationFormInput;
  taxRates: TaxRateDto[];
  settings: CompanySettingsDto;
}

function TemplateDialog({ open, onOpenChange, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; onApply: (template: TemplateDto) => void }) {
  const { companyId } = useCompany();
  const templates = useQuery({ queryKey: qk.templates(companyId), queryFn: () => api.templates.list(companyId), enabled: open });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const pick = async (id: string) => {
    setLoadingId(id);
    try {
      onApply(await api.templates.get(companyId, id));
      onOpenChange(false);
    } catch (error) {
      toast.error(tr('Vorlage konnte nicht geladen werden', 'Template could not be loaded'), errorMessage(error));
    } finally {
      setLoadingId(null);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={tr('Mit Vorlage starten', 'Start from a template')}
      description={tr(
        'Texte und Positionen der Vorlage werden übernommen und ersetzen die aktuellen Positionen. Sie können alles anschließend anpassen.',
        'The template’s texts and line items are applied and replace the current line items. You can adjust everything afterwards.',
      )}
      size="lg"
    >
      {templates.isPending ? (
        <Spinner />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : templates.data.length === 0 ? (
        <EmptyState
          compact
          icon={FileStack}
          title={tr('Noch keine Vorlagen', 'No templates yet')}
          description={tr(
            'Speichern Sie ein Angebot als Vorlage oder legen Sie unter „Vorlagen“ eine neue an.',
            'Save a quotation as a template or create a new one under “Templates”.',
          )}
          action={<ButtonLink to="/vorlagen/neu">{tr('Vorlage anlegen', 'Create template')}</ButtonLink>}
        />
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {templates.data.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void pick(t.id)}
                disabled={loadingId !== null}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-neutral-900">{t.name}</span>
                  <span className="block truncate text-[13px] text-neutral-500">
                    {t.description ? `${t.description} · ` : ''}
                    {plural(t.lineItemCount, tr('Position', 'line item'), tr('Positionen', 'line items'))}
                  </span>
                </span>
                {loadingId === t.id ? (
                  <Spinner label="" />
                ) : (
                  <span className="text-sm font-medium whitespace-nowrap text-neutral-700 tabular">
                    {tr(`${formatEur(t.netTotal)} netto`, `${formatEur(t.netTotal)} net`)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function EditorForm({ quotation, initial, taxRates, settings }: EditorFormProps) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const bypassGuard = useRef(false);
  const [rowVersion, setRowVersion] = useState(quotation?.rowVersion ?? null);
  const [serverTotals, setServerTotals] = useState(quotation?.totals ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(!quotation && params.get('vorlage') === '1');
  const [saving, setSaving] = useState<SaveMode | null>(null);
  const isNew = !quotation;

  const form = useForm<QuotationFormInput, unknown, QuotationFormOutput>({
    resolver: zodResolver(quotationSchema),
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
    getValues,
    reset,
    formState: { errors, isDirty },
  } = form;

  const taxMode = useWatch({ control, name: 'taxMode' });
  const lineItems = useWatch({ control, name: 'lineItems' }) as LineItemValue[] | undefined;
  const issueDate = useWatch({ control, name: 'issueDate' });
  const validUntil = useWatch({ control, name: 'validUntil' });
  const totals = useMemo(() => liveTotals(lineItems, taxMode), [lineItems, taxMode]);
  const showServerTotals = !isDirty && serverTotals !== null;
  const validityDays = issueDate && validUntil ? daysUntil(validUntil, issueDate) : null;

  const reload = useMutation({
    mutationFn: () => api.quotations.get(companyId, quotation!.id),
    onSuccess: (fresh) => {
      queryClient.setQueryData(qk.quotation(companyId, fresh.id), fresh);
      reset(quotationToForm(fresh));
      setRowVersion(fresh.rowVersion);
      setServerTotals(fresh.totals);
      setConflictOpen(false);
      setFormError(null);
      toast.info(tr('Aktuelle Fassung geladen', 'Latest version loaded'));
    },
    onError: (error) => toast.error(tr('Neu laden fehlgeschlagen', 'Reloading failed'), errorMessage(error)),
  });

  const applyTemplate = (template: TemplateDto) => {
    const fallbackRate = defaultTaxRateOf(taxRates);
    if (!getValues('title').trim()) setValue('title', template.name, { shouldDirty: true });
    if (template.introText) setValue('introText', template.introText, { shouldDirty: true });
    if (template.closingText) setValue('closingText', template.closingText, { shouldDirty: true });
    if (template.terms) setValue('terms', template.terms, { shouldDirty: true });
    if (template.taxMode) setValue('taxMode', template.taxMode, { shouldDirty: true });
    if (template.lineItems.length > 0) {
      setValue(
        'lineItems',
        [...template.lineItems]
          .sort((a, b) => a.position - b.position)
          .map((l) => ({
            title: l.title,
            description: l.description ?? '',
            quantity: l.quantity,
            unit: l.unit,
            unitPriceNet: l.unitPriceNet,
            discountPercent: l.discountPercent,
            taxRatePercent: l.taxRatePercent ?? fallbackRate,
          })),
        { shouldDirty: true },
      );
    }
    toast.success(tr('Vorlage übernommen', 'Template applied'), template.name);
  };

  // ?vorlage=<id>: apply that template once when creating a new quotation.
  const templateParam = params.get('vorlage');
  const appliedTemplate = useRef(false);
  useEffect(() => {
    if (!isNew || !templateParam || templateParam === '1' || appliedTemplate.current) return;
    appliedTemplate.current = true;
    api.templates
      .get(companyId, templateParam)
      .then(applyTemplate)
      .catch((error: unknown) => toast.error(tr('Vorlage konnte nicht geladen werden', 'Template could not be loaded'), errorMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the URL parameter
  }, [templateParam]);

  const save = (mode: SaveMode) =>
    handleSubmit(
      async (values) => {
        setFormError(null);
        setSaving(mode);
        try {
          const body = {
            customerId: values.customerId,
            title: values.title.trim(),
            issueDate: values.issueDate,
            validUntil: values.validUntil,
            taxMode: values.taxMode,
            introText: nullIfEmpty(values.introText),
            closingText: nullIfEmpty(values.closingText),
            terms: nullIfEmpty(values.terms),
            paymentTerms: nullIfEmpty(values.paymentTerms),
            internalNotes: nullIfEmpty(values.internalNotes),
            lineItems: toLineInputs(values.lineItems),
          };
          const saved = isNew
            ? await api.quotations.create(companyId, body)
            : await api.quotations.update(companyId, quotation.id, { ...body, rowVersion: rowVersion ?? quotation.rowVersion });
          queryClient.setQueryData(qk.quotation(companyId, saved.id), saved);
          void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
          void queryClient.invalidateQueries({ queryKey: ['c', companyId, 'dashboard'] });
          reset(quotationToForm(saved));
          setRowVersion(saved.rowVersion);
          setServerTotals(saved.totals);
          toast.success(isNew ? tr('Entwurf angelegt', 'Draft created') : tr('Entwurf gespeichert', 'Draft saved'), `${saved.number} · ${formatEur(saved.totals.grossTotal)}`);
          if (mode !== 'stay' || isNew) {
            bypassGuard.current = true;
            const target =
              mode === 'send' ? `/angebote/${saved.id}?senden=1` : mode === 'close' ? `/angebote/${saved.id}` : `/angebote/${saved.id}/bearbeiten`;
            void navigate(target, { replace: isNew && mode === 'stay' });
          }
        } catch (error) {
          if (isConflict(error)) {
            setConflictOpen(true);
          } else if (error instanceof ApiError && error.code === 'quotation_not_editable') {
            toast.error(tr('Nicht mehr bearbeitbar', 'No longer editable'), errorMessage(error));
            bypassGuard.current = true;
            void navigate(`/angebote/${quotation?.id ?? ''}`);
          } else {
            const rest = applyServerErrors(error, setError, knownFields);
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

  const title = isNew ? tr('Neues Angebot', 'New quotation') : tr(`Angebot ${quotation.number} bearbeiten`, `Edit quotation ${quotation.number}`);

  return (
    <>
      <PageHeader
        title={title}
        back={isNew ? { to: '/angebote', label: tr('Angebote', 'Quotations') } : { to: `/angebote/${quotation.id}`, label: quotation.number }}
        meta={<QuotationStatusBadge status="Draft" />}
        actions={
          <>
            {isNew && (
              <Button icon={FileStack} onClick={() => setTemplateOpen(true)}>
                {tr('Vorlage verwenden', 'Use template')}
              </Button>
            )}
            {!isNew && (
              <ButtonLink to={`/angebote/${quotation.id}/vorschau`} icon={Eye}>
                {tr('Vorschau', 'Preview')}
              </ButtonLink>
            )}
          </>
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
          <Alert tone="danger" live title={tr('Speichern nicht möglich', 'Could not save')}>
            {formError}
          </Alert>
        )}

        <Card>
          <CardHeader title={tr('Kunde & Eckdaten', 'Customer & key details')} />
          <CardBody className="grid gap-5 lg:grid-cols-2">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => <CustomerPicker value={field.value} onChange={field.onChange} error={errors.customerId?.message} />}
            />
            <div className="space-y-4">
              <Field label={tr('Betreff', 'Subject')} error={errors.title?.message} required>
                <Input placeholder={tr('z. B. Erneuerung Unterverteilung EG', 'e.g. Renewal of ground-floor sub-distribution board')} {...register('title')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr('Angebotsdatum', 'Quotation date')} error={errors.issueDate?.message} required>
                  <Input type="date" {...register('issueDate')} />
                </Field>
                <Field
                  label={tr('Gültig bis', 'Valid until')}
                  error={errors.validUntil?.message}
                  required
                  hint={
                    validityDays !== null && validityDays >= 0
                      ? tr(
                          `${validityDays} Tage gültig (Standard: ${settings.defaultValidityDays} Tage)`,
                          `Valid for ${validityDays} days (default: ${settings.defaultValidityDays} days)`,
                        )
                      : undefined
                  }
                >
                  <Input type="date" {...register('validUntil')} />
                </Field>
              </div>
              <Field
                label={tr('Besteuerung', 'Tax mode')}
                error={errors.taxMode?.message}
                labelAside={
                  <HelpPopover label={tr('Erklärung zur Besteuerung', 'About the tax mode')}>
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
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={tr('Einleitung', 'Introduction')}
            description={tr('Erscheint vor den Positionen, z. B. Anrede und Bezug auf Ihre Anfrage.', 'Appears before the line items, e.g. greeting and reference to the enquiry.')}
          />
          <CardBody>
            <Field label={tr('Einleitungstext', 'Introduction text')} hideLabel error={errors.introText?.message}>
              <Textarea
                rows={3}
                placeholder={tr('Sehr geehrte Damen und Herren, vielen Dank für Ihre Anfrage …', 'Dear Sir or Madam, thank you for your enquiry …')}
                {...register('introText')}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={tr('Positionen', 'Line items')}
            description={tr('Mengen und Preise akzeptieren deutsche Schreibweise, z. B. 1.234,56.', 'Quantities and prices accept English number format, e.g. 1,234.56.')}
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
          <CardHeader title={tr('Abschluss & Bedingungen', 'Closing & terms')} />
          <CardBody className="space-y-4">
            <Field label={tr('Schlusstext', 'Closing text')} error={errors.closingText?.message} optional>
              <Textarea rows={3} {...register('closingText')} />
            </Field>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label={tr('Zahlungsbedingungen', 'Payment terms')} error={errors.paymentTerms?.message} optional>
                <Textarea rows={3} placeholder={tr('z. B. Zahlbar innerhalb von 14 Tagen ohne Abzug.', 'e.g. Payable within 14 days without deduction.')} {...register('paymentTerms')} />
              </Field>
              <Field label={tr('Weitere Bedingungen', 'Further terms')} error={errors.terms?.message} optional>
                <Textarea rows={3} {...register('terms')} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card className="border-dashed bg-neutral-25">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Lock aria-hidden size={15} className="text-neutral-500" /> {tr('Interne Notizen', 'Internal notes')}
              </span>
            }
            description={tr('Nur intern – erscheint weder im PDF noch auf der Kundenseite.', 'Internal only – appears neither in the PDF nor on the customer page.')}
          />
          <CardBody>
            <Field label={tr('Interne Notizen (nur intern)', 'Internal notes (internal only)')} hideLabel error={errors.internalNotes?.message}>
              <Textarea rows={2} placeholder={tr('z. B. Material bei Großhändler reservieren', 'e.g. Reserve materials at the wholesaler')} {...register('internalNotes')} />
            </Field>
          </CardBody>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-neutral-500">{taxMode === 'Standard' ? tr('Gesamt brutto', 'Gross total') : tr('Gesamtbetrag', 'Total')}</p>
              <p className="text-lg leading-6 font-semibold text-neutral-900 tabular" data-testid="sticky-gross">
                {formatEur((showServerTotals && serverTotals ? serverTotals : totals).grossTotal)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="mr-1 hidden text-[13px] text-neutral-500 md:inline" aria-live="polite">
                {isDirty ? tr('Ungespeicherte Änderungen', 'Unsaved changes') : isNew ? '' : tr('Alle Änderungen gespeichert', 'All changes saved')}
              </span>
              <Button type="submit" icon={Save} loading={saving === 'stay'} disabled={saving !== null}>
                <span className="sm:hidden">{tr('Speichern', 'Save')}</span>
                <span className="hidden sm:inline">{tr('Entwurf speichern', 'Save draft')}</span>
              </Button>
              <Button variant="primary" icon={Send} loading={saving === 'send'} disabled={saving !== null} onClick={() => void save('send')}>
                <span className="sm:hidden">{tr('Senden …', 'Send …')}</span>
                <span className="hidden sm:inline">{tr('Speichern & versenden …', 'Save & send …')}</span>
              </Button>
            </div>
          </div>
        </div>
      </form>

      <UnsavedChangesGuard when={isDirty && saving === null} bypass={bypassGuard} />
      {isNew && <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} onApply={applyTemplate} />}
      <Dialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title={tr('Das Angebot wurde zwischenzeitlich geändert', 'The quotation has been changed in the meantime')}
        description={tr(
          'Jemand anderes hat diesen Entwurf gespeichert, während Sie ihn bearbeitet haben. Ihre Änderungen wurden nicht gespeichert.',
          'Someone else saved this draft while you were editing it. Your changes have not been saved.',
        )}
        footer={
          <>
            <Button onClick={() => setConflictOpen(false)}>{tr('Weiter bearbeiten', 'Continue editing')}</Button>
            <Button variant="primary" icon={RefreshCw} loading={reload.isPending} onClick={() => reload.mutate()}>
              {tr('Aktuelle Fassung laden', 'Load latest version')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">
          {tr(
            'Beim Neuladen gehen Ihre ungespeicherten Änderungen verloren. Kopieren Sie wichtige Texte ggf. vorher heraus.',
            'Reloading discards your unsaved changes. Copy any important texts out first if needed.',
          )}
        </p>
      </Dialog>
    </>
  );
}

export default function QuotationEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { companyId } = useCompany();
  const settings = useCompanySettings();
  const taxRates = useTaxRates();
  const quotation = useQuery({ queryKey: qk.quotation(companyId, id ?? ''), queryFn: () => api.quotations.get(companyId, id!), enabled: Boolean(id) });

  const failed = settings.error ?? taxRates.error ?? (id ? quotation.error : null);
  if (failed) {
    return (
      <ErrorState
        error={failed}
        onRetry={() => {
          void settings.refetch();
          void taxRates.refetch();
          if (id) void quotation.refetch();
        }}
      />
    );
  }
  if (!settings.data || !taxRates.data || (id && !quotation.data)) return <PageSkeleton rows={10} />;

  if (quotation.data && quotation.data.status !== 'Draft') {
    return (
      <>
        <PageHeader title={tr(`Angebot ${quotation.data.number}`, `Quotation ${quotation.data.number}`)} back={{ to: `/angebote/${quotation.data.id}`, label: quotation.data.number }} />
        <Alert
          tone="info"
          title={tr('Nur Entwürfe können bearbeitet werden', 'Only drafts can be edited')}
          actions={
            <ButtonLink to={`/angebote/${quotation.data.id}`} variant="primary">
              {tr('Zum Angebot', 'Go to quotation')}
            </ButtonLink>
          }
        >
          {tr(
            'Dieses Angebot wurde bereits versendet oder abgeschlossen. Um Änderungen vorzunehmen, erstellen Sie in der Angebotsansicht eine Revision.',
            'This quotation has already been sent or completed. To make changes, create a revision from the quotation view.',
          )}{' '}
          <Link to={`/angebote/${quotation.data.id}`}>{tr('Angebot öffnen', 'Open quotation')}</Link>
        </Alert>
      </>
    );
  }

  const initial = quotation.data
    ? quotationToForm(quotation.data)
    : newQuotationDefaults(settings.data, taxRates.data, params.get('kunde') ?? '');

  return <EditorForm key={quotation.data?.id ?? 'new'} quotation={quotation.data ?? null} initial={initial} taxRates={taxRates.data} settings={settings.data} />;
}
