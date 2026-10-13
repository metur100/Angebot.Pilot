import {
  customerTypeLabel, formatDate, formatEur, invoiceDisplayStatus, jobStatusLabel, quotationStatusLabel,
  type CustomerListItemDto, type InvoiceLinkDto, type InvoiceListItemDto, type JobListItemDto, type QuotationListItemDto,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { formatInvoiceAmount, invoiceLabel } from '@/lib/invoices';
import { makeStyles, space, useTheme } from '@/theme';

import { PressableCard } from './Card';
import { InvoiceStatusBadge, JobStatusBadge, QuotationStatusBadge } from './StatusBadge';
import { Text } from './Text';

export function InvoiceCard({ item }: { item: InvoiceListItemDto }) {
  const router = useRouter();
  const { tr } = useLocale();
  const styles = useStyles();
  const status = invoiceDisplayStatus(item);
  const amount = formatInvoiceAmount(item.grossTotal, item.kind);
  const isOpen = item.kind === 'Invoice' && (item.status === 'Issued' || item.status === 'PartiallyPaid');
  const due = item.status === 'Draft' ? null
    : item.isOverdue
      ? tr(
        `${item.daysOverdue} ${item.daysOverdue === 1 ? 'Tag' : 'Tage'} überfällig (fällig ${formatDate(item.dueDate)})`,
        `${item.daysOverdue} ${item.daysOverdue === 1 ? 'day' : 'days'} overdue (due ${formatDate(item.dueDate)})`,
      )
      : isOpen ? tr(`fällig ${formatDate(item.dueDate)}`, `due ${formatDate(item.dueDate)}`)
        : tr(`vom ${formatDate(item.issueDate)}`, `dated ${formatDate(item.issueDate)}`);
  return (
    <PressableCard
      onPress={() => router.push(`/invoice/${item.id}`)}
      accessibilityLabel={`${item.number ? tr(`Rechnung ${invoiceLabel(item)}`, `Invoice ${invoiceLabel(item)}`) : tr('Rechnungsentwurf', 'Draft invoice')}, ${item.title}, ${item.customerName}, ${status.label}, ${amount}${due ? `, ${due}` : ''}`}
      testID={`invoice-card-${item.id}`}
    >
      <View style={styles.topRow}>
        <Text variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
          {invoiceLabel(item)}
        </Text>
        <InvoiceStatusBadge invoice={item} />
      </View>
      <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>
        {item.title || tr('Ohne Betreff', 'No subject')}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {item.customerName}
      </Text>
      <View style={styles.bottomRow}>
        <Text variant="caption" tone={item.isOverdue ? 'danger' : 'muted'} style={styles.flex} testID={`invoice-due-${item.id}`}>
          {due ?? tr('Nummer wird beim Stellen vergeben', 'Number is assigned when issued')}
        </Text>
        <Text variant="bodyStrong">{amount}</Text>
      </View>
      {item.status === 'PartiallyPaid' ? (
        <Text variant="small" tone="muted">
          {tr(
            `offen ${formatEur(item.openAmount)} von ${formatEur(item.grossTotal)}`,
            `${formatEur(item.openAmount)} of ${formatEur(item.grossTotal)} outstanding`,
          )}
        </Text>
      ) : null}
    </PressableCard>
  );
}

/** Compact row for invoices linked from a job or quotation (InvoiceLinkDto). */
export function InvoiceLinkCard({ item }: { item: InvoiceLinkDto }) {
  const router = useRouter();
  const { tr } = useLocale();
  const styles = useStyles();
  const amount = formatInvoiceAmount(item.grossTotal, item.kind);
  const status = invoiceDisplayStatus({ ...item, isOverdue: false });
  return (
    <PressableCard
      onPress={() => router.push(`/invoice/${item.id}`)}
      accessibilityLabel={`${item.number ? tr(`Rechnung ${invoiceLabel(item)}`, `Invoice ${invoiceLabel(item)}`) : tr('Rechnungsentwurf', 'Draft invoice')}, ${status.label}, ${amount}`}
      testID={`invoice-link-${item.id}`}
    >
      <View style={styles.topRow}>
        <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
          {invoiceLabel(item)}
        </Text>
        <Text variant="bodyStrong">{amount}</Text>
      </View>
      <View style={styles.badgeRow}>
        <InvoiceStatusBadge invoice={item} />
      </View>
    </PressableCard>
  );
}

export function QuotationCard({ item }: { item: QuotationListItemDto }) {
  const router = useRouter();
  const { tr } = useLocale();
  const styles = useStyles();
  return (
    <PressableCard
      onPress={() => router.push(`/quotation/${item.id}`)}
      accessibilityLabel={`${tr('Angebot', 'Quotation')} ${item.number}, ${item.title}, ${item.customerName}, ${quotationStatusLabel[item.status]}, ${formatEur(item.grossTotal)}`}
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
        {item.title || tr('Ohne Betreff', 'No subject')}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {item.customerName}
      </Text>
      <View style={styles.bottomRow}>
        <Text variant="caption" tone="muted" style={styles.flex}>
          {tr(`gültig bis ${formatDate(item.validUntil)}`, `valid until ${formatDate(item.validUntil)}`)}
          {item.hasJob ? tr(' · Auftrag', ' · Job') : ''}
        </Text>
        <Text variant="bodyStrong">{formatEur(item.grossTotal)}</Text>
      </View>
    </PressableCard>
  );
}

export function CustomerCard({ item, onPress }: { item: CustomerListItemDto; onPress?: () => void }) {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <PressableCard
      onPress={onPress ?? (() => router.push(`/customer/${item.id}`))}
      accessibilityLabel={`${item.displayName}, ${customerTypeLabel[item.type]}${item.city ? `, ${item.city}` : ''}${item.isArchived ? tr(', archiviert', ', archived') : ''}`}
      testID={`customer-card-${item.id}`}
    >
      <View style={styles.customerRow}>
        <View style={styles.avatar}>
          <Ionicons name={item.type === 'Business' ? 'business-outline' : 'person-outline'} size={20} color={colors.brandText} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {[item.contactPerson, item.city].filter(Boolean).join(' · ') || customerTypeLabel[item.type]}
          </Text>
          <Text variant="small" tone="muted">
            {item.quotationCount}{' '}
            {item.quotationCount === 1 ? tr('Angebot', 'quotation') : tr('Angebote', 'quotations')}
            {item.acceptedValue > 0 ? tr(` · ${formatEur(item.acceptedValue)} angenommen`, ` · ${formatEur(item.acceptedValue)} accepted`) : ''}
            {item.isArchived ? tr(' · archiviert', ' · archived') : ''}
          </Text>
        </View>
      </View>
    </PressableCard>
  );
}

