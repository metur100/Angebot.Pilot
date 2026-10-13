<#
.SYNOPSIS
  Applies EF Core migrations to a target database explicitly (never automatically in production).

.DESCRIPTION
  1. Generates an idempotent SQL script into ./artifacts for review.
  2. Refuses to continue if the script contains DROP statements unless -AllowDestructive is given.
  3. Applies pending migrations with the API's `migrate` command.
  The connection string is read from the environment variable ANGEBOTPILOT_MIGRATION_CONNECTION
  (for MonsterASP use the *public* host, e.g. dbXXXX.public.databaseasp.net) so it never appears in Git or shell history files.

.EXAMPLE
  $env:ANGEBOTPILOT_MIGRATION_CONNECTION = '<connection string>'
  ./scripts/migrate-database.ps1
#>
param([switch]$AllowDestructive, [switch]$ScriptOnly)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$connection = $env:ANGEBOTPILOT_MIGRATION_CONNECTION
if ([string]::IsNullOrWhiteSpace($connection)) { throw 'Set ANGEBOTPILOT_MIGRATION_CONNECTION first.' }

$infra = Join-Path $root 'apps\api\src\AngebotPilot.Infrastructure'
$api = Join-Path $root 'apps\api\src\AngebotPilot.Api'
$script = Join-Path $root 'artifacts\migrations-idempotent.sql'
dotnet tool restore | Out-Null
dotnet ef migrations script --idempotent --project $infra --startup-project $api -o $script
if ($LASTEXITCODE -ne 0) { throw 'Generating the migration script failed' }
$destructive = Select-String -Path $script -Pattern 'DROP TABLE|DROP COLUMN|ALTER COLUMN' -SimpleMatch:$false
if ($destructive -and -not $AllowDestructive) {
    $destructive | Select-Object -First 10 | ForEach-Object { Write-Warning $_.Line }
    throw 'The migration contains potentially destructive statements. Review artifacts/migrations-idempotent.sql, take a backup, then re-run with -AllowDestructive.'
}
if ($ScriptOnly) { Write-Host "Script written to $script"; return }

$out = Join-Path $root 'artifacts\api-migrate'
dotnet publish $api -c Release -o $out --nologo -v q
$env:ConnectionStrings__Default = $connection
$env:Jobs__EnableHostedScheduler = 'false'
# The migrate command does not issue tokens; a throw-away key satisfies startup validation.
$env:Jwt__SigningKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:ASPNETCORE_ENVIRONMENT = 'Production'
try {
    dotnet (Join-Path $out 'AngebotPilot.Api.dll') migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
} finally {
    Remove-Item Env:ConnectionStrings__Default, Env:Jwt__SigningKey, Env:Jobs__EnableHostedScheduler -ErrorAction SilentlyContinue
}
