# Local Development

Related: [ENVIRONMENT-VARIABLES.md](ENVIRONMENT-VARIABLES.md) · [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) ·
[CONTRIBUTING.md](../../CONTRIBUTING.md)

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| .NET SDK | 10.x | `TargetFramework net10.0` (`Directory.Build.props`). Local tool `dotnet-ef` 10.0.12 via `dotnet tool restore`. |
| Node.js | 22 (`engines.node >= 22`) | CI uses Node 22. |
| npm | 11 | The lock files were written with npm 11; Node 22 ships npm 10. Use `npx -y npm@11 <command>` (e.g. `npx -y npm@11 ci`) instead of upgrading the global npm. |
| SQL Server | LocalDB (Windows) **or** Docker | Development connection string: `Server=(localdb)\MSSQLLocalDB;Database=AngebotPilot_Dev;Trusted_Connection=True;TrustServerCertificate=True` (`appsettings.Development.json`). |
| Docker (optional) | – | `docker-compose.yml`: SQL Server 2022 Developer edition (free for dev/test only) + Mailpit. Needs ~2 GB RAM. |
| Android Studio + emulator (mobile) | JDK 17, Android SDK | Only for running the native app. On Windows also CMake ≥ 3.30 (see §6). |

## 2. Install

```bash
dotnet tool restore
dotnet restore AngebotPilot.sln
npx -y npm@11 ci                      # root workspaces: packages/*, apps/web
(cd apps/mobile && npx -y npm@11 ci)  # the mobile app has its own lock file
```

## 3. Development secrets (user-secrets)

The API refuses to start without a JWT key. Store development secrets outside the repository
(`UserSecretsId = angebotpilot-api-dev`):

```bash
cd apps/api/src/AngebotPilot.Api
dotnet user-secrets set "Jwt:SigningKey"        "<at least 32 random characters>"
dotnet user-secrets set "Billing:WebhookSecret" "<random string – lets the mock provider sign plan changes locally>"
dotnet user-secrets set "Jobs:TriggerSecret"    "<at least 32 random characters – enables POST /api/internal/jobs/run>"
```

Generate values e.g. with `openssl rand -base64 48` or PowerShell
`[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))`.
Without `Billing:WebhookSecret`, self-service plan changes fail locally; without `Jobs:TriggerSecret` the trigger
endpoint returns 404 (the in-process scheduler still runs).

## 4. Database

**LocalDB (default):** nothing to do. In Development `Database:MigrateOnStartup=true`, so the database
`AngebotPilot_Dev` is created/migrated when the API starts.

**Docker alternative:**

```bash
cp .env.example .env            # set MSSQL_SA_PASSWORD (min. 8 chars, upper/lower/digit/symbol)
docker compose up -d
cd apps/api/src/AngebotPilot.Api
dotnet user-secrets set "ConnectionStrings:Default" \
  "Server=localhost,1433;Database=AngebotPilot_Dev;User Id=sa;Password=<your password>;TrustServerCertificate=True"
```

Mailpit (`http://localhost:8025`, SMTP `localhost:1025`) is included in the compose file. Note: the SMTP sender
only supports `StartTls` and `SslOnConnect`; whether it can talk to Mailpit's plain port without further Mailpit TLS
configuration is **to be confirmed**. The default `Capture` provider needs no SMTP server (see §5).

## 5. Run the API

```bash
npm run api                     # = dotnet run --project apps/api/src/AngebotPilot.Api  → http://localhost:5080
# or, keeping bin/ unlocked for parallel builds/tests:
bash scripts/run-dev-api.sh     # publishes to a temp folder and runs it in Development
```

- Health: `GET http://localhost:5080/health`, readiness (DB): `/health/ready`.
- OpenAPI `/openapi/v1.json` and Swagger UI `/swagger` – Development only.
- Emails: `Email:Provider=Capture` with `CaptureDirectory=App_Data/emails` – messages are written as `.eml` files and
  listed by the dev-only endpoint `GET /api/v1/dev/emails?to=<address>` (use it to open verification/reset links).
- Rate limits are multiplied by 20 in Development (`RateLimits:Scale`).
- Self-service plan changes work locally (`Billing:MockAllowsSelfService=true`) – clearly a mock, no payment.

### Demo data

