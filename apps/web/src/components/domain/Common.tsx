import { Download, Lock } from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useBlocker } from 'react-router';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { HelpPopover, Tooltip } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { downloadBlob } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { tr } from '@/lib/i18n';

/** A disabled control with an explanation: tooltip on hover plus a help button for keyboard and touch users. */
export function Restricted({ allowed, hint, children }: { allowed: boolean; hint: string; children: ReactNode }) {
  if (allowed) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Tooltip content={hint}>
        <span className="inline-flex rounded-md">{children}</span>
      </Tooltip>
      <HelpPopover label={tr('Warum ist diese Aktion nicht verfügbar?', 'Why is this action unavailable?')}>{hint}</HelpPopover>
    </span>
  );
}

interface ExportButtonProps extends Omit<ButtonProps, 'onClick'> {
  allowed: boolean;
  hint: string;
  fileName: string;
  load: () => Promise<Blob>;
}

/** CSV export with role check, loading state and error toast. */
export function ExportButton({ allowed, hint, fileName, load, children = tr('CSV exportieren', 'Export CSV'), ...rest }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const blob = await load();
      downloadBlob(blob, fileName);
      toast.success(tr('Export erstellt', 'Export created'), fileName);
    } catch (error) {
      toast.error(tr('Export fehlgeschlagen', 'Export failed'), errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Restricted allowed={allowed} hint={hint}>
      <Button icon={allowed ? Download : Lock} loading={busy} disabled={!allowed} onClick={run} {...rest}>
        {children}
      </Button>
    </Restricted>
  );
}

/**
 * Warns before leaving a page with unsaved changes – in-app navigation (router blocker) and tab close (beforeunload).
 */
export function UnsavedChangesGuard({ when, bypass }: { when: boolean; bypass?: RefObject<boolean> }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && !bypass?.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(next) => {
        if (!next && blocker.state === 'blocked') blocker.reset();
      }}
      title={tr('Ungespeicherte Änderungen verwerfen?', 'Discard unsaved changes?')}
      description={tr(
        'Sie haben Änderungen vorgenommen, die noch nicht gespeichert sind. Wenn Sie die Seite verlassen, gehen sie verloren.',
        'You have changes that have not been saved yet. If you leave this page, they will be lost.',
      )}
      confirmLabel={tr('Verwerfen und verlassen', 'Discard and leave')}
      cancelLabel={tr('Weiter bearbeiten', 'Keep editing')}
      variant="danger"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}
