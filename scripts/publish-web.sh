#!/usr/bin/env bash
# Builds the web app for production and publishes the static bundle to the public GitHub Pages repository
# (default: metur100/Angebot.Pilot.App). Only built files are published; the source stays in the private repo.
# Requires git push access to the Pages repository (Git Credential Manager).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES_REPO="${PAGES_REPO:-https://github.com/metur100/Angebot.Pilot.App.git}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://angebotpilot.runasp.net}"
export VITE_BASE_PATH="${VITE_BASE_PATH:-/Angebot.Pilot.App/}"
export VITE_LANDING_URL="${VITE_LANDING_URL:-https://metur100.github.io/Angebot.Pilot.Landing/}"

cd "$ROOT"
npm run build --workspace apps/web
WORK="$(mktemp -d)"
git clone --depth 1 "$PAGES_REPO" "$WORK/site"
find "$WORK/site" -mindepth 1 -maxdepth 1 ! -name .git ! -name .github -exec rm -rf {} +
cp -R apps/web/dist/. "$WORK/site/"
mkdir -p "$WORK/site/.github/workflows"
cp deploy/pages-repo/.github/workflows/scheduled-jobs.yml "$WORK/site/.github/workflows/"
touch "$WORK/site/.nojekyll"
cd "$WORK/site"
git add -A
if git diff --cached --quiet; then echo "No changes to publish."; exit 0; fi
git commit -m "Publish web app build $(cd "$ROOT" && git rev-parse --short HEAD)"
git push origin HEAD
echo "Published. Pages URL: https://metur100.github.io/Angebot.Pilot.App/"