```bash
dotnet run --project apps/api/src/AngebotPilot.Api -- seed-demo
# optional fixed password for your machine only:
DEMO_PASSWORD='<your choice>' dotnet run --project apps/api/src/AngebotPilot.Api -- seed-demo
```

Creates "Muster Elektrotechnik (Demo)" with login `demo@angebotpilot.example`. Without `DEMO_PASSWORD` a random
password is generated and printed once in the log. The command refuses `Production` and does nothing if the demo
user already exists.

## 6. Run the web app

```bash
npm run web                     # Vite dev server, http://localhost:5173 (API: http://localhost:5080)
npm run dev:mock --workspace apps/web   # in-browser MSW mocks, no API needed (dev only)
```

Configuration: copy `apps/web/.env.example` to `apps/web/.env.local` if you need different values
(`VITE_API_BASE_URL`, `VITE_LANDING_URL`, `VITE_BASE_PATH`, `VITE_USE_MOCKS`). The app uses hash routing
(`/#/dashboard`). Production build: `npm run build:web`; preview: `npm run preview --workspace apps/web`
(port 4173, an allowed CORS origin in Development).

## 7. Run the mobile app (Android emulator)

The emulator reaches the host's `localhost` via `10.0.2.2`.

```bash
cd apps/mobile
# PowerShell: $env:EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:5080'
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5080 npm run android     # expo run:android (prebuild + Gradle + install)
```

- With an `http://` API URL the config plugin `plugins/withLocalCleartext.js` allows cleartext traffic for
  `10.0.2.2`/`localhost` only. Release/production builds use `https://angebotpilot.runasp.net`.
- If the native project already exists from a production build, regenerate it:
  `npm run prebuild:android` (`expo prebuild --platform android --clean`).
- **Windows long paths:** set `ANDROID_CMAKE_DIR` to a CMake ≥ 3.30 inside the SDK, e.g.
  `set ANDROID_CMAKE_DIR=%ANDROID_HOME%\cmake\3.31.6`; `plugins/withLocalCmakeDir.js` writes it to
  `android/local.properties` (the default CMake 3.22.1 ships a ninja that fails on paths > 260 characters).
- Metro dev server only: `npm run mobile` (root) or `npx expo start` in `apps/mobile`.
- iOS requires macOS/Xcode or EAS cloud builds (see [STORE-READINESS.md](../store-listings/STORE-READINESS.md)).

## 8. Tests and checks

| What | Command |
|---|---|
| API unit + integration tests | `dotnet test AngebotPilot.sln` (integration tests need LocalDB or `TEST_SQLSERVER_CONNECTION`, e.g. the Docker SQL Server) |
| Formatting (as in CI) | `dotnet format AngebotPilot.sln --verify-no-changes --severity error` |
| Contracts | `npm run test:contracts` |
| Web | `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web`, `npm run test:web` |
| Web E2E | `npm run e2e` (Playwright, `apps/web/playwright.config.ts`, specs in `tests/web-e2e`; against the deployed site: `npm run e2e:deployed --workspace apps/web`). Added by the web workstream while this document was written – details to be confirmed. |
| Mobile | `cd apps/mobile && npm run verify` (typecheck + lint + Jest) |
| Mobile E2E flow | `tests/mobile/maestro/login-customer-quotation.yaml` (Maestro CLI required) |
| Smoke test (running API) | `node scripts/smoke-test.mjs http://localhost:5080 http://localhost:5173` |
| Dependency audit | `dotnet list AngebotPilot.sln package --vulnerable --include-transitive`, `npx -y npm@11 audit --omit=dev` |

The integration tests host the real API against a throw-away database per run, use in-memory storage, captured
email, a controllable clock and `RateLimits:Scale=1000` (`tests/api-integration/Infrastructure/ApiFactory.cs`).

## 9. Migrations (developers)

```bash
dotnet ef migrations add <Name> \
  --project apps/api/src/AngebotPilot.Infrastructure --startup-project apps/api/src/AngebotPilot.Api \
  --output-dir Persistence/Migrations
```

`DatabaseTests.Migrations_are_applied_and_model_has_no_pending_changes` fails if the model changed without a migration.
Never edit an applied migration; production rollout is described in [DATABASE.md](../architecture/DATABASE.md#migration-strategy).
