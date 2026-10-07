#!/usr/bin/env bash
# One-time setup: the development tools and the git hook. The site itself needs nothing installed.
set -euo pipefail
cd "$(dirname "$0")"
npm install
npx playwright install chromium
git config core.hooksPath .githooks
