// Create/edit an invoice draft. Same layout as the quotation editor: four steps (customer, dates, items, texts), line
// items as stacked cards edited in a bottom sheet, and a sticky live-totals bar. Only drafts are editable – issued
// invoices are frozen and can only be corrected via a cancellation invoice.
import {
  addDaysIso, ApiError, calculateTotals, errorMessage, formatEur, todayIso, tr,
  type InvoiceDto, type UpdateInvoiceRequest,
} from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { Alert, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, SectionHeader } from '@/components/Card';
import { DateField, SegmentedControl, SelectField, TextField } from '@/components/Field';
import { BottomBar, FormScroll, Screen } from '@/components/Layout';
import { ErrorState, InlineError, LoadingView } from '@/components/States';
import { taxDisclaimer, taxModeOptions } from '@/components/TaxModeInfo';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { CustomerPicker } from '@/features/quotation-editor/CustomerPicker';
import { LineCard, StepIndicator } from '@/features/quotation-editor/EditorParts';
import { LineItemEditor } from '@/features/quotation-editor/LineItemEditor';
import { emptyToNull, isConflict } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { invalidateInvoiceData, useCompanySettings, useCustomer, useInvoice, useTaxRates } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { daysBetween, invoiceFormSchema, type InvoiceForm } from './schema';

const STEP_COUNT = 4;

function stepLabels(): string[] {
  return [tr('Kunde', 'Customer'), tr('Daten', 'Dates'), tr('Positionen', 'Items'), tr('Texte', 'Texts')];
}

const STEP_FIELDS: (keyof InvoiceForm)[][] = [
  ['customerId'],
  ['title', 'issueDate', 'servicePeriod', 'serviceDateFrom', 'serviceDateTo', 'dueDate', 'taxMode', 'buyerReference'],
  ['lineItems'],
  ['introText', 'closingText', 'paymentTerms', 'internalNotes'],
];

function firstStepWithError(errors: FieldErrors<InvoiceForm>): number {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((f) => errors[f]));
  return index === -1 ? 0 : index;
}

function fromDto(i: InvoiceDto): InvoiceForm {
  const period = !!i.serviceDateTo && i.serviceDateTo !== i.serviceDateFrom;
  return {
    customerId: i.customerId,
    title: i.title,
    issueDate: i.issueDate,
    servicePeriod: period,
    serviceDateFrom: i.serviceDateFrom ?? '',
    serviceDateTo: period ? (i.serviceDateTo ?? '') : '',
    dueDate: i.dueDate,
    taxMode: i.taxMode,
    buyerReference: i.buyerReference ?? '',
    introText: i.introText ?? '',
    closingText: i.closingText ?? '',
    paymentTerms: i.paymentTerms ?? '',
    internalNotes: i.internalNotes ?? '',
    lineItems: i.lineItems
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        title: li.title, description: li.description ?? '', quantity: li.quantity, unit: li.unit,
        unitPriceNet: li.unitPriceNet, discountPercent: li.discountPercent, taxRatePercent: li.taxRatePercent,
      })),
  };
}

interface EditorInit {
  values: InvoiceForm;
  customerName: string;
  rowVersion: string | null;
  editId?: string;
  openDetailAfterSave?: boolean;
}

/** Loads everything the editor needs, then mounts the form with its initial values (no reset-in-effect). */
export default function InvoiceEditorScreen() {
  // created=1: the draft was just created from a job/quotation – after saving, show its detail instead of going back.
  const params = useLocalSearchParams<{ id?: string; customerId?: string; created?: string }>();
  const editId = params.id || undefined;
  const existing = useInvoice(editId);
  const settings = useCompanySettings();
  const presetCustomer = useCustomer(editId ? undefined : params.customerId);
  const { tr } = useLocale();
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
            error={new ApiError({
              status: 409,
              detail: tr(
                'Nur Rechnungsentwürfe können bearbeitet werden. Gestellte Rechnungen sind unveränderbar – korrigieren Sie sie über eine Stornorechnung.',
                'Only draft invoices can be edited. Issued invoices cannot be changed – correct them with a cancellation invoice.',
              ),
            })}
          />
        </Screen>
      );
    }
    const init: EditorInit = {
      values: fromDto(existing.data), customerName: existing.data.customerName, rowVersion: existing.data.rowVersion, editId,
      openDetailAfterSave: params.created === '1',
    };
    return (
      <InvoiceEditor
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
  const today = todayIso();
  const init: EditorInit = {
    values: {
      customerId: presetCustomer.data?.id ?? '',
      title: 'Rechnung', // document content: German
      issueDate: today,
      servicePeriod: false,
      serviceDateFrom: today,
      serviceDateTo: '',
      dueDate: addDaysIso(today, s?.invoicePaymentDays ?? 14),
      taxMode: s?.defaultTaxMode ?? 'Standard',
      buyerReference: '',
      introText: s?.invoiceIntroText ?? '',
      closingText: s?.invoiceClosingText ?? '',
      paymentTerms: '',
      internalNotes: '',
      lineItems: [],
    },
    customerName: presetCustomer.data?.displayName ?? '',
    rowVersion: null,
  };
  return <InvoiceEditor init={init} />;
}

