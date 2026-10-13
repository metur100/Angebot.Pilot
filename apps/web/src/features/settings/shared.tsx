import type { CompanyDto, UpdateCompanyRequest } from '@angebotpilot/api-contracts';
import { Lock, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { cx } from '@/lib/cx';

/** Full update request from the loaded company, optionally with changed fields (PUT replaces everything). */
export function companyToRequest(company: CompanyDto, patch: Partial<UpdateCompanyRequest> = {}): UpdateCompanyRequest {
  return {
    name: company.name,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    postalCode: company.postalCode,
    city: company.city,
    country: company.country,
    email: company.email,
    phone: company.phone,
    website: company.website,
    vatId: company.vatId,
    taxNumber: company.taxNumber,
    brandColor: company.brandColor,
    timeZone: company.timeZone,
    language: company.language,
    rowVersion: company.rowVersion,
    ...patch,
  };
}

/** Trimmed text or null for empty optional fields. */
export const emptyToNull = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

/** Shown on settings pages the current role may only read. */
export function ReadOnlyNotice({ owner = false, children, className }: { owner?: boolean; children?: ReactNode; className?: string }) {
  return (
    <Alert tone="neutral" icon={Lock} title="Nur Lesezugriff" className={className}>
      {children ??
        (owner
          ? 'Diese Einstellungen können nur Inhaber:innen ändern. Sie sehen die aktuellen Werte.'
          : 'Diese Einstellungen können nur Inhaber:innen und Administrator:innen ändern. Sie sehen die aktuellen Werte.')}
    </Alert>
  );
}

/** 409 concurrency_conflict: someone else saved in the meantime. */
export function ConflictAlert({ onReload, className }: { onReload: () => Promise<unknown>; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Alert
      tone="warning"
      live
      className={className}
      title="Die Daten wurden zwischenzeitlich geändert"
      actions={
        <Button
          size="sm"
          icon={RefreshCw}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onReload();
            } finally {
              setBusy(false);
            }
          }}
        >
          Neu laden (eigene Änderungen verwerfen)
        </Button>
      }
    >
      Jemand anderes hat diese Einstellungen gespeichert, während Sie sie bearbeitet haben. Laden Sie die aktuelle Fassung neu und
      übernehmen Sie Ihre Änderungen danach erneut.
    </Alert>
  );
}

/** Two-column form section (title left, fields right on wide screens). */
export function FormSection({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        'grid gap-x-8 gap-y-4 border-t border-neutral-100 pt-6 first:border-t-0 first:pt-0 md:grid-cols-[200px_minmax(0,1fr)]',
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {description && <p className="mt-1 text-[13px] leading-[18px] text-neutral-500">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
