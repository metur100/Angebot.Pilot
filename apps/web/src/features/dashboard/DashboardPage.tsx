import { followUpKindLabel, todayIso, type DashboardDto, type InvoiceListItemDto, type QuotationListItemDto } from '@angebotpilot/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlarmClock,
  Banknote,
  BellRing,
  CircleCheck,
  CircleX,
  FilePen,
  FilePlus2,
  Hammer,
  Hourglass,
  Percent,
  Plus,
  ReceiptText,
  Send,
  TrendingUp,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useUser } from '@/app/auth';
import { useCompany } from '@/app/company';
import { notificationTarget } from '@/components/layout/NotificationBell';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input, Select } from '@/components/ui/Input';
import { HelpPopover } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { datePresetLabel, rangeForPreset, type DatePreset } from '@/lib/dateRange';
import { daysUntil, formatDate, formatDateTime, formatEur, formatRelative, plural } from '@/lib/format';
import { currentIntlLocale, tr } from '@/lib/i18n';
import { useListParams } from '@/lib/listParams';
import { qk } from '@/lib/queryKeys';

function formatPercentValue(value: number) {
  return new Intl.NumberFormat(currentIntlLocale(), { maximumFractionDigits: 1 }).format(value);
}

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 11 ? tr('Guten Morgen', 'Good morning') : hour < 18 ? tr('Guten Tag', 'Good afternoon') : tr('Guten Abend', 'Good evening');
}

interface KpiProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  to?: string;
  help?: ReactNode;
  tone?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral';
  /** Colours the value itself, e.g. overdue amounts. */
  valueTone?: 'danger';
}

const toneClass = {
  brand: 'bg-brand-50 text-brand-600 dark:text-brand-700',
  success: 'bg-success-bg text-success-text',
  danger: 'bg-danger-bg text-danger-text',
  warning: 'bg-warning-bg text-warning-text',
  neutral: 'bg-neutral-100 text-neutral-600',
};

function Kpi({ label, value, icon: Icon, hint, to, help, tone = 'neutral', valueTone }: KpiProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-neutral-600">{label}</p>
        <span className={cx('flex size-7 items-center justify-center rounded-md', toneClass[tone])}>
          <Icon aria-hidden size={15} />
        </span>
      </div>
      <p className={cx('mt-2 text-2xl leading-8 font-semibold tracking-[-0.01em] tabular', valueTone === 'danger' ? 'text-danger-text' : 'text-neutral-900')}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </>
  );
  return (
    <div className="relative rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-colors has-[a:hover]:border-neutral-300">
      {to ? (
        <Link to={to} className="block rounded after:absolute after:inset-0 after:content-['']">
          {body}
        </Link>
      ) : (
        body
      )}
      {help && <div className="absolute right-11 top-3.5 z-10">{help}</div>}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
    </div>
  );
}

function expiryText(days: number, validUntil: string) {
  if (days < 0) return tr(`abgelaufen am ${formatDate(validUntil)}`, `expired on ${formatDate(validUntil)}`);
  if (days === 0) return tr('läuft heute ab', 'expires today');
  return tr(`noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`, `${days} ${days === 1 ? 'day' : 'days'} left`);
}

