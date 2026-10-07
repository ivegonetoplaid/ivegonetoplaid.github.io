#!/usr/bin/env bash
# Copies Matinee's page into the site, exactly as a Matinee commit has it: its static files to static/ and its
# index.html to demo/index.html. Every copied file stays byte for byte as that commit has it, except
# static/js/api.js, which the site's own stand-in replaces (kept in tools/api.js). The commit is recorded in
# MATINEE_COMMIT, which tests/page-copy.test.mjs checks the copy against.
#
# Usage: tools/copy_page.sh MATINEE_CHECKOUT [COMMIT]   (COMMIT defaults to the checkout's HEAD)
set -euo pipefail
cd "$(dirname "$0")/.."
checkout="$1"
commit="$(git -C "$checkout" rev-parse "${2:-HEAD}")"
rm -rf static demo
mkdir -p static demo
git -C "$checkout" archive "$commit" src/matinee/web/static | tar -x --strip-components=4 -C static
mv static/index.html demo/index.html
if [[ -f tools/api.js ]]; then cp tools/api.js static/js/api.js; fi
echo "$commit" > MATINEE_COMMIT
echo "copied Matinee's page at $commit"
