// Create/edit a quotation, optimised for small screens: four steps (Kunde, Basis, Positionen, Texte), line items as
// stacked cards edited in a focused bottom sheet, and a sticky live-totals bar (calculateTotals = server preview).
import {
  addDaysIso, ApiError, calculateTotals, errorMessage, formatEur, formatPercent, formatQuantity, quotationSchema, todayIso,
  type LineItemForm, type QuotationDto, type QuotationForm, type TaxMode,
} from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, SectionHeader } from '@/components/Card';
import { DateField, SelectField, TextField } from '@/components/Field';
import { BottomBar, FormScroll, Screen } from '@/components/Layout';
import { ErrorState, InlineError, LoadingView } from '@/components/States';
import { TAX_DISCLAIMER, taxModeOptions } from '@/components/TaxModeInfo';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { emptyToNull, isConflict } from '@/lib/forms';
import { keys, useCompanySettings, useCustomer, useQuotation, useTaxRates } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { colors, radius, space, touch } from '@/theme';

import { CustomerPicker } from './CustomerPicker';
import { LineItemEditor } from './LineItemEditor';
import { TemplatePicker } from './TemplatePicker';

const STEPS = ['Kunde', 'Basis', 'Positionen', 'Texte'] as const;

const STEP_FIELDS: (keyof QuotationForm)[][] = [
  ['customerId'],
  ['title', 'issueDate', 'validUntil', 'taxMode'],
  ['lineItems'],
  ['introText', 'closingText', 'terms', 'paymentTerms', 'internalNotes'],
];

function firstStepWithError(errors: FieldErrors<QuotationForm>): number {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((f) => errors[f]));
  return index === -1 ? 0 : index;
}

function fromDto(q: QuotationDto): QuotationForm {
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
    lineItems: q.lineItems
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        title: li.title, description: li.description ?? '', quantity: li.quantity, unit: li.unit,
        unitPriceNet: li.unitPriceNet, discountPercent: li.discountPercent, taxRatePercent: li.taxRatePercent,
      })),
  };
}

function emptyForm(): QuotationForm {
  const today = todayIso();
  return {
    customerId: '', title: '', issueDate: today, validUntil: addDaysIso(today, 30), taxMode: 'Standard',
    introText: '', closingText: '', terms: '', paymentTerms: '', internalNotes: '', lineItems: [],
  };
}

