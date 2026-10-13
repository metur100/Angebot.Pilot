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
import { useListParams } from '@/lib/listParams';
import { qk } from '@/lib/queryKeys';

const percentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
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
  brand: 'bg-brand-50 text-brand-600',
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
                    {days < 0 ? `abgelaufen am ${formatDate(q.validUntil)}` : days === 0 ? 'läuft heute ab' : `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500">{q.sentAt ? `versendet ${formatRelative(q.sentAt)}` : formatDate(q.issueDate)}</p>
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
    { done: hasCustomers, title: 'Kunden anlegen', text: 'Firma oder Privatperson mit Adresse und E-Mail.', to: '/kunden/neu', cta: 'Kunden anlegen', icon: UserPlus },
    { done: hasQuotations, title: 'Angebot erstellen', text: 'Positionen erfassen – Summen und USt. rechnet AngebotPilot.', to: '/angebote/neu', cta: 'Angebot erstellen', icon: FilePlus2 },
    { done: hasSent, title: 'Angebot versenden', text: 'Per E-Mail mit Kundenlink – Ihr Kunde kann online annehmen.', to: '/angebote?status=Draft', cta: 'Entwurf öffnen', icon: Send },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-neutral-100 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
        <h2 className="text-[15px] font-semibold text-neutral-900">Willkommen bei AngebotPilot – in drei Schritten zum ersten Angebot</h2>
        <p className="mt-0.5 text-[13px] text-neutral-600">Sobald Sie Angebote versenden, erscheinen hier Ihre Kennzahlen.</p>
      </div>
      <ol className="grid divide-y divide-neutral-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 px-5 py-4">
            <span
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                step.done ? 'bg-success-bg text-success-text' : index === next ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-500',
              )}
            >
              {step.done ? <CircleCheck aria-hidden size={16} /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">
                {step.title}
                {step.done && <span className="ml-1.5 text-xs font-normal text-success-text">erledigt</span>}
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
  const conversion =
    data.conversionRatePercent === null ? '–' : `${percentFormat.format(data.conversionRatePercent)} %`;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi label="Entwürfe" value={data.draftCount} icon={FilePen} to="/angebote?status=Draft" />
      <Kpi label="Offen / versendet" value={data.sentCount} icon={Send} tone="brand" to="/angebote?status=Sent" />
      <Kpi label="Angenommen" value={data.acceptedCount} icon={CircleCheck} tone="success" to="/angebote?status=Accepted" />
      <Kpi label="Abgelehnt" value={data.rejectedCount} icon={CircleX} tone="danger" to="/angebote?status=Rejected" />
      <Kpi
        label="Ablaufend / abgelaufen"
        value={`${data.expiringSoonCount} / ${data.expiredCount}`}
        icon={Hourglass}
        tone="warning"
        hint="in 7 Tagen / im Zeitraum"
        to="/angebote?status=Sent&sort=validUntil"
      />
      <Kpi label="Angebotsvolumen netto" value={formatEur(data.quotedValueNet)} icon={Wallet} hint="versendete Angebote" />
      <Kpi label="Angenommen netto" value={formatEur(data.acceptedValueNet)} icon={TrendingUp} tone="success" />
      <Kpi
        label="Abschlussquote"
        value={conversion}
        icon={Percent}
        tone="brand"
        hint={data.conversionRatePercent === null ? 'noch keine Entscheidungen im Zeitraum' : undefined}
        help={
          <HelpPopover label="Wie wird die Abschlussquote berechnet?">
            <p>{data.conversionRateDefinition}</p>
            {data.conversionRatePercent === null && <p className="mt-2 text-neutral-500">Ohne entschiedene Angebote gibt es noch keine Quote.</p>}
          </HelpPopover>
        }
      />
      <Kpi label="Fällige Erinnerungen" value={data.followUpsDueCount} icon={BellRing} />
      <Kpi label="Offene Aufträge" value={data.openJobsCount} icon={Hammer} to="/auftraege?status=Open,InProgress" />
    </div>
  );
}

function InvoiceKpis({ data }: { data: DashboardDto }) {
  const overdue = data.overdueInvoicesCount > 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Kpi
        label="Offene Rechnungen"
        value={formatEur(data.openInvoicesAmount)}
        icon={ReceiptText}
        tone="brand"
        hint={data.openInvoicesCount === 0 ? 'keine offenen Rechnungen' : `${plural(data.openInvoicesCount, 'Rechnung', 'Rechnungen')} offen`}
        to="/rechnungen?status=Issued,PartiallyPaid"
      />
      <Kpi
        label="Überfällig"
        value={formatEur(data.overdueInvoicesAmount)}
        icon={AlarmClock}
        tone={overdue ? 'danger' : 'neutral'}
        valueTone={overdue ? 'danger' : undefined}
        hint={overdue ? `${plural(data.overdueInvoicesCount, 'Rechnung', 'Rechnungen')} überfällig` : 'nichts überfällig'}
        to="/rechnungen?ueberfaellig=1"
      />
      <Kpi label="Zahlungseingang" value={formatEur(data.paymentsReceived)} icon={Banknote} tone="success" hint="Zahlungen im Zeitraum" />
      <Kpi
        label="Abgerechnet netto"
        value={formatEur(data.invoicedNet)}
        icon={TrendingUp}
        hint="gestellte Rechnungen im Zeitraum"
        help={
          <HelpPopover label="Was zählt als abgerechnet?">
            Nettobetrag aller im Zeitraum gestellten Rechnungen (nach Rechnungsdatum). Stornorechnungen werden abgezogen, Entwürfe zählen nicht.
          </HelpPopover>
        }
      />
    </div>
  );
}

function OverdueInvoices({ items }: { items: InvoiceListItemDto[] }) {
  if (items.length === 0) return <p className="px-5 py-6 text-sm text-neutral-500">Keine überfälligen Rechnungen – alles im Zahlungsziel.</p>;
  return (
    <ul className="divide-y divide-neutral-100">
      {items.map((i) => (
        <li key={i.id}>
          <Link to={`/rechnungen/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-25">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">{i.customerName}</p>
              <p className="truncate text-[13px] text-neutral-500">
                {i.number ?? 'Entwurf'} · {i.title}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium text-neutral-900 tabular">{formatEur(i.openAmount)}</p>
              <p className="text-xs text-danger-text">
                {i.daysOverdue} {i.daysOverdue === 1 ? 'Tag' : 'Tage'} überfällig
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
        description={`Überblick für ${membership.companyName}`}
        actions={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dashboard-range" className="sr-only">
                Zeitraum
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
                  <Input type="date" inputSize="sm" aria-label="Von" className="w-[150px]" value={params.from} onChange={(e) => update({ from: e.target.value })} />
                  <Input type="date" inputSize="sm" aria-label="Bis" className="w-[150px]" value={params.to} onChange={(e) => update({ to: e.target.value })} />
                </>
              )}
            </div>
            <ButtonLink to="/angebote/neu" variant="primary" icon={Plus} size="sm" className="sm:hidden">
              Angebot
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
          <section aria-label="Kennzahlen">
            <p className="mb-2 text-xs text-neutral-600">
              Zeitraum: {formatDate(dashboard.data.from)} – {formatDate(dashboard.data.to)} (nach Angebotsdatum)
            </p>
            <Kpis data={dashboard.data} />
          </section>

          <section aria-labelledby="dashboard-invoices" className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <div>
              <h2 id="dashboard-invoices" className="mb-2 text-xs text-neutral-600">
                Rechnungen: offen und überfällig zum heutigen Stand, Zahlungen und Abrechnung im Zeitraum
              </h2>
              <InvoiceKpis data={dashboard.data} />
            </div>
            <Card className="self-start">
              <CardHeader
                title="Überfällige Rechnungen"
                description="Zahlungsziel überschritten – Zeit für eine Erinnerung"
                actions={
                  <Link to="/rechnungen?ueberfaellig=1" className="text-[13px] font-medium text-brand-600 hover:underline">
                    Alle
                  </Link>
                }
              />
              <OverdueInvoices items={dashboard.data.overdueInvoices} />
            </Card>
          </section>

          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader title="Warten auf Entscheidung" description="Versendete Angebote ohne Antwort" actions={<Link to="/angebote?status=Sent" className="text-[13px] font-medium text-brand-600 hover:underline">Alle</Link>} />
              <QuotationRows items={dashboard.data.awaitingDecision} empty="Keine offenen Angebote – alles entschieden." />
            </Card>
            <Card>
              <CardHeader title="Läuft bald ab" description="Gültigkeit endet in den nächsten Tagen" />
              <QuotationRows items={dashboard.data.expiringSoon} empty="Keine Angebote laufen in Kürze ab." showExpiry />
            </Card>
            <Card>
              <CardHeader title="Anstehende Erinnerungen" description="Automatische Nachfass-E-Mails" />
              {dashboard.data.upcomingFollowUps.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500">Keine Erinnerungen geplant.</p>
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
              <CardHeader title="Letzte Aktivitäten" />
              {dashboard.data.recentActivity.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500">Noch keine Aktivitäten.</p>
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