function QuotationRows({ items, empty, showExpiry }: { items: QuotationListItemDto[]; empty: string; showExpiry?: boolean }) {
  const today = todayIso();
  if (items.length === 0) return <p className="px-5 py-6 text-sm text-neutral-500">{empty}</p>;
  return (
    <ul className="divide-y divide-neutral-100">
      {items.map((q) => {
        const days = daysUntil(q.validUntil, today);
        return (
          <li key={q.id}>
            <Link to={`/angebote/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-25">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{q.customerName}</p>
                <p className="truncate text-[13px] text-neutral-500">
                  {q.number} · {q.title}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-neutral-900 tabular">{formatEur(q.grossTotal)}</p>
                {showExpiry ? (
                  <p className={cx('text-xs', days < 0 ? 'text-danger-text' : days <= 3 ? 'text-warning-text' : 'text-neutral-500')}>
                    {expiryText(days, q.validUntil)}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500">
                    {q.sentAt ? tr(`versendet ${formatRelative(q.sentAt)}`, `sent ${formatRelative(q.sentAt)}`) : formatDate(q.issueDate)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function GettingStarted({ hasCustomers, hasQuotations, hasSent }: { hasCustomers: boolean; hasQuotations: boolean; hasSent: boolean }) {
  const steps = [
    {
      done: hasCustomers,
      title: tr('Kunden anlegen', 'Add a customer'),
      text: tr('Firma oder Privatperson mit Adresse und E-Mail.', 'Company or private person with address and email.'),
      to: '/kunden/neu',
      cta: tr('Kunden anlegen', 'Add customer'),
      icon: UserPlus,
    },
    {
      done: hasQuotations,
      title: tr('Angebot erstellen', 'Create a quotation'),
      text: tr('Positionen erfassen – Summen und USt. rechnet AngebotPilot.', 'Enter line items – AngebotPilot calculates totals and VAT.'),
      to: '/angebote/neu',
      cta: tr('Angebot erstellen', 'Create quotation'),
      icon: FilePlus2,
    },
    {
      done: hasSent,
      title: tr('Angebot versenden', 'Send the quotation'),
      text: tr('Per E-Mail mit Kundenlink – Ihr Kunde kann online annehmen.', 'By email with a customer link – your customer can accept online.'),
      to: '/angebote?status=Draft',
      cta: tr('Entwurf öffnen', 'Open draft'),
      icon: Send,
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-neutral-100 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
        <h2 className="text-[15px] font-semibold text-neutral-900">
          {tr('Willkommen bei AngebotPilot – in drei Schritten zum ersten Angebot', 'Welcome to AngebotPilot – your first quotation in three steps')}
        </h2>
        <p className="mt-0.5 text-[13px] text-neutral-600">
          {tr('Sobald Sie Angebote versenden, erscheinen hier Ihre Kennzahlen.', 'Your key figures will appear here once you send quotations.')}
        </p>
      </div>
      <ol className="grid divide-y divide-neutral-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.to} className="flex gap-3 px-5 py-4">
            <span
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                step.done ? 'bg-success-bg text-success-text' : index === next ? 'bg-brand-600 text-on-brand' : 'bg-neutral-100 text-neutral-500',
              )}
            >
              {step.done ? <CircleCheck aria-hidden size={16} /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">
                {step.title}
                {step.done && <span className="ml-1.5 text-xs font-normal text-success-text">{tr('erledigt', 'done')}</span>}
              </p>
              <p className="mt-0.5 text-[13px] text-neutral-500">{step.text}</p>
              {!step.done && (
                <ButtonLink to={step.to} size="sm" variant={index === next ? 'primary' : 'secondary'} icon={step.icon} className="mt-3">
                  {step.cta}
                </ButtonLink>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Kpis({ data }: { data: DashboardDto }) {
  const conversion = data.conversionRatePercent === null ? '–' : `${formatPercentValue(data.conversionRatePercent)} %`;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi label={tr('Entwürfe', 'Drafts')} value={data.draftCount} icon={FilePen} to="/angebote?status=Draft" />
      <Kpi label={tr('Offen / versendet', 'Open / sent')} value={data.sentCount} icon={Send} tone="brand" to="/angebote?status=Sent" />
      <Kpi label={tr('Angenommen', 'Accepted')} value={data.acceptedCount} icon={CircleCheck} tone="success" to="/angebote?status=Accepted" />
      <Kpi label={tr('Abgelehnt', 'Declined')} value={data.rejectedCount} icon={CircleX} tone="danger" to="/angebote?status=Rejected" />
      <Kpi
        label={tr('Ablaufend / abgelaufen', 'Expiring / expired')}
        value={`${data.expiringSoonCount} / ${data.expiredCount}`}
        icon={Hourglass}
        tone="warning"
        hint={tr('in 7 Tagen / im Zeitraum', 'in 7 days / in period')}
        to="/angebote?status=Sent&sort=validUntil"
      />
      <Kpi
        label={tr('Angebotsvolumen netto', 'Quoted value (net)')}
        value={formatEur(data.quotedValueNet)}
        icon={Wallet}
        hint={tr('versendete Angebote', 'sent quotations')}
      />
      <Kpi label={tr('Angenommen netto', 'Accepted (net)')} value={formatEur(data.acceptedValueNet)} icon={TrendingUp} tone="success" />
      <Kpi
        label={tr('Abschlussquote', 'Conversion rate')}
        value={conversion}
        icon={Percent}
        tone="brand"
        hint={data.conversionRatePercent === null ? tr('noch keine Entscheidungen im Zeitraum', 'no decisions in this period yet') : undefined}
        help={
          <HelpPopover label={tr('Wie wird die Abschlussquote berechnet?', 'How is the conversion rate calculated?')}>
            <p>{data.conversionRateDefinition}</p>
            {data.conversionRatePercent === null && (
              <p className="mt-2 text-neutral-500">
                {tr('Ohne entschiedene Angebote gibt es noch keine Quote.', 'There is no rate until quotations have been decided.')}
              </p>
            )}
          </HelpPopover>
        }
      />
      <Kpi label={tr('Fällige Erinnerungen', 'Reminders due')} value={data.followUpsDueCount} icon={BellRing} />
      <Kpi label={tr('Offene Aufträge', 'Open jobs')} value={data.openJobsCount} icon={Hammer} to="/auftraege?status=Open,InProgress" />
    </div>
  );
}

function InvoiceKpis({ data }: { data: DashboardDto }) {
  const overdue = data.overdueInvoicesCount > 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Kpi
        label={tr('Offene Rechnungen', 'Open invoices')}
        value={formatEur(data.openInvoicesAmount)}
        icon={ReceiptText}
        tone="brand"
        hint={
          data.openInvoicesCount === 0
            ? tr('keine offenen Rechnungen', 'no open invoices')
            : tr(`${plural(data.openInvoicesCount, 'Rechnung', 'Rechnungen')} offen`, `${plural(data.openInvoicesCount, 'invoice', 'invoices')} open`)
        }
        to="/rechnungen?status=Issued,PartiallyPaid"
      />
      <Kpi
        label={tr('Überfällig', 'Overdue')}
        value={formatEur(data.overdueInvoicesAmount)}
        icon={AlarmClock}
        tone={overdue ? 'danger' : 'neutral'}
        valueTone={overdue ? 'danger' : undefined}
        hint={
          overdue
            ? tr(`${plural(data.overdueInvoicesCount, 'Rechnung', 'Rechnungen')} überfällig`, `${plural(data.overdueInvoicesCount, 'invoice', 'invoices')} overdue`)
            : tr('nichts überfällig', 'nothing overdue')
        }
        to="/rechnungen?ueberfaellig=1"
      />
      <Kpi
        label={tr('Zahlungseingang', 'Payments received')}
        value={formatEur(data.paymentsReceived)}
        icon={Banknote}
        tone="success"
        hint={tr('Zahlungen im Zeitraum', 'payments in period')}
      />
      <Kpi
        label={tr('Abgerechnet netto', 'Invoiced (net)')}
        value={formatEur(data.invoicedNet)}
        icon={TrendingUp}
        hint={tr('gestellte Rechnungen im Zeitraum', 'invoices issued in period')}
        help={
          <HelpPopover label={tr('Was zählt als abgerechnet?', 'What counts as invoiced?')}>
            {tr(
              'Nettobetrag aller im Zeitraum gestellten Rechnungen (nach Rechnungsdatum). Stornorechnungen werden abgezogen, Entwürfe zählen nicht.',
              'Net amount of all invoices issued in the period (by invoice date). Cancellation invoices are deducted, drafts do not count.',
            )}
          </HelpPopover>
        }
      />
    </div>
  );
}

function OverdueInvoices({ items }: { items: InvoiceListItemDto[] }) {
  if (items.length === 0)
    return (
      <p className="px-5 py-6 text-sm text-neutral-500">
        {tr('Keine überfälligen Rechnungen – alles im Zahlungsziel.', 'No overdue invoices – everything is within payment terms.')}
      </p>
    );
  return (
    <ul className="divide-y divide-neutral-100">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`/rechnungen/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-25">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">{i.customerName}</p>
              <p className="truncate text-[13px] text-neutral-500">
                {i.number ?? tr('Entwurf', 'Draft')} · {i.title}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium text-neutral-900 tabular">{formatEur(i.openAmount)}</p>
              <p className="text-xs text-danger-text">
                {tr(
                  `${i.daysOverdue} ${i.daysOverdue === 1 ? 'Tag' : 'Tage'} überfällig`,
                  `${i.daysOverdue} ${i.daysOverdue === 1 ? 'day' : 'days'} overdue`,
                )}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const { companyId, membership } = useCompany();
  const [params, update] = useListParams({ range: 'month', from: '', to: '' });
  const preset = (Object.keys(datePresetLabel) as DatePreset[]).includes(params.range as DatePreset) ? (params.range as DatePreset) : 'month';
  const range = preset === 'custom' ? { from: params.from || undefined, to: params.to || undefined } : rangeForPreset(preset);
  const dashboard = useQuery({
    queryKey: qk.dashboard(companyId, range),
    queryFn: () => api.companies.dashboard(companyId, range),
    placeholderData: keepPreviousData,
  });
  // Getting-started detection is independent of the date range.
  const customers = useQuery({ queryKey: qk.customerList(companyId, { pageSize: 1 }), queryFn: () => api.customers.list(companyId, { pageSize: 1, status: 'all' }) });
  const quotations = useQuery({ queryKey: qk.quotationList(companyId, { pageSize: 1 }), queryFn: () => api.quotations.list(companyId, { pageSize: 1 }) });
  const sent = useQuery({
    queryKey: qk.quotationList(companyId, { pageSize: 1, status: ['Sent', 'Accepted', 'Rejected', 'Expired'] }),
    queryFn: () => api.quotations.list(companyId, { pageSize: 1, status: ['Sent', 'Accepted', 'Rejected', 'Expired'] }),
  });
  const onboarding = customers.data && quotations.data && sent.data && sent.data.totalCount === 0;
  const firstName = user.displayName.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        documentTitle="Dashboard"
        description={tr(`Überblick für ${membership.companyName}`, `Overview for ${membership.companyName}`)}
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dashboard-range" className="sr-only">
                {tr('Zeitraum', 'Period')}
              </label>
              <Select
                id="dashboard-range"
                inputSize="sm"
                className="w-[180px]"
                value={preset}
                onChange={(e) => {
                  const next = e.target.value as DatePreset;
                  if (next === 'custom') {
                    const current = rangeForPreset(preset === 'custom' ? 'month' : preset);
                    update({ range: 'custom', from: current.from, to: current.to });
                  } else update({ range: next, from: '', to: '' });
                }}
              >
                {(Object.keys(datePresetLabel) as DatePreset[]).map((p) => (
                  <option key={p} value={p}>
                    {datePresetLabel[p]}
                  </option>
                ))}
              </Select>
              {preset === 'custom' && (
                <>
                  <Input
                    type="date"
                    inputSize="sm"
                    aria-label={tr('Von', 'From')}
                    className="w-[150px]"
                    value={params.from}
                    onChange={(e) => update({ from: e.target.value })}
                  />
                  <Input
                    type="date"
                    inputSize="sm"
                    aria-label={tr('Bis', 'To')}
                    className="w-[150px]"
                    value={params.to}
                    onChange={(e) => update({ to: e.target.value })}
                  />
                </>
              )}
            </div>
            <ButtonLink to="/angebote/neu" variant="primary" icon={Plus} size="sm" className="sm:hidden">
              {tr('Angebot', 'Quotation')}
            </ButtonLink>
          </>
        }
      />

      {onboarding && (
        <GettingStarted hasCustomers={customers.data.totalCount > 0} hasQuotations={quotations.data.totalCount > 0} hasSent={false} />
      )}

      {dashboard.isError ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : !dashboard.data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <KpiSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={cx('space-y-6', dashboard.isPlaceholderData && 'opacity-60 transition-opacity')}>
          <section aria-label={tr('Kennzahlen', 'Key figures')}>
            <p className="mb-2 text-xs text-neutral-600">
              {tr(
                `Zeitraum: ${formatDate(dashboard.data.from)} – ${formatDate(dashboard.data.to)} (nach Angebotsdatum)`,
                `Period: ${formatDate(dashboard.data.from)} – ${formatDate(dashboard.data.to)} (by quotation date)`,
              )}
            </p>
            <Kpis data={dashboard.data} />
          </section>

          <section aria-labelledby="dashboard-invoices" className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <div>
              <h2 id="dashboard-invoices" className="mb-2 text-xs text-neutral-600">
                {tr(
                  'Rechnungen: offen und überfällig zum heutigen Stand, Zahlungen und Abrechnung im Zeitraum',
                  'Invoices: open and overdue as of today, payments and invoicing in the period',
                )}
              </h2>
              <InvoiceKpis data={dashboard.data} />
            </div>
            <Card className="self-start">
              <CardHeader
                title={tr('Überfällige Rechnungen', 'Overdue invoices')}
                description={tr('Zahlungsziel überschritten – Zeit für eine Erinnerung', 'Payment terms exceeded – time for a reminder')}
                actions={
                  <Link to="/rechnungen?ueberfaellig=1" className="text-[13px] font-medium text-brand-600 dark:text-brand-700 hover:underline">
                    {tr('Alle', 'All')}
                  </Link>
                }
              />
              <OverdueInvoices items={dashboard.data.overdueInvoices} />
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader
                title={tr('Warten auf Entscheidung', 'Awaiting decision')}
                description={tr('Versendete Angebote ohne Antwort', 'Sent quotations without a response')}
                actions={
                  <Link to="/angebote?status=Sent" className="text-[13px] font-medium text-brand-600 dark:text-brand-700 hover:underline">
                    {tr('Alle', 'All')}
                  </Link>
                }
              />
              <QuotationRows items={dashboard.data.awaitingDecision} empty={tr('Keine offenen Angebote – alles entschieden.', 'No open quotations – all decided.')} />
            </Card>
            <Card>
              <CardHeader
                title={tr('Läuft bald ab', 'Expiring soon')}
                description={tr('Gültigkeit endet in den nächsten Tagen', 'Validity ends in the next few days')}
              />
              <QuotationRows items={dashboard.data.expiringSoon} empty={tr('Keine Angebote laufen in Kürze ab.', 'No quotations expire soon.')} showExpiry />
            </Card>
            <Card>
              <CardHeader
                title={tr('Anstehende Erinnerungen', 'Upcoming reminders')}
                description={tr('Automatische Nachfass-E-Mails', 'Automatic follow-up emails')}
              />
              {dashboard.data.upcomingFollowUps.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500">{tr('Keine Erinnerungen geplant.', 'No reminders scheduled.')}</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {dashboard.data.upcomingFollowUps.map((f) => (
                    <li key={`${f.quotationId}-${f.kind}-${f.dueAt}`}>
                      <Link to={`/angebote/${f.quotationId}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-25">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-900">{f.customerName}</p>
                          <p className="text-[13px] text-neutral-500">
                            {f.quotationNumber} · {followUpKindLabel[f.kind]}
                          </p>
                        </div>
                        <p className="shrink-0 text-[13px] text-neutral-600">{formatDateTime(f.dueAt)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={tr('Letzte Aktivitäten', 'Recent activity')} />
              {dashboard.data.recentActivity.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500">{tr('Noch keine Aktivitäten.', 'No activity yet.')}</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {dashboard.data.recentActivity.map((a) => {
                    const target = notificationTarget(a);
                    const content = (
                      <>
                        <Activity aria-hidden size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-neutral-800">{a.summary}</p>
                          <p className="text-xs text-neutral-500">
                            {a.actorName ? `${a.actorName} · ` : ''}
                            <span title={formatDateTime(a.occurredAt)}>{formatRelative(a.occurredAt)}</span>
                          </p>
                        </div>
                      </>
                    );
                    return (
                      <li key={a.id}>
                        {target ? (
                          <Link to={target} className="flex gap-3 px-5 py-3 hover:bg-neutral-25">
                            {content}
                          </Link>
                        ) : (
                          <div className="flex gap-3 px-5 py-3">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
