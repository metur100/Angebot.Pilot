import {
  emailStatusLabel, emailStatusTone, invoiceDisplayStatus, jobStatusLabel, jobStatusTone, quotationStatusLabel, quotationStatusTone,
  type EmailStatus, type InvoiceKind, type InvoiceStatus, type JobStatus, type QuotationStatus, type Tone,
} from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius, space, toneColors } from '@/theme';

import type { IconName } from './Button';
import { Text } from './Text';

const quotationIcon: Record<QuotationStatus, IconName> = {
  Draft: 'create-outline',
  Sent: 'paper-plane-outline',
  Accepted: 'checkmark-circle-outline',
  Rejected: 'close-circle-outline',
  Expired: 'time-outline',
  Cancelled: 'ban-outline',
};

const jobIcon: Record<JobStatus, IconName> = {
  Open: 'ellipse-outline',
  InProgress: 'construct-outline',
  Completed: 'checkmark-done-outline',
  Cancelled: 'ban-outline',
};

const emailIcon: Record<EmailStatus, IconName> = {
  Pending: 'hourglass-outline',
  Sending: 'sync-outline',
  HandedOff: 'mail-outline',
  RetryScheduled: 'refresh-outline',
  Failed: 'alert-circle-outline',
  Cancelled: 'ban-outline',
};

/** Status badge: always icon + text + colour (never colour alone). */
export function Badge({ label, tone, icon, testID }: { label: string; tone: Tone; icon?: IconName; testID?: string }) {
  const c = toneColors[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}
      accessible
      accessibilityLabel={`Status: ${label}`}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={14} color={c.text} /> : null}
      <Text variant="small" style={[styles.text, { color: c.text }]}>
        {label}
      </Text>
    </View>
  );
}

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge label={quotationStatusLabel[status]} tone={quotationStatusTone[status]} icon={quotationIcon[status]} testID={`status-${status}`} />;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge label={jobStatusLabel[status]} tone={jobStatusTone[status]} icon={jobIcon[status]} testID={`job-status-${status}`} />;
}

const invoiceIcon: Record<InvoiceStatus, IconName> = {
  Draft: 'create-outline',
  Issued: 'receipt-outline',
  PartiallyPaid: 'pie-chart-outline',
  Paid: 'checkmark-done-circle-outline',
  Cancelled: 'ban-outline',
};

/** Invoice badge: cancellation invoices and overdue invoices get their own wording (invoiceDisplayStatus). */
export function InvoiceStatusBadge({ invoice }: { invoice: { kind: InvoiceKind; status: InvoiceStatus; isOverdue?: boolean } }) {
  const { label, tone } = invoiceDisplayStatus({ kind: invoice.kind, status: invoice.status, isOverdue: !!invoice.isOverdue });
  const icon: IconName = invoice.kind === 'Cancellation' ? 'return-down-back-outline' : invoice.isOverdue ? 'alert-circle-outline' : invoiceIcon[invoice.status];
  return <Badge label={label} tone={tone} icon={icon} testID={`invoice-status-${invoice.status}`} />;
}

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge label={emailStatusLabel[status]} tone={emailStatusTone[status]} icon={emailIcon[status]} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: space[2], paddingVertical: 3, borderRadius: radius.full, borderWidth: 1,
  },
  text: { fontWeight: '600' },
});