export function JobCard({ item }: { item: JobListItemDto }) {
  const router = useRouter();
  const { tr } = useLocale();
  const styles = useStyles();
  return (
    <PressableCard
      onPress={() => router.push(`/job/${item.id}`)}
      accessibilityLabel={`${tr('Auftrag', 'Job')} ${item.number}, ${item.title}, ${item.customerName}, ${jobStatusLabel[item.status]}`}
      testID={`job-card-${item.id}`}
    >
      <View style={styles.topRow}>
        <Text variant="caption" tone="secondary" style={styles.flex} numberOfLines={1}>
          {item.number} · {tr('aus', 'from')} {item.quotationNumber}
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
          {item.dueDate
            ? tr(`fällig ${formatDate(item.dueDate)}`, `due ${formatDate(item.dueDate)}`)
            : item.plannedStartDate ? tr(`Start ${formatDate(item.plannedStartDate)}`, `starts ${formatDate(item.plannedStartDate)}`) : tr('ohne Termin', 'no date')}
          {item.assignedUserName ? ` · ${item.assignedUserName}` : ''}
        </Text>
        <Text variant="bodyStrong">{formatEur(item.netValue)}</Text>
      </View>
    </PressableCard>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  title: { marginTop: space[1] },
  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: space[2], gap: space[2] },
  badgeRow: { marginTop: space[1] },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
}));
