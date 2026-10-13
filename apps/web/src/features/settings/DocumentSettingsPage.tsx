import { formatPercent, type CompanyDto, type CompanySettingsDto, type TaxMode, type TaxRateDto } from '@angebotpilot/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useCompany, useCompanyDetails, useCompanySettings, useTaxRates } from '@/app/company';
import { TaxModePicker } from '@/components/domain/TaxMode';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Checkbox, Switch } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { table } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { useCompanyLogoUrl } from '@/features/quotations/QuotationPreviewPage';
import { api } from '@/lib/api';
import { contrastWithWhite } from '@/lib/color';
import { cx } from '@/lib/cx';
import { errorMessage, isConflict } from '@/lib/errors';
import { formatFileSize } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { companyToRequest, ConflictAlert, emptyToNull, FormSection, ReadOnlyNotice } from './shared';

const MAX_LOGO_BYTES = 1024 * 1024;

function LogoCard({ company, readOnly }: { company: CompanyDto; readOnly: boolean }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const logoUrl = useCompanyLogoUrl(company.hasLogo);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onUpdated = (updated: CompanyDto) => {
    queryClient.setQueryData(qk.company(companyId), updated);
    void queryClient.invalidateQueries({ queryKey: qk.logo(companyId) });
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.companies.uploadLogo(companyId, form);
    },
    onSuccess: (updated) => {
      onUpdated(updated);
      toast.success('Logo gespeichert');
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.companies.deleteLogo(companyId),
    onSuccess: (updated) => {
      onUpdated(updated);
      toast.success('Logo entfernt');
    },
    onError: (e) => toast.error('Entfernen fehlgeschlagen', errorMessage(e)),
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Bitte wählen Sie eine PNG- oder JPEG-Datei.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(`Die Datei ist ${formatFileSize(file.size)} groß. Erlaubt sind höchstens 1 MB.`);
      return;
    }
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader title="Logo" description="Erscheint im Briefkopf von PDF und Kundenseite. PNG oder JPEG, höchstens 1 MB, idealerweise mit transparentem Hintergrund." />
      <CardBody className="flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-56 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-25 p-3">
          {company.hasLogo ? (
            logoUrl ? (
              <img src={logoUrl} alt={`Aktuelles Logo von ${company.name}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <Spinner label="" />
            )
          ) : (
            <span className="text-[13px] text-neutral-500">Kein Logo hinterlegt</span>
          )}
        </div>
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onFile} aria-label="Logo-Datei auswählen" tabIndex={-1} />
          <div className="flex flex-wrap gap-2">
            <Button icon={ImageUp} disabled={readOnly} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              {company.hasLogo ? 'Logo ersetzen' : 'Logo hochladen'}
            </Button>
            {company.hasLogo && (
              <Button variant="dangerGhost" icon={Trash2} disabled={readOnly} loading={remove.isPending} onClick={() => remove.mutate()}>
                Entfernen
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-[13px] text-danger-text">
              {error}
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function BrandColorCard({ company, readOnly }: { company: CompanyDto; readOnly: boolean }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [color, setColor] = useState(company.brandColor);
  const [conflict, setConflict] = useState(false);
  const valid = /^#[0-9a-fA-F]{6}$/.test(color);
  const contrast = valid ? contrastWithWhite(color) : null;
  const save = useMutation({
    mutationFn: () => api.companies.update(companyId, companyToRequest(company, { brandColor: color.toUpperCase() })),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.company(companyId), updated);
      toast.success('Markenfarbe gespeichert');
    },
    onError: (e) => {
      if (isConflict(e)) setConflict(true);
      else toast.error('Speichern fehlgeschlagen', errorMessage(e));
    },
  });
  return (
    <Card>
      <CardHeader title="Markenfarbe" description="Akzentfarbe für PDF und Kundenseite (z. B. Linien, Überschriften, Annahme-Button)." />
      <CardBody className="space-y-4">
        {conflict && (
          <ConflictAlert
            onReload={async () => {
              const fresh = await queryClient.fetchQuery({ queryKey: qk.company(companyId), queryFn: () => api.companies.get(companyId), staleTime: 0 });
              setColor(fresh.brandColor);
              setConflict(false);
            }}
          />
        )}
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Farbe wählen">
            <input
              type="color"
              aria-label="Markenfarbe wählen"
              value={valid ? color : '#2F45D8'}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              disabled={readOnly}
              className="h-9 w-16 cursor-pointer rounded-md border border-neutral-300 bg-white p-1 disabled:cursor-not-allowed"
            />
          </Field>
          <Field label="Hex-Wert" error={valid ? undefined : 'Format #RRGGBB, z. B. #2F45D8.'} className="w-36">
            <Input value={color} onChange={(e) => setColor(e.target.value.trim())} disabled={readOnly} maxLength={7} className="font-mono" />
          </Field>
          <div className="flex items-center gap-3 pb-0.5">
            <span className="text-[13px] text-neutral-500">Vorschau:</span>
            <span className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white shadow-sm" style={{ background: valid ? color : '#2F45D8' }}>
              Angebot annehmen
            </span>
          </div>
        </div>
        {contrast !== null && contrast < 4.5 && (
          <Alert tone="warning" icon={TriangleAlert}>
            Weißer Text auf dieser Farbe ist schwer lesbar (Kontrast {contrast.toFixed(1).replace('.', ',')}:1, empfohlen mindestens 4,5:1). Wählen Sie
            einen dunkleren Farbton.
          </Alert>
        )}
      </CardBody>
      {!readOnly && (
        <CardFooter>
          <Button variant="primary" disabled={!valid || color.toUpperCase() === company.brandColor.toUpperCase()} loading={save.isPending} onClick={() => save.mutate()}>
            Farbe speichern
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function DocumentDefaultsCard({ settings, readOnly }: { settings: CompanySettingsDto; readOnly: boolean }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(settings);
  const [errorText, setErrorText] = useState<string | null>(null);
  const set = <K extends keyof CompanySettingsDto>(key: K, value: CompanySettingsDto[K]) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = JSON.stringify(values) !== JSON.stringify(settings);
  const prefixError = (v: string) => (/^[A-Z0-9]{1,8}$/.test(v) ? undefined : '1–8 Großbuchstaben oder Ziffern.');
  const validityError = Number.isInteger(values.defaultValidityDays) && values.defaultValidityDays >= 1 && values.defaultValidityDays <= 365 ? undefined : 'Zwischen 1 und 365 Tagen.';
  const invalid = Boolean(prefixError(values.quotationPrefix) || prefixError(values.jobPrefix) || validityError);
  const save = useMutation({
    mutationFn: () =>
      api.companies.updateSettings(companyId, {
        ...values,
        defaultIntroText: emptyToNull(values.defaultIntroText),
        defaultClosingText: emptyToNull(values.defaultClosingText),
        defaultTerms: emptyToNull(values.defaultTerms),
        paymentTerms: emptyToNull(values.paymentTerms),
        bankAccountHolder: emptyToNull(values.bankAccountHolder),
        iban: emptyToNull(values.iban?.replace(/\s/g, '')),
        bic: emptyToNull(values.bic),
        bankName: emptyToNull(values.bankName),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.settings(companyId), saved);
      setValues(saved);
      setErrorText(null);
      toast.success('Dokumenteinstellungen gespeichert');
    },
    onError: (e) => setErrorText(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader title="Dokumente & Standardtexte" description="Vorgaben für neue Angebote. Bestehende Angebote bleiben unverändert." />
      <fieldset disabled={readOnly} className="min-w-0">
        <CardBody className="space-y-6 py-6">
          {errorText && (
            <Alert tone="danger" live>
              {errorText}
            </Alert>
          )}
          <FormSection title="Nummern & Gültigkeit">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Präfix Angebote" error={prefixError(values.quotationPrefix)} hint={`z. B. ${values.quotationPrefix}-2026-0001`}>
                <Input value={values.quotationPrefix} onChange={(e) => set('quotationPrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <Field label="Präfix Aufträge" error={prefixError(values.jobPrefix)}>
                <Input value={values.jobPrefix} onChange={(e) => set('jobPrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <Field label="Gültigkeit (Tage)" error={validityError}>
                <NumberInput value={values.defaultValidityDays} onValueChange={(v) => set('defaultValidityDays', v)} maxFractionDigits={0} align="left" />
              </Field>
            </div>
            <TaxModePicker
              name="settings-tax-mode"
              legend="Standard-Besteuerung"
              value={values.defaultTaxMode}
              onChange={(mode: TaxMode) => set('defaultTaxMode', mode)}
              disabled={readOnly}
            />
          </FormSection>
          <FormSection title="Standardtexte" description="Werden in neue Angebote übernommen und können dort angepasst werden.">
            <Field label="Einleitung" optional>
              <Textarea rows={3} value={values.defaultIntroText ?? ''} onChange={(e) => set('defaultIntroText', e.target.value)} />
            </Field>
            <Field label="Schlusstext" optional>
              <Textarea rows={3} value={values.defaultClosingText ?? ''} onChange={(e) => set('defaultClosingText', e.target.value)} />
            </Field>
            <Field label="Zahlungsbedingungen" optional>
              <Textarea rows={2} value={values.paymentTerms ?? ''} onChange={(e) => set('paymentTerms', e.target.value)} />
            </Field>
            <Field label="Weitere Bedingungen" optional>
              <Textarea rows={3} value={values.defaultTerms ?? ''} onChange={(e) => set('defaultTerms', e.target.value)} />
            </Field>
          </FormSection>
          <FormSection title="Bankverbindung" description="Optional in der Fußzeile der Angebote.">
            <Switch
              checked={values.showBankDetails}
              onCheckedChange={(v) => set('showBankDetails', v)}
              label="Auf Angeboten anzeigen"
              disabled={readOnly}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kontoinhaber" optional>
                <Input value={values.bankAccountHolder ?? ''} onChange={(e) => set('bankAccountHolder', e.target.value)} />
              </Field>
              <Field label="Bank" optional>
                <Input value={values.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} />
              </Field>
              <Field label="IBAN" optional>
                <Input value={values.iban ?? ''} onChange={(e) => set('iban', e.target.value.toUpperCase())} className="font-mono" />
              </Field>
              <Field label="BIC" optional>
                <Input value={values.bic ?? ''} onChange={(e) => set('bic', e.target.value.toUpperCase())} className="font-mono" />
              </Field>
            </div>
          </FormSection>
        </CardBody>
        {!readOnly && (
          <CardFooter>
            <Button onClick={() => setValues(settings)} disabled={!dirty || save.isPending}>
              Verwerfen
            </Button>
            <Button variant="primary" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate()}>
              Speichern
            </Button>
          </CardFooter>
        )}
      </fieldset>
    </Card>
  );
}

function TaxRateDialog({ rate, open, onOpenChange }: { rate: TaxRateDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState(rate?.name ?? '');
  const [percent, setPercent] = useState(rate?.ratePercent ?? Number.NaN);
  const [isDefault, setIsDefault] = useState(rate?.isDefault ?? false);
  const [isArchived, setIsArchived] = useState(rate?.isArchived ?? false);
  const percentError = Number.isFinite(percent) && percent >= 0 && percent <= 100 ? undefined : 'Bitte einen Satz zwischen 0 und 100 % angeben.';
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), ratePercent: percent, isDefault, isArchived };
      return rate ? api.companies.updateTaxRate(companyId, rate.id, body) : api.companies.createTaxRate(companyId, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.taxRates(companyId) });
      toast.success(rate ? 'Steuersatz gespeichert' : 'Steuersatz angelegt');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rate ? 'Steuersatz bearbeiten' : 'Neuer Steuersatz'}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim() || Boolean(percentError)} onClick={() => save.mutate()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.isError && (
          <Alert tone="danger" live>
            {errorMessage(save.error)}
          </Alert>
        )}
        <Field label="Bezeichnung" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Regelsatz" maxLength={50} />
        </Field>
        <Field label="Steuersatz" error={Number.isNaN(percent) ? undefined : percentError} required>
          <NumberInput value={percent} onValueChange={setPercent} suffix="%" maxFractionDigits={2} align="left" />
        </Field>
        <Checkbox label="Standardsatz für neue Positionen" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <Checkbox
          label="Archiviert"
          description="Nicht mehr für neue Positionen auswählbar. Bestehende Angebote bleiben unverändert."
          checked={isArchived}
          onChange={(e) => setIsArchived(e.target.checked)}
        />
      </div>
    </Dialog>
  );
}

function TaxRatesCard({ readOnly }: { readOnly: boolean }) {
  const rates = useTaxRates();
  const [editing, setEditing] = useState<TaxRateDto | null | 'new'>(null);
  return (
    <Card>
      <CardHeader
        title="Umsatzsteuersätze"
        description="Auswahl in den Positionen bei Regelbesteuerung."
        actions={
          !readOnly && (
            <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
              Steuersatz
            </Button>
          )
        }
      />
      {rates.isPending ? (
        <Spinner className="p-5" />
      ) : rates.isError ? (
        <ErrorState error={rates.error} onRetry={() => void rates.refetch()} />
      ) : (
        <div className={table.wrapper}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Bezeichnung</th>
                <th scope="col" className={cx(table.th, 'text-right')}>Satz</th>
                <th scope="col" className={table.th}>Status</th>
                <th scope="col" className={table.th}>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rates.data]
                .sort((a, b) => b.ratePercent - a.ratePercent)
                .map((r) => (
                  <tr key={r.id} className={table.row}>
                    <td className={table.td}>{r.name}</td>
                    <td className={cx(table.td, table.num)}>{formatPercent(r.ratePercent)}</td>
                    <td className={table.td}>
                      <div className="flex gap-1.5">
                        {r.isDefault && <Badge tone="info">Standard</Badge>}
                        {r.isArchived ? <Badge tone="muted">Archiviert</Badge> : <Badge tone="success">Aktiv</Badge>}
                      </div>
                    </td>
                    <td className={cx(table.td, 'w-12 text-right')}>
                      {!readOnly && <IconButton size="sm" icon={Pencil} label={`${r.name} bearbeiten`} onClick={() => setEditing(r)} />}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && (
        <TaxRateDialog
          key={editing === 'new' ? 'new' : editing.id}
          rate={editing === 'new' ? null : editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </Card>
  );
}

export default function DocumentSettingsPage() {
  const { can } = useCompany();
  const company = useCompanyDetails();
  const settings = useCompanySettings();
  if (company.isPending || settings.isPending) return <PageSkeleton />;
  if (company.isError) return <ErrorState error={company.error} onRetry={() => void company.refetch()} />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const readOnly = !can.manageDocumentSettings;
  return (
    <div className="space-y-6">
      {readOnly && <ReadOnlyNotice />}
      <LogoCard company={company.data} readOnly={readOnly} />
      <BrandColorCard key={company.data.rowVersion} company={company.data} readOnly={readOnly} />
      <DocumentDefaultsCard settings={settings.data} readOnly={readOnly} />
      <TaxRatesCard readOnly={readOnly} />
    </div>
  );
}
