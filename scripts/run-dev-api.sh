#!/usr/bin/env bash
# Publishes the API to a temp folder and runs it in Development mode on http://localhost:5080.
# Running from a publish folder keeps the source tree's bin/ unlocked so you can keep building and testing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${API_RUN_DIR:-${TMPDIR:-/tmp}/angebotpilot-api-run}"
dotnet publish "$ROOT/apps/api/src/AngebotPilot.Api" -c Release -o "$OUT" -v q -nologo
cd "$OUT"
ASPNETCORE_ENVIRONMENT=Development exec dotnet AngebotPilot.Api.dll --urls "${API_URLS:-http://localhost:5080}"
