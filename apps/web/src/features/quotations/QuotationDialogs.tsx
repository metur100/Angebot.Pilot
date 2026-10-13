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
        {qr && <img src={qr} alt="QR-Code zum Kundenlink" className="size-[120px] shrink-0 rounded-md border border-neutral-200 bg-white p-1" />}
        <div className="min-w-0 flex-1">
          <label htmlFor="public-link-url" className="text-[13px] font-medium text-neutral-800">
            Kundenlink
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input id="public-link-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" data-testid="public-link-url" />
            <Button
              icon={copied ? Check : Copy}
              onClick={async () => {
                const ok = await copyToClipboard(url);
                setCopied(ok);
                if (ok) toast.success('Link kopiert');
                else toast.error('Kopieren nicht möglich', 'Bitte markieren und manuell kopieren.');
              }}
            >
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-neutral-600">
            Aus Sicherheitsgründen wird der Link nur jetzt angezeigt. Speichern oder teilen Sie ihn direkt.
            {expiresAt && ` Gültig bis ${formatDateTime(expiresAt)}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Planned reminder dates for a quotation sent today, from the company settings. */
export function plannedReminders(settings: CompanySettingsDto, validUntil: string, today = todayIso()) {
  const items: { label: string; date: string | null; enabled: boolean; note?: string }[] = [
    { label: '1. Erinnerung', enabled: settings.firstReminderEnabled, date: addDaysIso(today, settings.firstReminderAfterDays), note: `${settings.firstReminderAfterDays} Tage nach Versand` },
    { label: '2. Erinnerung', enabled: settings.secondReminderEnabled, date: addDaysIso(today, settings.secondReminderAfterDays), note: `${settings.secondReminderAfterDays} Tage nach Versand` },
    { label: 'Erinnerung vor Ablauf', enabled: settings.expiryReminderEnabled, date: addDaysIso(validUntil, -settings.expiryReminderDaysBefore), note: `${settings.expiryReminderDaysBefore} Tage vor Ablauf` },
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
      toast.success(mode === 'Email' ? 'Angebot versendet' : 'Als versendet markiert', quotation.number);
      if (response.publicUrl) setResult({ publicUrl: response.publicUrl, mode });
      else onOpenChange(false);
    },
  });
  const resendVerification = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () => toast.success('Bestätigungs-E-Mail gesendet', 'Bitte prüfen Sie Ihr Postfach.'),
    onError: (error) => toast.error('Senden fehlgeschlagen', errorMessage(error)),
  });

  const pastValidity = quotation.validUntil < todayIso();

  const submit = () => {
    setRecipientError(null);
    if (mode === 'Email') {
      const parsed = emailSchema.safeParse(recipient);
      if (!parsed.success) {
        setRecipientError(parsed.error.issues[0]?.message ?? 'Bitte gültige E-Mail-Adresse angeben.');
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
        title={result.mode === 'Email' ? 'Angebot versendet' : 'Angebot als versendet markiert'}
        size="lg"
        footer={
          <Button variant="primary" onClick={() => close(false)}>
            Fertig
          </Button>
        }
      >
        <div className="space-y-4">
          <Alert tone="success" icon={MailCheck}>
            {result.mode === 'Email'
              ? 'Die E-Mail wurde zum Versand übergeben. Den Zustellstatus sehen Sie im Reiter „E-Mail-Versand“.'
              : 'Teilen Sie den Kundenlink, damit Ihr Kunde das Angebot online ansehen und annehmen kann.'}
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
      title={resend ? `Angebot ${quotation.number} erneut senden` : `Angebot ${quotation.number} senden`}
      description={`An ${quotation.recipientName}`}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => close(false)} disabled={send.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={send.isPending} disabled={pastValidity} onClick={submit}>
            {mode === 'Email' ? 'Jetzt senden' : 'Als versendet markieren'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {pastValidity && (
          <Alert tone="warning" title="Gültigkeitsdatum liegt in der Vergangenheit">
            Passen Sie „Gültig bis“ an, bevor Sie das Angebot versenden.{' '}
            {quotation.status === 'Draft' && <Link to={`/angebote/${quotation.id}/bearbeiten`}>Angebot bearbeiten</Link>}
          </Alert>
        )}
        {send.isError &&
          (isEmailNotVerified(send.error) ? (
            <Alert
              tone="warning"
              live
              title="E-Mail-Adresse noch nicht bestätigt"
              actions={
                <Button size="sm" loading={resendVerification.isPending} onClick={() => resendVerification.mutate()}>
                  Bestätigungs-E-Mail erneut senden
                </Button>
              }
            >
              {errorMessage(send.error)} Alternativ können Sie das Angebot selbst übermitteln und es hier als versendet markieren.
            </Alert>
          ) : (
            <Alert tone="danger" live>
              {errorMessage(send.error)}
            </Alert>
          ))}

        <RadioCards<SendMode>
          name="send-mode"
          legend="Versandart"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'Email', label: 'Per E-Mail senden', description: 'AngebotPilot sendet die E-Mail mit Kundenlink und optional PDF.' },
            { value: 'Manual', label: 'Ich habe das Angebot selbst übermittelt', description: 'z. B. ausgedruckt, persönlich oder aus Ihrem eigenen E-Mail-Programm.' },
          ]}
        />

        {mode === 'Email' ? (
          <div className="space-y-4">
            <Field label="Empfänger" error={recipientError ?? undefined} required>
              <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Betreff">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Nachricht" hint="Ihre E-Mail-Signatur aus den Einstellungen wird automatisch angefügt.">
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox label="PDF anhängen" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              <Checkbox
                label="Kundenlink einfügen"
                description="Online ansehen und annehmen"
                checked={includeLink}
                onChange={(e) => setIncludeLink(e.target.checked)}
              />
            </div>
          </div>
        ) : (
          <Checkbox
            label="Kundenlink erzeugen"
            description="Damit Ihr Kunde das Angebot online ansehen und annehmen kann. Der Link wird nach dem Speichern einmalig angezeigt."
            checked={includeLink}
            onChange={(e) => setIncludeLink(e.target.checked)}
          />
        )}

        <div className="rounded-lg border border-neutral-200 p-4">
          <Checkbox
            label="Automatisch nachfassen"
            description="Freundliche Erinnerungs-E-Mails an den Kunden, solange er nicht entschieden hat. Sie stoppen automatisch bei Annahme, Ablehnung, Ablauf oder Abmeldung des Kunden."
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
                    <span className="text-neutral-500">in den Einstellungen deaktiviert</span>
                  ) : r.skipped ? (
                    <span className="text-neutral-500">entfällt ({r.note} läge außerhalb der Gültigkeit)</span>
                  ) : (
                    <span>
                      voraussichtlich am {formatDate(r.date)} <span className="text-neutral-500">({r.note})</span>
                    </span>
                  )}
                </li>
              ))}
              <li className="pt-1 text-neutral-500">
                Anpassen unter <Link to="/einstellungen/benachrichtigungen" className="font-medium text-brand-600 hover:underline">Einstellungen → Erinnerungen</Link>.
              </li>
            </ul>
          )}
          {followUps && mode === 'Manual' && !recipient && (
            <p className="mt-2 pl-6.5 text-[13px] text-warning-text">Für Erinnerungen braucht der Kunde eine E-Mail-Adresse.</p>
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
      toast.success(decision === 'accept' ? 'Annahme erfasst' : 'Ablehnung erfasst', quotation.number);
      setNote('');
      onOpenChange(false);
    },
  });
  const late = decision === 'accept' && quotation.status === 'Expired';
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={decision === 'accept' ? (late ? 'Späte Annahme erfassen' : 'Annahme erfassen') : 'Ablehnung erfassen'}
      description={
        decision === 'accept'
          ? 'Erfassen Sie, dass Ihr Kunde das Angebot z. B. telefonisch, per E-Mail oder unterschrieben angenommen hat.'
          : 'Erfassen Sie, dass Ihr Kunde das Angebot abgelehnt hat.'
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant={decision === 'accept' ? 'primary' : 'danger'} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {decision === 'accept' ? 'Annahme speichern' : 'Ablehnung speichern'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {late && <Alert tone="info">Das Angebot ist bereits abgelaufen. Sie können eine nachträgliche Zusage Ihres Kunden trotzdem erfassen.</Alert>}
        {mutation.isError && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <Field label={decision === 'accept' ? 'Notiz (z. B. „telefonisch zugesagt von Herrn Huber“)' : 'Grund / Notiz'} optional>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </Field>
        <p className="text-[13px] text-neutral-500">Offene Erinnerungen werden automatisch gestoppt.</p>
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
      toast.success('Angebot storniert', quotation.number);
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={`Angebot ${quotation.number} stornieren?`}
      description="Das Angebot bleibt archiviert erhalten, kann aber nicht mehr angenommen werden. Ein aktiver Kundenlink zeigt den Status „storniert“, Erinnerungen werden gestoppt."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Stornieren
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
        <Field label="Grund (nur intern)" optional>
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
      toast.success('Auftrag erstellt', `${job.number} · ${job.title}`);
      onOpenChange(false);
      void navigate(`/auftraege/${job.id}`);
    },
  });
  const dateError = start && due && due < start ? 'Fälligkeit liegt vor dem geplanten Start.' : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title="In Auftrag umwandeln"
      description={`Aus dem angenommenen Angebot ${quotation.number} wird ein Auftrag mit Verweis auf Angebot und Kunde.`}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={mutation.isPending} disabled={Boolean(dateError)} onClick={() => mutation.mutate()}>
            Auftrag erstellen
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
        <Field label="Titel" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Beschreibung" optional>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Geplanter Start" optional>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Fällig bis" optional error={dateError}>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Zuständig" optional hint={members.isError ? 'Teamliste nicht verfügbar.' : undefined}>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!members.data}>
              <option value="">Niemand</option>
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
        <Field label="Notizen" optional>
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
      title={quotation.hasActivePublicLink ? 'Kundenlink neu erzeugen' : 'Kundenlink erzeugen'}
      description="Über den Link kann Ihr Kunde das Angebot ohne Anmeldung ansehen, als PDF laden und annehmen oder ablehnen."
      size="lg"
      footer={
        mutation.data ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Fertig
          </Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button variant="primary" icon={Link2} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              {quotation.hasActivePublicLink ? 'Neuen Link erzeugen' : 'Link erzeugen'}
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
            <Alert tone="warning">Der bisherige Link wird dabei ungültig. Kunden, die ihn noch haben, sehen dann einen Hinweis.</Alert>
          )}
          {mutation.isError && (
            <Alert tone="danger" live>
              {errorMessage(mutation.error)}
            </Alert>
          )}
          <p className="text-sm text-neutral-600">Der Link wird aus Sicherheitsgründen nur einmal angezeigt.</p>
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
      toast.success('Vorlage gespeichert', template.name);
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title="Als Vorlage speichern"
      description="Texte und Positionen werden als wiederverwendbare Vorlage gespeichert. Kundendaten werden nicht übernommen."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!name.trim()} onClick={() => mutation.mutate()}>
            Vorlage speichern
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
        <Field label="Name der Vorlage" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Beschreibung" optional>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}
