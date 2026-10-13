import { subscriptionStatusLabel, type PlanDto, type SubscriptionDto, type SubscriptionPlan, type SubscriptionStatus, type Tone } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useCompany } from '@/app/company';
import { Restricted } from '@/components/domain/Common';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DetailList } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { daysUntil, formatDate, formatEur, plural } from '@/lib/format';
import { formatCount, tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { todayIso } from '@angebotpilot/api-contracts';
import { ReadOnlyNotice } from './shared';

const statusTone: Record<SubscriptionStatus, Tone> = { Trialing: 'info', Active: 'success', PastDue: 'warning', Canceled: 'muted', Expired: 'danger' };

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-neutral-700">{label}</span>
        <span className="font-medium text-neutral-900 tabular">
          {formatCount(used)} {limit === null ? tr('(unbegrenzt)', '(unlimited)') : tr(`von ${formatCount(limit)}`, `of ${formatCount(limit)}`)}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100" role="presentation">
          <div className={cx('h-full rounded-full', ratio >= 1 ? 'bg-danger-solid' : ratio >= 0.8 ? 'bg-warning-solid' : 'bg-brand-600')} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, current, onChoose, allowed }: { plan: PlanDto; current: boolean; onChoose: () => void; allowed: boolean }) {
  return (
    <div className={cx('flex flex-col rounded-xl border bg-white p-5', current ? 'border-brand-500 ring-1 ring-brand-500' : 'border-neutral-200')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-neutral-900">{plan.name}</p>
        {current && <Badge tone="info" icon={Check}>
            {tr('Aktueller Tarif', 'Current plan')}
          </Badge>}
      </div>
      <p className="mt-3">
        <span className="text-2xl font-semibold text-neutral-900 tabular">{formatEur(plan.monthlyPriceEur)}</span>
        <span className="text-sm text-neutral-500"> {tr('/ Monat', '/ month')}</span>
      </p>
      <p className="text-xs text-neutral-500">{tr('zzgl. USt.', 'plus VAT')}</p>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm text-neutral-700">
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />
          {plan.maxActiveMembers === 1 ? tr('1 Person', '1 person') : tr(`bis zu ${plan.maxActiveMembers} Personen`, `up to ${plan.maxActiveMembers} people`)}
        </li>
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />
          {plan.maxQuotationsPerMonth === null
            ? tr('Unbegrenzt Angebote', 'Unlimited quotations')
            : tr(`${plan.maxQuotationsPerMonth} Angebote / Monat`, `${formatCount(plan.maxQuotationsPerMonth)} quotations / month`)}
        </li>
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />
          {tr(`${plan.maxEmailsPerDay} E-Mails / Tag`, `${formatCount(plan.maxEmailsPerDay)} emails / day`)}
        </li>
      </ul>
      <Restricted allowed={allowed} hint={tr('Nur für Inhaber:innen und Administrator:innen verfügbar.', 'Only available to owners and admins.')}>
        <Button className="mt-5 w-full" variant={current ? 'secondary' : 'primary'} disabled={current || !allowed} onClick={onChoose}>
          {current ? tr('Gewählt', 'Selected') : tr('Tarif wählen', 'Choose plan')}
        </Button>
      </Restricted>
    </div>
  );
}

function Content({ sub }: { sub: SubscriptionDto }) {
  const { companyId, can } = useCompany();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<PlanDto | null>(null);
  const change = useMutation({
    mutationFn: (plan: SubscriptionPlan) => api.companies.changePlan(companyId, { plan }),
  });
  const currentPlan = sub.availablePlans.find((p) => p.plan === sub.plan);
  const trialDays = sub.trialEndsAt ? daysUntil(sub.trialEndsAt.slice(0, 10), todayIso()) : null;

  return (
    <div className="space-y-6">
      {!sub.providerIsLive && (
        <Alert
          tone="warning"
          icon={FlaskConical}
          title={tr('Testmodus – es findet keine echte Zahlung statt', 'Test mode – no real payment takes place')}
        >
          {tr(
            `Die Zahlungsabwicklung ist noch nicht angebunden (Anbieter: „${sub.provider}“). Ein Tarifwechsel wird sofort simuliert; es werden keine Zahlungsdaten abgefragt und nichts berechnet.`,
            `Payment processing is not connected yet (provider: “${sub.provider}”). A plan change is simulated immediately; no payment details are requested and nothing is charged.`,
          )}
        </Alert>
      )}
      {!sub.hasFullAccess && (
        <Alert tone="danger" title={tr('Eingeschränkter Zugriff', 'Restricted access')}>
          {tr(
            'Ihr Testzeitraum bzw. Abonnement ist nicht aktiv. Bestehende Daten bleiben lesbar; neue Angebote und E-Mails sind erst nach Wahl eines Tarifs wieder möglich.',
            'Your trial or subscription is not active. Existing data stays readable; new quotations and emails are possible again once you choose a plan.',
          )}
        </Alert>
      )}
      <Card>
        <CardHeader
          title={tr('Aktueller Tarif', 'Current plan')}
          actions={<Badge tone={statusTone[sub.status]} size="md">{subscriptionStatusLabel[sub.status]}</Badge>}
        />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <DetailList
            items={[
              { label: tr('Tarif', 'Plan'), value: <span className="font-medium">{sub.planName}</span> },
              ...(sub.trialEndsAt
                ? [
                    {
                      label: tr('Testphase endet', 'Trial ends'),
                      value: `${formatDate(sub.trialEndsAt)}${
                        trialDays !== null && trialDays >= 0
                          ? tr(` (noch ${trialDays} ${trialDays === 1 ? 'Tag' : 'Tage'})`, ` (${plural(trialDays, 'day', 'days')} left)`)
                          : ''
                      }`,
                    },
                  ]
                : []),
              ...(sub.currentPeriodEnd ? [{ label: sub.cancelAtPeriodEnd ? tr('Endet am', 'Ends on') : tr('Nächste Verlängerung', 'Next renewal'), value: formatDate(sub.currentPeriodEnd) }] : []),
              ...(sub.graceUntil ? [{ label: tr('Kulanz bis', 'Grace period until'), value: formatDate(sub.graceUntil) }] : []),
            ]}
          />
          <div className="space-y-4">
            <Usage label={tr('Aktive Teammitglieder', 'Active team members')} used={sub.activeMembers} limit={currentPlan?.maxActiveMembers ?? null} />
            <Usage label={tr('Angebote in diesem Monat', 'Quotations this month')} used={sub.quotationsThisMonth} limit={currentPlan?.maxQuotationsPerMonth ?? null} />
          </div>
        </CardBody>
      </Card>
      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="mb-3 text-[15px] font-semibold text-neutral-900">
          {tr('Tarife', 'Plans')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {sub.availablePlans
            .filter((p) => p.plan !== 'Trial')
            .map((plan) => (
              <PlanCard key={plan.plan} plan={plan} current={plan.plan === sub.plan} allowed={can.manageBilling} onChoose={() => setChoice(plan)} />
            ))}
        </div>
      </section>
      <ConfirmDialog
        open={choice !== null}
        onOpenChange={(open) => !open && setChoice(null)}
        title={tr(`Zu „${choice?.name ?? ''}“ wechseln?`, `Switch to “${choice?.name ?? ''}”?`)}
        description={
          sub.providerIsLive
            ? tr(
                `Sie werden zum Zahlungsanbieter weitergeleitet. ${choice ? formatEur(choice.monthlyPriceEur) : ''} pro Monat zzgl. USt.`,
                `You will be redirected to the payment provider. ${choice ? formatEur(choice.monthlyPriceEur) : ''} per month plus VAT.`,
              )
            : tr(
                'Testmodus: Der Wechsel wird sofort simuliert. Es findet keine Zahlung statt.',
                'Test mode: the change is simulated immediately. No payment takes place.',
              )
        }
        confirmLabel={tr('Tarif wechseln', 'Change plan')}
        onConfirm={async () => {
          if (!choice) return;
          const response = await change.mutateAsync(choice.plan);
          if (response.redirectUrl) {
            window.location.assign(response.redirectUrl);
            return;
          }
          queryClient.setQueryData(qk.subscription(companyId), response.subscription);
          toast.success(tr('Tarif geändert', 'Plan changed'), response.subscription.planName);
        }}
      />
    </div>
  );
}

export default function SubscriptionPage() {
  const { companyId, can } = useCompany();
  const sub = useQuery({ queryKey: qk.subscription(companyId), queryFn: () => api.companies.subscription(companyId) });
  if (sub.isPending) return <PageSkeleton />;
  if (sub.isError) return <ErrorState error={sub.error} onRetry={() => void sub.refetch()} />;
  return (
    <div className="space-y-6">
      {!can.manageBilling && <ReadOnlyNotice>
          {tr('Tarif und Abrechnung können nur Inhaber:innen und Administrator:innen ändern.', 'Only owners and admins can change the plan and billing.')}
        </ReadOnlyNotice>}
      <Content sub={sub.data} />
    </div>
  );
}
