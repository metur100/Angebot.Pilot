// Subscription/plan logic of the mock (mirrors PlanCatalog + BillingService). Limits answer HTTP 402.
import type { PlanDto, SubscriptionDto, SubscriptionPlan } from '@angebotpilot/api-contracts';
import { db } from '../db';
import { nowIso, type CompanyRec, type SubscriptionRec } from '../model';
import { paymentRequired } from './http';

interface PlanLimits extends PlanDto {
  purchasable: boolean;
}

// Trial: the API allows 3 members; the mock allows 5 so the seeded team (3 active + 1 invitation) can still invite.
export const PLAN_CATALOG: PlanLimits[] = [
  { plan: 'Trial', name: 'Testphase', monthlyPriceEur: 0, maxActiveMembers: 5, maxQuotationsPerMonth: 30, maxEmailsPerDay: 50, purchasable: false },
  { plan: 'Starter', name: 'Starter', monthlyPriceEur: 19, maxActiveMembers: 1, maxQuotationsPerMonth: 100, maxEmailsPerDay: 100, purchasable: true },
  { plan: 'Team', name: 'Team', monthlyPriceEur: 49, maxActiveMembers: 5, maxQuotationsPerMonth: null, maxEmailsPerDay: 300, purchasable: true },
  { plan: 'Business', name: 'Business', monthlyPriceEur: 99, maxActiveMembers: 20, maxQuotationsPerMonth: null, maxEmailsPerDay: 1000, purchasable: true },
];

export function planFor(plan: SubscriptionPlan): PlanLimits {
  return PLAN_CATALOG.find((p) => p.plan === plan) ?? (PLAN_CATALOG[0] as PlanLimits);
}

export function subscriptionOf(companyId: string): SubscriptionRec {
  let sub = db.subscriptions.find((s) => s.companyId === companyId);
  if (!sub) {
    sub = { companyId, plan: 'Trial', status: 'Trialing', trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), currentPeriodEnd: null, cancelAtPeriodEnd: false };
    db.subscriptions.push(sub);
  }
  // A trial that ran out is expired (the API's billing job does this daily).
  if (sub.status === 'Trialing' && sub.trialEndsAt && sub.trialEndsAt < nowIso()) sub.status = 'Expired';
  return sub;
}

export function hasFullAccess(sub: SubscriptionRec): boolean {
  return sub.status === 'Trialing' || sub.status === 'Active' || sub.status === 'PastDue';
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function quotationsThisMonth(companyId: string): number {
  const start = monthStartIso();
  return db.quotations.filter((q) => q.companyId === companyId && q.revisionNumber === 0 && q.createdAt >= start).length;
}

export function activeMembers(companyId: string): number {
  return db.memberships.filter((m) => m.companyId === companyId && m.status === 'Active').length;
}

export function toSubscriptionDto(company: CompanyRec): SubscriptionDto {
  const sub = subscriptionOf(company.id);
  const plan = planFor(sub.plan);
  return {
    plan: sub.plan,
    planName: plan.name,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    graceUntil: sub.status === 'PastDue' && sub.currentPeriodEnd ? new Date(new Date(sub.currentPeriodEnd).getTime() + 7 * 86_400_000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    hasFullAccess: hasFullAccess(sub),
    provider: 'mock',
    providerIsLive: false,
    activeMembers: activeMembers(company.id),
    quotationsThisMonth: quotationsThisMonth(company.id),
    availablePlans: PLAN_CATALOG.filter((p) => p.purchasable).map(({ plan: p, name, monthlyPriceEur, maxActiveMembers, maxQuotationsPerMonth, maxEmailsPerDay }) => ({
      plan: p, name, monthlyPriceEur, maxActiveMembers, maxQuotationsPerMonth, maxEmailsPerDay,
    })),
  };
}

/** Expired/cancelled subscriptions keep data readable but block writes (402 subscription_inactive). */
export function ensureWritable(companyId: string): void {
  if (!hasFullAccess(subscriptionOf(companyId))) {
    throw paymentRequired(
      'subscription_inactive',
      'Ihre Testphase bzw. Ihr Abonnement ist abgelaufen. Ihre Daten bleiben lesbar; zum Bearbeiten wählen Sie bitte einen Tarif.',
    );
  }
}

export function ensureQuotationQuota(companyId: string): void {
  ensureWritable(companyId);
  const limits = planFor(subscriptionOf(companyId).plan);
  if (limits.maxQuotationsPerMonth !== null && quotationsThisMonth(companyId) >= limits.maxQuotationsPerMonth) {
    throw paymentRequired('quotation_limit', `Ihr Tarif „${limits.name}“ erlaubt ${limits.maxQuotationsPerMonth} neue Angebote pro Monat.`);
  }
}

export function ensureEmailQuota(companyId: string): void {
  ensureWritable(companyId);
  const limits = planFor(subscriptionOf(companyId).plan);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const sent = db.deliveries.filter((d) => d.companyId === companyId && d.createdAt >= since).length;
  if (sent >= limits.maxEmailsPerDay) {
    throw paymentRequired('email_limit', `Das tägliche E-Mail-Limit Ihres Tarifs (${limits.maxEmailsPerDay}) ist erreicht. Bitte versuchen Sie es später erneut.`);
  }
}

export function ensureMemberCapacity(companyId: string): void {
  ensureWritable(companyId);
  const limits = planFor(subscriptionOf(companyId).plan);
  const pending = db.invitations.filter((i) => i.companyId === companyId && i.status === 'Pending' && i.expiresAt > nowIso()).length;
  if (activeMembers(companyId) + pending >= limits.maxActiveMembers) {
    throw paymentRequired('member_limit', `Ihr Tarif „${limits.name}“ erlaubt höchstens ${limits.maxActiveMembers} aktive Mitglieder (inkl. offener Einladungen).`);
  }
}
