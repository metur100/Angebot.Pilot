import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/layout/Brand';
import { legalLinks } from '@/lib/env';

/** Minimal chrome for pages customers see (no app navigation). */
export function PublicLayout({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      {header && <header className="border-b border-neutral-200 bg-white">{header}</header>}
      <main className="flex-1">{children}</main>
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-neutral-500 sm:px-6">
          <a href={legalLinks.home} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-neutral-800" aria-label="Erstellt mit AngebotPilot">
            <span>Erstellt mit</span>
            <BrandLogo size="sm" />
          </a>
          <nav aria-label="Rechtliches" className="flex gap-4">
            <a href={legalLinks.impressum} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
              Impressum
            </a>
            <a href={legalLinks.datenschutz} target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 hover:underline">
              Datenschutz
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PublicMessage({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 shadow-sm">{icon}</div>
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        <div className="mt-2 text-sm text-neutral-600">{children}</div>
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
      </div>
    </PublicLayout>
  );
}
