import { customerTypeLabel, type CustomerDto, type CustomerListItemDto } from '@angebotpilot/api-contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Plus, Search, UserRound, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useCompany } from '@/app/company';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Feedback';
import { controlBase } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { CustomerForm, formatAddress } from '@/features/customers/CustomerForm';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useDebouncedValue } from '@/lib/hooks';
import { qk } from '@/lib/queryKeys';

interface CustomerPickerProps {
  value: string;
  onChange: (customerId: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}

/** Searchable customer combobox (ARIA 1.2 combobox pattern) with inline "Neuer Kunde" dialog. */
export function CustomerPicker({ value, onChange, error, disabled }: CustomerPickerProps) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const errorId = `${baseId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search, 200);

  const selected = useQuery({
    queryKey: qk.customer(companyId, value),
    queryFn: () => api.customers.get(companyId, value),
    enabled: Boolean(value),
  });
  const results = useQuery({
    queryKey: qk.customerList(companyId, { search: debounced, status: 'active', pageSize: 8, sort: 'name' }),
    queryFn: () => api.customers.list(companyId, { search: debounced || undefined, status: 'active', pageSize: 8, sort: 'name' }),
    enabled: open,
    // Keep showing the previous matches while the next search runs (no flicker, stable options).
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    mutationFn: (request: Parameters<typeof api.customers.create>[1]) => api.customers.create(companyId, request),
    onSuccess: (customer) => {
      queryClient.setQueryData(qk.customer(companyId, customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: qk.customers(companyId) });
      toast.success('Kunde angelegt', customer.displayName);
      onChange(customer.id);
      setCreating(false);
    },
  });

  const items: CustomerListItemDto[] = results.data?.items ?? [];

  const choose = (customer: CustomerListItemDto) => {
    onChange(customer.id);
    setOpen(false);
    setSearch('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && items[active]) {
        event.preventDefault();
        choose(items[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const customer: CustomerDto | undefined = selected.data;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[13px] font-medium text-neutral-800">
          Kunde<span aria-hidden className="ml-0.5 text-danger-text">*</span>
        </label>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          <Plus aria-hidden size={14} /> Neuer Kunde
        </button>
      </div>

      {value && customer ? (
        <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-25 px-3.5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500 ring-1 ring-neutral-200">
            {customer.type === 'Business' ? <Building2 aria-hidden size={16} /> : <UserRound aria-hidden size={16} />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium text-neutral-900">{customer.displayName}</p>
            <p className="text-[13px] whitespace-pre-line text-neutral-600">
              {formatAddress(customer.billingStreet, customer.billingPostalCode, customer.billingCity, customer.billingCountry) ?? 'Keine Adresse hinterlegt'}
            </p>
            <p className="mt-0.5 text-[13px] text-neutral-500">{customer.email ?? 'Keine E-Mail-Adresse – Versand nur manuell möglich'}</p>
          </div>
          {!disabled && (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => {
                onChange('');
                setOpen(true);
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              Ändern
            </Button>
          )}
        </div>
      ) : value && selected.isPending ? (
        <div className="rounded-lg border border-neutral-200 px-3.5 py-3">
          <Spinner label="Kunde wird geladen …" />
        </div>
      ) : (
        <div className="relative">
          <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `${listId}-${items[active].id}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            disabled={disabled}
            placeholder="Kunden suchen (Name, E-Mail, Ort) …"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className={cx(controlBase, 'h-10 pl-9')}
          />
          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Kunden"
              className="ap-popover absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
            >
              {results.isPending ? (
                <li className="px-3 py-2.5" role="presentation">
                  <Spinner label="Suche …" />
                </li>
              ) : items.length === 0 ? (
                <li className="px-3 py-3 text-sm text-neutral-500" role="presentation">
                  Kein Kunde gefunden.{' '}
                  <button type="button" className="font-medium text-brand-600 hover:underline" onMouseDown={(e) => e.preventDefault()} onClick={() => setCreating(true)}>
                    Neuen Kunden anlegen
                  </button>
                </li>
              ) : (
                items.map((item, index) => (
                  // Keyboard selection is handled by the combobox input (arrow keys + Enter via aria-activedescendant).
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <li
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                    onMouseEnter={() => setActive(index)}
                    className={cx('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', index === active && 'bg-neutral-100')}
                  >
                    {item.type === 'Business' ? (
                      <Building2 aria-hidden size={16} className="shrink-0 text-neutral-400" />
                    ) : (
                      <UserRound aria-hidden size={16} className="shrink-0 text-neutral-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">{item.displayName}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {[customerTypeLabel[item.type], item.city, item.email].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {item.id === value && <Check aria-hidden size={16} className="text-brand-600" />}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[13px] text-danger-text">
          {error}
        </p>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Neuer Kunde"
        description="Der Kunde wird angelegt und direkt für dieses Angebot ausgewählt."
        size="lg"
        dismissible={false}
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Abbrechen</Button>
            <Button type="submit" form="inline-customer-form" variant="primary" loading={create.isPending}>
              Kunde anlegen und auswählen
            </Button>
          </>
        }
      >
        <CustomerForm id="inline-customer-form" compact onSubmit={(request) => create.mutateAsync(request)} />
      </Dialog>
    </div>
  );
}
