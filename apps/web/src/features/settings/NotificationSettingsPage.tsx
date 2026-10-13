import { emailSchema, getLocale, type CompanySettingsDto } from '@angebotpilot/api-contracts';
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
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { emptyToNull, FormSection, ReadOnlyNotice } from './shared';

const dayError = (value: number, enabled: boolean) =>
  !enabled || (Number.isInteger(value) && value >= 1 && value <= 90) ? undefined : tr('Bitte 1 bis 90 Tage angeben.', 'Please enter 1 to 90 days.');

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
        <NumberInput value={days} onValueChange={onDays} maxFractionDigits={0} align="left" suffix={tr('Tage', 'days')} disabled={readOnly || !enabled} />
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
  const replyError = values.replyToEmail && !emailSchema.safeParse(values.replyToEmail).success ? tr('Bitte gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.') : undefined;
  const invalid = Boolean(
    replyError ||
      dayError(values.firstReminderAfterDays, values.firstReminderEnabled) ||
      dayError(values.secondReminderAfterDays, values.secondReminderEnabled) ||
      dayError(values.expiryReminderDaysBefore, values.expiryReminderEnabled),
  );
  const orderWarning =
    values.firstReminderEnabled && values.secondReminderEnabled && values.secondReminderAfterDays <= values.firstReminderAfterDays
      ? tr('Die 2. Erinnerung sollte nach der 1. Erinnerung kommen.', 'The 2nd reminder should come after the 1st reminder.')
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
      toast.success(tr('Einstellungen gespeichert', 'Settings saved'));
    },
  });

  return (
    <Card>
      <CardHeader
        title={tr('Erinnerungen & Benachrichtigungen', 'Reminders & notifications')}
        description={tr('Wie AngebotPilot bei offenen Angeboten automatisch nachfasst.', 'How AngebotPilot automatically follows up on open quotations.')}
      />
      <fieldset disabled={readOnly} className="min-w-0">
        <CardBody className="space-y-6 py-6">
          {save.isError && (
            <Alert tone="danger" live>
              {errorMessage(save.error)}
            </Alert>
          )}
          <Alert tone="info" title={tr('So funktionieren Erinnerungen', 'How reminders work')}>
            {tr(
              'Erinnerungen werden nur für Angebote geplant, die Sie per E-Mail versenden und bei denen „Automatisch nachfassen“ aktiv ist. Sie stoppen automatisch, sobald Ihr Kunde annimmt oder ablehnt, das Angebot abläuft oder storniert wird – oder wenn sich der Kunde über den Link in der E-Mail abmeldet. Änderungen gelten für künftig versendete Angebote.',
              'Reminders are only scheduled for quotations you send by email with “Automatic follow-up” switched on. They stop automatically as soon as your customer accepts or declines, the quotation expires or is cancelled – or when the customer unsubscribes via the link in the email. Changes apply to quotations sent from now on.',
            )}
            {getLocale() === 'en' && ' Reminder emails are sent to your customers in German.'}
          </Alert>
          <FormSection title={tr('Automatische Erinnerungen', 'Automatic reminders')}>
            <ReminderRow
              label={tr('1. Erinnerung', '1st reminder')}
              description={tr('Freundliche Nachfrage, ob das Angebot angekommen ist.', 'A friendly check that the quotation has arrived.')}
              enabled={values.firstReminderEnabled}
              onEnabled={(v) => set('firstReminderEnabled', v)}
              days={values.firstReminderAfterDays}
              onDays={(v) => set('firstReminderAfterDays', v)}
              daysLabel={tr('Tage nach Versand', 'Days after sending')}
              readOnly={readOnly}
            />
            <ReminderRow
              label={tr('2. Erinnerung', '2nd reminder')}
              description={tr('Zweite Nachfrage, falls noch keine Entscheidung vorliegt.', 'A second follow-up if there is no decision yet.')}
              enabled={values.secondReminderEnabled}
              onEnabled={(v) => set('secondReminderEnabled', v)}
              days={values.secondReminderAfterDays}
              onDays={(v) => set('secondReminderAfterDays', v)}
              daysLabel={tr('Tage nach Versand', 'Days after sending')}
              readOnly={readOnly}
            />
            {orderWarning && <p className="text-[13px] text-warning-text">{orderWarning}</p>}
            <ReminderRow
              label={tr('Erinnerung vor Ablauf', 'Reminder before expiry')}
              description={tr('Hinweis kurz bevor das Angebot seine Gültigkeit verliert.', 'A note shortly before the quotation expires.')}
              enabled={values.expiryReminderEnabled}
              onEnabled={(v) => set('expiryReminderEnabled', v)}
              days={values.expiryReminderDaysBefore}
              onDays={(v) => set('expiryReminderDaysBefore', v)}
              daysLabel={tr('Tage vor Ablauf', 'Days before expiry')}
              readOnly={readOnly}
            />
          </FormSection>
          <FormSection title={tr('E-Mails', 'Emails')}>
            <Switch
              checked={values.attachPdfToEmails}
              onCheckedChange={(v) => set('attachPdfToEmails', v)}
              label={tr('PDF standardmäßig anhängen', 'Attach PDF by default')}
              description={tr('Vorauswahl im Versanddialog; pro Versand änderbar.', 'Preselected in the send dialog; can be changed each time.')}
              disabled={readOnly}
            />
            <Field
              label={tr('Antwort-an-Adresse', 'Reply-to address')}
              error={replyError}
              optional
              hint={tr('Antworten Ihrer Kunden gehen an diese Adresse.', 'Replies from your customers go to this address.')}
            >
              <Input type="email" value={values.replyToEmail ?? ''} onChange={(e) => set('replyToEmail', e.target.value)} />
            </Field>
            <Field
              label={tr('E-Mail-Signatur', 'Email signature')}
              optional
              hint={tr(
                'Wird an Angebots- und Erinnerungs-E-Mails angehängt.',
                'Appended to quotation and reminder emails, which your customers receive in German.',
              )}
            >
              <Textarea rows={4} value={values.emailSignature ?? ''} onChange={(e) => set('emailSignature', e.target.value)} />
            </Field>
          </FormSection>
          <FormSection title={tr('Benachrichtigungen', 'Notifications')}>
            <Switch
              checked={values.notifyOnCustomerDecision}
              onCheckedChange={(v) => set('notifyOnCustomerDecision', v)}
              label={tr('Bei Kundenentscheidung benachrichtigen', 'Notify me of customer decisions')}
              description={tr('E-Mail und Hinweis in der App, wenn ein Kunde online annimmt oder ablehnt.', 'Email and in-app notice when a customer accepts or declines online.')}
              disabled={readOnly}
            />
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
