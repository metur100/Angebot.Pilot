import { Download, Lock } from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useBlocker } from 'react-router';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { HelpPopover, Tooltip } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { downloadBlob } from '@/lib/download';
import { errorMessage } from '@/lib/errors';

/** A disabled control with an explanation: tooltip on hover plus a help button for keyboard and touch users. */
export function Restricted({ allowed, hint, children }: { allowed: boolean; hint: string; children: ReactNode }) {
  if (allowed) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Tooltip content={hint}>
        <span className="inline-flex rounded-md">{children}</span>
      </Tooltip>
      <HelpPopover label="Warum ist diese Aktion nicht verfügbar?">{hint}</HelpPopover>
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
export function ExportButton({ allowed, hint, fileName, load, children = 'CSV exportieren', ...rest }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const blob = await load();
      downloadBlob(blob, fileName);
      toast.success('Export erstellt', fileName);
    } catch (error) {
      toast.error('Export fehlgeschlagen', errorMessage(error));
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
      title="Ungespeicherte Änderungen verwerfen?"
      description="Sie haben Änderungen vorgenommen, die noch nicht gespeichert sind. Wenn Sie die Seite verlassen, gehen sie verloren."
      confirmLabel="Verwerfen und verlassen"
      cancelLabel="Weiter bearbeiten"
      variant="danger"
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}
