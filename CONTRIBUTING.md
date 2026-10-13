# Contributing

AngebotPilot is a proprietary product ([LICENSE](LICENSE)). Contributions are by invitation only. These rules apply
to everyone working in this repository, including automated agents.

## Setup

Follow [docs/deployment/LOCAL-DEVELOPMENT.md](docs/deployment/LOCAL-DEVELOPMENT.md). Use `npx -y npm@11` for npm
commands (lock files are npm 11).

## Workflow

1. Branch from `main`; keep changes focused.
2. Run the quality gates locally before pushing:
   ```bash
   dotnet build AngebotPilot.sln -c Release
   dotnet format AngebotPilot.sln --verify-no-changes --severity error
   dotnet test AngebotPilot.sln
   npm run test:contracts && npm run typecheck && npm run lint && npm run test:web
   (cd apps/mobile && npm run verify)
   ```
3. Open a pull request; CI (`.github/workflows/ci.yml`) must be green: API build/tests against SQL Server, vulnerable
   NuGet check, web/contracts typecheck/lint/tests/build, `npm audit`, mobile typecheck/lint/tests, gitleaks.
4. Update the documentation in `docs/` when behaviour, configuration or deployment changes.

## Code conventions

- C#: `TreatWarningsAsErrors`, nullable enabled, `AnalysisLevel latest-recommended`, code style enforced in build
  (`Directory.Build.props`, `.editorconfig`). Central package versions in `Directory.Packages.props`.
- Layering: Domain has no infrastructure dependencies; Application talks to abstractions; only Infrastructure knows
  SQL Server, storage, SMTP and QuestPDF.
- Money: `decimal` only, server-side calculation is authoritative (`QuotationCalculator`); clients use
  `packages/api-contracts/src/money.ts`.
- Time: store UTC `DateTimeOffset`; business dates as `DateOnly`; use `TimeProvider`, never `DateTime.Now`.
- Multi-tenancy: tenant data goes through the filtered `DbSet`s. `IgnoreQueryFilters()` only with an explicit
  predicate and a reason in a comment; add an isolation test for new tenant-owned entities.
- Validation: every request DTO with user input gets a FluentValidation validator and `.Validate<T>()` on the route;
  validate enum values with `IsInEnum()`.
- Errors: throw the typed exceptions from `Application/Common` or `DomainException`; never return exception details.
- User-facing texts are German (UTF-8); code, comments, logs and docs are English.
- Logging: never log tokens, passwords, email bodies or raw request paths.
- Web/mobile: TypeScript strict; share API types through `packages/api-contracts`.

## Database migrations

- Create with `dotnet ef migrations add <Name>` (see LOCAL-DEVELOPMENT §9); never edit an applied migration.
- Prefer additive, backward-compatible changes; destructive changes need a backup plan and a separate release.
- Production is migrated only via `scripts/migrate-database.ps1` ([DATABASE.md](docs/architecture/DATABASE.md#migration-strategy)).

## Secrets

- Never commit secrets, connection strings, publish profiles, keystores or `appsettings.Production.json`.
- The `input/` folder holds owner secrets: do not open, copy or reference its contents.
- Development secrets: `dotnet user-secrets`. Build-time variables (`VITE_*`, `EXPO_PUBLIC_*`) are public by design.
- If a secret leaks, report it immediately (see [SECURITY.md](SECURITY.md)) – it must be rotated, not just removed
  from history.

## Commits

- Imperative subject line, ≤ 72 characters; explain the "why" in the body.
- Stage only your own files; do not commit build output (`bin/`, `obj/`, `dist/`, `artifacts/`).
