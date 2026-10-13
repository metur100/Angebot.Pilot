// Pure mapping from an invoice (status, kind and the server-computed allowedActions) to the buttons shown on the detail
// screen. The server decides what is allowed (status + role); this file only decides placement, order and wording.
import type { InvoiceDto } from '@angebotpilot/api-contracts';

import type { IconName } from '@/components/Button';

export type InvoiceUiAction =
  | 'issue' | 'edit' | 'send' | 'recordPayment' | 'remind' | 'pdf' | 'xml' | 'duplicate' | 'cancel' | 'delete';

export interface InvoiceActionDef {
  action: InvoiceUiAction;
  label: string;
  icon: IconName;
  destructive?: boolean;
}

type InvoiceForActions = Pick<InvoiceDto, 'status' | 'kind' | 'allowedActions' | 'hasEInvoice' | 'sentAt' | 'isOverdue'>;

function def(action: InvoiceUiAction, i: InvoiceForActions): InvoiceActionDef {
  switch (action) {
    case 'issue':
      return { action, label: 'Rechnung stellen', icon: 'checkmark-done-outline' };
    case 'edit':
      return { action, label: 'Bearbeiten', icon: 'create-outline' };
    case 'send':
      return { action, label: i.sentAt ? 'Erneut senden' : 'Senden', icon: 'paper-plane-outline' };
    case 'recordPayment':
      return { action, label: 'Zahlung erfassen', icon: 'cash-outline' };
    case 'remind':
      return { action, label: 'Zahlungserinnerung senden', icon: 'alarm-outline' };
    case 'pdf':
      return { action, label: i.status === 'Draft' ? 'PDF-Vorschau teilen' : 'PDF teilen', icon: 'document-attach-outline' };
    case 'xml':
      return { action, label: 'E-Rechnung (XML) teilen', icon: 'code-download-outline' };
    case 'duplicate':
      return { action, label: 'Kopieren', icon: 'copy-outline' };
    case 'cancel':
      return { action, label: 'Stornieren', icon: 'ban-outline', destructive: true };
    case 'delete':
      return { action, label: 'Entwurf löschen', icon: 'trash-outline', destructive: true };
  }
}

/**
 * Primary actions are shown as buttons; the rest go into the "Weitere Aktionen" sheet.
 * PDF is always available (drafts as watermarked preview); XML only once the e-invoice exists.
 */
export function availableInvoiceActions(i: InvoiceForActions): { primary: InvoiceActionDef[]; more: InvoiceActionDef[] } {
  const allowed = new Set(i.allowedActions);
  const primary: InvoiceUiAction[] = [];
  const more: InvoiceUiAction[] = [];

  if (i.status === 'Draft') {
    if (allowed.has('issue')) primary.push('issue');
    if (allowed.has('edit')) primary.push('edit');
    more.push('pdf');
    if (allowed.has('duplicate')) more.push('duplicate');
    if (allowed.has('delete')) more.push('delete');
  } else {
    // Not yet sent: sending is the next step. Afterwards, recording the payment is.
    if (allowed.has('send') && !i.sentAt) primary.push('send');
    if (allowed.has('recordPayment')) primary.push('recordPayment');
    if (allowed.has('remind') && i.isOverdue) primary.push('remind');
    if (allowed.has('send') && i.sentAt) more.push('send');
    if (allowed.has('remind') && !i.isOverdue) more.push('remind');
    more.push('pdf');
    if (i.hasEInvoice) more.push('xml');
    if (allowed.has('duplicate')) more.push('duplicate');
    if (allowed.has('cancel')) more.push('cancel');
  }

  return { primary: primary.map((a) => def(a, i)), more: more.map((a) => def(a, i)) };
}
