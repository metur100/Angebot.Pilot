import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { Button, type ButtonVariant } from './Button';
import { Alert } from './Feedback';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing by clicking outside (e.g. forms with input). */
  dismissible?: boolean;
}

const widths = { sm: 'max-w-[420px]', md: 'max-w-[520px]', lg: 'max-w-[680px]', xl: 'max-w-[860px]' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', dismissible = true }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="ap-overlay fixed inset-0 z-50 bg-neutral-900/45 backdrop-blur-[2px]" />
        <RadixDialog.Content
          onPointerDownOutside={dismissible ? undefined : (event) => event.preventDefault()}
          className={cx(
            'ap-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl border border-neutral-200 bg-white shadow-lg focus:outline-none',
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <RadixDialog.Title className="text-base leading-6 font-semibold text-neutral-900">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-neutral-500">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="Schließen"
                className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X aria-hidden size={18} />
              </button>
            </RadixDialog.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>}
          {footer && (
            <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t border-neutral-100 bg-neutral-25 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  /** May return a promise; the dialog shows a spinner and closes on success. Errors are shown inline. */
  onConfirm: () => unknown;
  confirmDisabled?: boolean;
  errorText?: string | null;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  variant = 'primary',
  onConfirm,
  confirmDisabled,
  errorText,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {

      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setError(null);
          onOpenChange(next);
        }
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} loading={busy} disabled={confirmDisabled} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {(children || error || errorText) && (
        <div className="space-y-3">
          {children}
          {(error ?? errorText) && (
            <Alert tone="danger" live>
              {error ?? errorText}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}
