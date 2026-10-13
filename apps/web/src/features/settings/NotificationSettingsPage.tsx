import { emailSchema, type CompanySettingsDto } from '@angebotpilot/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useCompany, useCompanySettings } from '@/app/company';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Choice';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { emptyToNull, FormSection, ReadOnlyNotice } from './shared';

const dayError = (value: number, enabled: boolean) =>
  !enabled || (Number.isInteger(value) && value >= 1 && value <= 90) ? undefined : 'Bitte 1 bis 90 Tage angeben.';

function ReminderRow({
  label,
  description,
  enabled,
  onEnabled,
  days,
  onDays,
  daysLabel,
  readOnly,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  days: number;
  onDays: (v: number) => void;
  daysLabel: string;
  readOnly: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-200 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
      <Switch checked={enabled} onCheckedChange={onEnabled} label={label} description={description} disabled={readOnly} />
      <Field label={daysLabel} error={dayError(days, enabled)}>
        <NumberInput value={days} onValueChange={onDays} maxFractionDigits={0} align="left" suffix="Tage" disabled={readOnly || !enabled} />
      </Field>
    </div>
  );
}

function Form({ settings, readOnly }: { settings: CompanySettingsDto; readOnly: boolean }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(settings);
  const set = <K extends keyof CompanySettingsDto>(key: K, value: CompanySettingsDto[K]) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = JSON.stringify(values) !== JSON.stringify(settings);
  const replyError = values.replyToEmail && !emailSchema.safeParse(values.replyToEmail).success ? 'Bitte gültige E-Mail-Adresse angeben.' : undefined;
  const invalid = Boolean(
    replyError ||
      dayError(values.firstReminderAfterDays, values.firstReminderEnabled) ||
      dayError(values.secondReminderAfterDays, values.secondReminderEnabled) ||
      dayError(values.expiryReminderDaysBefore, values.expiryReminderEnabled),
  );
  const orderWarning =
    values.firstReminderEnabled && values.secondReminderEnabled && values.secondReminderAfterDays <= values.firstReminderAfterDays
      ? 'Die 2. Erinnerung sollte nach der 1. Erinnerung kommen.'
      : null;
  const save = useMutation({
    mutationFn: () =>
      api.companies.updateSettings(companyId, {
        ...values,
        emailSignature: emptyToNull(values.emailSignature),
        replyToEmail: emptyToNull(values.replyToEmail),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.settings(companyId), saved);
      setValues(saved);
      toast.success('Einstellungen gespeichert');
    },
  });

  return (
    <Card>
      <CardHeader title="Erinnerungen & Benachrichtigungen" description="Wie AngebotPilot bei offenen Angeboten automatisch nachfasst." />
      <fieldset disabled={readOnly} className="min-w-0">
        <CardBody className="space-y-6 py-6">
          {save.isError && (
            <Alert tone="danger" live>
              {errorMessage(save.error)}
            </Alert>
          )}
          <Alert tone="info" title="So funktionieren Erinnerungen">
            Erinnerungen werden nur für Angebote geplant, die Sie per E-Mail versenden und bei denen „Automatisch nachfassen“ aktiv ist. Sie stoppen
            automatisch, sobald Ihr Kunde annimmt oder ablehnt, das Angebot abläuft oder storniert wird – oder wenn sich der Kunde über den Link in der
            E-Mail abmeldet. Änderungen gelten für künftig versendete Angebote.
          </Alert>
          <FormSection title="Automatische Erinnerungen">
            <ReminderRow
              label="1. Erinnerung"
              description="Freundliche Nachfrage, ob das Angebot angekommen ist."
              enabled={values.firstReminderEnabled}
              onEnabled={(v) => set('firstReminderEnabled', v)}
              days={values.firstReminderAfterDays}
              onDays={(v) => set('firstReminderAfterDays', v)}
              daysLabel="Tage nach Versand"
              readOnly={readOnly}
            />
            <ReminderRow
              label="2. Erinnerung"
              description="Zweite Nachfrage, falls noch keine Entscheidung vorliegt."
              enabled={values.secondReminderEnabled}
              onEnabled={(v) => set('secondReminderEnabled', v)}
              days={values.secondReminderAfterDays}
              onDays={(v) => set('secondReminderAfterDays', v)}
              daysLabel="Tage nach Versand"
              readOnly={readOnly}
            />
            {orderWarning && <p className="text-[13px] text-warning-text">{orderWarning}</p>}
            <ReminderRow
              label="Erinnerung vor Ablauf"
              description="Hinweis kurz bevor das Angebot seine Gültigkeit verliert."
              enabled={values.expiryReminderEnabled}
              onEnabled={(v) => set('expiryReminderEnabled', v)}
              days={values.expiryReminderDaysBefore}
              onDays={(v) => set('expiryReminderDaysBefore', v)}
              daysLabel="Tage vor Ablauf"
              readOnly={readOnly}
            />
          </FormSection>
          <FormSection title="E-Mails">
            <Switch
              checked={values.attachPdfToEmails}
              onCheckedChange={(v) => set('attachPdfToEmails', v)}
              label="PDF standardmäßig anhängen"
              description="Vorauswahl im Versanddialog; pro Versand änderbar."
              disabled={readOnly}
            />
            <Field label="Antwort-an-Adresse" error={replyError} optional hint="Antworten Ihrer Kunden gehen an diese Adresse.">
              <Input type="email" value={values.replyToEmail ?? ''} onChange={(e) => set('replyToEmail', e.target.value)} />
            </Field>
            <Field label="E-Mail-Signatur" optional hint="Wird an Angebots- und Erinnerungs-E-Mails angehängt.">
              <Textarea rows={4} value={values.emailSignature ?? ''} onChange={(e) => set('emailSignature', e.target.value)} />
            </Field>
          </FormSection>
          <FormSection title="Benachrichtigungen">
            <Switch
              checked={values.notifyOnCustomerDecision}
              onCheckedChange={(v) => set('notifyOnCustomerDecision', v)}
              label="Bei Kundenentscheidung benachrichtigen"
              description="E-Mail und Hinweis in der App, wenn ein Kunde online annimmt oder ablehnt."
              disabled={readOnly}
            />
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

export default function NotificationSettingsPage() {
  const { can } = useCompany();
  const settings = useCompanySettings();
  if (settings.isPending) return <PageSkeleton />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const readOnly = !can.manageDocumentSettings;
  return (
    <div className="space-y-6">
      {readOnly && <ReadOnlyNotice />}
      <Form settings={settings.data} readOnly={readOnly} />
    </div>
  );
}