function InvoiceEditor({ init, onReload }: { init: EditorInit; onReload?: () => Promise<void> }) {
  const editId = init.editId;
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const companyId = useCompanyId();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const taxRates = useTaxRates();

  const [step, setStep] = useState(0);
  const [customerName, setCustomerName] = useState(init.customerName);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = new line
  const [formError, setFormError] = useState<string | null>(null);
  const allowLeave = useRef(false);
  // Frozen at mount: a background refetch must not silently bypass the optimistic-concurrency check.
  const [rowVersion] = useState(init.rowVersion);

  const form = useForm<InvoiceForm>({ resolver: zodResolver(invoiceFormSchema), defaultValues: init.values, mode: 'onSubmit' });
  const { control, handleSubmit, setValue, getValues, formState } = form;
  const { errors, isSubmitting, isDirty } = formState;
  const lines = useFieldArray({ control, name: 'lineItems' });
  const lineItems = useWatch({ control, name: 'lineItems' });
  const taxMode = useWatch({ control, name: 'taxMode' });
  const issueDate = useWatch({ control, name: 'issueDate' });
  const dueDate = useWatch({ control, name: 'dueDate' });
  const servicePeriod = useWatch({ control, name: 'servicePeriod' });
  const serviceDateFrom = useWatch({ control, name: 'serviceDateFrom' });
  const totals = useMemo(() => calculateTotals(lineItems ?? [], taxMode), [lineItems, taxMode]);
  const paymentDays = issueDate && dueDate ? daysBetween(issueDate, dueDate) : null;

  const activeRates = useMemo(() => (taxRates.data ?? []).filter((r) => !r.isArchived), [taxRates.data]);
  const defaultTaxRate = activeRates.find((r) => r.isDefault)?.ratePercent ?? activeRates[0]?.ratePercent ?? 19;

  // ---- unsaved changes guard (Android back, header back) ----
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeave.current || !isDirty) return;
      e.preventDefault();
      Alert.alert(tr('Änderungen verwerfen?', 'Discard changes?'), tr('Ihre Änderungen an dieser Rechnung sind noch nicht gespeichert.', 'Your changes to this invoice have not been saved yet.'), [
        { text: tr('Weiter bearbeiten', 'Keep editing'), style: 'cancel' },
        { text: tr('Verwerfen', 'Discard'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, isDirty, tr]);

  /** Moving the invoice date keeps the payment term (days until due) and a single service date in step. */
  const changeIssueDate = (next: string) => {
    const current = getValues();
    const term = daysBetween(current.issueDate, current.dueDate);
    setValue('issueDate', next, { shouldDirty: true });
    setValue('dueDate', addDaysIso(next, Math.max(0, term)), { shouldDirty: true });
    if (!current.servicePeriod && current.serviceDateFrom === current.issueDate) setValue('serviceDateFrom', next, { shouldDirty: true });
  };

  const onValid = async (v: InvoiceForm) => {
    setFormError(null);
    const body: Omit<UpdateInvoiceRequest, 'rowVersion'> = {
      customerId: v.customerId,
      title: v.title.trim(),
      issueDate: v.issueDate,
      serviceDateFrom: v.serviceDateFrom || null,
      serviceDateTo: v.servicePeriod ? v.serviceDateTo || null : null,
      dueDate: v.dueDate,
      taxMode: v.taxMode,
      // An empty string means "deliberately empty"; only a missing value makes the server use the company default.
      introText: (v.introText ?? '').trim(),
      closingText: (v.closingText ?? '').trim(),
      paymentTerms: emptyToNull(v.paymentTerms),
      buyerReference: emptyToNull(v.buyerReference),
      internalNotes: emptyToNull(v.internalNotes),
      lineItems: v.lineItems.map((li) => ({ ...li, description: emptyToNull(li.description) })),
    };
    try {
      const saved = editId
        ? await api.invoices.update(companyId, editId, { ...body, rowVersion: rowVersion ?? '' })
        : await api.invoices.create(companyId, body);
      invalidateInvoiceData(queryClient, companyId, saved);
      allowLeave.current = true;
      toast(editId ? tr('Rechnungsentwurf gespeichert', 'Draft invoice saved') : tr('Rechnungsentwurf angelegt', 'Draft invoice created'));
      if (editId && !init.openDetailAfterSave) router.back();
      else router.replace(`/invoice/${saved.id}`);
    } catch (error) {
      if (isConflict(error)) {
        setFormError(tr('Speichern nicht möglich: Die Rechnung wurde zwischenzeitlich geändert.', 'Cannot save: the invoice was changed in the meantime.'));
        Alert.alert(
          tr('Rechnung wurde zwischenzeitlich geändert', 'Invoice was changed in the meantime'),
          tr(
            'Eine andere Person hat diesen Entwurf gespeichert oder gestellt. Laden Sie die aktuelle Fassung neu – Ihre Eingaben in diesem Formular gehen dabei verloren.',
            'Someone else has saved or issued this draft. Reload the current version – your entries in this form will be lost.',
          ),
          [
            { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
            { text: tr('Neu laden', 'Reload'), onPress: () => void onReload?.() },
          ],
        );
        return;
      }
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        const messages: string[] = [];
        let firstStep: number = STEP_COUNT;
        for (const [key, msgs] of Object.entries(error.fieldErrors)) {
          const path = key.replace(/\[(\d+)\]/g, '.$1');
          const top = path.split('.')[0] as keyof InvoiceForm;
          const stepIndex = STEP_FIELDS.findIndex((fields) => fields.includes(top));
          if (stepIndex >= 0) {
            form.setError(path as never, { type: 'server', message: msgs[0] });
            firstStep = Math.min(firstStep, stepIndex);
          }
          const lineMatch = /^lineItems\.(\d+)/.exec(path);
          messages.push(lineMatch ? `${tr('Position', 'Item')} ${Number(lineMatch[1]) + 1}: ${msgs[0]}` : (msgs[0] ?? ''));
        }
        setFormError(messages.join('\n'));
        if (firstStep < STEP_COUNT) setStep(firstStep);
        return;
      }
      setFormError(errorMessage(error));
    }
  };

  const onInvalid = (invalid: FieldErrors<InvoiceForm>) => {
    setStep(firstStepWithError(invalid));
    setFormError(tr('Bitte prüfen Sie die markierten Angaben.', 'Please check the highlighted fields.'));
  };

  const save = () => handleSubmit(onValid, onInvalid)();

  const errorSteps = new Set<number>();
  STEP_FIELDS.forEach((fields, i) => {
    if (fields.some((f) => errors[f])) errorSteps.add(i);
  });

  const lineCount = lines.fields.length;
  const editingItem = editingIndex !== null && editingIndex >= 0 ? (lineItems?.[editingIndex] ?? null) : null;

  const confirmDelete = (index: number) =>
    Alert.alert(tr('Position löschen?', 'Delete item?'), tr(`„${lineItems?.[index]?.title ?? ''}“ wird aus der Rechnung entfernt.`, `“${lineItems?.[index]?.title ?? ''}” will be removed from the invoice.`), [
      { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
      { text: tr('Löschen', 'Delete'), style: 'destructive', onPress: () => lines.remove(index) },
    ]);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: editId ? tr('Entwurf bearbeiten', 'Edit draft') : tr('Neue Rechnung', 'New invoice'),
          gestureEnabled: !isDirty,
          headerRight: () => (
            <Button label={tr('Speichern', 'Save')} variant="ghost" size="sm" fullWidth={false} onPress={() => void save()} loading={isSubmitting} testID="invoice-editor-save-header" />
          ),
        }}
      />
      <StepIndicator steps={stepLabels()} step={step} onSelect={setStep} errorSteps={errorSteps} />
      <FormScroll bottomInset={false} contentStyle={styles.content}>
        <InlineError message={formError} testID="invoice-editor-error" />

        {step === 0 ? (
          <>
            <SectionHeader title={tr('Kunde', 'Customer')} />
            <Controller
              control={control}
              name="customerId"
              render={({ field: { value } }) =>
                value ? (
                  <Card style={styles.customerCard} testID="selected-customer">
                    <Ionicons name="person-circle-outline" size={32} color={colors.brandText} />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">{customerName}</Text>
                      <Text variant="caption" tone="secondary">
                        {tr('Rechnungsempfänger', 'Invoice recipient')}
                      </Text>
                    </View>
                    <Button
                      label={tr('Ändern', 'Change')}
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      onPress={() => setCustomerPickerOpen(true)}
                      accessibilityLabel={tr('Kunden ändern', 'Change customer')}
                    />
                  </Card>
                ) : (
                  <View style={styles.gap}>
                    <Button label={tr('Kunde wählen', 'Choose customer')} icon="people-outline" variant="outline" onPress={() => setCustomerPickerOpen(true)} testID="pick-customer" />
                    {errors.customerId ? (
                      <Text variant="caption" tone="danger" accessibilityRole="alert">
                        {errors.customerId.message}
                      </Text>
                    ) : null}
                  </View>
                )
              }
            />
            <Text variant="caption" tone="muted">
              {tr(
                'Name, Anschrift und USt-IdNr. werden beim Stellen der Rechnung aus den Kundendaten übernommen und danach festgeschrieben.',
                'Name, address and VAT ID are taken from the customer data when the invoice is issued and then frozen.',
              )}
            </Text>
          </>
        ) : null}

        {step === 1 ? (
          <Card style={styles.gap}>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={tr('Betreff', 'Subject')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.title?.message}
                  required
                  placeholder={tr('z. B. Badsanierung EG', 'e.g. Badsanierung EG (printed in German)')}
                  testID="invoice-editor-title"
                />
              )}
            />
            <Controller
              control={control}
              name="issueDate"
              render={({ field: { value } }) => (
                <DateField label={tr('Rechnungsdatum', 'Invoice date')} value={value} onChange={changeIssueDate} error={errors.issueDate?.message} required testID="invoice-editor-issueDate" />
              )}
            />
            <Controller
              control={control}
              name="servicePeriod"
              render={({ field: { onChange, value } }) => (
                <SegmentedControl
                  accessibilityLabel={tr('Leistungsdatum oder Leistungszeitraum', 'Service date or service period')}
                  options={[
                    { value: 'date', label: tr('Leistungsdatum', 'Service date') },
                    { value: 'period', label: tr('Leistungszeitraum', 'Service period') },
                  ]}
                  value={value ? 'period' : 'date'}
                  onChange={(v) => {
                    onChange(v === 'period');
                    if (v === 'date') setValue('serviceDateTo', '', { shouldDirty: true });
                  }}
                />
              )}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="serviceDateFrom"
                  render={({ field: { onChange, value } }) => (
                    <DateField
                      label={servicePeriod ? tr('Leistung von', 'Service from') : tr('Leistungsdatum', 'Service date')}
                      value={value ?? ''}
                      onChange={onChange}
                      onClear={() => onChange('')}
                      error={errors.serviceDateFrom?.message}
                      required={servicePeriod}
                      testID="invoice-editor-serviceDateFrom"
                    />
                  )}
                />
              </View>
              {servicePeriod ? (
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name="serviceDateTo"
                    render={({ field: { onChange, value } }) => (
                      <DateField
                        label={tr('Leistung bis', 'Service to')}
                        value={value ?? ''}
                        onChange={onChange}
                        onClear={() => onChange('')}
                        minimumDate={serviceDateFrom || undefined}
                        error={errors.serviceDateTo?.message}
                        required
                        testID="invoice-editor-serviceDateTo"
                      />
                    )}
                  />
                </View>
              ) : null}
            </View>
            <Text variant="small" tone="muted">
              {tr('Pflichtangabe nach § 14 UStG: wann die Leistung erbracht wurde.', 'Mandatory under § 14 UStG: when the service was provided.')}
            </Text>
            <Controller
              control={control}
              name="dueDate"
              render={({ field: { onChange, value } }) => (
                <DateField label={tr('Fällig am', 'Due on')} value={value} onChange={onChange} error={errors.dueDate?.message} minimumDate={issueDate} required testID="invoice-editor-dueDate" />
              )}
            />
            {paymentDays !== null && paymentDays >= 0 && !errors.dueDate ? (
              <Text variant="small" tone="muted" testID="invoice-editor-payment-days">
                {tr('Zahlungsziel', 'Payment term')}:{' '}
                {paymentDays === 0
                  ? tr('sofort', 'immediately')
                  : tr(`${paymentDays} ${paymentDays === 1 ? 'Tag' : 'Tage'}`, `${paymentDays} ${paymentDays === 1 ? 'day' : 'days'}`)}
              </Text>
            ) : null}
            <Controller
              control={control}
              name="taxMode"
              render={({ field: { onChange, value } }) => <SelectField label={tr('Besteuerung', 'Tax treatment')} value={value} options={taxModeOptions()} onChange={onChange} testID="invoice-editor-taxMode" />}
            />
            <Text variant="small" tone="muted">
              {taxDisclaimer()}
            </Text>
            <Controller
              control={control}
              name="buyerReference"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label={tr('Referenz (optional)', 'Reference (optional)')}
                  hint={tr('z. B. Bestellnummer oder Leitweg-ID des Kunden', 'e.g. the customer’s order number or Leitweg-ID')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.buyerReference?.message}
                  testID="invoice-editor-buyerReference"
                />
              )}
            />
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
                <Ionicons name="list-outline" size={28} color={colors.brandText} />
                <Text variant="body" tone="secondary" align="center">
                  {tr('Noch keine Positionen. Fügen Sie die erbrachten Leistungen und das Material hinzu.', 'No line items yet. Add the services provided and the materials.')}
                </Text>
              </Card>
            ) : null}
            {errors.lineItems?.message || errors.lineItems?.root?.message ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert">
                {errors.lineItems?.message ?? errors.lineItems?.root?.message}
              </Text>
            ) : null}
            <Button label={tr('Position hinzufügen', 'Add item')} icon="add-circle-outline" variant="secondary" onPress={() => setEditingIndex(-1)} testID="add-line" />
          </>
        ) : null}

        {step === 3 ? (
          <Card style={styles.gap}>
            {(
              [
                ['introText', tr('Einleitung', 'Introduction'), tr('Text vor den Positionen', 'Text before the line items')],
                ['closingText', tr('Schlusstext', 'Closing text'), tr('Text nach den Positionen', 'Text after the line items')],
                ['paymentTerms', tr('Zahlungshinweis (optional)', 'Payment note (optional)'), tr('z. B. Skonto-Vereinbarung', 'e.g. early payment discount')],
                ['internalNotes', tr('Interne Notizen', 'Internal notes'), tr('Nur intern sichtbar, nicht auf der Rechnung', 'Internal only, not on the invoice')],
              ] as const
            ).map(([name, label, hint]) => (
              <Controller
                key={name}
                control={control}
                name={name}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField label={label} hint={hint} value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={errors[name]?.message} multiline testID={`invoice-editor-${name}`} />
                )}
              />
            ))}
          </Card>
        ) : null}
      </FormScroll>

      <BottomBar>
        <View style={styles.totalsRow}>
          <View style={styles.flex} accessible accessibilityLabel={tr(
              `Summe netto ${formatEur(totals.netTotal)}, Umsatzsteuer ${formatEur(totals.taxTotal)}, Gesamt brutto ${formatEur(totals.grossTotal)}`,
              `Net total ${formatEur(totals.netTotal)}, VAT ${formatEur(totals.taxTotal)}, total gross ${formatEur(totals.grossTotal)}`,
            )}>
            <Text variant="small" tone="secondary" testID="totals-net">
              {tr('Netto', 'Net')} {formatEur(totals.netTotal)}
              {taxMode === 'Standard' ? ` · ${tr('USt.', 'VAT')} ${formatEur(totals.taxTotal)}` : ''}
            </Text>
            <Text variant="heading" testID="totals-gross">
              {formatEur(totals.grossTotal)}
            </Text>
          </View>
          {step > 0 ? <IconButton icon="chevron-back" accessibilityLabel={tr('Vorheriger Schritt', 'Previous step')} onPress={() => setStep(step - 1)} testID="step-back" /> : null}
          {step < STEP_COUNT - 1 ? (
            <Button label={tr('Weiter', 'Next')} icon="chevron-forward" fullWidth={false} onPress={() => setStep(step + 1)} testID="step-next" />
          ) : (
            <Button label={tr('Speichern', 'Save')} icon="save-outline" fullWidth={false} onPress={() => void save()} loading={isSubmitting} testID="invoice-editor-save" />
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

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[3] },
  content: { paddingBottom: space[8] },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  emptyLines: { alignItems: 'center', gap: space[2], borderStyle: 'dashed', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl },
  totalsRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
}));
