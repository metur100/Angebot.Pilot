import { formatPercent, getLocale, type CompanyDto, type CompanySettingsDto, type TaxMode, type TaxRateDto } from '@angebotpilot/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
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
import { currentIntlLocale, tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { companyToRequest, ConflictAlert, emptyToNull, FormSection, ReadOnlyNotice } from './shared';

const MAX_LOGO_BYTES = 1024 * 1024;

/** Contrast ratio with one decimal in the UI language (4,5 / 4.5). */
const formatRatio = (value: number) => new Intl.NumberFormat(currentIntlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

/** English UI only: texts entered here are printed on the (German) documents as written. */
function GermanDocumentsHint() {
  return getLocale() === 'en' ? <>Printed on your German documents as written.</> : null;
}

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
      toast.success(tr('Logo gespeichert', 'Logo saved'));
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.companies.deleteLogo(companyId),
    onSuccess: (updated) => {
      onUpdated(updated);
      toast.success(tr('Logo entfernt', 'Logo removed'));
    },
    onError: (e) => toast.error(tr('Entfernen fehlgeschlagen', 'Removal failed'), errorMessage(e)),
  });

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError(tr('Bitte wählen Sie eine PNG- oder JPEG-Datei.', 'Please choose a PNG or JPEG file.'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(
        tr(
          `Die Datei ist ${formatFileSize(file.size)} groß. Erlaubt sind höchstens 1 MB.`,
          `The file is ${formatFileSize(file.size)}. The maximum is 1 MB.`,
        ),
      );
      return;
    }
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader
        title={tr('Logo', 'Logo')}
        description={tr(
          'Erscheint im Briefkopf von PDF und Kundenseite. PNG oder JPEG, höchstens 1 MB, idealerweise mit transparentem Hintergrund.',
          'Appears in the letterhead of the PDF and the customer page. PNG or JPEG, max. 1 MB, ideally with a transparent background.',
        )}
      />
      <CardBody className="flex flex-wrap items-center gap-5">
        <div data-theme="light" className="flex h-24 w-56 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-25 p-3">
          {company.hasLogo ? (
            logoUrl ? (
              <img src={logoUrl} alt={tr(`Aktuelles Logo von ${company.name}`, `Current logo of ${company.name}`)} className="max-h-full max-w-full object-contain" />
            ) : (
              <Spinner label="" />
            )
          ) : (
            <span className="text-[13px] text-neutral-500">{tr('Kein Logo hinterlegt', 'No logo uploaded')}</span>
          )}
        </div>
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onFile} aria-label={tr('Logo-Datei auswählen', 'Choose logo file')} tabIndex={-1} />
          <div className="flex flex-wrap gap-2">
            <Button icon={ImageUp} disabled={readOnly} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              {company.hasLogo ? tr('Logo ersetzen', 'Replace logo') : tr('Logo hochladen', 'Upload logo')}
            </Button>
            {company.hasLogo && (
              <Button variant="dangerGhost" icon={Trash2} disabled={readOnly} loading={remove.isPending} onClick={() => remove.mutate()}>
                {tr('Entfernen', 'Remove')}
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
      toast.success(tr('Markenfarbe gespeichert', 'Brand colour saved'));
    },
    onError: (e) => {
      if (isConflict(e)) setConflict(true);
      else toast.error(tr('Speichern fehlgeschlagen', 'Saving failed'), errorMessage(e));
    },
  });
  return (
    <Card>
      <CardHeader
        title={tr('Markenfarbe', 'Brand colour')}
        description={tr(
          'Akzentfarbe für PDF und Kundenseite (z. B. Linien, Überschriften, Annahme-Button).',
          'Accent colour for the PDF and the customer page (e.g. lines, headings, accept button).',
        )}
      />
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
          <Field label={tr('Farbe wählen', 'Choose colour')}>
            <input
              type="color"
              aria-label={tr('Markenfarbe wählen', 'Choose brand colour')}
              value={valid ? color : '#2F45D8'}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              disabled={readOnly}
              className="h-9 w-16 cursor-pointer rounded-md border border-neutral-300 bg-white p-1 disabled:cursor-not-allowed"
            />
          </Field>
          <Field label={tr('Hex-Wert', 'Hex value')} error={valid ? undefined : tr('Format #RRGGBB, z. B. #2F45D8.', 'Format #RRGGBB, e.g. #2F45D8.')} className="w-36">
            <Input value={color} onChange={(e) => setColor(e.target.value.trim())} disabled={readOnly} maxLength={7} className="font-mono" />
          </Field>
          <div className="flex items-center gap-3 pb-0.5">
            <span className="text-[13px] text-neutral-500">{tr('Vorschau:', 'Preview:')}</span>
            <span className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-on-brand shadow-sm" style={{ background: valid ? color : '#2F45D8' }}>
              {tr('Angebot annehmen', 'Accept quotation')}
            </span>
          </div>
        </div>
        {contrast !== null && contrast < 4.5 && (
          <Alert tone="warning" icon={TriangleAlert}>
            {tr(
              `Weißer Text auf dieser Farbe ist schwer lesbar (Kontrast ${formatRatio(contrast)}:1, empfohlen mindestens ${formatRatio(4.5)}:1). Wählen Sie einen dunkleren Farbton.`,
              `White text on this colour is hard to read (contrast ${formatRatio(contrast)}:1, recommended at least ${formatRatio(4.5)}:1). Choose a darker shade.`,
            )}
          </Alert>
        )}
      </CardBody>
      {!readOnly && (
        <CardFooter>
          <Button variant="primary" disabled={!valid || color.toUpperCase() === company.brandColor.toUpperCase()} loading={save.isPending} onClick={() => save.mutate()}>
            {tr('Farbe speichern', 'Save colour')}
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
  const prefixError = (v: string) => (/^[A-Z0-9]{1,8}$/.test(v) ? undefined : tr('1–8 Großbuchstaben oder Ziffern.', '1–8 capital letters or digits.'));
  const validityError = Number.isInteger(values.defaultValidityDays) && values.defaultValidityDays >= 1 && values.defaultValidityDays <= 365 ? undefined : tr('Zwischen 1 und 365 Tagen.', 'Between 1 and 365 days.');
  const paymentDaysError =
    Number.isInteger(values.invoicePaymentDays) && values.invoicePaymentDays >= 0 && values.invoicePaymentDays <= 120 ? undefined : tr('Zwischen 0 und 120 Tagen.', 'Between 0 and 120 days.');
  const reminderDaysError =
    Number.isInteger(values.invoiceReminderAfterDays) && values.invoiceReminderAfterDays >= 1 && values.invoiceReminderAfterDays <= 60
      ? undefined
      : tr('Zwischen 1 und 60 Tagen.', 'Between 1 and 60 days.');
  const invalid = Boolean(
    prefixError(values.quotationPrefix) ||
      prefixError(values.jobPrefix) ||
      validityError ||
      prefixError(values.invoicePrefix) ||
      paymentDaysError ||
      (values.invoiceReminderEnabled && reminderDaysError),
  );
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
        invoicePrefix: values.invoicePrefix.trim().toUpperCase(),
        // null would leave the invoice texts unchanged on the server; an empty string clears them.
        invoiceIntroText: values.invoiceIntroText?.trim() ?? '',
        invoiceClosingText: values.invoiceClosingText?.trim() ?? '',
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.settings(companyId), saved);
      setValues(saved);
      setErrorText(null);
      toast.success(tr('Dokumenteinstellungen gespeichert', 'Document settings saved'));
    },
    onError: (e) => setErrorText(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader
        title={tr('Dokumente & Standardtexte', 'Documents & default texts')}
        description={tr(
          'Vorgaben für neue Angebote und Rechnungen. Bestehende Dokumente bleiben unverändert.',
          'Defaults for new quotations and invoices. Existing documents stay unchanged.',
        )}
      />
      <fieldset disabled={readOnly} className="min-w-0">
        <CardBody className="space-y-6 py-6">
          {errorText && (
            <Alert tone="danger" live>
              {errorText}
            </Alert>
          )}
          <FormSection title={tr('Nummern & Gültigkeit', 'Numbers & validity')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={tr('Präfix Angebote', 'Quotation prefix')}
                error={prefixError(values.quotationPrefix)}
                hint={tr(`z. B. ${values.quotationPrefix}-2026-0001`, `e.g. ${values.quotationPrefix}-2026-0001`)}
              >
                <Input value={values.quotationPrefix} onChange={(e) => set('quotationPrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <Field label={tr('Präfix Aufträge', 'Job prefix')} error={prefixError(values.jobPrefix)}>
                <Input value={values.jobPrefix} onChange={(e) => set('jobPrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <Field label={tr('Gültigkeit (Tage)', 'Validity (days)')} error={validityError}>
                <NumberInput value={values.defaultValidityDays} onValueChange={(v) => set('defaultValidityDays', v)} maxFractionDigits={0} align="left" />
              </Field>
            </div>
            <TaxModePicker
              name="settings-tax-mode"
              legend={tr('Standard-Besteuerung', 'Default taxation')}
              value={values.defaultTaxMode}
              onChange={(mode: TaxMode) => set('defaultTaxMode', mode)}
              disabled={readOnly}
            />
          </FormSection>
          <FormSection
            title={tr('Standardtexte', 'Default texts')}
            description={
              <>
                {tr('Werden in neue Angebote übernommen und können dort angepasst werden.', 'Copied into new quotations, where you can adjust them.')}{' '}
                <GermanDocumentsHint />
              </>
            }
          >
            <Field label={tr('Einleitung', 'Introduction')} optional>
              <Textarea rows={3} value={values.defaultIntroText ?? ''} onChange={(e) => set('defaultIntroText', e.target.value)} />
            </Field>
            <Field label={tr('Schlusstext', 'Closing text')} optional>
              <Textarea rows={3} value={values.defaultClosingText ?? ''} onChange={(e) => set('defaultClosingText', e.target.value)} />
            </Field>
            <Field label={tr('Zahlungsbedingungen', 'Payment terms')} optional>
              <Textarea rows={2} value={values.paymentTerms ?? ''} onChange={(e) => set('paymentTerms', e.target.value)} />
            </Field>
            <Field label={tr('Weitere Bedingungen', 'Further terms')} optional>
              <Textarea rows={3} value={values.defaultTerms ?? ''} onChange={(e) => set('defaultTerms', e.target.value)} />
            </Field>
          </FormSection>
          <FormSection
            title={tr('Bankverbindung', 'Bank details')}
            description={tr(
              'Optional in der Fußzeile der Angebote, auf Rechnungen immer (sofern eine IBAN hinterlegt ist).',
              'Optional in the footer of quotations, always on invoices (if an IBAN is stored).',
            )}
          >
            <Switch
              checked={values.showBankDetails}
              onCheckedChange={(v) => set('showBankDetails', v)}
              label={tr('Auf Angeboten anzeigen', 'Show on quotations')}
              disabled={readOnly}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr('Kontoinhaber', 'Account holder')} optional>
                <Input value={values.bankAccountHolder ?? ''} onChange={(e) => set('bankAccountHolder', e.target.value)} />
              </Field>
              <Field label={tr('Bank', 'Bank')} optional>
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
          <FormSection
            title={tr('Rechnungen', 'Invoices')}
            description={
              <>
                {tr('Nummernkreis, Zahlungsziel und Texte für neue Rechnungen.', 'Number range, payment terms and texts for new invoices.')}{' '}
                <GermanDocumentsHint />
              </>
            }
          >
            <Alert tone="info">
              {getLocale() === 'en' ? (
                <>
                  Invoices require the full address and a tax number or VAT ID (USt-IdNr.) in the{' '}
                  <Link to="/einstellungen/firma">company details</Link>. Without these details an invoice cannot be issued.
                </>
              ) : (
                <>
                  Für Rechnungen sind die vollständige Anschrift sowie Steuernummer oder USt-IdNr. in den{' '}
                  <Link to="/einstellungen/firma">Firmendaten</Link> Pflicht. Ohne diese Angaben kann eine Rechnung nicht gestellt werden.
                </>
              )}
            </Alert>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={tr('Präfix Rechnungen', 'Invoice prefix')}
                error={prefixError(values.invoicePrefix)}
                hint={tr(
                  `z. B. ${values.invoicePrefix || 'RE'}-${new Date().getFullYear()}-0001 · fortlaufend und lückenlos`,
                  `e.g. ${values.invoicePrefix || 'RE'}-${new Date().getFullYear()}-0001 · consecutive without gaps`,
                )}
              >
                <Input value={values.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())} maxLength={8} />
              </Field>
              <Field
                label={tr('Zahlungsziel (Tage)', 'Payment terms (days)')}
                error={paymentDaysError}
                hint={tr('Fälligkeit = Rechnungsdatum + Zahlungsziel. 0 = sofort fällig.', 'Due date = invoice date + payment terms. 0 = due immediately.')}
              >
                <NumberInput value={values.invoicePaymentDays} onValueChange={(v) => set('invoicePaymentDays', v)} maxFractionDigits={0} align="left" />
              </Field>
            </div>
            <Field label={tr('Einleitung Rechnungen', 'Invoice introduction')} optional>
              <Textarea rows={3} value={values.invoiceIntroText ?? ''} onChange={(e) => set('invoiceIntroText', e.target.value)} />
            </Field>
            <Field label={tr('Schlusstext Rechnungen', 'Invoice closing text')} optional>
              <Textarea rows={3} value={values.invoiceClosingText ?? ''} onChange={(e) => set('invoiceClosingText', e.target.value)} />
            </Field>
            <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
              <Switch
                checked={values.invoiceReminderEnabled}
                onCheckedChange={(v) => set('invoiceReminderEnabled', v)}
                label={tr('Automatische Zahlungserinnerung', 'Automatic payment reminder')}
                description={tr(
                  'Eine freundliche Erinnerung per E-Mail, wenn eine per E-Mail versendete Rechnung überfällig ist.',
                  'A friendly email reminder when an invoice sent by email is overdue.',
                )}
                disabled={readOnly}
              />
              <Field label={tr('Tage nach Fälligkeit', 'Days after due date')} error={values.invoiceReminderEnabled ? reminderDaysError : undefined} className="sm:max-w-[220px]">
                <NumberInput
                  value={values.invoiceReminderAfterDays}
                  onValueChange={(v) => set('invoiceReminderAfterDays', v)}
                  maxFractionDigits={0}
                  align="left"
                  disabled={readOnly || !values.invoiceReminderEnabled}
                />
              </Field>
            </div>
            <p className="text-[13px] leading-[18px] text-neutral-500">
              {tr(
                'Auf Rechnungen wird Ihre Bankverbindung immer angegeben, sofern eine IBAN hinterlegt ist. Rechnungen enthalten einen GiroCode zum Bezahlen per Banking-App.',
                'Your bank details are always shown on invoices if an IBAN is stored. Invoices include a GiroCode for paying with a banking app.',
              )}
            </p>
          </FormSection>
        </CardBody>
        {!readOnly && (
          <CardFooter>
            <Button onClick={() => setValues(settings)} disabled={!dirty || save.isPending}>
              {tr('Verwerfen', 'Discard')}
            </Button>
            <Button variant="primary" disabled={!dirty || invalid} loading={save.isPending} onClick={() => save.mutate()}>
              {tr('Speichern', 'Save')}
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
  const percentError = Number.isFinite(percent) && percent >= 0 && percent <= 100 ? undefined : tr('Bitte einen Satz zwischen 0 und 100 % angeben.', 'Please enter a rate between 0 and 100 %.');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), ratePercent: percent, isDefault, isArchived };
      return rate ? api.companies.updateTaxRate(companyId, rate.id, body) : api.companies.createTaxRate(companyId, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.taxRates(companyId) });
      toast.success(rate ? tr('Steuersatz gespeichert', 'VAT rate saved') : tr('Steuersatz angelegt', 'VAT rate created'));
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rate ? tr('Steuersatz bearbeiten', 'Edit VAT rate') : tr('Neuer Steuersatz', 'New VAT rate')}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{tr('Abbrechen', 'Cancel')}</Button>
          <Button variant="primary" loading={save.isPending} disabled={!name.trim() || Boolean(percentError)} onClick={() => save.mutate()}>
            {tr('Speichern', 'Save')}
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
        <Field label={tr('Bezeichnung', 'Name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('z. B. Regelsatz', 'e.g. Standard rate')} maxLength={50} />
        </Field>
        <Field label={tr('Steuersatz', 'VAT rate')} error={Number.isNaN(percent) ? undefined : percentError} required>
          <NumberInput value={percent} onValueChange={setPercent} suffix="%" maxFractionDigits={2} align="left" />
        </Field>
        <Checkbox label={tr('Standardsatz für neue Positionen', 'Default rate for new line items')} checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <Checkbox
          label={tr('Archiviert', 'Archived')}
          description={tr(
            'Nicht mehr für neue Positionen auswählbar. Bestehende Angebote bleiben unverändert.',
            'No longer selectable for new line items. Existing quotations stay unchanged.',
          )}
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
        title={tr('Umsatzsteuersätze', 'VAT rates')}
        description={tr('Auswahl in den Positionen bei Regelbesteuerung.', 'Selectable in line items under standard taxation.')}
        actions={
          !readOnly && (
            <Button size="sm" icon={Plus} onClick={() => setEditing('new')}>
              {tr('Steuersatz', 'VAT rate')}
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
                <th scope="col" className={table.th}>
                  {tr('Bezeichnung', 'Name')}
                </th>
                <th scope="col" className={cx(table.th, 'text-right')}>
                  {tr('Satz', 'Rate')}
                </th>
                <th scope="col" className={table.th}>
                  {tr('Status', 'Status')}
                </th>
                <th scope="col" className={table.th}>
                  <span className="sr-only">{tr('Aktionen', 'Actions')}</span>
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
                        {r.isDefault && <Badge tone="info">{tr('Standard', 'Default')}</Badge>}
                        {r.isArchived ? <Badge tone="muted">{tr('Archiviert', 'Archived')}</Badge> : <Badge tone="success">{tr('Aktiv', 'Active')}</Badge>}
                      </div>
                    </td>
                    <td className={cx(table.td, 'w-12 text-right')}>
                      {!readOnly && <IconButton size="sm" icon={Pencil} label={tr(`${r.name} bearbeiten`, `Edit ${r.name}`)} onClick={() => setEditing(r)} />}
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
