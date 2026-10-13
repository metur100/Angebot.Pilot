<#
.SYNOPSIS
  Publishes the AngebotPilot API and deploys it to MonsterASP.NET via Web Deploy.

.DESCRIPTION
  - Reads host, site, user and password from the publish profile downloaded from the MonsterASP control panel.
  - Copies a production settings file (secrets!) into the package. Both files must live OUTSIDE Git
    (default: the git-ignored ./input folder).
  - Never deletes App_Data on the server (uploaded logos and stored PDFs live there when Storage:Provider=Local).
  - Takes the site offline during the sync (app_offline.htm) so locked DLLs can be replaced.
  - Does NOT run database migrations. Run scripts/migrate-database.ps1 explicitly beforehand.

.EXAMPLE
  ./scripts/deploy-api.ps1
  ./scripts/deploy-api.ps1 -WhatIf     # show what would change
#>
param(
    [string]$PublishSettings = (Join-Path $PSScriptRoot '..\input\angebotpilot.runasp.net-WebDeploy.publishSettings'),
    [string]$ProductionSettings = (Join-Path $PSScriptRoot '..\input\appsettings.Production.json'),
    [string]$MsDeploy = 'C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
foreach ($required in @($PublishSettings, $ProductionSettings, $MsDeploy)) {
    if (-not (Test-Path $required)) { throw "Missing: $required" }
}

[xml]$profileXml = Get-Content $PublishSettings
$p = $profileXml.publishData.publishProfile | Where-Object { $_.publishMethod -eq 'MSDeploy' } | Select-Object -First 1
if (-not $p) { throw 'No MSDeploy profile found in the publish settings.' }

$out = Join-Path $root 'artifacts\api-publish'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Write-Host "Publishing API (Release) to $out"
dotnet publish (Join-Path $root 'apps\api\src\AngebotPilot.Api') -c Release -o $out --nologo -v q
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
Copy-Item $ProductionSettings (Join-Path $out 'appsettings.Production.json')
# Development-only files are not deployed.
Remove-Item (Join-Path $out 'appsettings.Development.json') -ErrorAction SilentlyContinue

$dest = "contentPath=$($p.msdeploySite),ComputerName=https://$($p.publishUrl):8172/msdeploy.axd?site=$($p.msdeploySite),UserName=$($p.userName),Password=$($p.userPWD),AuthType=Basic"
$arguments = @(
    '-verb:sync',
    "-source:contentPath=$out",
    "-dest:$dest",
    '-allowUntrusted',
    '-enableRule:AppOffline',
    '-skip:objectName=dirPath,absolutePath=App_Data$',
    '-skip:objectName=dirPath,absolutePath=App_Data\\.*',
    '-skip:objectName=filePath,absolutePath=App_Data\\.*',
    '-retryAttempts:3'
)
if ($WhatIf) { $arguments += '-whatif' }

Write-Host "Deploying to $($p.destinationAppUrl) (site $($p.msdeploySite))"
& $MsDeploy @arguments 2>&1 | ForEach-Object { ($_ -replace [regex]::Escape($p.userPWD), '***') }
if ($LASTEXITCODE -ne 0) { throw "msdeploy failed with exit code $LASTEXITCODE" }
Write-Host 'Deployment finished. Run: node scripts/smoke-test.mjs https://angebotpilot.runasp.net'
