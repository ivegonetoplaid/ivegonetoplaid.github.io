#!/usr/bin/env bash
# Copies Matinee's page into the site, exactly as a Matinee commit has it: its static files to static/ and its
# index.html to demo/index.html. Every copied file stays byte for byte as that commit has it, except
# static/js/api.js, which the site's own stand-in replaces (kept in tools/api.js). The commit is recorded in
# MATINEE_COMMIT and each file's checksum in PAGE_FILES, which tests/page-copy.test.mjs checks the copy against.
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
# Each copied file's checksum as the commit has it, before the stand-in replaces api.js.
{ (cd static && find . -type f | sort | sed 's|^\./||' | while read -r f; do echo "$(sha256sum < "$f" | cut -c1-64)  static/$f"; done)
  echo "$(sha256sum < demo/index.html | cut -c1-64)  demo/index.html"; } > PAGE_FILES
cp tools/api.js static/js/api.js
echo "$commit" > MATINEE_COMMIT
echo "copied Matinee's page at $commit"
