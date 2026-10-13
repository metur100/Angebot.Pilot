import { lineItemSchema, type TemplateDto, type UpsertTemplateRequest } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Save, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { useCompany, useTaxRates } from '@/app/company';
import { UnsavedChangesGuard } from '@/components/domain/Common';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { LineItemsEditor, newLineItem, type LineItemValue } from '@/features/quotations/LineItemsEditor';
import { defaultTaxRateOf, liveTotals } from '@/features/quotations/QuotationEditorPage';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, hasFieldErrors } from '@/lib/errors';
import { formatEur } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';

// Validation messages are resolved when validating (zod v4 `error` callbacks), so they follow the current UI language.
const optionalText = (max: number) => z.string().trim().max(max, { error: () => tr(`Maximal ${max} Zeichen.`, `At most ${max} characters.`) });

const templateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => tr('Bitte Namen angeben.', 'Please enter a name.') })
    .max(200),
  description: optionalText(500),
  taxMode: z.enum(['', 'Standard', 'SmallBusiness', 'ReverseCharge']),
  introText: optionalText(4000),
  closingText: optionalText(4000),
  terms: optionalText(4000),
  lineItems: z
    .array(lineItemSchema.extend({ taxRatePercent: z.number().min(0).max(100).nullable() }))
    .min(1, { error: () => tr('Mindestens eine Position.', 'At least one line item.') })
    .max(200),
});
type TemplateFormInput = z.input<typeof templateSchema>;
type TemplateFormOutput = z.output<typeof templateSchema>;

const fields = ['name', 'description', 'taxMode', 'introText', 'closingText', 'terms', 'lineItems'];
const n = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null);

function toForm(t: TemplateDto | null): TemplateFormInput {
  return {
    name: t?.name ?? '',
    description: t?.description ?? '',
    taxMode: t?.taxMode ?? '',
    introText: t?.introText ?? '',
    closingText: t?.closingText ?? '',
    terms: t?.terms ?? '',
    lineItems: t
      ? [...t.lineItems]
          .sort((a, b) => a.position - b.position)
          .map((l) => ({
            title: l.title,
            description: l.description ?? '',
            quantity: l.quantity,
            unit: l.unit,
            unitPriceNet: l.unitPriceNet,
            discountPercent: l.discountPercent,
            taxRatePercent: l.taxRatePercent,
          }))
      : [{ ...newLineItem(null), taxRatePercent: null }],
  };
}

function toRequest(v: TemplateFormOutput): UpsertTemplateRequest {
  return {
    name: v.name.trim(),
    description: n(v.description),
    taxMode: v.taxMode === '' ? null : v.taxMode,
    introText: n(v.introText),
    closingText: n(v.closingText),
    terms: n(v.terms),
    lineItems: v.lineItems.map((l) => ({
      title: l.title.trim(),
      description: n(l.description),
      quantity: l.quantity,
      unit: l.unit.trim(),
      unitPriceNet: l.unitPriceNet,
      discountPercent: l.discountPercent,
      taxRatePercent: l.taxRatePercent,
    })),
  };
}

