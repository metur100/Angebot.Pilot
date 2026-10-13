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
import { daysUntil, formatDate, formatEur } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';
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
          {used.toLocaleString('de-DE')} {limit === null ? '(unbegrenzt)' : `von ${limit.toLocaleString('de-DE')}`}
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
        {current && <Badge tone="info" icon={Check}>Aktueller Tarif</Badge>}
      </div>
      <p className="mt-3">
        <span className="text-2xl font-semibold text-neutral-900 tabular">{formatEur(plan.monthlyPriceEur)}</span>
        <span className="text-sm text-neutral-500"> / Monat</span>
      </p>
      <p className="text-xs text-neutral-500">zzgl. USt.</p>
      <ul className="mt-4 flex-1 space-y-1.5 text-sm text-neutral-700">
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />{plan.maxActiveMembers === 1 ? '1 Person' : `bis zu ${plan.maxActiveMembers} Personen`}</li>
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />{plan.maxQuotationsPerMonth === null ? 'Unbegrenzt Angebote' : `${plan.maxQuotationsPerMonth} Angebote / Monat`}</li>
        <li className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success-text" />{`${plan.maxEmailsPerDay} E-Mails / Tag`}</li>
      </ul>
      <Restricted allowed={allowed} hint={ADMIN_ONLY_HINT}>
        <Button className="mt-5 w-full" variant={current ? 'secondary' : 'primary'} disabled={current || !allowed} onClick={onChoose}>
          {current ? 'Gewählt' : 'Tarif wählen'}
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
        <Alert tone="warning" icon={FlaskConical} title="Testmodus – es findet keine echte Zahlung statt">
          Die Zahlungsabwicklung ist noch nicht angebunden (Anbieter: „{sub.provider}“). Ein Tarifwechsel wird sofort simuliert; es werden keine
          Zahlungsdaten abgefragt und nichts berechnet.
        </Alert>
      )}
      {!sub.hasFullAccess && (
        <Alert tone="danger" title="Eingeschränkter Zugriff">
          Ihr Testzeitraum bzw. Abonnement ist nicht aktiv. Bestehende Daten bleiben lesbar; neue Angebote und E-Mails sind erst nach Wahl eines Tarifs
          wieder möglich.
        </Alert>
      )}
      <Card>
        <CardHeader title="Aktueller Tarif" actions={<Badge tone={statusTone[sub.status]} size="md">{subscriptionStatusLabel[sub.status]}</Badge>} />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <DetailList
            items={[
              { label: 'Tarif', value: <span className="font-medium">{sub.planName}</span> },
              ...(sub.trialEndsAt
                ? [{ label: 'Testphase endet', value: `${formatDate(sub.trialEndsAt)}${trialDays !== null && trialDays >= 0 ? ` (noch ${trialDays} ${trialDays === 1 ? 'Tag' : 'Tage'})` : ''}` }]
                : []),
              ...(sub.currentPeriodEnd ? [{ label: sub.cancelAtPeriodEnd ? 'Endet am' : 'Nächste Verlängerung', value: formatDate(sub.currentPeriodEnd) }] : []),
              ...(sub.graceUntil ? [{ label: 'Kulanz bis', value: formatDate(sub.graceUntil) }] : []),
            ]}
          />
          <div className="space-y-4">
            <Usage label="Aktive Teammitglieder" used={sub.activeMembers} limit={currentPlan?.maxActiveMembers ?? null} />
            <Usage label="Angebote in diesem Monat" used={sub.quotationsThisMonth} limit={currentPlan?.maxQuotationsPerMonth ?? null} />
          </div>
        </CardBody>
      </Card>
      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="mb-3 text-[15px] font-semibold text-neutral-900">Tarife</h2>
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
        title={`Zu „${choice?.name ?? ''}“ wechseln?`}
        description={
          sub.providerIsLive
            ? `Sie werden zum Zahlungsanbieter weitergeleitet. ${choice ? formatEur(choice.monthlyPriceEur) : ''} pro Monat zzgl. USt.`
            : 'Testmodus: Der Wechsel wird sofort simuliert. Es findet keine Zahlung statt.'
        }
        confirmLabel="Tarif wechseln"
        onConfirm={async () => {
          if (!choice) return;
          const response = await change.mutateAsync(choice.plan);
          if (response.redirectUrl) {
            window.location.assign(response.redirectUrl);
            return;
          }
          queryClient.setQueryData(qk.subscription(companyId), response.subscription);
          toast.success('Tarif geändert', response.subscription.planName);
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
      {!can.manageBilling && <ReadOnlyNotice>Tarif und Abrechnung können nur Inhaber:innen und Administrator:innen ändern.</ReadOnlyNotice>}
      <Content sub={sub.data} />
    </div>
  );
}
