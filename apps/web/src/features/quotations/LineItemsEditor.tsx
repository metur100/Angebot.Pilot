import { calculateLine, formatPercent, unitSuggestions, type TaxRateDto } from '@angebotpilot/api-contracts';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import {
  Controller,
  get,
  useFieldArray,
  useFormState,
  useWatch,
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { Button, IconButton } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { cx } from '@/lib/cx';
import { formatEur } from '@/lib/format';
import { useMediaQuery } from '@/lib/hooks';

export interface LineItemValue {
  title: string;
  description?: string | undefined;
  quantity: number;
  unit: string;
  unitPriceNet: number;
  discountPercent: number;
  taxRatePercent?: number | null | undefined;
}

type WithLineItems = FieldValues & { lineItems: LineItemValue[] };

interface LineItemsEditorProps<T extends WithLineItems> {
  control: Control<T>;
  register: UseFormRegister<T>;
  taxRates: TaxRateDto[];
  defaultTaxRate: number;
  /** False when the tax mode does not show VAT (§ 19 / § 13b): the rate select is disabled. */
  vatEnabled: boolean;
  /** Templates: the tax rate may be left empty ("Standardsatz"). */
  taxRateOptional?: boolean;
  disabled?: boolean;
}

export function newLineItem(defaultTaxRate: number | null): LineItemValue {
  return { title: '', description: '', quantity: 1, unit: 'Stk.', unitPriceNet: Number.NaN, discountPercent: 0, taxRatePercent: defaultTaxRate };
}

function LineNet<T extends WithLineItems>({ control, index }: { control: Control<T>; index: number }) {
  const item = useWatch({ control, name: `lineItems.${index}` as Path<T> }) as LineItemValue | undefined;
  const net = item ? calculateLine(item.quantity || 0, item.unitPriceNet || 0, item.discountPercent || 0).net : 0;
  const valid = item && Number.isFinite(item.quantity) && Number.isFinite(item.unitPriceNet);
  return <span className={cx('tabular font-medium whitespace-nowrap', !valid && 'text-neutral-500')}>{formatEur(valid ? net : 0)}</span>;
}

export function LineItemsEditor<T extends WithLineItems>({
  control,
  register,
  taxRates,
  defaultTaxRate,
  vatEnabled,
  taxRateOptional,
  disabled,
}: LineItemsEditorProps<T>) {
  const name = 'lineItems' as ArrayPath<T>;
  const { fields, append, insert, remove, move } = useFieldArray({ control, name });
  const { errors } = useFormState({ control });
  const items = useWatch({ control, name: name as Path<T> }) as LineItemValue[] | undefined;
  const wide = useMediaQuery('(min-width: 1280px)');
  const datalistId = `${useId()}-units`;
  const activeRates = taxRates.filter((r) => !r.isArchived);
  const p = (index: number, field: keyof LineItemValue) => `lineItems.${index}.${field}` as Path<T>;
  const err = (index: number, field: keyof LineItemValue): string | undefined =>
    (get(errors, `lineItems.${index}.${field}`) as { message?: string } | undefined)?.message;
  const arrayError =
    (get(errors, 'lineItems') as { message?: string; root?: { message?: string } } | undefined)?.message ??
    (get(errors, 'lineItems.root') as { message?: string } | undefined)?.message;

  const rateOptions = (current: number | null | undefined) => {
    const values = new Set(activeRates.map((r) => r.ratePercent));
    const options = activeRates.map((r) => ({ value: String(r.ratePercent), label: formatPercent(r.ratePercent) }));
    if (current !== null && current !== undefined && !values.has(current)) {
      options.push({ value: String(current), label: formatPercent(current) });
    }
    if (options.length === 0) options.push({ value: String(defaultTaxRate), label: formatPercent(defaultTaxRate) });
    return options;
  };

  const duplicate = (index: number) => {
    const source = items?.[index];
    if (source) insert(index + 1, { ...source } as FieldArray<T, ArrayPath<T>>, { focusName: `lineItems.${index + 1}.title` });
  };
  const add = () =>
    append(newLineItem(taxRateOptional ? null : defaultTaxRate) as FieldArray<T, ArrayPath<T>>, {
      focusName: `lineItems.${fields.length}.title`,
    });

  const taxSelect = (index: number, small: boolean) => (
    <Controller
      control={control}
      name={p(index, 'taxRatePercent')}
      render={({ field }) => {
        const value = field.value as number | null | undefined;
        return (
          <Select
            inputSize={small ? 'sm' : 'md'}
            aria-label={small ? `USt.-Satz, Position ${index + 1}` : undefined}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
            onBlur={field.onBlur}
            disabled={disabled || !vatEnabled}
            title={!vatEnabled ? 'In dieser Besteuerungsart wird keine USt. ausgewiesen.' : undefined}
          >
            {taxRateOptional && <option value="">Standard</option>}
            {rateOptions(value).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      }}
    />
  );

  const numberField = (index: number, field: 'quantity' | 'unitPriceNet' | 'discountPercent', small: boolean, label: string) => (
    <Controller
      control={control}
      name={p(index, field)}
      render={({ field: f }) => (
        <NumberInput
          inputSize={small ? 'sm' : 'md'}
          aria-label={small ? `${label}, Position ${index + 1}` : undefined}
          aria-invalid={err(index, field) ? true : undefined}
          value={f.value}
          onValueChange={f.onChange}
          onBlur={f.onBlur}
          ref={f.ref}
          name={f.name}
          disabled={disabled}
          minFractionDigits={field === 'unitPriceNet' ? 2 : 0}
          maxFractionDigits={field === 'quantity' ? 3 : 2}
          suffix={field === 'discountPercent' ? '%' : field === 'unitPriceNet' ? '€' : undefined}
        />
      )}
    />
  );

  const rowActions = (index: number) => (
    <div className="flex items-center gap-0.5">
      <IconButton size="sm" icon={ArrowUp} label={`Position ${index + 1} nach oben verschieben`} disabled={disabled || index === 0} onClick={() => move(index, index - 1)} />
      <IconButton
        size="sm"
        icon={ArrowDown}
        label={`Position ${index + 1} nach unten verschieben`}
        disabled={disabled || index === fields.length - 1}
        onClick={() => move(index, index + 1)}
      />
      <IconButton size="sm" icon={Copy} label={`Position ${index + 1} duplizieren`} disabled={disabled} onClick={() => duplicate(index)} />
      <IconButton
        size="sm"
        icon={Trash2}
        label={`Position ${index + 1} entfernen`}
        disabled={disabled || fields.length <= 1}
        onClick={() => remove(index)}
        className="hover:bg-danger-bg! hover:text-danger-text!"
      />
    </div>
  );

  const fieldErrors = (index: number) =>
    (['title', 'quantity', 'unit', 'unitPriceNet', 'discountPercent', 'taxRatePercent', 'description'] as const)
      .map((f) => err(index, f))
      .filter((m): m is string => Boolean(m));

  return (
    <div>
      <datalist id={datalistId}>
        {unitSuggestions.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      {wide ? (
        <table className="w-full border-collapse text-sm" aria-label="Positionen">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th scope="col" className="w-10 pb-2 font-medium">Pos.</th>
              <th scope="col" className="pb-2 pl-2 font-medium">Bezeichnung</th>
              <th scope="col" className="w-[96px] pb-2 pl-2 text-right font-medium">Menge</th>
              <th scope="col" className="w-[104px] pb-2 pl-2 font-medium">Einheit</th>
              <th scope="col" className="w-[132px] pb-2 pl-2 text-right font-medium">Einzelpreis netto</th>
              <th scope="col" className="w-[84px] pb-2 pl-2 text-right font-medium">Rabatt</th>
              <th scope="col" className="w-[96px] pb-2 pl-2 font-medium">USt.</th>
              <th scope="col" className="w-[120px] pb-2 pl-2 text-right font-medium">Gesamt netto</th>
              <th scope="col" className="w-[132px] pb-2 pl-2">
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          {fields.map((item, index) => {
            const problems = fieldErrors(index);
            return (
              <tbody key={item.id} className="border-t border-neutral-100" data-testid="line-item">
                <tr className="align-top">
                  <td className="pt-3 pr-1 text-[13px] font-medium text-neutral-500 tabular">
                    <span className="inline-flex h-8 items-center">{index + 1}</span>
                  </td>
                  <td className="pt-3 pl-2">
                    <Input
                      inputSize="sm"
                      aria-label={`Bezeichnung, Position ${index + 1}`}
                      aria-invalid={err(index, 'title') ? true : undefined}
                      placeholder="z. B. Montage Unterverteilung"
                      disabled={disabled}
                      {...register(p(index, 'title'))}
                    />
                  </td>
                  <td className="pt-3 pl-2">{numberField(index, 'quantity', true, 'Menge')}</td>
                  <td className="pt-3 pl-2">
                    <Input
                      inputSize="sm"
                      list={datalistId}
                      aria-label={`Einheit, Position ${index + 1}`}
                      aria-invalid={err(index, 'unit') ? true : undefined}
                      disabled={disabled}
                      {...register(p(index, 'unit'))}
                    />
                  </td>
                  <td className="pt-3 pl-2">{numberField(index, 'unitPriceNet', true, 'Einzelpreis netto')}</td>
                  <td className="pt-3 pl-2">{numberField(index, 'discountPercent', true, 'Rabatt in Prozent')}</td>
                  <td className="pt-3 pl-2">{taxSelect(index, true)}</td>
                  <td className="pt-3 pl-2 text-right">
                    <span className="inline-flex h-8 items-center">
                      <LineNet control={control} index={index} />
                    </span>
                  </td>
                  <td className="pt-3 pl-2">{rowActions(index)}</td>
                </tr>
                <tr>
                  <td />
                  <td colSpan={6} className="pt-1.5 pb-3 pl-2">
                    <Textarea
                      rows={1}
                      aria-label={`Beschreibung, Position ${index + 1}`}
                      placeholder="Beschreibung (optional) – Details, Material, Leistungsumfang"
                      disabled={disabled}
                      className="min-h-8! resize-y py-1.5 text-[13px]"
                      {...register(p(index, 'description'))}
                    />
                    {problems.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[13px] text-danger-text" aria-live="polite">
                        {problems.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            );
          })}
        </table>
      ) : (
        <ol className="space-y-3" aria-label="Positionen">
          {fields.map((item, index) => (
            <li key={item.id} className="rounded-lg border border-neutral-200 bg-neutral-25 p-3.5 sm:p-4" data-testid="line-item">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-neutral-700">Position {index + 1}</p>
                {rowActions(index)}
              </div>
              <div className="space-y-3">
                <Field label="Bezeichnung" error={err(index, 'title')} required>
                  <Input placeholder="z. B. Montage Unterverteilung" disabled={disabled} {...register(p(index, 'title'))} />
                </Field>
                <Field label="Beschreibung" error={err(index, 'description')} optional>
                  <Textarea rows={2} disabled={disabled} {...register(p(index, 'description'))} />
                </Field>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label="Menge" error={err(index, 'quantity')}>
                    {numberField(index, 'quantity', false, 'Menge')}
                  </Field>
                  <Field label="Einheit" error={err(index, 'unit')}>
                    <Input list={datalistId} disabled={disabled} {...register(p(index, 'unit'))} />
                  </Field>
                  <Field label="Einzelpreis netto" error={err(index, 'unitPriceNet')} className="col-span-2 sm:col-span-1">
                    {numberField(index, 'unitPriceNet', false, 'Einzelpreis netto')}
                  </Field>
                  <Field label="Rabatt" error={err(index, 'discountPercent')}>
                    {numberField(index, 'discountPercent', false, 'Rabatt')}
                  </Field>
                  <Field label="USt." error={err(index, 'taxRatePercent')}>
                    {taxSelect(index, false)}
                  </Field>
                </div>
                <div className="flex items-center justify-between border-t border-neutral-200 pt-2.5 text-sm">
                  <span className="text-neutral-600">Gesamt netto</span>
                  <LineNet control={control} index={index} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {arrayError && (
        <p role="alert" className="mt-3 text-[13px] text-danger-text">
          {arrayError}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
        <Button icon={Plus} onClick={add} disabled={disabled || fields.length >= 200}>
          Position hinzufügen
        </Button>
        {!vatEnabled && <p className="text-[13px] text-neutral-500">Bei dieser Besteuerungsart wird keine Umsatzsteuer ausgewiesen.</p>}
      </div>
    </div>
  );
}
