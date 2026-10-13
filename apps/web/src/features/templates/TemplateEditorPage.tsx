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
import { qk } from '@/lib/queryKeys';

const optionalText = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`);

const templateSchema = z.object({
  name: z.string().trim().min(1, 'Bitte Namen angeben.').max(200),
  description: optionalText(500),
  taxMode: z.enum(['', 'Standard', 'SmallBusiness', 'ReverseCharge']),
  introText: optionalText(4000),
  closingText: optionalText(4000),
  terms: optionalText(4000),
  lineItems: z
    .array(lineItemSchema.extend({ taxRatePercent: z.number().min(0).max(100).nullable() }))
    .min(1, 'Mindestens eine Position.')
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
        toast.success(template ? 'Vorlage gespeichert' : 'Vorlage angelegt', saved.name);
        if (!template) {
          bypass.current = true;
          void navigate(`/vorlagen/${saved.id}`, { replace: true });
        }
      } catch (error) {
        const rest = applyServerErrors(error, setError, fields);
        if (rest.length > 0 || !hasFieldErrors(error)) setFormError(rest.join(' ') || errorMessage(error));
      }
    },
    () => toast.error('Bitte prüfen Sie die markierten Felder.'),
  )(event);

  return (
    <>
      <PageHeader
        title={template ? template.name : 'Neue Vorlage'}
        documentTitle={template ? `Vorlage ${template.name}` : 'Neue Vorlage'}
        back={{ to: '/vorlagen', label: 'Vorlagen' }}
        description="Wiederverwendbare Texte und Positionen für typische Angebote."
        actions={
          template && (
            <>
              <Button variant="dangerGhost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
                Löschen
              </Button>
              <ButtonLink to={`/angebote/neu?vorlage=${template.id}`} icon={FilePlus2}>
                Angebot daraus erstellen
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
          <CardHeader title="Allgemein" />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Field label="Name" error={errors.name?.message} required>
              <Input placeholder="z. B. Zählerschrank-Modernisierung" {...register('name')} />
            </Field>
            <Field label="Besteuerung" error={errors.taxMode?.message} hint="Optional: überschreibt beim Erstellen die Firmenvorgabe.">
              <Select {...register('taxMode')}>
                <option value="">Keine Vorgabe (Firmenstandard)</option>
                <option value="Standard">Regelbesteuerung</option>
                <option value="SmallBusiness">Kleinunternehmer (§ 19 UStG)</option>
                <option value="ReverseCharge">Reverse Charge (§ 13b UStG)</option>
              </Select>
            </Field>
            <Field label="Beschreibung" error={errors.description?.message} optional className="md:col-span-2">
              <Input placeholder="Wofür ist die Vorlage gedacht?" {...register('description')} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Positionen" description="Ohne Steuersatz („Standard“) gilt beim Erstellen der Standardsatz Ihrer Firma." />
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
                <span className="text-neutral-600">Summe netto: </span>
                <span className="font-semibold text-neutral-900 tabular">{formatEur(net)}</span>
                <p className="mt-1 text-xs text-neutral-500">Die Umsatzsteuer wird im Angebot berechnet.</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Texte" />
          <CardBody className="space-y-4">
            <Field label="Einleitung" error={errors.introText?.message} optional>
              <Textarea rows={3} {...register('introText')} />
            </Field>
            <Field label="Schlusstext" error={errors.closingText?.message} optional>
              <Textarea rows={3} {...register('closingText')} />
            </Field>
            <Field label="Bedingungen" error={errors.terms?.message} optional>
              <Textarea rows={3} {...register('terms')} />
            </Field>
          </CardBody>
        </Card>
        <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ButtonLink to="/vorlagen">Abbrechen</ButtonLink>
          <Button type="submit" variant="primary" icon={Save} loading={isSubmitting}>
            {template ? 'Vorlage speichern' : 'Vorlage anlegen'}
          </Button>
        </div>
      </form>
      <UnsavedChangesGuard when={isDirty && !isSubmitting} bypass={bypass} />
      {template && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Vorlage „${template.name}“ löschen?`}
          description="Bereits erstellte Angebote bleiben unverändert."
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={async () => {
            await api.templates.delete(companyId, template.id);
            void queryClient.invalidateQueries({ queryKey: qk.templates(companyId) });
            toast.success('Vorlage gelöscht');
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
