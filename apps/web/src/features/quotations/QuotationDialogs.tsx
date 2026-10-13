import {
  addDaysIso,
  emailSchema,
  todayIso,
  type CompanySettingsDto,
  type QuotationDto,
  type SendMode,
  type SendQuotationRequest,
} from '@angebotpilot/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Copy, Link2, MailCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCompany, useCompanySettings, useMembers } from '@/app/company';
import { Button } from '@/components/ui/Button';
import { Checkbox, RadioCards } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { errorMessage, isEmailNotVerified } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { copyToClipboard } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';

function useInvalidateQuotation(id: string) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  return (updated?: QuotationDto) => {
    if (updated) queryClient.setQueryData(qk.quotation(companyId, id), updated);
    // Detail, events, deliveries, follow-ups and lists all live under the quotations key.
    void queryClient.invalidateQueries({ queryKey: qk.quotations(companyId) });
    void queryClient.invalidateQueries({ queryKey: ['c', companyId, 'dashboard'] });
  };
}

/** Shows a URL once with copy button and QR code. */
export function LinkReveal({ url, expiresAt }: { url: string; expiresAt?: string | null }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { margin: 1, width: 168, color: { dark: '#141821', light: '#FFFFFF' } })
      .then((data) => {
        if (active) setQr(data);
      })
      .catch(() => setQr(null));
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-25 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr && (
          // Paper-like box: the QR code stays black on white in dark mode too.
          <div data-theme="light" className="shrink-0 self-start rounded-md border border-neutral-200 bg-white p-1.5">
            <img src={qr} alt={tr('QR-Code zum Kundenlink', 'QR code for the customer link')} className="block size-[120px]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor="public-link-url" className="text-[13px] font-medium text-neutral-800">
            {tr('Kundenlink', 'Customer link')}
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input id="public-link-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" data-testid="public-link-url" />
            <Button
              icon={copied ? Check : Copy}
              onClick={async () => {
                const ok = await copyToClipboard(url);
                setCopied(ok);
                if (ok) toast.success(tr('Link kopiert', 'Link copied'));
                else toast.error(tr('Kopieren nicht möglich', 'Copying not possible'), tr('Bitte markieren und manuell kopieren.', 'Please select and copy it manually.'));
              }}
            >
              {copied ? tr('Kopiert', 'Copied') : tr('Kopieren', 'Copy')}
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-neutral-600">
            {tr(
              'Aus Sicherheitsgründen wird der Link nur jetzt angezeigt. Speichern oder teilen Sie ihn direkt.',
              'For security reasons the link is only shown now. Save or share it straight away.',
            )}
            {expiresAt && tr(` Gültig bis ${formatDateTime(expiresAt)}.`, ` Valid until ${formatDateTime(expiresAt)}.`)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Planned reminder dates for a quotation sent today, from the company settings. */
export function plannedReminders(settings: CompanySettingsDto, validUntil: string, today = todayIso()) {
  const items: { label: string; date: string | null; enabled: boolean; note?: string }[] = [
    {
      label: tr('1. Erinnerung', '1st reminder'),
      enabled: settings.firstReminderEnabled,
      date: addDaysIso(today, settings.firstReminderAfterDays),
      note: tr(`${settings.firstReminderAfterDays} Tage nach Versand`, `${settings.firstReminderAfterDays} days after sending`),
    },
    {
      label: tr('2. Erinnerung', '2nd reminder'),
      enabled: settings.secondReminderEnabled,
      date: addDaysIso(today, settings.secondReminderAfterDays),
      note: tr(`${settings.secondReminderAfterDays} Tage nach Versand`, `${settings.secondReminderAfterDays} days after sending`),
    },
    {
      label: tr('Erinnerung vor Ablauf', 'Reminder before expiry'),
      enabled: settings.expiryReminderEnabled,
      date: addDaysIso(validUntil, -settings.expiryReminderDaysBefore),
      note: tr(`${settings.expiryReminderDaysBefore} Tage vor Ablauf`, `${settings.expiryReminderDaysBefore} days before expiry`),
    },
  ];
  return items.map((item) => ({ ...item, skipped: item.enabled && item.date !== null && (item.date > validUntil || item.date <= today) }));
}

interface SendDialogProps {
  quotation: QuotationDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendDialog({ quotation, open, onOpenChange }: SendDialogProps) {
  const { companyId } = useCompany();
  const settings = useCompanySettings();
  const invalidate = useInvalidateQuotation(quotation.id);
  const resend = quotation.status === 'Sent';
  const [mode, setMode] = useState<SendMode>(quotation.recipientEmail ? 'Email' : 'Manual');
  const [recipient, setRecipient] = useState(quotation.recipientEmail ?? '');
  // Subject and message go to the (German) customer: the prefills stay German in the English UI too.
  const [subject, setSubject] = useState(`Angebot ${quotation.number}: ${quotation.title}`);
  const [message, setMessage] = useState(
    `Guten Tag ${quotation.recipientContact ?? quotation.recipientName},\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot ${quotation.number}. Über den Link können Sie es online ansehen und direkt annehmen.\n\nBei Fragen sind wir gerne für Sie da.`,
  );
  const [attachPdfChoice, setAttachPdf] = useState<boolean | null>(null);
  const attachPdf = attachPdfChoice ?? settings.data?.attachPdfToEmails ?? true;
  const [includeLink, setIncludeLink] = useState(true);
  const [followUps, setFollowUps] = useState(!resend);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicUrl: string | null; mode: SendMode } | null>(null);


  const send = useMutation({
    mutationFn: (body: SendQuotationRequest) => api.quotations.send(companyId, quotation.id, body),
    onSuccess: (response) => {
      invalidate(response.quotation);
      toast.success(mode === 'Email' ? tr('Angebot versendet', 'Quotation sent') : tr('Als versendet markiert', 'Marked as sent'), quotation.number);
      if (response.publicUrl) setResult({ publicUrl: response.publicUrl, mode });
      else onOpenChange(false);
    },
  });
  const resendVerification = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () => toast.success(tr('Bestätigungs-E-Mail gesendet', 'Confirmation email sent'), tr('Bitte prüfen Sie Ihr Postfach.', 'Please check your inbox.')),
    onError: (error) => toast.error(tr('Senden fehlgeschlagen', 'Sending failed'), errorMessage(error)),
  });

  const pastValidity = quotation.validUntil < todayIso();

  const submit = () => {
    setRecipientError(null);
    if (mode === 'Email') {
      const parsed = emailSchema.safeParse(recipient);
      if (!parsed.success) {
        setRecipientError(parsed.error.issues[0]?.message ?? tr('Bitte gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.'));
        return;
      }
    }
    send.mutate({
      mode,
      recipientEmail: mode === 'Email' ? recipient.trim() : recipient.trim() || null,
      subject: mode === 'Email' ? subject : null,
      message: mode === 'Email' ? message : null,
      attachPdf: mode === 'Email' ? attachPdf : null,
      includePublicLink: includeLink,
      scheduleFollowUps: followUps,
    });
  };

  const close = (next: boolean) => {
    if (send.isPending) return;
    if (!next) {
      setResult(null);
      send.reset();
    }
    onOpenChange(next);
  };

  if (result?.publicUrl) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        title={result.mode === 'Email' ? tr('Angebot versendet', 'Quotation sent') : tr('Angebot als versendet markiert', 'Quotation marked as sent')}
        size="lg"
        footer={
          <Button variant="primary" onClick={() => close(false)}>
            {tr('Fertig', 'Done')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="success" icon={MailCheck}>
            {result.mode === 'Email'
              ? tr(
                  'Die E-Mail wurde zum Versand übergeben. Den Zustellstatus sehen Sie im Reiter „E-Mail-Versand“.',
                  'The email has been handed over for delivery. You can see the delivery status on the “Email delivery” tab.',
                )
              : tr(
                  'Teilen Sie den Kundenlink, damit Ihr Kunde das Angebot online ansehen und annehmen kann.',
                  'Share the customer link so your customer can view and accept the quotation online.',
                )}
          </Alert>
          <LinkReveal url={result.publicUrl} />
        </div>
      </Dialog>
    );
  }

  const reminders = settings.data ? plannedReminders(settings.data, quotation.validUntil) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={
        resend
          ? tr(`Angebot ${quotation.number} erneut senden`, `Send quotation ${quotation.number} again`)
          : tr(`Angebot ${quotation.number} senden`, `Send quotation ${quotation.number}`)
      }
      description={tr(`An ${quotation.recipientName}`, `To ${quotation.recipientName}`)}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => close(false)} disabled={send.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={send.isPending} disabled={pastValidity} onClick={submit}>
            {mode === 'Email' ? tr('Jetzt senden', 'Send now') : tr('Als versendet markieren', 'Mark as sent')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {pastValidity && (
          <Alert tone="warning" title={tr('Gültigkeitsdatum liegt in der Vergangenheit', 'The validity date is in the past')}>
            {tr('Passen Sie „Gültig bis“ an, bevor Sie das Angebot versenden.', 'Adjust “Valid until” before you send the quotation.')}{' '}
            {quotation.status === 'Draft' && <Link to={`/angebote/${quotation.id}/bearbeiten`}>{tr('Angebot bearbeiten', 'Edit quotation')}</Link>}
          </Alert>
        )}
        {send.isError &&
          (isEmailNotVerified(send.error) ? (
            <Alert
              tone="warning"
              live
              title={tr('E-Mail-Adresse noch nicht bestätigt', 'Email address not yet confirmed')}
              actions={
                <Button size="sm" loading={resendVerification.isPending} onClick={() => resendVerification.mutate()}>
                  {tr('Bestätigungs-E-Mail erneut senden', 'Resend confirmation email')}
                </Button>
              }
            >
              {errorMessage(send.error)}{' '}
              {tr(
                'Alternativ können Sie das Angebot selbst übermitteln und es hier als versendet markieren.',
                'Alternatively, you can deliver the quotation yourself and mark it as sent here.',
              )}
            </Alert>
          ) : (
            <Alert tone="danger" live>
              {errorMessage(send.error)}
            </Alert>
          ))}

        <RadioCards<SendMode>
          name="send-mode"
          legend={tr('Versandart', 'Delivery method')}
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'Email',
              label: tr('Per E-Mail senden', 'Send by email'),
              description: tr('AngebotPilot sendet die E-Mail mit Kundenlink und optional PDF.', 'AngebotPilot sends the email with the customer link and, optionally, the PDF.'),
            },
            {
              value: 'Manual',
              label: tr('Ich habe das Angebot selbst übermittelt', 'I delivered the quotation myself'),
              description: tr('z. B. ausgedruckt, persönlich oder aus Ihrem eigenen E-Mail-Programm.', 'e.g. printed, in person or from your own email program.'),
            },
          ]}
        />

        {mode === 'Email' ? (
          <div className="space-y-4">
            <Field label={tr('Empfänger', 'Recipient')} error={recipientError ?? undefined} required>
              <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={tr('Betreff', 'Subject')}>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
            <Field
              label={tr('Nachricht', 'Message')}
              hint={tr(
                'Ihre E-Mail-Signatur aus den Einstellungen wird automatisch angefügt.',
                'Your email signature from Settings is added automatically. Your customer receives this email in German.',
              )}
            >
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox label={tr('PDF anhängen', 'Attach PDF')} checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              <Checkbox
                label={tr('Kundenlink einfügen', 'Include customer link')}
                description={tr('Online ansehen und annehmen', 'View and accept online')}
                checked={includeLink}
                onChange={(e) => setIncludeLink(e.target.checked)}
              />
            </div>
          </div>
        ) : (
          <Checkbox
            label={tr('Kundenlink erzeugen', 'Create customer link')}
            description={tr(
              'Damit Ihr Kunde das Angebot online ansehen und annehmen kann. Der Link wird nach dem Speichern einmalig angezeigt.',
              'So your customer can view and accept the quotation online. The link is shown once after saving.',
            )}
            checked={includeLink}
            onChange={(e) => setIncludeLink(e.target.checked)}
          />
        )}

        <div className="rounded-lg border border-neutral-200 p-4">
          <Checkbox
            label={tr('Automatisch nachfassen', 'Automatic follow-up')}
            description={tr(
              'Freundliche Erinnerungs-E-Mails an den Kunden, solange er nicht entschieden hat. Sie stoppen automatisch bei Annahme, Ablehnung, Ablauf oder Abmeldung des Kunden.',
              'Friendly reminder emails (in German) to the customer until they decide. They stop automatically on acceptance, rejection, expiry or if the customer unsubscribes.',
            )}
            checked={followUps}
            onChange={(e) => setFollowUps(e.target.checked)}
          />
          {followUps && reminders && (
            <ul className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3 pl-6.5 text-[13px]">
              {reminders.map((r) => (
                <li key={r.label} className="flex flex-wrap items-center gap-x-2 text-neutral-700">
                  <CalendarClock aria-hidden size={14} className="text-neutral-400" />
                  <span className="font-medium">{r.label}:</span>
                  {!r.enabled ? (
                    <span className="text-neutral-500">{tr('in den Einstellungen deaktiviert', 'switched off in Settings')}</span>
                  ) : r.skipped ? (
                    <span className="text-neutral-500">
                      {tr(`entfällt (${r.note} läge außerhalb der Gültigkeit)`, `skipped (${r.note} would be outside the validity period)`)}
                    </span>
                  ) : (
                    <span>
                      {tr(`voraussichtlich am ${formatDate(r.date)}`, `expected on ${formatDate(r.date)}`)} <span className="text-neutral-500">({r.note})</span>
                    </span>
                  )}
                </li>
              ))}
              <li className="pt-1 text-neutral-500">
                {tr('Anpassen unter', 'Change under')}{' '}
                <Link to="/einstellungen/benachrichtigungen" className="font-medium text-brand-600 dark:text-brand-700 hover:underline">
                  {tr('Einstellungen → Erinnerungen', 'Settings → Reminders')}
                </Link>
                .
              </li>
            </ul>
          )}
          {followUps && mode === 'Manual' && !recipient && (
            <p className="mt-2 pl-6.5 text-[13px] text-warning-text">
              {tr('Für Erinnerungen braucht der Kunde eine E-Mail-Adresse.', 'The customer needs an email address for reminders.')}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function DecisionDialog({
  quotation,
  decision,
  open,
  onOpenChange,
}: {
  quotation: QuotationDto;
  decision: 'accept' | 'reject';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateQuotation(quotation.id);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      decision === 'accept'
        ? api.quotations.accept(companyId, quotation.id, { note: note.trim() || null })
        : api.quotations.reject(companyId, quotation.id, { note: note.trim() || null }),
    onSuccess: (updated) => {
      invalidate(updated);
      toast.success(decision === 'accept' ? tr('Annahme erfasst', 'Acceptance recorded') : tr('Ablehnung erfasst', 'Rejection recorded'), quotation.number);
      setNote('');
      onOpenChange(false);
    },
  });
  const late = decision === 'accept' && quotation.status === 'Expired';
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={
        decision === 'accept'
          ? late
            ? tr('Späte Annahme erfassen', 'Record late acceptance')
            : tr('Annahme erfassen', 'Record acceptance')
          : tr('Ablehnung erfassen', 'Record rejection')
      }
      description={
        decision === 'accept'
          ? tr(
              'Erfassen Sie, dass Ihr Kunde das Angebot z. B. telefonisch, per E-Mail oder unterschrieben angenommen hat.',
              'Record that your customer accepted the quotation, e.g. by phone, by email or with a signature.',
            )
          : tr('Erfassen Sie, dass Ihr Kunde das Angebot abgelehnt hat.', 'Record that your customer declined the quotation.')
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant={decision === 'accept' ? 'primary' : 'danger'} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {decision === 'accept' ? tr('Annahme speichern', 'Save acceptance') : tr('Ablehnung speichern', 'Save rejection')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {late && (
          <Alert tone="info">
            {tr(
              'Das Angebot ist bereits abgelaufen. Sie können eine nachträgliche Zusage Ihres Kunden trotzdem erfassen.',
              'The quotation has already expired. You can still record a late acceptance by your customer.',
            )}
          </Alert>
        )}
        {mutation.isError && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <Field
          label={
            decision === 'accept'
              ? tr('Notiz (z. B. „telefonisch zugesagt von Herrn Huber“)', 'Note (e.g. “confirmed by phone by Mr Huber”)')
              : tr('Grund / Notiz', 'Reason / note')
          }
          optional
        >
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <p className="text-[13px] text-neutral-500">{tr('Offene Erinnerungen werden automatisch gestoppt.', 'Pending reminders are stopped automatically.')}</p>
      </div>
    </Dialog>
  );
}

export function CancelDialog({ quotation, open, onOpenChange }: { quotation: QuotationDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateQuotation(quotation.id);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.quotations.cancel(companyId, quotation.id, { reason: reason.trim() || null }),
    onSuccess: (updated) => {
      invalidate(updated);
      toast.success(tr('Angebot storniert', 'Quotation cancelled'), quotation.number);
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={tr(`Angebot ${quotation.number} stornieren?`, `Cancel quotation ${quotation.number}?`)}
      description={tr(
        'Das Angebot bleibt archiviert erhalten, kann aber nicht mehr angenommen werden. Ein aktiver Kundenlink zeigt den Status „storniert“, Erinnerungen werden gestoppt.',
        'The quotation is kept in the archive but can no longer be accepted. An active customer link shows the status “cancelled” and reminders are stopped.',
      )}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {tr('Stornieren', 'Cancel quotation')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <Field label={tr('Grund (nur intern)', 'Reason (internal only)')} optional>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}

export function ConvertToJobDialog({ quotation, open, onOpenChange }: { quotation: QuotationDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = useInvalidateQuotation(quotation.id);
  const members = useMembers(open);
  const [title, setTitle] = useState(quotation.title);
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      api.quotations.convertToJob(companyId, quotation.id, {
        title: title.trim() || null,
        description: description.trim() || null,
        plannedStartDate: start || null,
        dueDate: due || null,
        assignedUserId: assignee || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (job) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: qk.jobs(companyId) });
      toast.success(tr('Auftrag erstellt', 'Job created'), `${job.number} · ${job.title}`);
      onOpenChange(false);
      void navigate(`/auftraege/${job.id}`);
    },
  });
  const dateError = start && due && due < start ? tr('Fälligkeit liegt vor dem geplanten Start.', 'The due date is before the planned start.') : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={tr('In Auftrag umwandeln', 'Convert to job')}
      description={tr(
        `Aus dem angenommenen Angebot ${quotation.number} wird ein Auftrag mit Verweis auf Angebot und Kunde.`,
        `The accepted quotation ${quotation.number} becomes a job linked to the quotation and the customer.`,
      )}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={mutation.isPending} disabled={Boolean(dateError)} onClick={() => mutation.mutate()}>
            {tr('Auftrag erstellen', 'Create job')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <Field label={tr('Titel', 'Title')} required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label={tr('Beschreibung', 'Description')} optional>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tr('Geplanter Start', 'Planned start')} optional>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={tr('Fällig bis', 'Due by')} optional error={dateError}>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={tr('Zuständig', 'Assignee')} optional hint={members.isError ? tr('Teamliste nicht verfügbar.', 'Team list not available.') : undefined}>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!members.data}>
              <option value="">{tr('Niemand', 'Nobody')}</option>
              {members.data
                ?.filter((m) => m.status === 'Active')
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label={tr('Notizen', 'Notes')} optional>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function PublicLinkDialog({ quotation, open, onOpenChange }: { quotation: QuotationDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateQuotation(quotation.id);
  const mutation = useMutation({
    mutationFn: () => api.quotations.createPublicLink(companyId, quotation.id),
    onSuccess: () => invalidate(),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
      title={quotation.hasActivePublicLink ? tr('Kundenlink neu erzeugen', 'Regenerate customer link') : tr('Kundenlink erzeugen', 'Create customer link')}
      description={tr(
        'Über den Link kann Ihr Kunde das Angebot ohne Anmeldung ansehen, als PDF laden und annehmen oder ablehnen.',
        'With the link your customer can view the quotation without signing in, download it as a PDF and accept or decline it.',
      )}
      size="lg"
      footer={
        mutation.data ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            {tr('Fertig', 'Done')}
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>{tr('Abbrechen', 'Cancel')}</Button>
            <Button variant="primary" icon={Link2} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              {quotation.hasActivePublicLink ? tr('Neuen Link erzeugen', 'Create new link') : tr('Link erzeugen', 'Create link')}
            </Button>
          </>
        )
      }
    >
      {mutation.data ? (
        <LinkReveal url={mutation.data.url} expiresAt={mutation.data.expiresAt} />
      ) : (
        <div className="space-y-3">
          {quotation.hasActivePublicLink && (
            <Alert tone="warning">
              {tr(
                'Der bisherige Link wird dabei ungültig. Kunden, die ihn noch haben, sehen dann einen Hinweis.',
                'The previous link will stop working. Customers who still have it will see a notice.',
              )}
            </Alert>
          )}
          {mutation.isError && (
            <Alert tone="danger" live>
              {errorMessage(mutation.error)}
            </Alert>
          )}
          <p className="text-sm text-neutral-600">{tr('Der Link wird aus Sicherheitsgründen nur einmal angezeigt.', 'For security reasons the link is only shown once.')}</p>
        </div>
      )}
    </Dialog>
  );
}

export function SaveTemplateDialog({ quotation, open, onOpenChange }: { quotation: QuotationDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState(quotation.title);
  const [description, setDescription] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.quotations.saveAsTemplate(companyId, quotation.id, { name: name.trim(), description: description.trim() || null }),
    onSuccess: (template) => {
      void queryClient.invalidateQueries({ queryKey: qk.templates(companyId) });
      toast.success(tr('Vorlage gespeichert', 'Template saved'), template.name);
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={tr('Als Vorlage speichern', 'Save as template')}
      description={tr(
        'Texte und Positionen werden als wiederverwendbare Vorlage gespeichert. Kundendaten werden nicht übernommen.',
        'Texts and line items are saved as a reusable template. Customer data is not included.',
      )}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!name.trim()} onClick={() => mutation.mutate()}>
            {tr('Vorlage speichern', 'Save template')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <Field label={tr('Name der Vorlage', 'Template name')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Field label={tr('Beschreibung', 'Description')} optional>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}
