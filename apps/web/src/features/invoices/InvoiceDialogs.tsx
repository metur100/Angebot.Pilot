import {
  ApiError,
  emailSchema,
  getLocale,
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
import { tr } from '@/lib/i18n';
import { invoiceName, sinceDaysText, useInvalidateInvoice } from './shared';

// The prefilled email subject and message go to the (German) customer, so they stay German in both UI languages,
// including the number and date formats.
const eurDe = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
function dateDe(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}
function invoiceNameDe(i: Pick<InvoiceDto, 'number' | 'kind'>): string {
  if (!i.number) return 'Rechnungsentwurf';
  return `${i.kind === 'Cancellation' ? 'Stornorechnung' : 'Rechnung'} ${i.number}`;
}

interface DialogProps {
  invoice: InvoiceDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Field error of a 400 response, e.g. "paidOn". */
function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldErrors[field]?.join(' ') : undefined;
}

/** Where the user can fix an issue problem reported by the server (its texts follow the UI language). */
export function problemLink(problem: string, invoice: Pick<InvoiceDto, 'id' | 'customerId'>): { to: string; label: string } {
  if (/Ihrer Firma|Firma\)|your company|→ Company\)/.test(problem)) return { to: '/einstellungen/firma', label: tr('Firmendaten öffnen', 'Open company details') };
  if (/Kunden|des Kunden|[Cc]ustomer/.test(problem)) return { to: `/kunden/${invoice.customerId}/bearbeiten`, label: tr('Kunden bearbeiten', 'Edit customer') };
  return { to: `/rechnungen/${invoice.id}/bearbeiten`, label: tr('Entwurf bearbeiten', 'Edit draft') };
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
      toast.success(tr('Rechnung gestellt', 'Invoice issued'), `${issued.number ?? ''} · ${formatEur(issued.totals.grossTotal)}`);
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
      title={tr('Rechnung stellen?', 'Issue invoice?')}
      description={`${invoice.recipientName} · ${formatEur(invoice.totals.grossTotal)}`}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" icon={FileCheck2} loading={mutation.isPending} disabled={problems.length > 0} onClick={() => mutation.mutate()}>
            {tr('Jetzt Rechnung stellen', 'Issue invoice now')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <Alert
            tone={incomplete ? 'warning' : 'danger'}
            live
            title={incomplete ? tr('Die Rechnung ist noch unvollständig', 'The invoice is still incomplete') : undefined}
          >
            {errorMessage(mutation.error)}
          </Alert>
        )}
        {problems.length > 0 ? (
          <Alert tone="warning" title={tr('Vor dem Stellen noch zu erledigen', 'To do before issuing')}>
            <IssueProblemList invoice={invoice} problems={problems} />
          </Alert>
        ) : (
          <Alert tone="success" icon={CircleCheck}>
            {tr('Alle Pflichtangaben sind vorhanden. Die Rechnung kann gestellt werden.', 'All mandatory details are present. The invoice can be issued.')}
          </Alert>
        )}
        <ul className="space-y-2.5 text-sm text-neutral-700">
          <li className="flex gap-2.5">
            <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-neutral-400" />
            {getLocale() === 'en' ? (
              <span>
                The invoice receives the next sequential invoice number (format{' '}
                <span className="font-medium tabular">
                  {prefix}-{year}-0001
                </span>
                ). Numbers are assigned without gaps.
              </span>
            ) : (
              <span>
                Die Rechnung erhält die nächste fortlaufende Rechnungsnummer (Format <span className="font-medium tabular">{prefix}-{year}-0001</span>).
                Nummern werden lückenlos vergeben.
              </span>
            )}
          </li>
          <li className="flex gap-2.5">
            <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0 text-warning-text" />
            {getLocale() === 'en' ? (
              <span>
                After that the invoice is <strong className="font-medium text-neutral-900">locked (GoBD)</strong>: its content and amounts can no longer
                be changed. Corrections are only possible with a cancellation invoice.
              </span>
            ) : (
              <span>
                Danach ist die Rechnung <strong className="font-medium text-neutral-900">festgeschrieben (GoBD)</strong>: Inhalt und Beträge lassen sich nicht
                mehr ändern. Korrekturen sind nur noch über eine Stornorechnung möglich.
              </span>
            )}
          </li>
          <li className="flex gap-2.5">
            <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-neutral-400" />
            <span>
              {tr(
                'Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Versenden können Sie die Rechnung im nächsten Schritt.',
                'The PDF contains the e-invoice in ZUGFeRD format (EN 16931). You can send the invoice in the next step.',
              )}
            </span>
          </li>
        </ul>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-neutral-200 bg-neutral-25 px-4 py-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-500">{tr('Rechnungsdatum', 'Invoice date')}</dt>
            <dd className="font-medium tabular">{formatDate(invoice.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">{tr('Fällig am', 'Due date')}</dt>
            <dd className="font-medium tabular">{formatDate(invoice.dueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">{tr('Netto', 'Net')}</dt>
            <dd className="font-medium tabular">{formatEur(invoice.totals.netTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">{tr('Brutto', 'Gross')}</dt>
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
    onSuccess: () => toast.success(tr('Bestätigungs-E-Mail gesendet', 'Confirmation email sent'), tr('Bitte prüfen Sie Ihr Postfach.', 'Please check your inbox.')),
    onError: (e) => toast.error(tr('Senden fehlgeschlagen', 'Sending failed'), errorMessage(e)),
  });
  if (isEmailNotVerified(error)) {
    return (
      <Alert
        tone="warning"
        live
        title={tr('E-Mail-Adresse noch nicht bestätigt', 'Email address not confirmed yet')}
        actions={
          <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>
            {tr('Bestätigungs-E-Mail erneut senden', 'Resend confirmation email')}
          </Button>
        }
      >
        {tr('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.', 'Please confirm your email address first.')} {alternative}
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
  // Customer-facing defaults: German in both UI languages (see eurDe/dateDe above).
  const [subject, setSubject] = useState(`${invoiceNameDe(invoice)}: ${invoice.title}`);
  const [message, setMessage] = useState(
    invoice.kind === 'Cancellation'
      ? `Guten Tag,\n\nanbei erhalten Sie unsere Stornorechnung ${invoice.number ?? ''} zur Rechnung ${invoice.cancelledInvoiceNumber ?? ''}.`
      : `Guten Tag ${invoice.recipientContact ?? invoice.recipientName},\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie unsere Rechnung ${invoice.number ?? ''} über ${eurDe.format(invoice.totals.grossTotal)}. Bitte begleichen Sie den Betrag bis zum ${dateDe(invoice.dueDate)}.`,
  );
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (body: SendInvoiceRequest) => api.invoices.send(companyId, invoice.id, body),
    onSuccess: (response) => {
      invalidate(response.invoice);
      toast.success(mode === 'Email' ? tr('Rechnung versendet', 'Invoice sent') : tr('Als versendet markiert', 'Marked as sent'), invoice.number ?? undefined);
      onOpenChange(false);
    },
  });

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
      title={invoice.sentAt ? tr(`${name} erneut senden`, `Send ${name} again`) : tr(`${name} senden`, `Send ${name}`)}
      description={tr(`An ${invoice.recipientName}`, `To ${invoice.recipientName}`)}
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={send.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={send.isPending} onClick={submit}>
            {mode === 'Email' ? tr('Jetzt senden', 'Send now') : tr('Als versendet markieren', 'Mark as sent')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {send.isError && (
          <VerificationAlert
            error={send.error}
            alternative={tr(
              'Alternativ können Sie die Rechnung selbst übermitteln und hier als versendet markieren.',
              'Alternatively, you can deliver the invoice yourself and mark it as sent here.',
            )}
          />
        )}
        <RadioCards<SendMode>
          name="invoice-send-mode"
          legend={tr('Versandart', 'Delivery method')}
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'Email',
              label: tr('Per E-Mail senden', 'Send by email'),
              description: tr('AngebotPilot sendet die E-Mail mit der Rechnung als PDF im Anhang.', 'AngebotPilot sends the email with the invoice attached as a PDF.'),
            },
            {
              value: 'Manual',
              label: tr('Anderweitig übermittelt (z. B. Post)', 'Delivered another way (e.g. by post)'),
              description: tr(
                'Sie haben die Rechnung ausgedruckt, persönlich übergeben oder selbst gemailt.',
                'You printed the invoice, handed it over in person or emailed it yourself.',
              ),
            },
          ]}
        />
        {mode === 'Email' ? (
          <div className="space-y-4">
            <Field label={tr('Empfänger', 'Recipient')} error={recipientError ?? fieldError(send.error, 'recipientEmail')} required>
              <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
            </Field>
            <Field label={tr('Betreff', 'Subject')}>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </Field>
            <Field
              label={tr('Nachricht', 'Message')}
              hint={tr(
                'Ihre E-Mail-Signatur aus den Einstellungen wird automatisch angefügt.',
                'Your customer receives this email in German. Your email signature from Settings is added automatically.',
              )}
            >
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            {tr('Der Versand wird im Verlauf vermerkt. Es wird keine E-Mail verschickt.', 'The delivery is noted in the history. No email is sent.')}
          </p>
        )}
        <Alert tone="info" title={tr('E-Rechnung inklusive', 'E-invoice included')}>
          {tr(
            'Das PDF enthält die E-Rechnung im ZUGFeRD-Format (EN 16931). Ihr Kunde kann sie direkt in seine Buchhaltung übernehmen – das PDF bleibt trotzdem ganz normal lesbar.',
            'The PDF contains the e-invoice in ZUGFeRD format (EN 16931). Your customer can import it straight into their accounting – the PDF still reads like a normal document.',
          )}
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
  // First suggestion = bank transfer, in the UI language (the method is a free-text note for the user's own records).
  const [method, setMethod] = useState(paymentMethodSuggestions[0] ?? '');
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
      toast.success(
        updated.status === 'Paid' ? tr('Rechnung vollständig bezahlt', 'Invoice paid in full') : tr('Zahlung erfasst', 'Payment recorded'),
        tr(`${formatEur(amount)} am ${formatDate(paidOn)}`, `${formatEur(amount)} on ${formatDate(paidOn)}`),
      );
      onOpenChange(false);
    },
  });

  const amountError = !Number.isFinite(amount) || amount <= 0
    ? tr('Bitte einen Betrag größer als 0 € angeben.', 'Please enter an amount greater than €0.')
    : Math.round(amount * 100) > Math.round(invoice.openAmount * 100)
      ? tr(`Der Betrag übersteigt den offenen Betrag von ${formatEur(invoice.openAmount)}.`, `The amount exceeds the open amount of ${formatEur(invoice.openAmount)}.`)
      : undefined;
  const dateError = !paidOn
    ? tr('Bitte Zahlungsdatum angeben.', 'Please enter the payment date.')
    : paidOn > today
      ? tr('Das Zahlungsdatum darf nicht in der Zukunft liegen.', 'The payment date must not be in the future.')
      : undefined;
  const invalid = Boolean(amountError || dateError);
  const full = !amountError && Math.round(amount * 100) === Math.round(invoice.openAmount * 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={tr('Zahlung erfassen', 'Record payment')}
      description={tr(
        `${invoiceName(invoice)} · offen ${formatEur(invoice.openAmount)} von ${formatEur(invoice.totals.grossTotal)}`,
        `${invoiceName(invoice)} · ${formatEur(invoice.openAmount)} of ${formatEur(invoice.totals.grossTotal)} open`,
      )}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={() => {
              setTouched(true);
              if (!invalid) mutation.mutate();
            }}
          >
            {tr('Zahlung speichern', 'Save payment')}
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
            label={tr('Betrag', 'Amount')}
            required
            error={(touched || Number.isFinite(amount) ? amountError : undefined) ?? fieldError(mutation.error, 'amount')}
            hint={
              full
                ? tr('Entspricht dem offenen Betrag – die Rechnung gilt danach als bezahlt.', 'Matches the open amount – the invoice is then marked as paid.')
                : tr('Teilzahlungen sind möglich.', 'Partial payments are possible.')
            }
          >
            <NumberInput value={amount} onValueChange={setAmount} minFractionDigits={2} suffix="€" align="left" />
          </Field>
          <Field label={tr('Zahlungsdatum', 'Payment date')} required error={dateError ?? fieldError(mutation.error, 'paidOn')}>
            <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label={tr('Zahlungsart', 'Payment method')} optional hint={tr('Vorschlag wählen oder frei eingeben.', 'Choose a suggestion or type your own.')}>
          <Input list={methodsId} value={method} onChange={(e) => setMethod(e.target.value)} maxLength={50} autoComplete="off" />
        </Field>
        <datalist id={methodsId}>
          {paymentMethodSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Field label={tr('Notiz', 'Note')} optional>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder={tr('z. B. Verwendungszweck oder Kontoauszug', 'e.g. payment reference or bank statement')}
          />
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
      toast.success(
        tr('Zahlungserinnerung versendet', 'Payment reminder sent'),
        tr(`${invoice.number ?? ''} an ${recipient.trim()}`, `${invoice.number ?? ''} to ${recipient.trim()}`),
      );
      onOpenChange(false);
    },
  });
  const submit = () => {
    setRecipientError(null);
    const parsed = emailSchema.safeParse(recipient);
    if (!parsed.success) {
      setRecipientError(parsed.error.issues[0]?.message ?? tr('Bitte gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.'));
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
      title={tr('Zahlungserinnerung senden', 'Send payment reminder')}
      description={tr(
        `${invoiceName(invoice)} · offen ${formatEur(invoice.openAmount)}${invoice.isOverdue ? ` · seit ${sinceDaysText(invoice.daysOverdue)} überfällig` : ''}`,
        `${invoiceName(invoice)} · ${formatEur(invoice.openAmount)} open${invoice.isOverdue ? ` · overdue for ${sinceDaysText(invoice.daysOverdue)}` : ''}`,
      )}
      dismissible={false}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {tr('Erinnerung senden', 'Send reminder')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mutation.isError && (
          <VerificationAlert
            error={mutation.error}
            alternative={tr('Danach können Sie Zahlungserinnerungen per E-Mail versenden.', 'Then you can send payment reminders by email.')}
          />
        )}
        <p className="text-sm text-neutral-600">
          {tr(
            'Eine freundliche E-Mail mit Rechnungsnummer, offenem Betrag, Fälligkeit und der Rechnung als PDF im Anhang.',
            'A friendly email with the invoice number, open amount, due date and the invoice attached as a PDF.',
          )}
          {invoice.reminderCount > 0 &&
            tr(
              ` Bisher ${invoice.reminderCount === 1 ? 'eine Erinnerung' : `${invoice.reminderCount} Erinnerungen`} versendet.`,
              ` ${invoice.reminderCount === 1 ? 'One reminder' : `${invoice.reminderCount} reminders`} sent so far.`,
            )}
        </p>
        <Field label={tr('Empfänger', 'Recipient')} error={recipientError ?? fieldError(mutation.error, 'recipientEmail')} required>
          <Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="off" />
        </Field>
        <Field
          label={tr('Persönliche Nachricht', 'Personal message')}
          optional
          hint={tr(
            'Wird zusätzlich zum Standardtext eingefügt.',
            'Added to the standard text. Your customer receives this email in German – consider writing your message in German too.',
          )}
        >
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
      toast.success(
        tr('Rechnung storniert', 'Invoice cancelled'),
        cancelled.cancellationInvoiceNumber
          ? tr(
              `Stornorechnung ${cancelled.cancellationInvoiceNumber} wurde erstellt.`,
              `Cancellation invoice ${cancelled.cancellationInvoiceNumber} has been created.`,
            )
          : undefined,
      );
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title={tr(`${invoiceName(invoice)} stornieren?`, `Cancel ${invoiceName(invoice)}?`)}
      description={tr(
        'Es wird eine Stornorechnung mit eigener Rechnungsnummer erstellt, die diese Rechnung in voller Höhe aufhebt.',
        'A cancellation invoice with its own invoice number is created that reverses this invoice in full.',
      )}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {tr('Abbrechen', 'Back')}
          </Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {tr('Stornorechnung erstellen', 'Create cancellation invoice')}
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
          {tr(
            'Die ursprüngliche Rechnung bleibt unverändert erhalten (GoBD) und erhält den Status „Storniert“. Offene Zahlungserinnerungen werden gestoppt. Senden Sie die Stornorechnung anschließend an Ihren Kunden.',
            'The original invoice is kept unchanged (GoBD) and gets the status “Cancelled”. Pending payment reminders are stopped. Then send the cancellation invoice to your customer.',
          )}
        </p>
        {invoice.paidAmount > 0 && (
          <Alert tone="warning">
            {tr(
              `Es wurden bereits ${formatEur(invoice.paidAmount)} gezahlt. Die Zahlungen bleiben erfasst – erstatten oder verrechnen Sie den Betrag mit Ihrem Kunden.`,
              `${formatEur(invoice.paidAmount)} has already been paid. The payments stay recorded – refund or offset the amount with your customer.`,
            )}
          </Alert>
        )}
        <Field
          label={tr('Grund', 'Reason')}
          optional
          hint={tr('Erscheint auf der Stornorechnung.', 'Appears on the cancellation invoice, which is in German.')}
        >
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}
