import {
  emailStatusLabel,
  emailStatusTone,
  followUpStatusLabel,
  jobStatusLabel,
  jobStatusTone,
  quotationStatusLabel,
  quotationStatusTone,
  type EmailStatus,
  type FollowUpStatus,
  type JobStatus,
  type QuotationStatus,
  type Tone,
} from '@angebotpilot/api-contracts';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  Clock,
  FilePen,
  Hammer,
  Hourglass,
  MailCheck,
  RotateCw,
  Send,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  info: 'bg-info-bg text-info-text border-info-border',
  success: 'bg-success-bg text-success-text border-success-border',
  warning: 'bg-warning-bg text-warning-text border-warning-border',
  danger: 'bg-danger-bg text-danger-text border-danger-border',
  muted: 'bg-muted-bg text-muted-text border-muted-border',
};

interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

/** Status pill. Always carries text (and usually an icon) – never colour alone. */
export function Badge({ tone = 'neutral', icon: Icon, children, className, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[22px] px-2 text-xs' : 'h-7 px-2.5 text-[13px]',
        toneClasses[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden size={size === 'sm' ? 12 : 14} strokeWidth={2.25} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

const quotationIcons: Record<QuotationStatus, LucideIcon> = {
  Draft: FilePen,
  Sent: Send,
  Accepted: CircleCheck,
  Rejected: CircleX,
  Expired: Hourglass,
  Cancelled: Ban,
};

export function QuotationStatusBadge({ status, size }: { status: QuotationStatus; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={quotationStatusTone[status]} icon={quotationIcons[status]} size={size}>
      {quotationStatusLabel[status]}
    </Badge>
  );
}

const jobIcons: Record<JobStatus, LucideIcon> = {
  Open: CircleDot,
  InProgress: Hammer,
  Completed: CircleCheck,
  Cancelled: Ban,
};

export function JobStatusBadge({ status, size }: { status: JobStatus; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={jobStatusTone[status]} icon={jobIcons[status]} size={size}>
      {jobStatusLabel[status]}
    </Badge>
  );
}

const emailIcons: Record<EmailStatus, LucideIcon> = {
  Pending: Clock,
  Sending: Send,
  HandedOff: MailCheck,
  RetryScheduled: RotateCw,
  Failed: CircleX,
  Cancelled: Ban,
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return (
    <Badge tone={emailStatusTone[status]} icon={emailIcons[status]}>
      {emailStatusLabel[status]}
    </Badge>
  );
}

const followUpTone: Record<FollowUpStatus, Tone> = { Scheduled: 'info', Queued: 'success', Cancelled: 'muted', Skipped: 'neutral' };
const followUpIcons: Record<FollowUpStatus, LucideIcon> = { Scheduled: Clock, Queued: MailCheck, Cancelled: Ban, Skipped: CircleDashed };

export function FollowUpStatusBadge({ status }: { status: FollowUpStatus }) {
  return (
    <Badge tone={followUpTone[status]} icon={followUpIcons[status]}>
      {followUpStatusLabel[status]}
    </Badge>
  );
}
