import {
  customerTypeLabel, formatDate, formatEur, jobStatusLabel, quotationStatusLabel,
  type CustomerListItemDto, type JobListItemDto, type QuotationListItemDto,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme';

import { PressableCard } from './Card';
import { JobStatusBadge, QuotationStatusBadge } from './StatusBadge';
import { Text } from './Text';

export function QuotationCard({ item }: { item: QuotationListItemDto }) {
  const router = useRouter();
  return (
    <PressableCard
      onPress={() => router.push(`/quotation/${item.id}`)}
      accessibilityLabel={`Angebot ${item.number}, ${item.title}, ${item.customerName}, ${quotationStatusLabel[item.status]}, ${formatEur(item.grossTotal)}`}
      testID={`quotation-card-${item.id}`}
    >
      <View style={styles.topRow}>
        <Text variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
          {item.number}
          {item.revisionNumber > 0 ? ` · Rev. ${item.revisionNumber}` : ''}
        </Text>
        <QuotationStatusBadge status={item.status} />
      </View>
      <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>
        {item.title || 'Ohne Betreff'}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {item.customerName}
      </Text>
      <View style={styles.bottomRow}>
        <Text variant="caption" tone="muted" style={styles.flex}>
          gültig bis {formatDate(item.validUntil)}
          {item.hasJob ? ' · Auftrag' : ''}
        </Text>
        <Text variant="bodyStrong">{formatEur(item.grossTotal)}</Text>
      </View>
    </PressableCard>
  );
}

export function CustomerCard({ item, onPress }: { item: CustomerListItemDto; onPress?: () => void }) {
  const router = useRouter();
  return (
    <PressableCard
      onPress={onPress ?? (() => router.push(`/customer/${item.id}`))}
      accessibilityLabel={`${item.displayName}, ${customerTypeLabel[item.type]}${item.city ? `, ${item.city}` : ''}${item.isArchived ? ', archiviert' : ''}`}
      testID={`customer-card-${item.id}`}
    >
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Ionicons name={item.type === 'Business' ? 'business-outline' : 'person-outline'} size={20} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {[item.contactPerson, item.city].filter(Boolean).join(' · ') || customerTypeLabel[item.type]}
          </Text>
          <Text variant="small" tone="muted">
            {item.quotationCount} {item.quotationCount === 1 ? 'Angebot' : 'Angebote'}
            {item.acceptedValue > 0 ? ` · ${formatEur(item.acceptedValue)} angenommen` : ''}
            {item.isArchived ? ' · archiviert' : ''}
          </Text>
        </View>
      </View>
    </PressableCard>
  );
}

export function JobCard({ item }: { item: JobListItemDto }) {
  const router = useRouter();
  return (
    <PressableCard
      onPress={() => router.push(`/job/${item.id}`)}
      accessibilityLabel={`Auftrag ${item.number}, ${item.title}, ${item.customerName}, ${jobStatusLabel[item.status]}`}
      testID={`job-card-${item.id}`}
    >
      <View style={styles.topRow}>
        <Text variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
          {item.number} · aus {item.quotationNumber}
        </Text>
        <JobStatusBadge status={item.status} />
      </View>
      <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>
        {item.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {item.customerName}
      </Text>
      <View style={styles.bottomRow}>
        <Text variant="caption" tone="muted" style={styles.flex}>
          {item.dueDate ? `fällig ${formatDate(item.dueDate)}` : item.plannedStartDate ? `Start ${formatDate(item.plannedStartDate)}` : 'ohne Termin'}
          {item.assignedUserName ? ` · ${item.assignedUserName}` : ''}
        </Text>
        <Text variant="bodyStrong">{formatEur(item.netValue)}</Text>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { marginTop: space[1] },
  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: space[2], gap: space[2] },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
});