function StepIndicator({ step, onSelect, errorSteps }: { step: number; onSelect: (s: number) => void; errorSteps: Set<number> }) {
  return (
    <View style={styles.steps} accessibilityRole="tablist">
      {STEPS.map((label, i) => {
        const active = i === step;
        const hasError = errorSteps.has(i);
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={`Schritt ${i + 1} von ${STEPS.length}: ${label}${hasError ? ', enthält Fehler' : ''}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(i)}
            style={[styles.step, active ? styles.stepActive : null]}
            testID={`step-${i}`}
          >
            <View style={[styles.stepNumber, active ? styles.stepNumberActive : null, hasError ? styles.stepNumberError : null]}>
              {hasError ? (
                <Ionicons name="alert" size={14} color={colors.onBrand} />
              ) : (
                <Text variant="small" style={{ color: active ? colors.onBrand : colors.textSecondary, fontWeight: '700' }}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text variant="small" tone={active ? 'brand' : 'secondary'} numberOfLines={1} style={styles.stepLabel}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LineCard({
  item, index, count, taxMode, onEdit, onMove, onDuplicate, onDelete,
}: {
  item: LineItemForm; index: number; count: number; taxMode: TaxMode;
  onEdit: () => void; onMove: (dir: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const totals = calculateTotals([item], 'Standard');
  return (
    <Card style={styles.lineCard} testID={`line-card-${index}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Position ${index + 1}: ${item.title}, ${formatEur(totals.netTotal)} netto. Bearbeiten`} onPress={onEdit} style={styles.lineMain}>
        <View style={styles.lineHeader}>
          <Text variant="small" tone="muted">
            Pos. {index + 1}
          </Text>
          <Text variant="bodyStrong" testID={`line-net-${index}`}>
            {formatEur(totals.netTotal)}
          </Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text variant="caption" tone="secondary">
          {formatQuantity(item.quantity)} {item.unit} × {formatEur(item.unitPriceNet)}
          {item.discountPercent ? ` · −${formatPercent(item.discountPercent)}` : ''}
          {taxMode === 'Standard' ? ` · ${formatPercent(item.taxRatePercent)} USt.` : ''}
        </Text>
      </Pressable>
      <View style={styles.lineActions}>
        <IconButton icon="arrow-up" accessibilityLabel={`Position ${index + 1} nach oben`} onPress={() => onMove(-1)} disabled={index === 0} size={20} testID={`line-up-${index}`} />
        <IconButton icon="arrow-down" accessibilityLabel={`Position ${index + 1} nach unten`} onPress={() => onMove(1)} disabled={index === count - 1} size={20} testID={`line-down-${index}`} />
        <IconButton icon="copy-outline" accessibilityLabel={`Position ${index + 1} duplizieren`} onPress={onDuplicate} size={20} testID={`line-duplicate-${index}`} />
        <IconButton icon="create-outline" accessibilityLabel={`Position ${index + 1} bearbeiten`} onPress={onEdit} size={20} testID={`line-edit-${index}`} />
        <IconButton icon="trash-outline" accessibilityLabel={`Position ${index + 1} löschen`} onPress={onDelete} color={colors.danger} size={20} testID={`line-delete-${index}`} />
      </View>
    </Card>
  );
}

interface EditorInit {
  values: QuotationForm;
  customerName: string;
  rowVersion: string | null;
  number?: string;
  editId?: string;
  templateId?: string;
}

/** Loads everything the editor needs, then mounts the form with its initial values (no reset-in-effect). */
export default function QuotationEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; templateId?: string; customerId?: string }>();
  const editId = params.id || undefined;
  const existing = useQuotation(editId);
  const settings = useCompanySettings();
  const presetCustomer = useCustomer(editId ? undefined : params.customerId);
  const [reloadCount, setReloadCount] = useState(0);

  if (editId) {
    if (existing.isPending) return <LoadingView />;
    if (existing.isError) {
      return (
        <Screen>
          <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
        </Screen>
      );
    }
    if (existing.data.status !== 'Draft') {
      return (
        <Screen>
          <ErrorState
            error={new ApiError({ status: 409, detail: 'Nur Entwürfe können bearbeitet werden. Erstellen Sie eine Revision, um ein versendetes Angebot zu ändern.' })}
          />
        </Screen>
      );
    }
    const init: EditorInit = { values: fromDto(existing.data), customerName: existing.data.customerName, rowVersion: existing.data.rowVersion, number: existing.data.number, editId };
    return (
      <QuotationEditor
        key={reloadCount}
        init={init}
        onReload={async () => {
          await existing.refetch();
          setReloadCount((n) => n + 1);
        }}
      />
    );
  }

  if (settings.isPending || (params.customerId && presetCustomer.isPending && presetCustomer.fetchStatus !== 'idle')) return <LoadingView />;
  const s = settings.data;
  const base = emptyForm();
  const init: EditorInit = {
    values: {
      ...base,
      customerId: presetCustomer.data?.id ?? '',
      validUntil: addDaysIso(base.issueDate, s?.defaultValidityDays ?? 30),
      taxMode: s?.defaultTaxMode ?? 'Standard',
      introText: s?.defaultIntroText ?? '',
      closingText: s?.defaultClosingText ?? '',
      terms: s?.defaultTerms ?? '',
      paymentTerms: s?.paymentTerms ?? '',
    },
    customerName: presetCustomer.data?.displayName ?? '',
    rowVersion: null,
    templateId: params.templateId || undefined,
  };
  return <QuotationEditor init={init} />;
}

function QuotationEditor({ init, onReload }: { init: EditorInit; onReload?: () => Promise<void> }) {
  const editId = init.editId;
  const companyId = useCompanyId();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const taxRates = useTaxRates();

  const [step, setStep] = useState(0);
  const [customerName, setCustomerName] = useState(init.customerName);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = new line
  const [formError, setFormError] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const allowLeave = useRef(false);
  // Frozen at mount: a background refetch must not silently bypass the optimistic-concurrency check.
  const [rowVersion] = useState(init.rowVersion);

  const form = useForm<QuotationForm>({ resolver: zodResolver(quotationSchema), defaultValues: init.values, mode: 'onSubmit' });
  const { control, handleSubmit, reset, setValue, formState } = form;
  const { errors, isSubmitting, isDirty } = formState;
  const lines = useFieldArray({ control, name: 'lineItems' });
  const lineItems = useWatch({ control, name: 'lineItems' });
  const taxMode = useWatch({ control, name: 'taxMode' });
  const issueDate = useWatch({ control, name: 'issueDate' });
  const totals = useMemo(() => calculateTotals(lineItems ?? [], taxMode), [lineItems, taxMode]);

  const activeRates = useMemo(() => (taxRates.data ?? []).filter((r) => !r.isArchived), [taxRates.data]);
  const defaultTaxRate = activeRates.find((r) => r.isDefault)?.ratePercent ?? activeRates[0]?.ratePercent ?? 19;

  const applyTemplate = useCallback(
    async (id: string) => {
      setApplyingTemplate(true);
      try {
        const t = await api.templates.get(companyId, id);
        const rates = (await queryClient.ensureQueryData({ queryKey: keys.taxRates(companyId), queryFn: () => api.companies.taxRates(companyId) })).filter((r) => !r.isArchived);
        const fallbackRate = rates.find((r) => r.isDefault)?.ratePercent ?? rates[0]?.ratePercent ?? 19;
        setTemplateId(id);
        const current = form.getValues();
        reset(
          {
            ...current,
            title: current.title || t.name,
            taxMode: t.taxMode ?? current.taxMode,
            introText: t.introText ?? current.introText,
            closingText: t.closingText ?? current.closingText,
            terms: t.terms ?? current.terms,
            lineItems: t.lineItems
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((li) => ({
                title: li.title, description: li.description ?? '', quantity: li.quantity, unit: li.unit,
                unitPriceNet: li.unitPriceNet, discountPercent: li.discountPercent, taxRatePercent: li.taxRatePercent ?? fallbackRate,
              })),
          },
          { keepDefaultValues: true },
        );
        toast(`Vorlage „${t.name}“ übernommen`, 'info');
      } catch (error) {
        Alert.alert('Vorlage konnte nicht geladen werden', errorMessage(error));
      } finally {
        setApplyingTemplate(false);
      }
    },
    [companyId, form, queryClient, reset, toast],
  );

  // Template chosen on the templates screen (?templateId=…): apply once after mount.
  const initialTemplate = init.templateId;
  useEffect(() => {
    if (!initialTemplate) return;
    const timer = setTimeout(() => void applyTemplate(initialTemplate), 0);
    return () => clearTimeout(timer);
  }, [initialTemplate, applyTemplate]);

  // ---- unsaved changes guard (Android back, header back) ----
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeave.current || !isDirty) return;
      e.preventDefault();
      Alert.alert('Änderungen verwerfen?', 'Ihre Änderungen an diesem Angebot sind noch nicht gespeichert.', [
        { text: 'Weiter bearbeiten', style: 'cancel' },
        { text: 'Verwerfen', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const onValid = async (v: QuotationForm) => {
    setFormError(null);
    const body = {
      customerId: v.customerId,
      title: v.title.trim(),
      issueDate: v.issueDate,
      validUntil: v.validUntil,
      taxMode: v.taxMode,
      introText: emptyToNull(v.introText),
      closingText: emptyToNull(v.closingText),
      terms: emptyToNull(v.terms),
      paymentTerms: emptyToNull(v.paymentTerms),
      internalNotes: emptyToNull(v.internalNotes),
      lineItems: v.lineItems.map((li) => ({ ...li, description: emptyToNull(li.description) })),
    };
    try {
      const saved = editId
        ? await api.quotations.update(companyId, editId, { ...body, rowVersion: rowVersion ?? '' })
        : await api.quotations.create(companyId, { ...body, templateId });
      queryClient.setQueryData(keys.quotation(companyId, saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: keys.quotations(companyId) });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard(companyId) });
      allowLeave.current = true;
      toast(editId ? 'Angebot gespeichert' : `Entwurf ${saved.number} angelegt`);
      if (editId) router.back();
      else router.replace(`/quotation/${saved.id}`);
    } catch (error) {
      if (isConflict(error)) {
        setFormError('Speichern nicht möglich: Das Angebot wurde zwischenzeitlich geändert.');
        Alert.alert(
          'Angebot wurde zwischenzeitlich geändert',
          'Eine andere Person hat dieses Angebot gespeichert. Laden Sie die aktuelle Fassung neu – Ihre Eingaben in diesem Formular gehen dabei verloren.',
          [
            { text: 'Abbrechen', style: 'cancel' },
            { text: 'Neu laden', onPress: () => void onReload?.() },
          ],
        );
        return;
      }
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        const messages: string[] = [];
        let firstStep: number = STEPS.length;
        for (const [key, msgs] of Object.entries(error.fieldErrors)) {
          const path = key.replace(/\[(\d+)\]/g, '.$1');
          const top = path.split('.')[0] as keyof QuotationForm;
          const stepIndex = STEP_FIELDS.findIndex((fields) => fields.includes(top));
          if (stepIndex >= 0) {
            form.setError(path as never, { type: 'server', message: msgs[0] });
            firstStep = Math.min(firstStep, stepIndex);
          }
          const lineMatch = /^lineItems\.(\d+)/.exec(path);
          messages.push(lineMatch ? `Position ${Number(lineMatch[1]) + 1}: ${msgs[0]}` : (msgs[0] ?? ''));
        }
        setFormError(messages.join('\n'));
        if (firstStep < STEPS.length) setStep(firstStep);
        return;
      }
      setFormError(errorMessage(error));
    }
  };

  const onInvalid = (invalid: FieldErrors<QuotationForm>) => {
    setStep(firstStepWithError(invalid));
    setFormError('Bitte prüfen Sie die markierten Angaben.');
  };

  const save = () => handleSubmit(onValid, onInvalid)();

  const errorSteps = new Set<number>();
  STEP_FIELDS.forEach((fields, i) => {
    if (fields.some((f) => errors[f])) errorSteps.add(i);
  });

  const lineCount = lines.fields.length;
  const editingItem = editingIndex !== null && editingIndex >= 0 ? (lineItems?.[editingIndex] ?? null) : null;

  const confirmDelete = (index: number) =>
    Alert.alert('Position löschen?', `„${lineItems?.[index]?.title ?? ''}“ wird aus dem Angebot entfernt.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => lines.remove(index) },
    ]);

  const openTemplatePicker = () => {
    if (lineCount > 0) {
      Alert.alert('Vorlage übernehmen?', 'Die vorhandenen Positionen werden durch die Positionen der Vorlage ersetzt.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Vorlage wählen', onPress: () => setTemplatePickerOpen(true) },
      ]);
    } else {
      setTemplatePickerOpen(true);
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: editId ? `${init.number ?? 'Angebot'} bearbeiten` : 'Neues Angebot',
          gestureEnabled: !isDirty,
          headerRight: () => (
            <Button label="Speichern" variant="ghost" size="sm" fullWidth={false} onPress={() => void save()} loading={isSubmitting} testID="editor-save-header" />
          ),
        }}
      />
      <StepIndicator step={step} onSelect={setStep} errorSteps={errorSteps} />
      <FormScroll bottomInset={false} contentStyle={styles.content}>
        <InlineError message={formError} testID="editor-error" />

        {step === 0 ? (
          <>
            <SectionHeader title="Kunde" />
            <Controller
              control={control}
              name="customerId"
              render={({ field: { value } }) =>
                value ? (
                  <Card style={styles.customerCard} testID="selected-customer">
                    <Ionicons name="person-circle-outline" size={32} color={colors.brand} />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{customerName}</Text>
                      <Text variant="caption" tone="secondary">
                        Empfänger des Angebots
                      </Text>
                    </View>
                    <Button label="Ändern" variant="ghost" size="sm" fullWidth={false} onPress={() => setCustomerPickerOpen(true)} />
                  </Card>
                ) : (
                  <View style={styles.gap}>
                    <Button label="Kunde wählen" icon="people-outline" variant="outline" onPress={() => setCustomerPickerOpen(true)} testID="pick-customer" />
                    {errors.customerId ? (
                      <Text variant="caption" tone="danger" accessibilityRole="alert">
                        {errors.customerId.message}
                      </Text>
                    ) : null}
                  </View>
                )
              }
            />
            {!editId ? (
              <>
                <SectionHeader title="Vorlage (optional)" />
                <Card style={styles.gap}>
                  <Text variant="caption" tone="secondary">
                    Starten Sie mit Positionen und Texten aus einer gespeicherten Vorlage.
                  </Text>
                  <Button
                    label={templateId ? 'Andere Vorlage wählen' : 'Vorlage wählen'}
                    icon="albums-outline"
                    variant="secondary"
                    onPress={openTemplatePicker}
                    loading={applyingTemplate}
                    testID="pick-template"
                  />
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <Card style={styles.gap}>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField label="Betreff" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.title?.message} required placeholder="z. B. Badsanierung EG" testID="editor-title" />
              )}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="issueDate"
                  render={({ field: { onChange, value } }) => <DateField label="Angebotsdatum" value={value} onChange={onChange} error={errors.issueDate?.message} required testID="editor-issueDate" />}
                />
              </View>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="validUntil"
                  render={({ field: { onChange, value } }) => (
                    <DateField label="Gültig bis" value={value} onChange={onChange} error={errors.validUntil?.message} minimumDate={issueDate} required testID="editor-validUntil" />
                  )}
                />
              </View>
            </View>
            <Controller
              control={control}
              name="taxMode"
              render={({ field: { onChange, value } }) => <SelectField label="Besteuerung" value={value} options={taxModeOptions} onChange={onChange} testID="editor-taxMode" />}
            />
            <Text variant="small" tone="muted">
              {TAX_DISCLAIMER}
            </Text>
          </Card>
        ) : null}

        {step === 2 ? (
          <>
            {lines.fields.map((field, index) => {
              const item = lineItems?.[index];
              if (!item) return null;
              return (
                <LineCard
                  key={field.id}
                  item={item}
                  index={index}
                  count={lineCount}
                  taxMode={taxMode}
                  onEdit={() => setEditingIndex(index)}
                  onMove={(dir) => lines.move(index, index + dir)}
                  onDuplicate={() => lines.insert(index + 1, { ...item })}
                  onDelete={() => confirmDelete(index)}
                />
              );
            })}
            {lineCount === 0 ? (
              <Card style={styles.emptyLines}>
                <Ionicons name="list-outline" size={28} color={colors.brand} />
                <Text variant="body" tone="secondary" align="center">
                  Noch keine Positionen. Fügen Sie Leistungen oder Material hinzu.
                </Text>
              </Card>
            ) : null}
            {errors.lineItems?.message || errors.lineItems?.root?.message ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {errors.lineItems?.message ?? errors.lineItems?.root?.message}
              </Text>
            ) : null}
            <Button label="Position hinzufügen" icon="add-circle-outline" variant="secondary" onPress={() => setEditingIndex(-1)} testID="add-line" />
          </>
        ) : null}

        {step === 3 ? (
          <Card style={styles.gap}>
            {(
              [
                ['introText', 'Einleitung', 'Text vor den Positionen'],
                ['closingText', 'Schlusstext', 'Text nach den Positionen'],
                ['paymentTerms', 'Zahlungsbedingungen', 'z. B. 14 Tage netto'],
                ['terms', 'Bedingungen / Hinweise', undefined],
                ['internalNotes', 'Interne Notiz', 'Nur intern sichtbar, nicht im PDF'],
              ] as const
            ).map(([name, label, hint]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField label={label} hint={hint} value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={errors[name]?.message} multiline testID={`editor-${name}`} />
                )}
              />
            ))}
          </Card>
        ) : null}
      </FormScroll>

      <BottomBar>
        <View style={styles.totalsRow}>
          <View style={styles.flex} accessible accessibilityLabel={`Summe netto ${formatEur(totals.netTotal)}, Umsatzsteuer ${formatEur(totals.taxTotal)}, Gesamt brutto ${formatEur(totals.grossTotal)}`}>
            <Text variant="small" tone="secondary" testID="totals-net">
              Netto {formatEur(totals.netTotal)}
              {taxMode === 'Standard' ? ` · USt. ${formatEur(totals.taxTotal)}` : ''}
            </Text>
            <Text variant="heading" testID="totals-gross">
              {formatEur(totals.grossTotal)}
            </Text>
          </View>
          {step > 0 ? <IconButton icon="chevron-back" accessibilityLabel="Vorheriger Schritt" onPress={() => setStep(step - 1)} testID="step-back" /> : null}
          {step < STEPS.length - 1 ? (
            <Button label="Weiter" icon="chevron-forward" fullWidth={false} onPress={() => setStep(step + 1)} testID="step-next" />
          ) : (
            <Button label="Speichern" icon="save-outline" fullWidth={false} onPress={() => void save()} loading={isSubmitting} testID="editor-save" />
          )}
        </View>
      </BottomBar>

      <CustomerPicker
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onPick={(c) => {
          setValue('customerId', c.id, { shouldDirty: true, shouldValidate: true });
          setCustomerName(c.displayName);
        }}
      />
      <TemplatePicker visible={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)} onPick={(id) => void applyTemplate(id)} />
      <LineItemEditor
        visible={editingIndex !== null}
        item={editingItem}
        position={editingIndex === null ? 0 : editingIndex === -1 ? lineCount + 1 : editingIndex + 1}
        taxMode={taxMode}
        taxRates={taxRates.data ?? []}
        defaultTaxRate={defaultTaxRate}
        onClose={() => setEditingIndex(null)}
        onSave={(item) => {
          if (editingIndex === -1) lines.append(item);
          else if (editingIndex !== null) lines.update(editingIndex, item);
          setEditingIndex(null);
          void form.trigger('lineItems');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  content: { paddingBottom: space[8] },
  steps: {
    flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border, paddingHorizontal: space[2],
  },
  step: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space[2], minHeight: touch + 8, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  stepActive: { borderBottomColor: colors.brand },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  stepNumberActive: { backgroundColor: colors.brand },
  stepNumberError: { backgroundColor: colors.danger },
  stepLabel: { fontWeight: '600' },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  lineCard: { padding: 0, overflow: 'hidden' },
  lineMain: { padding: space[4], gap: 2 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineActions: {
    flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    backgroundColor: colors.neutral[25],
  },
  emptyLines: { alignItems: 'center', gap: space[2], borderStyle: 'dashed', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl },
  totalsRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
