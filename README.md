# Matinee's demo site

The site at https://ivegonetoplaid.github.io/: three slides about
[Matinee](https://github.com/ivegonetoplaid/matinee), a film picker for a home media library, with a working demo
of it.

The demo is a representation of Matinee on rails: the site's own player (`site/player.js`) plays Matinee's screens
from canned files, wearing Matinee's own stylesheet, fonts, pictures and words, copied unchanged from the Matinee
repository (`static/`, from the commit named in `MATINEE_COMMIT`). Both drawn screens play every press together.
Nothing on the site talks to a server, and a visitor's browser fetches nothing from any other site.

## Working on it

- `./bootstrap.sh` once: the development tools and the git hook.
- `./check.sh` before every commit: lint and the tests, in a headless browser.
- `tools/copy_page.sh MATINEE_CHECKOUT [COMMIT]` copies what the site borrows from Matinee, and records the commit
  (`MATINEE_COMMIT`) and each file's checksum (`PAGE_FILES`). `tests/page-copy.test.mjs` checks the copy against
  those checksums everywhere, and checks the checksums against the commit itself only where a Matinee checkout is
  at hand (`MATINEE_CHECKOUT`, or a `matinee` folder beside this one); elsewhere that half is skipped.
- `tools/build_demo.py` rebuilds the canned replies and the pictures from a Matinee checkout, a film table and the
  film folders; its docstring says how. `tools/demo-films.json` lists the films each path reveals, and `exclude`
  names any film the site must not show: removing a film is one entry there and a rebuild. `tools/synopses.json`
  holds the demo's own synopsis of each revealed film, written for the demo rather than copied from TMDB.

## Licence and the pictures

The site's own code and words are licensed AGPL-3.0, as Matinee is (`LICENSE`).

The film posters and backdrops belong to their studios and are shown to illustrate the software. If one is yours,
open an issue and it comes down. The partner logos on the last slide (Jellyfin, Plex, Seerr, TMDB, DoesTheDogDie
and MovieLens) belong to their owners and are shown to say Matinee works with them; none of them endorses Matinee.
Plex and the Plex logo are trademarks of Plex and used under a license. The Jellyfin logo is by the Jellyfin
contributors, CC BY-SA 4.0. The Seerr logo is from the Seerr project, under the MIT licence. This product uses the
TMDB API but is not endorsed or certified by TMDB.
