import {
  followUpKindLabel, formatDate, formatDateTime, formatEur, formatPercent,
  type ActivityDto, type DashboardDto, type QuotationStatus,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, type IconName } from '@/components/Button';
import { Card, PressableCard, SectionHeader } from '@/components/Card';
import { InvoiceCard, QuotationCard } from '@/components/EntityCards';
import { ContentScroll, Screen } from '@/components/Layout';
import { ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDashboard } from '@/lib/queries';
import { useMembership, useSession } from '@/lib/session';
import { colors, radius, space, touch } from '@/theme';

function Kpi({
  label, value, icon, hint, onPress, testID, danger,
}: { label: string; value: string; icon: IconName; hint?: string; onPress?: () => void; testID?: string; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.kpi, danger ? styles.kpiDanger : null, pressed ? { backgroundColor: colors.surfaceMuted } : null]}
      testID={testID}
    >
      <View style={styles.kpiHeader}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brand} />
        <Text variant="caption" tone={danger ? 'danger' : 'secondary'} style={styles.flex} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text variant="title" tone={danger ? 'danger' : 'default'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="small" tone="muted" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

function isEmptyCompany(d: DashboardDto): boolean {
  return (
    d.draftCount + d.sentCount + d.acceptedCount + d.rejectedCount + d.expiredCount === 0 &&
    d.recentActivity.length === 0 &&
    d.openJobsCount === 0
  );
}

function FirstSteps() {
  const router = useRouter();
  const steps: { icon: IconName; title: string; text: string; action: () => void; label: string }[] = [
    { icon: 'person-add-outline', title: '1. Kunden anlegen', text: 'Firmen- oder Privatkunden mit Kontaktdaten.', action: () => router.push('/customer-form'), label: 'Kunde anlegen' },
    { icon: 'document-text-outline', title: '2. Angebot erstellen', text: 'Positionen erfassen, Summen werden live berechnet.', action: () => router.push('/quotation-editor'), label: 'Angebot erstellen' },
    { icon: 'paper-plane-outline', title: '3. Versenden & nachfassen', text: 'Per E-Mail oder Kundenlink; Erinnerungen laufen automatisch.', action: () => router.push('/quotations'), label: 'Zu den Angeboten' },
  ];
  return (
    <Card style={styles.firstSteps} testID="first-steps">
      <Text variant="heading" accessibilityRole="header">
        Erste Schritte
      </Text>
      <Text variant="body" tone="secondary">
        Noch keine Angebote in diesem Zeitraum. So starten Sie:
      </Text>
      {steps.map((s) => (
        <Pressable key={s.title} accessibilityRole="button" accessibilityLabel={`${s.title}. ${s.text}`} onPress={s.action} style={styles.step}>
          <View style={styles.stepIcon}>
            <Ionicons name={s.icon} size={20} color={colors.brand} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{s.title}</Text>
            <Text variant="caption" tone="secondary">
              {s.text}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

function ActivityRow({ item }: { item: ActivityDto }) {
  const router = useRouter();
  const target =
    item.entityId && item.entityType === 'Quotation' ? `/quotation/${item.entityId}`
      : item.entityId && item.entityType === 'Job' ? `/job/${item.entityId}`
        : item.entityId && item.entityType === 'Customer' ? `/customer/${item.entityId}`
          : item.entityId && item.entityType === 'Invoice' ? `/invoice/${item.entityId}`
            : null;
  const content = (
    <>
      <View style={styles.dot} />
      <View style={styles.flex}>
        <Text variant="body">{item.summary}</Text>
        <Text variant="small" tone="muted">
          {formatDateTime(item.occurredAt)}
          {item.actorName ? ` · ${item.actorName}` : ''}
        </Text>
      </View>
    </>
  );
  if (!target) return <View style={styles.activity}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.summary} onPress={() => router.push(target as never)} style={styles.activity}>
      {content}
    </Pressable>
  );
}

function DashboardSkeleton() {
  return (
    <View style={styles.grid} testID="dashboard-skeleton">
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={styles.kpi}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={28} width="50%" />
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useSession();
  const membership = useMembership();
  const dashboard = useDashboard();
  const d = dashboard.data;
  const goToStatus = (status: QuotationStatus) => router.push({ pathname: '/quotations', params: { status } });
  const goToInvoices = (filter: 'open' | 'overdue') => router.push({ pathname: '/invoices', params: { filter } });

  return (
    <Screen>
      <ContentScroll refreshing={dashboard.isRefetching} onRefresh={() => void dashboard.refetch()} testID="dashboard">
        <View style={styles.greeting}>
          <Text variant="heading">Hallo{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</Text>
          <Text variant="caption" tone="secondary">
            {membership?.companyName}
            {membership?.isDemo ? ' · Demo-Daten' : ''}
            {d ? ` · ${formatDate(d.from)} – ${formatDate(d.to)}` : ''}
          </Text>
        </View>

        <View style={styles.quick}>
          <Button label="Neues Angebot" icon="add" onPress={() => router.push('/quotation-editor')} style={styles.flex} testID="dashboard-new-quotation" />
          <Button label="Neuer Kunde" icon="person-add-outline" variant="outline" onPress={() => router.push('/customer-form')} style={styles.flex} />
        </View>

        {dashboard.isPending ? <DashboardSkeleton /> : null}
        {dashboard.isError && !d ? <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : null}

        {d ? (
          <>
            {isEmptyCompany(d) ? <FirstSteps /> : null}
            <View style={styles.grid}>
              <Kpi label="Versendet / offen" value={String(d.sentCount)} icon="paper-plane-outline" onPress={() => goToStatus('Sent')} testID="kpi-sent" />
              <Kpi label="Angenommen" value={String(d.acceptedCount)} icon="checkmark-circle-outline" onPress={() => goToStatus('Accepted')} testID="kpi-accepted" />
              <Kpi label="Entwürfe" value={String(d.draftCount)} icon="create-outline" onPress={() => goToStatus('Draft')} testID="kpi-drafts" />
              <Kpi
                label="Abschlussquote"
                value={d.conversionRatePercent === null ? '–' : formatPercent(d.conversionRatePercent)}
                icon="trending-up-outline"
                hint={d.conversionRatePercent === null ? 'Noch keine Entscheidungen' : 'Definition antippen'}
                onPress={() => Alert.alert('Abschlussquote', d.conversionRateDefinition)}
                testID="kpi-conversion"
              />
              <Kpi label="Angebotsvolumen (netto)" value={formatEur(d.quotedValueNet)} icon="cash-outline" testID="kpi-quoted" />
              <Kpi label="Gewonnen (netto)" value={formatEur(d.acceptedValueNet)} icon="trophy-outline" testID="kpi-won" />
              <Kpi label="Offene Aufträge" value={String(d.openJobsCount)} icon="briefcase-outline" onPress={() => router.push('/jobs')} testID="kpi-jobs" />
              <Kpi label="Fällige Erinnerungen" value={String(d.followUpsDueCount)} icon="alarm-outline" testID="kpi-followups" />
              <Kpi
                label="Offene Rechnungen"
                value={formatEur(d.openInvoicesAmount)}
                hint={`${d.openInvoicesCount} ${d.openInvoicesCount === 1 ? 'Rechnung' : 'Rechnungen'}`}
                icon="receipt-outline"
                onPress={() => goToInvoices('open')}
                testID="kpi-open-invoices"
              />
              <Kpi
                label="Überfällig"
                value={formatEur(d.overdueInvoicesAmount)}
                hint={`${d.overdueInvoicesCount} ${d.overdueInvoicesCount === 1 ? 'Rechnung' : 'Rechnungen'}`}
                icon="alert-circle-outline"
                onPress={() => goToInvoices('overdue')}
                danger={d.overdueInvoicesCount > 0}
                testID="kpi-overdue-invoices"
              />
            </View>
            <Text variant="small" tone="muted" testID="conversion-definition">
              {d.conversionRateDefinition}
            </Text>

            {d.overdueInvoices.length > 0 ? (
              <>
                <SectionHeader title={`Überfällige Rechnungen (${d.overdueInvoicesCount})`} />
                <View style={styles.list}>
                  {d.overdueInvoices.slice(0, 5).map((i) => (
                    <InvoiceCard key={i.id} item={i} />
                  ))}
                </View>
              </>
            ) : null}

            {d.awaitingDecision.length > 0 ? (
              <>
                <SectionHeader title={`Warten auf Entscheidung (${d.awaitingDecision.length})`} />
                <View style={styles.list}>
                  {d.awaitingDecision.slice(0, 5).map((q) => (
                    <QuotationCard key={q.id} item={q} />
                  ))}
                </View>
              </>
            ) : null}

            {d.expiringSoon.length > 0 ? (
              <>
                <SectionHeader title={`Läuft bald ab (${d.expiringSoonCount})`} />
                <View style={styles.list}>
                  {d.expiringSoon.slice(0, 5).map((q) => (
                    <QuotationCard key={q.id} item={q} />
                  ))}
                </View>
              </>
            ) : null}

            {d.upcomingFollowUps.length > 0 ? (
              <>
                <SectionHeader title="Anstehende Erinnerungen" />
                <View style={styles.list}>
                  {d.upcomingFollowUps.slice(0, 5).map((f) => (
                    <PressableCard
                      key={`${f.quotationId}-${f.kind}`}
                      onPress={() => router.push(`/quotation/${f.quotationId}`)}
                      accessibilityLabel={`${followUpKindLabel[f.kind]} für ${f.quotationNumber}, ${f.customerName}, am ${formatDateTime(f.dueAt)}`}
                    >
                      <Text variant="bodyStrong">
                        {followUpKindLabel[f.kind]} · {f.quotationNumber}
                      </Text>
                      <Text variant="caption" tone="secondary">
                        {f.customerName} · {formatDateTime(f.dueAt)}
                      </Text>
                    </PressableCard>
                  ))}
                </View>
              </>
            ) : null}

            {d.recentActivity.length > 0 ? (
              <>
                <SectionHeader title="Letzte Aktivitäten" />
                <Card style={styles.activityCard}>
                  {d.recentActivity.slice(0, 8).map((a) => (
                    <ActivityRow key={a.id} item={a} />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </ContentScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  greeting: { gap: 2 },
  quick: { flexDirection: 'row', gap: space[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  kpi: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space[3], gap: space[1],
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 96,
  },
  kpiDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.palette.danger.border },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  list: { gap: space[3] },
  firstSteps: { gap: space[3] },
  step: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touch + 8 },
  stepIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  activityCard: { paddingVertical: space[1] },
  activity: { flexDirection: 'row', gap: space[3], paddingVertical: space[2], minHeight: touch },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 8 },
});
