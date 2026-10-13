# Web App and Landing Site on GitHub Pages

| Site | URL | Repository | Content |
|---|---|---|---|
| Web app | `https://metur100.github.io/Angebot.Pilot.App/` | `metur100/Angebot.Pilot.App` (public) | **Built static bundle only** + scheduled-jobs workflow. Source stays in the private repo `Angebot.Pilot`. |
| Landing / legal | `https://metur100.github.io/Angebot.Pilot.Landing/` – live | `metur100/Angebot.Pilot.Landing` (public, commit `7eab71d` at the time of writing) | Static HTML: `index`, `impressum`, `datenschutz`, `agb`, `avv`, `barrierefreiheit`, `support`, `konto-loeschen`, `404` |

Related: [CLOUDFLARE-PAGES.md](CLOUDFLARE-PAGES.md) (alternative) · [threat model T7](../security/THREAT-MODEL.md#t7-token-theft-web)

## How the web app is built for Pages

- **Base path:** `VITE_BASE_PATH=/Angebot.Pilot.App/` (`apps/web/vite.config.ts`, default for builds).
- **Hash routing:** `createHashRouter` (`apps/web/src/app/router.tsx`) – all app URLs look like
  `…/Angebot.Pilot.App/#/angebote/…`. GitHub Pages has no SPA rewrite, so deep links work without a `404.html` trick.
  The customer link is `…/#/q/{token}`; the fragment is never sent to GitHub's servers.
- **API origin:** `VITE_API_BASE_URL=https://angebotpilot.runasp.net`; the API allows the CORS origin
  `https://metur100.github.io` (`Cors:AllowedOrigins`).
- **CSP:** GitHub Pages cannot set response headers, so the build injects a `<meta http-equiv="Content-Security-Policy">`
  (production builds only):
  `default-src 'self'; connect-src 'self' <api origins>; img-src 'self' data: blob: <api origins>; worker-src 'self' blob:;
  script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'`.
  `frame-ancestors` cannot be set via `<meta>` – the app can be framed on this hosting (see threat model T17).
- Other meta: `referrer=no-referrer`, `robots=noindex`. Source maps are disabled. `public/.nojekyll` disables Jekyll.
- **Sessions:** cross-site → `Auth:WebRefreshTransport=Body`; refresh token in `localStorage`/`sessionStorage`.

## Publish

Requires push access to the Pages repo (Git Credential Manager) and a clean build environment.

```bash
bash scripts/publish-web.sh
# overrides (defaults shown):
PAGES_REPO=https://github.com/metur100/Angebot.Pilot.App.git \
VITE_API_BASE_URL=https://angebotpilot.runasp.net \
VITE_BASE_PATH=/Angebot.Pilot.App/ \
VITE_LANDING_URL=https://metur100.github.io/Angebot.Pilot.Landing/ \
bash scripts/publish-web.sh
```

The script (`scripts/publish-web.sh`): builds `apps/web`, shallow-clones the Pages repo, removes everything except
`.git` and `.github`, copies `apps/web/dist`, adds `.github/workflows/scheduled-jobs.yml` from
`deploy/pages-repo/`, touches `.nojekyll`, commits "Publish web app build <private-commit-sha>" and pushes.
Each publish is also repository activity that keeps the scheduled workflow from being auto-disabled.

### One-time repository setup

- [ ] **Owner:** create the public repo `metur100/Angebot.Pilot.App` (empty `main` branch).
- [ ] Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
- [ ] Settings → Secrets and variables → Actions → `JOBS_TRIGGER_SECRET` (same value as `Jobs:TriggerSecret`).
- [ ] Settings → Actions → General: allow GitHub Actions; workflow permissions read-only (the workflow declares
      `permissions: {}`).
- [ ] After the first publish, open `https://metur100.github.io/Angebot.Pilot.App/` and run the smoke checks:
      login, create a quotation, open a customer link.

The landing site repo is maintained separately (read-only for this repository). Its pages are referenced from the
apps: `impressum.html`, `datenschutz.html`, `agb.html` (`apps/web/src/lib/env.ts`, `apps/mobile/src/lib/config.ts`),
and `konto-loeschen.html` is the account-deletion URL for the store listings.

## Limitations and hardening path

1. **Shared origin.** Every Pages project site of the account lives under `https://metur100.github.io`. They share
   `localStorage` and are all accepted by the API's CORS policy. Do not host untrusted or third-party scripts on any
   `metur100.github.io` page while the app stores refresh tokens there.
2. **No response headers.** No HSTS preload control, no `frame-ancestors`, no `Permissions-Policy` for the SPA.
3. **Hardening:** move the app to a custom domain on the same site as the API (e.g. `app.<domain>` and
   `api.<domain>`), switch `Auth:WebRefreshTransport=Cookie` (HttpOnly, `SameSite=Strict`) – this also needs the web
   client to send `credentials: 'include'` (code change) – and set `Cors:AllowedOrigins` to the exact app origin.
   Custom domains on the API require a paid MonsterASP plan. Cloudflare Pages with a proxy function is described in
   [CLOUDFLARE-PAGES.md](CLOUDFLARE-PAGES.md).
4. GitHub Pages terms/limits for commercial SaaS front-ends: to be confirmed by the owner (not researched).
