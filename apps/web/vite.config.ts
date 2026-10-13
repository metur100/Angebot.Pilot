import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const require = createRequire(import.meta.url);

/** Origin (scheme://host[:port]) of a URL, or null when it cannot be parsed. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * GitHub Pages cannot send response headers, so the Content-Security-Policy is delivered as a <meta> tag.
 * Only injected into production builds: the dev server needs inline scripts (React Refresh preamble).
 * Note: frame-ancestors cannot be set via <meta>; clickjacking protection would require a real header.
 */
function contentSecurityPolicy(apiBaseUrl: string | undefined): Plugin {
  // Only the API this build talks to (production: angebotpilot.runasp.net; E2E builds: the local API).
  const api = originOf(apiBaseUrl) ?? 'https://angebotpilot.runasp.net';
  const policy = [
    "default-src 'self'",
    `connect-src 'self' ${api}`,
    `img-src 'self' data: blob: ${api}`,
    "worker-src 'self' blob:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'angebotpilot-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html.replace('<!--app-csp-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`),
    },
  };
}

/** Serves the MSW service worker in dev mock mode only, so it is never part of a production build. */
function mockServiceWorker(): Plugin {
  return {
    name: 'angebotpilot-msw-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0]?.endsWith('/mockServiceWorker.js')) {
          const file = require.resolve('msw/mockServiceWorker.js');
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Service-Worker-Allowed', '/');
          res.end(readFileSync(file));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useMocks = command === 'serve' && (mode === 'mock' || env.VITE_USE_MOCKS === 'true');
  return {
    base: command === 'build' ? (env.VITE_BASE_PATH ?? '/Angebot.Pilot.App/') : '/',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_API_BASE_URL), mockServiceWorker()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      'import.meta.env.VITE_USE_MOCKS': JSON.stringify(useMocks ? 'true' : 'false'),
    },
    server: { port: 5173, strictPort: false },
    preview: { port: 4173 },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
  };
});
