import {
  ApiError,
  emailSchema,
  paymentMethodSuggestions,
  todayIso,
  type InvoiceDto,
  type SendInvoiceRequest,
  type SendMode,
} from '@angebotpilot/api-contracts';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, FileCheck2, Info, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useCompany, useCompanySettings } from '@/app/company';
import { Button } from '@/components/ui/Button';
import { RadioCards } from '@/components/ui/Choice';
import { Dialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { errorMessage, isEmailNotVerified } from '@/lib/errors';
import { formatDate, formatEur, getDisplayTimeZone } from '@/lib/format';
import { invoiceName, sinceDaysText, useInvalidateInvoice } from './shared';

interface DialogProps {
  invoice: InvoiceDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Field error of a 400 response, e.g. "paidOn". */
function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldErrors[field]?.join(' ') : undefined;
}

/** Where the user can fix an issue problem reported by the server. */
export function problemLink(problem: string, invoice: Pick<InvoiceDto, 'id' | 'customerId'>): { to: string; label: string } {
  if (/Ihrer Firma|Firma\)/.test(problem)) return { to: '/einstellungen/firma', label: 'Firmendaten öffnen' };
  if (/Kunden|des Kunden/.test(problem)) return { to: `/kunden/${invoice.customerId}/bearbeiten`, label: 'Kunden bearbeiten' };
  return { to: `/rechnungen/${invoice.id}/bearbeiten`, label: 'Entwurf bearbeiten' };
}

