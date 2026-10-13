# Alternative: Web App on Cloudflare Pages

Status: **documented alternative, not deployed.** The current production frontend is GitHub Pages
([GITHUB-PAGES.md](GITHUB-PAGES.md)). Cloudflare Pages becomes attractive together with a custom domain, because it
allows response headers and a same-origin `/api/*` proxy, which makes HttpOnly refresh cookies first-party.

Limits below were verified on Cloudflare's documentation on 2026-10-12 (page dates in parentheses).

## Free-plan limits

| Item | Limit | Source |
|---|---|---|
| Builds | 500/month, 1 concurrent, 20 min timeout | <https://developers.cloudflare.com/pages/platform/limits/> (Sep 5, 2026) |
| Files / asset size | 20,000 files per site, 25 MiB per asset | same |
| Custom domains | 100 per project | same |
| `_headers` | max 100 rules; **not applied to Pages Functions responses** | <https://developers.cloudflare.com/pages/configuration/headers/> (Aug 25, 2026) |
| `_redirects` | proxying (status 200) only for relative URLs – external domains cannot be proxied this way | <https://developers.cloudflare.com/pages/configuration/redirects/> (Aug 25, 2026) |
| SPA fallback | without a top-level `404.html`, unknown paths serve `/` | <https://developers.cloudflare.com/pages/configuration/serving-pages/> (Oct 10, 2026) |
| Pages Functions | count against Workers Free: **100,000 requests/day** (reset 00:00 UTC); static assets free and unlimited | <https://developers.cloudflare.com/pages/functions/pricing/> (Sep 8, 2026) |
| Workers Free runtime | 10 ms CPU per request, 50 subrequests, 128 MB memory | <https://developers.cloudflare.com/workers/platform/limits/> (Oct 12, 2026) |

## Architecture

```
Browser ──► https://app.<domain>/                 static bundle (Pages)
        └─► https://app.<domain>/api/*  ──► Pages Function functions/api/[[path]].js ──fetch──► https://angebotpilot.runasp.net/api/*
```

- Same origin for app and API → refresh token can be an HttpOnly, `Secure`, `SameSite=Strict` cookie
  (`Auth:WebRefreshTransport=Cookie`, cookie `ap_refresh`, path `/api/v1/auth`).
- `_routes.json` with `"include": ["/api/*"]` so only API calls invoke the function (≥ 1 include, ≤ 100 rules;
  <https://developers.cloudflare.com/pages/functions/routing/>, Sep 18, 2026).
- `fetch()` to an external origin from a Function is supported
  (<https://developers.cloudflare.com/workers/runtime-apis/fetch/>, Jul 5, 2026). The proxy should forward method,
  body, `Authorization`, `Content-Type`, `X-AngebotPilot-Client` and cookies, and must strip/rewrite any `Domain=`
  attribute of `Set-Cookie` so the cookie binds to the Pages host (inferred, not from Cloudflare docs).
- Security headers for the static app via `_headers` (e.g. `Content-Security-Policy` with `frame-ancestors 'none'`,
  `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`); the Function must set its own headers.

## Fail-open behaviour – configure fail closed

When the daily Functions quota is exhausted, Cloudflare's default is **fail open**: requests "behave as if there was no
Function" and go to static assets. Combined with the SPA fallback, `/api/*` calls would receive `index.html` with
status 200 instead of an error. Configure **fail closed** (error 1027) for the project
(<https://developers.cloudflare.com/pages/functions/pricing/>; verified via Cloudflare docs search snippet).
The clients then see a clear failure instead of misleading HTML.

## Required changes (not implemented)

- [ ] Web build with `VITE_BASE_PATH=/` and `VITE_API_BASE_URL=https://app.<domain>`; adjust the CSP
      `connect-src` origins in `apps/web/vite.config.ts` (it currently whitelists `angebotpilot.runasp.net`).
- [ ] Web client: send `credentials: 'include'` for auth calls and stop storing the refresh token when the server
      returns none (code change in `apps/web/src/lib/api.ts` / `session.ts` – to be implemented).
- [ ] Pages Function proxy `functions/api/[[path]].js` + `_routes.json` + `_headers`.
- [ ] API settings: `Auth:WebRefreshTransport=Cookie`, `Cors:AllowedOrigins=["https://app.<domain>"]`,
      `App:WebBaseUrl=https://app.<domain>/#`.
- [ ] Rate limiting: all proxied requests arrive from Cloudflare IPs. The API would partition by Cloudflare edge IPs
      unless it trusts a forwarded header. Only enable `Network:TrustForwardedHeaders` if the API is reachable
      **exclusively** through the proxy (the current setting trusts any `X-Forwarded-For`).
- [ ] Mobile apps are unaffected (they keep using the API directly with body transport).
- [ ] **Owner:** Cloudflare account, custom domain, DPA with Cloudflare.
