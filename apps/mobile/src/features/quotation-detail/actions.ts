import { tr, type QuotationDto } from '@angebotpilot/api-contracts';

import type { IconName } from '@/components/Button';

export type QuotationAction =
  | 'edit' | 'send' | 'resend' | 'accept' | 'reject' | 'cancel' | 'revise' | 'duplicate' | 'convert' | 'openJob'
  | 'pdf' | 'publicLink' | 'delete' | 'cancelFollowUps' | 'createInvoice';

export interface ActionDef {
  action: QuotationAction;
  label: string;
  icon: IconName;
  destructive?: boolean;
}

/** Action definitions in the current UI language (built at call time). */
const defs = (): Record<QuotationAction, ActionDef> => ({
  edit: { action: 'edit', label: tr('Bearbeiten', 'Edit'), icon: 'create-outline' },
  send: { action: 'send', label: tr('Versenden', 'Send'), icon: 'paper-plane-outline' },
  resend: { action: 'resend', label: tr('Erneut senden', 'Send again'), icon: 'paper-plane-outline' },
  accept: { action: 'accept', label: tr('Annahme erfassen', 'Record acceptance'), icon: 'checkmark-circle-outline' },
  reject: { action: 'reject', label: tr('Ablehnung erfassen', 'Record rejection'), icon: 'close-circle-outline' },
  cancel: { action: 'cancel', label: tr('Stornieren', 'Cancel quotation'), icon: 'ban-outline', destructive: true },
  revise: { action: 'revise', label: tr('Revision erstellen', 'Create revision'), icon: 'git-branch-outline' },
  duplicate: { action: 'duplicate', label: tr('Duplizieren', 'Duplicate'), icon: 'copy-outline' },
  convert: { action: 'convert', label: tr('In Auftrag umwandeln', 'Convert to job'), icon: 'briefcase-outline' },
  openJob: { action: 'openJob', label: tr('Auftrag öffnen', 'Open job'), icon: 'briefcase-outline' },
  pdf: { action: 'pdf', label: tr('PDF öffnen / teilen', 'Open / share PDF'), icon: 'document-attach-outline' },
  publicLink: { action: 'publicLink', label: tr('Kundenlink neu erzeugen & teilen', 'Regenerate & share customer link'), icon: 'link-outline' },
  delete: { action: 'delete', label: tr('Entwurf löschen', 'Delete draft'), icon: 'trash-outline', destructive: true },
  cancelFollowUps: { action: 'cancelFollowUps', label: tr('Erinnerungen abbrechen', 'Cancel reminders'), icon: 'alarm-outline' },
  createInvoice: { action: 'createInvoice', label: tr('Rechnung erstellen', 'Create invoice'), icon: 'receipt-outline' },
});

/**
 * Actions available for a quotation, derived from its status and the server-provided allowedTransitions.
 * The first entries are the primary actions shown as buttons; the rest go into the "Weitere Aktionen" sheet.
 */
export function availableActions(q: QuotationDto, hasScheduledFollowUps = false): { primary: ActionDef[]; more: ActionDef[] } {
  const t = new Set(q.allowedTransitions);
  const primary: QuotationAction[] = [];
  const more: QuotationAction[] = [];

  if (q.status === 'Draft') {
    if (t.has('Sent')) primary.push('send');
    primary.push('edit');
  }
  if (q.status === 'Sent') {
    if (t.has('Accepted')) primary.push('accept');
    if (t.has('Rejected')) primary.push('reject');
    more.push('resend'); // re-sending keeps the status "Sent"
  }
  if (q.status === 'Accepted') {
    primary.push(q.jobId ? 'openJob' : 'convert');
  }
  // Accepted: invoice directly from the quotation (in addition to the job conversion).
  if (q.status === 'Accepted') more.push('createInvoice');
  if (q.status === 'Sent' || q.status === 'Rejected' || q.status === 'Expired') more.push('revise');
  // The API lets users record a late acceptance (e.g. by phone) on an expired quotation; customers cannot.
  if (q.status === 'Expired') primary.push('accept');

  more.push('pdf');
  if (q.status !== 'Draft' && q.status !== 'Cancelled') more.push('publicLink');
  more.push('duplicate');
  if (hasScheduledFollowUps && q.status === 'Sent') more.push('cancelFollowUps');
  if (t.has('Cancelled')) more.push('cancel');
  if (q.status === 'Draft') more.push('delete');

  const d = defs();
  return { primary: primary.map((a) => d[a]), more: more.filter((a) => !primary.includes(a)).map((a) => d[a]) };
}