/** Checklist of what is missing before an invoice can be issued (from InvoiceDto.issueProblems). */
export function IssueProblemList({ invoice, problems }: { invoice: Pick<InvoiceDto, 'id' | 'customerId'>; problems: string[] }) {
  return (
    <ul className="mt-1.5 space-y-1.5" data-testid="issue-problems">
      {problems.map((problem) => {
        const link = problemLink(problem, invoice);
        return (
          <li key={problem} className="flex flex-wrap items-baseline gap-x-2">
            <span>{problem}</span>
            <Link to={link.to} className="inline-flex items-center gap-0.5 whitespace-nowrap">
              {link.label}
              <ArrowRight aria-hidden size={13} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function IssueDialog({ invoice, open, onOpenChange }: DialogProps) {
  const { companyId } = useCompany();
  const settings = useCompanySettings();
  const invalidate = useInvalidateInvoice();
  const mutation = useMutation({
    mutationFn: () => api.invoices.issue(companyId, invoice.id),
    onSuccess: (issued) => {
      invalidate(issued);
      toast.success('Rechnung gestellt', `${issued.number ?? ''} · ${formatEur(issued.totals.grossTotal)}`);
      onOpenChange(false);
    },
  });
  const problems = invoice.issueProblems;
  const prefix = settings.data?.invoicePrefix ?? 'RE';
  const year = invoice.issueDate.slice(0, 4);
  const incomplete = mutation.error instanceof ApiError && mutation.error.code === 'invoice_incomplete';
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
      title="Rechnung stellen?"
      description={`${invoice.recipientName} · ${formatEur(invoice.totals.grossTotal)}`}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={FileCheck2} loading={mutation.isPending} disabled={problems.length > 0} onClick={() => mutation.mutate()}>
            Jetzt Rechnung stellen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <Alert tone={incomplete ? 'warning' : 'danger'} live title={incomplete ? 'Die Rechnung ist noch unvollständig' : undefined}>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        {problems.length > 0 ? (
          <Alert tone="warning" title="Vor dem Stellen noch zu erledigen">
            <IssueProblemList invoice={invoice} problems={problems} />
          </Alert>
        ) : (
          <Alert tone="success" icon={CircleCheck}>
            Alle Pflichtangaben sind vorhanden. Die Rechnung kann gestellt werden.
          </Alert>
        )}
        <ul className="space-y-2.5 text-sm text-neutral-700">
          <li className="flex gap-2.5">
            <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>
              Die Rechnung erhält die nächste fortlaufende Rechnungsnummer (Format <span className="font-medium tabular">{prefix}-{year}-0001</span>).
              Nummern werden lückenlos vergeben.
            </span>
          </li>
          <li className="flex gap-2.5">
            <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0 text-warning-text" />
            <span>
              Danach ist die Rechnung <strong className="font-medium text-neutral-900">festgeschrieben (GoBD)</strong>: Inhalt und Beträge lassen sich nicht
              mehr ändern. Korrekturen sind nur noch über eine Stornorechnung möglich.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Versenden können Sie die Rechnung im nächsten Schritt.</span>
          </li>
        </ul>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-neutral-200 bg-neutral-25 px-4 py-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-500">Rechnungsdatum</dt>
            <dd className="font-medium tabular">{formatDate(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Fällig am</dt>
            <dd className="font-medium tabular">{formatDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Netto</dt>
            <dd className="font-medium tabular">{formatEur(invoice.totals.netTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Brutto</dt>
            <dd className="font-semibold tabular">{formatEur(invoice.totals.grossTotal)}</dd>
          </div>
        </dl>
      </div>
    </Dialog>
  );
}

function VerificationAlert({ error, alternative }: { error: unknown; alternative: string }) {
  const resend = useMutation({
    mutationFn: () => api.auth.resendVerification(),
    onSuccess: () => toast.success('Bestätigungs-E-Mail gesendet', 'Bitte prüfen Sie Ihr Postfach.'),
    onError: (e) => toast.error('Senden fehlgeschlagen', errorMessage(e)),
  });
  if (isEmailNotVerified(error)) {
    return (
      <Alert
        tone="warning"
        live
        title="E-Mail-Adresse noch nicht bestätigt"
        actions={
          <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
            Bestätigungs-E-Mail erneut senden
          </Button>
        }
      >
        Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse. {alternative}
      </Alert>
    );
  }
  return (
    <Alert tone="danger" live>
      {fieldError(error, 'recipientEmail') ?? errorMessage(error)}
    </Alert>
  );
}

export function SendInvoiceDialog({ invoice, open, onOpenChange }: DialogProps) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateInvoice();
  const name = invoiceName(invoice);
  const [mode, setMode] = useState<SendMode>(invoice.recipientEmail ? 'Email' : 'Manual');
  const [recipient, setRecipient] = useState(invoice.recipientEmail ?? '');
  const [subject, setSubject] = useState(`${name}: ${invoice.title}`);
  const [message, setMessage] = useState(
    invoice.kind === 'Cancellation'
      ? `Guten Tag,\n\nanbei erhalten Sie unsere Stornorechnung ${invoice.number ?? ''} zur Rechnung ${invoice.cancelledInvoiceNumber ?? ''}.`
      : `Guten Tag ${invoice.recipientContact ?? invoice.recipientName},\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie unsere Rechnung ${invoice.number ?? ''} über ${formatEur(invoice.totals.grossTotal)}. Bitte begleichen Sie den Betrag bis zum ${formatDate(invoice.dueDate)}.`,
  );
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (body: SendInvoiceRequest) => api.invoices.send(companyId, invoice.id, body),
    onSuccess: (response) => {
      invalidate(response.invoice);
      toast.success(mode === 'Email' ? 'Rechnung versendet' : 'Als versendet markiert', invoice.number ?? undefined);
      onOpenChange(false);
    },
  });

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
      recipientEmail: mode === 'Email' ? recipient.trim() : null,
      subject: mode === 'Email' ? subject.trim() || null : null,
      message: mode === 'Email' ? message.trim() || null : null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (send.isPending) return;
        if (!next) send.reset();
        onOpenChange(next);
      }}
      title={invoice.sentAt ? `${name} erneut senden` : `${name} senden`}
      description={`An ${invoice.recipientName}`}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={send.isPending} onClick={submit}>
            {mode === 'Email' ? 'Jetzt senden' : 'Als versendet markieren'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {send.isError && (
          <VerificationAlert error={send.error} alternative="Alternativ können Sie die Rechnung selbst übermitteln und hier als versendet markieren." />
        )}
        <RadioCards<SendMode>
          name="invoice-send-mode"
          legend="Versandart"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'Email', label: 'Per E-Mail senden', description: 'AngebotPilot sendet die E-Mail mit der Rechnung als PDF im Anhang.' },
            { value: 'Manual', label: 'Anderweitig übermittelt (z. B. Post)', description: 'Sie haben die Rechnung ausgedruckt, persönlich übergeben oder selbst gemailt.' },
          ]}
        />
        {mode === 'Email' ? (
          <div className="space-y-4">
            <Field label="Empfänger" error={recipientError ?? fieldError(send.error, 'recipientEmail')} required>
              <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Betreff">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Nachricht" hint="Ihre E-Mail-Signatur aus den Einstellungen wird automatisch angefügt.">
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Der Versand wird im Verlauf vermerkt. Es wird keine E-Mail verschickt.</p>
        )}
        <Alert tone="info" title="E-Rechnung inklusive">
          Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Ihr Kunde kann sie direkt in seine Buchhaltung übernehmen – das PDF bleibt
          trotzdem ganz normal lesbar.
        </Alert>
      </div>
    </Dialog>
  );
}

export function PaymentDialog({ invoice, open, onOpenChange }: DialogProps) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateInvoice();
  const methodsId = `${useId()}-methods`;
  const today = todayIso(getDisplayTimeZone());
  const [amount, setAmount] = useState(invoice.openAmount);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState('Überweisung');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api.invoices.recordPayment(companyId, invoice.id, {
        amount: Math.round(amount * 100) / 100,
        paidOn,
        method: method.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: (updated) => {
      invalidate(updated);
      toast.success(updated.status === 'Paid' ? 'Rechnung vollständig bezahlt' : 'Zahlung erfasst', `${formatEur(amount)} am ${formatDate(paidOn)}`);
      onOpenChange(false);
    },
  });

  const amountError = !Number.isFinite(amount) || amount <= 0
    ? 'Bitte einen Betrag größer als 0 € angeben.'
    : Math.round(amount * 100) > Math.round(invoice.openAmount * 100)
      ? `Der Betrag übersteigt den offenen Betrag von ${formatEur(invoice.openAmount)}.`
      : undefined;
  const dateError = !paidOn ? 'Bitte Zahlungsdatum angeben.' : paidOn > today ? 'Das Zahlungsdatum darf nicht in der Zukunft liegen.' : undefined;
  const invalid = Boolean(amountError || dateError);
  const full = !amountError && Math.round(amount * 100) === Math.round(invoice.openAmount * 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title="Zahlung erfassen"
      description={`${invoiceName(invoice)} · offen ${formatEur(invoice.openAmount)} von ${formatEur(invoice.totals.grossTotal)}`}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => {
              setTouched(true);
              if (!invalid) mutation.mutate();
            }}
          >
            Zahlung speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && !fieldError(mutation.error, 'amount') && !fieldError(mutation.error, 'paidOn') && (
          <Alert tone="danger" live>
            {errorMessage(mutation.error)}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Betrag"
            required
            error={(touched || Number.isFinite(amount) ? amountError : undefined) ?? fieldError(mutation.error, 'amount')}
            hint={full ? 'Entspricht dem offenen Betrag – die Rechnung gilt danach als bezahlt.' : 'Teilzahlungen sind möglich.'}
          >
            <NumberInput value={amount} onValueChange={setAmount} minFractionDigits={2} suffix="€" align="left" />
          </Field>
          <Field label="Zahlungsdatum" required error={dateError ?? fieldError(mutation.error, 'paidOn')}>
            <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Zahlungsart" optional hint="Vorschlag wählen oder frei eingeben.">
          <Input list={methodsId} value={method} onChange={(e) => setMethod(e.target.value)} maxLength={50} autoComplete="off" />
        </Field>
        <datalist id={methodsId}>
          {paymentMethodSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Field label="Notiz" optional>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="z. B. Verwendungszweck oder Kontoauszug" />
        </Field>
      </div>
    </Dialog>
  );
}

export function ReminderDialog({ invoice, open, onOpenChange }: DialogProps) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateInvoice();
  const [recipient, setRecipient] = useState(invoice.recipientEmail ?? '');
  const [message, setMessage] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.invoices.remind(companyId, invoice.id, { recipientEmail: recipient.trim() || null, message: message.trim() || null }),
    onSuccess: (response) => {
      invalidate(response.invoice);
      toast.success('Zahlungserinnerung versendet', `${invoice.number ?? ''} an ${recipient.trim()}`);
      onOpenChange(false);
    },
  });
  const submit = () => {
    setRecipientError(null);
    const parsed = emailSchema.safeParse(recipient);
    if (!parsed.success) {
      setRecipientError(parsed.error.issues[0]?.message ?? 'Bitte gültige E-Mail-Adresse angeben.');
      return;
    }
    mutation.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
      title="Zahlungserinnerung senden"
      description={`${invoiceName(invoice)} · offen ${formatEur(invoice.openAmount)}${invoice.isOverdue ? ` · seit ${sinceDaysText(invoice.daysOverdue)} überfällig` : ''}`}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            Erinnerung senden
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && <VerificationAlert error={mutation.error} alternative="Danach können Sie Zahlungserinnerungen per E-Mail versenden." />}
        <p className="text-sm text-neutral-600">
          Eine freundliche E-Mail mit Rechnungsnummer, offenem Betrag, Fälligkeit und der Rechnung als PDF im Anhang.
          {invoice.reminderCount > 0 && ` Bisher ${invoice.reminderCount === 1 ? 'eine Erinnerung' : `${invoice.reminderCount} Erinnerungen`} versendet.`}
        </p>
        <Field label="Empfänger" error={recipientError ?? fieldError(mutation.error, 'recipientEmail')} required>
          <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Persönliche Nachricht" optional hint="Wird zusätzlich zum Standardtext eingefügt.">
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
        </Field>
      </div>
    </Dialog>
  );
}

