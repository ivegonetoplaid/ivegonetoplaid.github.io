#!/usr/bin/env bash
# The site's gate: lint, then every test (the deck's gestures, the demo's walk, the page copy and the canned
# files). Run from the repository root after ./bootstrap.sh.
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x node_modules/.bin/eslint ]]; then
    echo "The tools are not installed; run ./bootstrap.sh" >&2
    exit 1
fi
node_modules/.bin/eslint .
timeout 600 node --test --test-concurrency=1 "tests/*.test.mjs"
