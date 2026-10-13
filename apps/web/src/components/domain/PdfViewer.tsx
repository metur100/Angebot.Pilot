import { FileWarning } from 'lucide-react';
import type * as PdfJsModule from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/Feedback';
import { tr } from '@/lib/i18n';

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js (legacy build for broad browser support) and its worker lazily – only on PDF pages. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
}

interface PdfViewerProps {
  data: Blob;
  /** Accessible name of the rendered document. */
  label: string;
}

/**
 * Renders every page of a PDF to <canvas> with pdf.js. Used instead of the browser's PDF plugin, which is not
 * available in all browsers/headless environments and cannot be styled.
 */
export function PdfViewer({ data, label }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; pages: number } | { kind: 'error'; message: string }>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const container = containerRef.current;
    if (!container) return undefined;
    container.replaceChildren();
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const buffer = new Uint8Array(await data.arrayBuffer());
        const task = pdfjs.getDocument({ data: buffer });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled) return;
        const width = Math.min(container.clientWidth || 820, 900);
        const ratio = window.devicePixelRatio || 1;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'mx-auto block bg-white shadow-md ring-1 ring-neutral-200';
          // A page is paper: keep the light palette (white background, light ring) in dark mode too.
          canvas.dataset.theme = 'light';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', tr(`${label} – Seite ${pageNumber} von ${pdf.numPages}`, `${label} – page ${pageNumber} of ${pdf.numPages}`));
          canvas.dataset.testid = 'pdf-page';
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (!cancelled) setState({ kind: 'ready', pages: pdf.numPages });
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : tr('Unbekannter Fehler', 'Unknown error') });
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [data, label]);

  return (
    <div>
      {state.kind === 'loading' && (
        <div className="flex justify-center py-16">
          <Spinner label={tr('PDF wird dargestellt …', 'Rendering PDF …')} />
        </div>
      )}
      {state.kind === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-2 py-16 text-center text-sm text-neutral-600">
          <FileWarning aria-hidden size={22} className="text-danger-text" />
          {tr('Das PDF konnte nicht angezeigt werden. Sie können es trotzdem herunterladen.', 'The PDF could not be displayed. You can still download it.')}
          <span className="text-xs text-neutral-500">{state.message}</span>
        </div>
      )}
      <div ref={containerRef} className="space-y-6" data-pages={state.kind === 'ready' ? state.pages : undefined} />
    </div>
  );
}
