#!/usr/bin/env bash
# Copies what the site borrows from Matinee, exactly as a Matinee commit has it, into static/: the stylesheet,
# fonts, avatars, icons, marquee drawings and credits pictures, and the few page modules the demo's player draws
# with (no part of Matinee's app runs on the site). Every copied file stays byte for byte as that commit has it.
# The commit is recorded in MATINEE_COMMIT and each file's checksum in PAGE_FILES, which
# tests/page-copy.test.mjs checks the copy against.
#
# Usage: tools/copy_page.sh MATINEE_CHECKOUT [COMMIT]   (COMMIT defaults to the checkout's HEAD)
set -euo pipefail
cd "$(dirname "$0")/.."
checkout="$1"
commit="$(git -C "$checkout" rev-parse "${2:-HEAD}")"
src=src/matinee/web/static
keep=(css fonts avatars icons marquee credits grain.svg blank.svg
  js/dom.js js/type.js js/flight.js js/mark.js js/hunt-plan.js js/wall-grid.js js/glow.js)
rm -rf static
mkdir -p static
git -C "$checkout" archive "$commit" "${keep[@]/#/$src/}" | tar -x --strip-components=4 -C static
(cd static && find . -type f | sort | sed 's|^\./||' | while read -r f; do echo "$(sha256sum < "$f" | cut -c1-64)  static/$f"; done) > PAGE_FILES
echo "$commit" > MATINEE_COMMIT
echo "copied Matinee's page files at $commit"