function TemplateForm({ template }: { template: TemplateDto | null }) {
  const { companyId } = useCompany();
  const taxRates = useTaxRates();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const bypass = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TemplateFormInput, unknown, TemplateFormOutput>({ resolver: zodResolver(templateSchema), defaultValues: toForm(template) });
  const items = useWatch({ control, name: 'lineItems' }) as LineItemValue[] | undefined;
  const taxModeValue = useWatch({ control, name: 'taxMode' });
  const defaultRate = defaultTaxRateOf(taxRates.data);
  const net = useMemo(
    () => liveTotals((items ?? []).map((l) => ({ ...l, taxRatePercent: l.taxRatePercent ?? defaultRate })), 'Standard').netTotal,
    [items, defaultRate],
  );

  const save = useMutation({
    mutationFn: (body: UpsertTemplateRequest) => (template ? api.templates.update(companyId, template.id, body) : api.templates.create(companyId, body)),
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) =>
    void handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const saved = await save.mutateAsync(toRequest(values));
        queryClient.setQueryData(qk.template(companyId, saved.id), saved);
        void queryClient.invalidateQueries({ queryKey: qk.templates(companyId) });
        reset(toForm(saved));
        toast.success(template ? tr('Vorlage gespeichert', 'Template saved') : tr('Vorlage angelegt', 'Template created'), saved.name);
        if (!template) {
          bypass.current = true;
          void navigate(`/vorlagen/${saved.id}`, { replace: true });
        }
      } catch (error) {
        const rest = applyServerErrors(error, setError, fields);
        if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
      }
    },
    () => toast.error(tr('Bitte prüfen Sie die markierten Felder.', 'Please check the highlighted fields.')),
  )(event);

  return (
    <>
      <PageHeader
        title={template ? template.name : tr('Neue Vorlage', 'New template')}
        documentTitle={template ? tr(`Vorlage ${template.name}`, `Template ${template.name}`) : tr('Neue Vorlage', 'New template')}
        back={{ to: '/vorlagen', label: tr('Vorlagen', 'Templates') }}
        description={tr('Wiederverwendbare Texte und Positionen für typische Angebote.', 'Reusable texts and line items for typical quotations.')}
        actions={
          template && (
            <>
              <Button variant="dangerGhost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                {tr('Löschen', 'Delete')}
              </Button>
              <ButtonLink to={`/angebote/neu?vorlage=${template.id}`} icon={FilePlus2}>
                {tr('Angebot daraus erstellen', 'Create quotation from it')}
              </ButtonLink>
            </>
          )
        }
      />
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {formError && (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        )}
        <Card>
          <CardHeader title={tr('Allgemein', 'General')} />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label={tr('Name', 'Name')} error={errors.name?.message} required>
              <Input placeholder={tr('z. B. Zählerschrank-Modernisierung', 'e.g. meter cabinet upgrade')} {...register('name')} />
            </Field>
            <Field
              label={tr('Besteuerung', 'Taxation')}
              error={errors.taxMode?.message}
              hint={tr('Optional: überschreibt beim Erstellen die Firmenvorgabe.', 'Optional: overrides the company default when creating a quotation.')}
            >
              <Select {...register('taxMode')}>
                <option value="">{tr('Keine Vorgabe (Firmenstandard)', 'No preset (company default)')}</option>
                <option value="Standard">{tr('Regelbesteuerung', 'Standard taxation')}</option>
                <option value="SmallBusiness">{tr('Kleinunternehmer (§ 19 UStG)', 'Small business (§ 19 UStG)')}</option>
                <option value="ReverseCharge">{tr('Reverse Charge (§ 13b UStG)', 'Reverse charge (§ 13b UStG)')}</option>
              </Select>
            </Field>
            <Field label={tr('Beschreibung', 'Description')} error={errors.description?.message} optional className="md:col-span-2">
              <Input placeholder={tr('Wofür ist die Vorlage gedacht?', 'What is the template for?')} {...register('description')} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={tr('Positionen', 'Line items')}
            description={tr(
              'Ohne Steuersatz („Standard“) gilt beim Erstellen der Standardsatz Ihrer Firma.',
              'Without a VAT rate (“Standard”), your company’s standard rate applies when creating a quotation.',
            )}
          />
          <CardBody>
            <LineItemsEditor
              control={control}
              register={register}
              taxRates={taxRates.data ?? []}
              defaultTaxRate={defaultRate}
              vatEnabled={(taxModeValue) === '' || taxModeValue === 'Standard'}
              taxRateOptional
            />
            <div className="mt-4 flex justify-end text-sm">
              <div className="rounded-lg border border-neutral-200 bg-neutral-25 px-4 py-3">
                <span className="text-neutral-600">{tr('Summe netto: ', 'Net total: ')}</span>
                <span className="font-semibold text-neutral-900 tabular">{formatEur(net)}</span>
                <p className="mt-1 text-xs text-neutral-500">{tr('Die Umsatzsteuer wird im Angebot berechnet.', 'VAT is calculated in the quotation.')}</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={tr('Texte', 'Texts')} />
          <CardBody className="space-y-4">
            <Field label={tr('Einleitung', 'Introduction')} error={errors.introText?.message} optional>
              <Textarea rows={3} {...register('introText')} />
            </Field>
            <Field label={tr('Schlusstext', 'Closing text')} error={errors.closingText?.message} optional>
              <Textarea rows={3} {...register('closingText')} />
            </Field>
            <Field label={tr('Bedingungen', 'Terms')} error={errors.terms?.message} optional>
              <Textarea rows={3} {...register('terms')} />
            </Field>
          </CardBody>
        </Card>
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ButtonLink to="/vorlagen">{tr('Abbrechen', 'Cancel')}</ButtonLink>
          <Button type="submit" variant="primary" icon={Save} loading={isSubmitting}>
            {template ? tr('Vorlage speichern', 'Save template') : tr('Vorlage anlegen', 'Create template')}
          </Button>
        </div>
      </form>
      <UnsavedChangesGuard when={isDirty && !isSubmitting} bypass={bypass} />
      {template && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={tr(`Vorlage „${template.name}“ löschen?`, `Delete template “${template.name}”?`)}
          description={tr('Bereits erstellte Angebote bleiben unverändert.', 'Quotations already created remain unchanged.')}
          confirmLabel={tr('Löschen', 'Delete')}
          variant="danger"
          onConfirm={async () => {
            await api.templates.delete(companyId, template.id);
            void queryClient.invalidateQueries({ queryKey: qk.templates(companyId) });
            toast.success(tr('Vorlage gelöscht', 'Template deleted'));
            bypass.current = true;
            void navigate('/vorlagen', { replace: true });
          }}
        />
      )}
    </>
  );
}

export default function TemplateEditorPage() {
  const { id } = useParams();
  const { companyId } = useCompany();
  const template = useQuery({ queryKey: qk.template(companyId, id ?? ''), queryFn: () => api.templates.get(companyId, id!), enabled: Boolean(id) });
  if (id && template.isPending) return <PageSkeleton rows={8} />;
  if (id && template.isError) return <ErrorState error={template.error} onRetry={() => void template.refetch()} />;
  return <TemplateForm key={id ?? 'new'} template={id ? (template.data ?? null) : null} />;
}