export function CancelInvoiceDialog({ invoice, open, onOpenChange }: DialogProps) {
  const { companyId } = useCompany();
  const invalidate = useInvalidateInvoice();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.invoices.cancel(companyId, invoice.id, { reason: reason.trim() || null }),
    onSuccess: (cancelled) => {
      invalidate(cancelled);
      toast.success('Rechnung storniert', cancelled.cancellationInvoiceNumber ? `Stornorechnung ${cancelled.cancellationInvoiceNumber} wurde erstellt.` : undefined);
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={`${invoiceName(invoice)} stornieren?`}
      description="Es wird eine Stornorechnung mit eigener Rechnungsnummer erstellt, die diese Rechnung in voller Höhe aufhebt."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Stornorechnung erstellen
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
        <p className="text-sm text-neutral-600">
          Die ursprüngliche Rechnung bleibt unverändert erhalten (GoBD) und erhält den Status „Storniert“. Offene Zahlungserinnerungen werden
          gestoppt. Senden Sie die Stornorechnung anschließend an Ihren Kunden.
        </p>
        {invoice.paidAmount > 0 && (
          <Alert tone="warning">
            Es wurden bereits {formatEur(invoice.paidAmount)} gezahlt. Die Zahlungen bleiben erfasst – erstatten oder verrechnen Sie den Betrag mit
            Ihrem Kunden.
          </Alert>
        )}
        <Field label="Grund" optional hint="Erscheint auf der Stornorechnung.">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}
