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

# The gate's time budget. Over it is a defect, cured by cutting duplicated tests, never by raising this; it
# warns rather than fails, since a busy machine runs slow.
BUDGET_S=180
log=$(mktemp)
trap 'rm -f "$log"' EXIT
start=$SECONDS
status=0
timeout 600 node --test --test-concurrency=1 "tests/*.test.mjs" | tee "$log" || status=$?
took=$((SECONDS - start))
echo "# gate: ${took}s of a ${BUDGET_S}s budget; the slowest tests:"
# A test's duration line follows its "ok" line in the TAP output.
awk '/^(not )?ok [0-9]+ - /{name=$0; sub(/^(not )?ok [0-9]+ - /, "", name)} /^  duration_ms:/{if (name) {print $2 "\t" name; name=""}}' "$log" |
    sort -rn | head -5 | awk -F '\t' '{printf "#   %5.1fs  %s\n", $1 / 1000, $2}'
if ((took > BUDGET_S)); then
    echo "# WARNING: the gate took ${took}s, over its ${BUDGET_S}s budget; cut duplicated tests" >&2
fi
exit "$status"
