---
purpose: The contract Matinee's demo site holds to — the deck and its gestures, the three slides and the About, the demo (the copy of Matinee's page, the stand-in and its canned replies, the frames, the mirror between two screens, the phone's full-screen demo), the canned-walk builder, what the site fetches, the tests and the gate — with a map of where each part lives.
updated: 2026-10-07
governs:
  - index.html
  - site/
  - tools/
  - tests/
  - canned/
  - img/
  - demo/
  - static/
  - MATINEE_COMMIT
  - PAGE_FILES
  - check.sh
  - bootstrap.sh
  - .githooks/
  - eslint.config.js
  - .nojekyll
---

# Matinee's demo site

The demo site presents [Matinee](https://github.com/ivegonetoplaid/matinee), a
film picker for a home media library, on three slides. The second slide holds a
working demo: Matinee's own page, answered from canned files instead of a
server. The site is static files only. GitHub Pages serves it from the root of
`https://ivegonetoplaid.github.io/`.

This spec was written from the code on 2026-10-07. It has two halves. The
**contract** says what the site does and what it refuses. It is authoritative.
The **map** says where each part lives. It is a pointer, never proof. When
the spec and the code disagree, the one that moved last decides which is wrong
([index](README.md)). Behaviour that is deliberately absent, unmeasured, or a snapshot is
listed under [Known limits](#known-limits).

This spec covers only what the site adds around Matinee's page. The page itself
follows Matinee's contract (Matinee repository, `docs/spec/matinee.md`,
section 12).

This spec borrows Matinee's words. The *front door* is the page's profile
screen, where a *Guest tile* opens a profile, and a *door word* can lock it. The
*source question* asks whether to choose from the library, from films it lacks,
or both. A *door* is one mood the first question offers (Comedy, Horror…); that
question is the *doors question*. Each door asks a *tree* of questions, and one
path through them is a *walk*. The *wall* is the poster backdrop, and it shows
the films still in play, the step's *pool*. A pick *reveals* one film. The
*trail* is the desktop's row of ways back. *Quips* are Matinee's short spoken
lines.

---

# Part 1 — Contract

## 1. Boundaries

1. **Static files only.** The site has no server code and no database. GitHub
   Pages serves the committed files as they stand and builds nothing. The canned
   files and pictures are built ahead, by hand, and committed (section 6). The
   empty `.nojekyll` file keeps Pages from running Jekyll over them.
2. **Nothing from another service.** A visitor's browser fetches every file
   from the site's own origin. No page on the site, the demo included, sends a
   request to any other origin. Links to other sites (the About's links, a
   film's TMDB page) are navigation a visitor chooses, never a fetch.
3. **No key.** The site uses no TMDB key, no media-server key and no other key.
4. **Matinee's page is unchanged.** The demo runs the *page copy*: a byte-for-byte copy of
   Matinee's page from one Matinee commit (section 5.1). The only file that differs is
   `static/js/api.js`, which the site replaces with its stand-in (section 5.2).
   Everything else the site does to the demo, it does from outside the page.
5. **Served from the root.** Matinee's page names every asset from the root
   (`/static/…`, `/img/…`). The site therefore lives at the root of its origin,
   and the page's requests resolve unchanged.
6. **Nothing from the maintainer's home.** No committed file holds a host name,
   a LAN address, an internal domain, a person's name, a path from a machine, an
   item id from a media server, a key or a setting's value. The canned-walk
   builder refuses to write any of them (section 6.5), and a test checks the
   committed canned files for them (section 8).

## 2. The deck

The page never scrolls. Three slides stand as layers over one curtain, and the
deck moves between them.

**A wheel pull.**

- A wheel pull moves the deck a little as it comes, magnified three times, so a
  short nudge shows.
- Wheel deltas count in pixels. A line counts as 16 px, and a page counts as the
  screen's height.
- A pull commits at 60 px. On commit the next slide rises over the curtain in
  820 ms, fast at first and then settling. The slide beneath shrinks by 8 % and
  fades out.
- After a commit, the rest of that wheel gesture is ignored until input has been
  quiet for 200 ms. So one flick moves one slide, however long its
  momentum runs.
- A pull short of 60 px springs back in 360 ms once input has been quiet for
  200 ms.
- A pull that begins while a slide is still settling starts from where the deck
  stands, so the settling slide never snaps into place.

**A finger.**

- The deck follows a finger one to one.
- A swipe commits when it covers an eighth of the screen's height, or when the
  finger leaves faster than 0.35 px per ms, measured over its last 100 ms.
  Otherwise the deck springs back.
- A second finger landing mid-swipe ends the swipe, and the deck returns to its
  slide. A cancelled touch springs back the same way.

**Past either end.** A pull past the first or the last slide gives a quarter of
the pull, and never more than 6 % of the screen. The deck then springs back. The
screen never goes blank.

**Keys.** Arrow Down, Page Down and Space move to the next slide. Arrow Up and
Page Up move to the previous slide. Home and End move to the first and the last
slide. A key held with Alt, Control or Meta is left alone. Space on a button, a
link or a field presses that control and does not move the deck.

**The bulbs.** Three bulbs down the right edge mark the slides. The current
slide's bulb is lit. A click on a bulb moves to its slide.

**A slide taller than the screen.** A slide that overflows the screen by more
than 8 px scrolls inside itself before the deck moves, by wheel, by finger and by
key. An arrow key scrolls it 40 px, and a page key 90 % of its height. A wheel
gesture that scrolled the slide is kept from the deck until input has been quiet
for 200 ms, so a flick that scrolls the slide to its end does not also move the
deck. An overflow of 8 px or less is ignored.

**While an overlay is open.** While the About or the phone's full-screen demo is
open, the deck ignores the wheel, the keys and the touch.

**State.** Only the current slide takes input; every other slide is inert. The
current bulb carries `aria-current="true"`. The page's `body` carries the
current slide's index in `data-slide`. A window resize redraws the deck where it
stands.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, a slide change is a
200 ms crossfade with no rise and no sink.

## 3. The slides

### 3.1 On every slide

- **The curtain.** One curtain stands behind every slide and never moves. It is a
  rendered velvet picture: the wide crop on a screen wider than 3:4, the tall
  crop on a taller screen. It covers the screen from the top centre. A curtain
  drawn in CSS lies beneath it and shows while the picture loads.
- **The top bar.** It shows "About", which opens the About (section 4), and a
  gold "Get started" button. "Get started" links to
  `https://github.com/ivegonetoplaid/matinee`.
- **Type and colour.** The site wears Matinee's own type and colours: Big
  Shoulders Display 800 and DM Sans, loaded from the page copy's fonts, and
  Matinee's gold and cream.
- **The lines.** Each slide's line is two parts in Matinee's manner: a short
  sentence in gold over the next in cream. A line types out once, the first time
  its slide arrives, 260 ms after the slide starts to move. It types at
  Matinee's pace, two characters every 24 ms. It holds its final shape while it
  types, because the untyped rest stands in place unseen. It shows no caret.
  Only the parts the stylesheet shows are typed. A screen reader reads the whole
  line at once. Under reduced motion the line appears whole.
- **The scrim.** Words standing on the curtain sit on a gentle feathered dark
  scrim, lighter than Matinee's.
- **Fit.** Every slide fits without scrolling inside itself on screens from
  1024 × 768 up, at 1280 × 720, and on phones 390 px wide and wider. A phone
  narrower than 390 px may scroll a slide inside itself.
- **Phone layout.** At 600 px wide or narrower, the site takes its phone layout.

### 3.2 Slide one: the marquee

- The headline is Matinee's marquee, drawn as on Matinee's front door: the
  "Matinee" sign over its letter board. The board reads "Now showing" over
  "Whatever you're in the mood for".
- The site lays Matinee's own drawings into the page from the page copy:
  `/static/marquee/marquee-wide.svg` and `marquee-narrow.svg`. The wide drawing
  shows above 600 px, the narrow one at 600 px and below. The marquee's bulbs chase as in
  Matinee. Nothing glows behind the marquee, and its lettering carries no glow.
- The headline's accessible name is "Matinee. Now showing: whatever you're in the
  mood for." A drawing that fails to load leaves that name in place and logs a
  warning.
- The line reads "Can't decide what to watch?" in gold, then "Tell me the mood.
  A few questions later, you'll have tonight's film." in cream.
- The paragraph reads: "Matinee picks from your Jellyfin or Plex film library,
  because there's no place like home. Not the one? Say so, and it'll be back
  with another, as many times as it takes. No library? It rounds up the usual
  suspects instead: about 10,000 well-loved films."
- The slide carries no scroll cue.

### 3.3 Slide two: the demo

- The line reads "Take a seat." in gold. On a wider screen the cream part reads
  "Tap anything. Both screens play along." On a phone it reads "Here's a working
  Matinee, just as it looks on your phone."
- The demo shows on a drawn desktop monitor and a drawn phone at once. The
  monitor has a dark bezel with a deeper chin, a neck and a foot. The phone has a
  rounded body, side keys, edge-to-edge glass, a camera island and a status bar
  showing a time, signal, wifi and battery. Neither carries a caption.
- On a phone the monitor does not show. The drawn phone is a preview that takes
  no input of its own. A tap on it, or on the gold "Try the demo" button beneath
  it, opens the full-screen demo (section 5.6). "It opens full screen. Back
  brings you here." stands under the button. The button shows only on a phone.
- In this spec, a *window* is the visitor's browser window; the *monitor* and the
  *drawn phone* are the two drawn devices; a *view* is one of Matinee's
  screens, such as the doors question or a pick.

### 3.4 Slide three: the partners

- The line reads "Plays well with others." in gold, then "Your library, your
  requests, and the film data behind every pick." in cream.
- Six partners stand alike, in this order: Jellyfin, Plex, Seerr, TMDB,
  DoesTheDogDie and MovieLens. Each stands in a theatre poster case (a *case*), all the same
  size: one row on a desktop, two rows of three on a phone.
- The partner's name stands in black on the case's brass plate. DoesTheDogDie's
  plate reads "DTDD". The partner's official logo stands centred in the case,
  unaltered. The glow is a soft light inside the case behind the logo; no effect
  touches the logo itself.
- Beneath the cases stands Matinee's Admit One ticket, which sways gently. The
  ticket links to Matinee's repository. Under it stand the tagline "Name the
  mood. We'll find the picture." in gold and the line "Grab your ticket on
  GitHub. Popcorn not included." with the GitHub mark. Hovering the ticket stops
  the sway and tilts it.
- The slide ends with one small line: "Matinee is not endorsed by or affiliated
  with any of the projects shown here. Their names and logos belong to their
  owners." It is the page's only footer.
- Under reduced motion the ticket and the marquee's bulbs stand still.

## 4. The About

- "About" in the top bar opens the About over everything, as a dialog.
- It carries Matinee's own About text with two changes and two additions. The
  sentence that says posters come from TMDB reads "On this demo, the posters
  come from my own film library." The section on what Matinee keeps on its
  computer is left out, because the site keeps nothing.
- It adds the partner credits: the Plex attribution ("Plex and the Plex logo are trademarks
  of Plex and used under a license"), the Jellyfin logo credit (CC BY-SA 4.0),
  the Seerr logo's MIT notice, and TMDB's notice ("This product uses the TMDB API
  but is not endorsed or certified by TMDB.") with TMDB's logo from the page
  copy.
- It adds a last line, the poster notice: "The posters on this site belong to their
  studios and are shown to illustrate the software. If one is yours, open an
  issue on the site's repository and it comes down." It names no person and no
  email address.
- The About's links open in a new tab.
- Opening the About adds one history step. The browser's Back closes it. Close,
  Escape and a press on the dark space around the panel close it by stepping
  back. Focus returns to "About".

## 5. The demo

### 5.1 The page copy and its record

- `tools/copy_page.sh MATINEE_CHECKOUT [COMMIT]` copies Matinee's page from one
  commit of a Matinee checkout (its `HEAD` when no commit is given). The page's
  static files go to `static/`, and its `index.html` goes to `demo/index.html`.
- Before it puts the stand-in in place, the script records each copied file's
  SHA-256 checksum in `PAGE_FILES`. It then copies `tools/api.js` over
  `static/js/api.js` and writes the full commit hash to `MATINEE_COMMIT`.
- The site depends on the copy beyond the demo: its fonts, its marquee
  drawings, its tab icon and the About's TMDB logo come from `static/`.

### 5.2 The stand-in

The stand-in is `tools/api.js`, copied to `static/js/api.js`. It exports the
same four helpers as Matinee's `api.js` (`get`, `post`, `put`, `del`). Each one
resolves to `{ ok, status, data }`, as Matinee's helpers do. Nothing in it talks
to a server.

- **Canned files.** The stand-in reads each canned file under `/canned/` once
  and keeps it for the visit. A file that fails to load is forgotten, so the
  next call asks for it again.
- **Boot replies.** `/api/admission`, `/api/setup`, `/api/quips`,
  `/api/pictures` and `/api/door` are answered from `boot.json`. Opening a
  profile is answered with the Guest profile.
- **The first view.** `/api/first` is answered from `first.json`.
- **The walk.** `/api/walk` is answered from `walk/<tree>.json`, by the answers
  given so far.
- **A film card.** `/api/film/<id>` is answered from `film/<id>.json`.
- **A pick.** `/api/pick` deals from `picks.json`:
  - With a branch chosen (a door's first answer, or a door that asks nothing),
    it deals that branch's three films.
  - With a door chosen but no answer yet ("Just pick one!" at the door's first
    question), it deals every branch of that door, one after another.
  - With no door, it deals every branch of every door.
  - It returns the film at position *n* modulo the deal's length, where *n* is
    the number of films the viewer has already seen. So "Not that one"
    cycles through the films without end, and the demo never says that the
    films ran out. Later answers inside a branch do not change its films.
- **A note.** A viewer's note is answered with two lines: "Thanks for that. On
  a real Matinee it goes to whoever runs it." and "This is only the demo."
  Nothing is kept.
- **Profile changes.** A changed avatar is echoed back, and deleting the profile
  answers with the Guest profile. Nothing is kept.
- **Failures.** A call the demo has no answer for gets a 404 reply with
  `error: "not_found"` and a message. A canned file that cannot be read gives a
  500 reply with `error: "refused"`, and logs a warning. Either way the page
  receives a failure it can show, never an exception.
- **One set of lines.** Matinee's page deals its quip lines with
  `Math.random`. The stand-in loads before Matinee's quip module and replaces
  `Math.random`: a call made from Matinee's quip module draws from one fixed
  seeded sequence, the same in every frame, and every other call stays random.
  So the two screens say the same lines, while the poster wall keeps its
  own randomness.

### 5.3 The canned replies

The builder (section 6) records the canned files from Matinee's own server code. Their shapes are in section 9.

- The demo opens five doors, in this order: Comedy, Horror, Sci-fi, For the
  kids and Documentaries. A branch is a door's first answer. Documentaries,
  which asks no question, is one branch.
- The first view says "What are we in the mood for?" and carries no source
  question: every reply was recorded as "only what we can watch right now".
- The walk files hold every question and answer Matinee's trees ask on the way
  to a pick. An answer whose films the library lacks is absent, as Matinee
  leaves it out.
- Every wall's films are the films Matinee's server named for that step, less
  any film without a real poster, in film-id order.
- The first screen's wall is every film behind the five doors' first
  questions.
- Each branch reveals exactly three films. No film is revealed by two branches.
- Each pick reply is the one recorded pick reply with its film replaced. Its
  other fields stay as Matinee answered them.
- Every film card links to `https://www.themoviedb.org/movie/<id>` with
  `link_to` set to `tmdb`. It carries no synopsis and no backdrop path.
- The picture reply names the site itself as the picture source
  (`source: "server"`) with no TMDB paths. The page therefore asks the site for
  every poster at `/img/poster/<id>/<size>` and every backdrop at
  `/img/backdrop/<id>/l`.
- The pictures are WebP files with no extension. Each poster exists in the four
  sizes Matinee's page asks for (`xs`, `s`, `m`, `l`). Each revealed film's
  backdrop exists in `l`. No picture is kept for a film no screen shows.

### 5.4 The frames and Matinee's front door

- Each demo is Matinee's page from `/demo/`, in an `iframe`. The monitor's
  frame is 1280 × 800. The phone's frame is 390 × 786 and stands below the
  drawn phone's 58 px status bar. The site scales each frame to the width of the
  glass it stands in, and rescales it when that glass changes size. The full-screen
  demo's frame fills the screen at its natural size.
- The phone's frame is always made. The monitor's frame is made only on a
  screen wider than 600 px. A window that widens past 600 px later gets its
  monitor's frame then, once, and both frames start again together at the
  doors.
- Matinee's page opens on its front door. The site never shows it. Whenever the
  front door stands with the Guest tile ready, the site hides the frame at once
  and presses the Guest tile. Once the doors question stands, the frame fades in
  over 250 ms. This holds for every document the frame loads: the first load, a
  reload, "Switch profiles" and "Delete profile". A frame being unloaded is
  hidden at once.
- So the visitor first sees the doors question, already signed in, with
  the source question already answered. The visitor never sees the front door,
  a profile, the door word or the source question.
- Matinee's corner mark inside a frame starts the walk over inside the frame.
  It never loads the site inside the frame; the frame stays at `/demo/`.

### 5.5 One demo on two screens

In a window wider than 600 px, the monitor and the drawn phone show one demo. A
choice made in either frame is made in the other, so both show the same view
and the same films.

The site's *mirror* (`site/mirror.js`) does this.

- **Clicks.** Each frame's clicks on a control (a button, a link, a menu item, a
  radio or a checkbox) are caught before the page acts on them. The site then
  finds the same control in the other frame and presses it there.
- **Finding the twin.** A control is found by its tag and classes, its words
  (its accessible name, its label or its text), and which of its kind it is.
  Matinee's page builds both the desktop's trail and the phone's "Back" on every
  screen and lets the stylesheet show one, so the twin exists in the other frame
  even where it is not shown. The phone's "Back" on a pick has no twin. The site presses
  the last way back on the desktop's trail instead. About's own "Back" never
  takes that substitute.
- **Order and patience.** Presses replay in the order made. The other frame is
  given up to 4 s to show the twin, since it may still be typing or moving.
- **Not repeated.** The site does not repeat a press it made itself. It does not
  repeat the profile tiles each frame presses on its own, and it does not repeat
  links that open a new tab (a film's page).
- **Closing alike.** Escape, a press beside a control and a step back through
  history are repeated in the other frame. So a menu or Matinee's About
  closes in both, however it was closed.
- **Starting again together.** When a twin never shows within 4 s, the site
  logs a warning and reloads every frame, so both start again at the doors. A
  frame that reloads on its own takes the other with it. Frames do not reload
  each other without end.
- **The wheel.** A wheel turned over a frame moves the deck, as it does
  anywhere on the page. A wheel that scrolls something inside the frame (About,
  a long list) is left to the frame. The rest of that gesture stays with the
  frame until input has been quiet for 200 ms, so a flick that scrolls to an
  inner list's end does not also move the deck.
- The full-screen demo (section 5.6) is not joined to the other two.

### 5.6 The phone's full-screen demo

- On a phone, "Try the demo" or a tap on the drawn phone opens Matinee's page
  full screen, over everything.
- The site makes the full-screen frame the first time the demo opens, and keeps it. A
  second visit finds the demo as the visitor left it.
- The site's own chip floats at the top centre, clear of Matinee's corner mark
  and profile button. It reads "Demo ✕" and is named "Close the demo". It
  labels the screen as a demo and is its visible exit.
- Opening the demo adds one history step. The phone's Back closes it and leaves
  the visitor on slide two.
- The chip and Escape close it by stepping back over every history step taken
  since it opened, including steps Matinee's page took inside it (its About,
  say). The page's history is left as it stood before the demo opened.
- Matinee's page is not changed to provide the exit.

## 6. The canned-walk builder

`tools/build_demo.py` rebuilds the canned replies, the pictures and the film
list. It runs with the Python of a Matinee checkout, because it imports
Matinee.

### 6.1 Settings

The builder reads two settings from its environment and never writes either
out:

- `FILM_TABLE`: a `films.sqlite` that Matinee's nightly rebuild wrote with a
  library.
- `FILM_DIRS`: the film folders, separated by colons. Each film's folder name
  carries `{tmdb-N}`.

A missing or empty setting stops the builder with a message.

### 6.2 What it reads

- **Matinee's own server.** The builder copies the film table into a scratch
  folder. It then runs Matinee's app inside the builder's own process, against
  that copy and the shipped labels. The film table's record of the library takes the media
  server's place. It answers no synopsis, and no media server is contacted. The scratch
  folder is removed afterwards.
- **What it records.** The boot replies; a Guest profile (avatar "popcorn"),
  created and opened; the first screen; every answer path behind the five
  doors; and one pick reply as a template. Every request asks for "only what we
  can watch right now".
- **The film folders.** Each film's poster is the `folder.jpg` in its folder,
  and its backdrop is the `backdrop.jpg`. The builder reads each picture's size
  without decoding it.

### 6.3 How it chooses

- **A real poster.** A poster is real when its width over its height lies
  between 0.6 and 0.75. A video frame is wide, so it fails. A film without a real
  poster is left off every wall.
- **What may be revealed.** A film may be revealed behind a branch when all of
  these hold:
  - it has a real poster and a backdrop on disk;
  - the film table holds it, with a year of 1985 or later;
  - the shipped labels place it behind the branch's door, except on
    Documentaries, whose films Matinee places by its own rule;
  - it is in the branch's pool;
  - it is not listed under `exclude` (section 6.4);
  - no other branch reveals it.
- **Listed films first.** `tools/demo-films.json` lists three films per branch.
  A listed film is kept while it may still be revealed behind its branch. Every
  kept film is reserved before any branch is filled.
- **Filling a place.** A branch with fewer than three kept films takes the
  most-voted films that may be revealed and that no branch has reserved. A branch
  that cannot reach three stops the builder, which asks for three films to be
  listed by hand.
- **The film list is written back.** The builder writes the films it settled on
  for every branch back to `tools/demo-films.json`, each branch's three in
  film-id order, so no ordering drawn from TMDB's votes is published.

### 6.4 Removing a film

Removing a film is one entry under `exclude` in `tools/demo-films.json` and a
rebuild. The rebuild drops the film from every wall and every branch, fills any
place it held, and removes its pictures.

### 6.5 What it refuses

The builder makes every canned file in memory and checks it before anything is
written. It refuses, and writes nothing, when:

- a branch does not reveal exactly three films, a revealed film is not behind
  its branch, or one film is revealed by two branches;
- any canned file carries a field, at any depth, named `item_id`, `itemid`,
  `path`, `file`, `folder`, `server`, `host`, `url`, `key`, `token` or
  `library`, whatever its value;
- any canned file holds a setting's value, a film folder's `{tmdb-` marker, the
  placeholder address the builder gives Matinee's media-server setting, or a value shaped like a media server's
  item id (32 hexadecimal characters, or a dashed GUID).

### 6.6 How it stages its output

A build cut short at any step leaves the last good set standing.

1. **Pictures first, which only add.** Each picture is converted to WebP at
   quality 72 with its metadata stripped: posters at 100, 160, 320 and 640 px
   wide (Matinee's own sizes), and backdrops at 1600 px. Posters are made for
   every film a wall shows, and backdrops for revealed films only. Each size is
   written under a working name and renamed into place once whole. A size newer
   than its source is kept. `img/.made-with.json` records the widths and the
   quality, and a change to either remakes every picture. One conversion may
   take at most 120 s.
2. **The canned files swap in whole.** The new set is written beside the old,
   and the two swap by rename. A swap cut short between its renames is put back
   at the start of the next run.
3. **The film list is replaced by rename.**
4. **Old pictures go last.** Only then are the pictures of films no longer shown
   removed.

## 7. What the site fetches

- The site's page fetches its own stylesheet, scripts, curtain, case, logos and
  ticket from `/site/`, and its fonts, marquee drawings, tab icon and TMDB logo
  from the page copy under `/static/`.
- A demo frame fetches Matinee's page from `/demo/` and `/static/`, its canned
  replies from `/canned/`, and its pictures from `/img/`.
- Every one of these is on the site's own origin. Nothing is fetched from any
  other service.

## 8. Tests and the gate

**Setup.** `./bootstrap.sh` runs once. It installs the development tools
(ESLint, and Playwright at a pinned version), installs the Chromium that
Playwright version drives, and points git at the committed hook in `.githooks/`. The site
itself needs nothing installed.

**The gate.** `./check.sh` runs ESLint over the site's own scripts, the
stand-in and the tests. It then runs every test file, one at a time, within 600 s. The tests that
drive a page drive it in a headless Chromium. The lint rules forbid nested ternaries,
cyclomatic complexity over 10, `var`, loose equality, and assigning
`innerHTML` or `outerHTML`. The rest of the page copy is Matinee's own and is
linted in Matinee.

**The hook.** The committed pre-commit hook runs `./check.sh`. On the
maintainer's machine it first runs a leak check that refuses anything
identifying a home. That check lives outside this repository, so a
contributor's commit runs `./check.sh` alone.

**The test server.** `tests/serve.mjs` serves the repository as GitHub Pages
does: each file by its extension's type, a file with no extension as
`application/octet-stream`, `X-Content-Type-Options: nosniff` on every reply,
and a folder by its `index.html`.

**What the tests hold.** Each test below fails when its statement stops
being true.

- **The deck** (`tests/deck.test.mjs`) is judged by where the slides stand, not
  by a counter. A short nudge shows and springs back. One flick moves one slide
  however long its momentum runs, and the rising slide is not yet home at
  0.4 s. The keys move one slide, Home and End reach either end, and Space on a
  bulb presses only the bulb. A pull past either end gives a sliver and never
  blanks the screen. A pull begun mid-settle moves on from where the deck
  stands. A tall slide scrolls by wheel and by key first. An overflow of 8 px
  does not hold the deck. A bulb moves to its slide. Reduced motion
  crossfades. A finger moves on by distance or by speed. A second finger
  returns the deck. A flick that scrolls a tall slide to its end does not also
  move the deck.
- **The slides** (`tests/site.test.mjs`): every slide fits at eleven screen
  sizes, from 1024 × 768 to 2560 × 1440 and four phones from 390 px wide. The
  page fetches nothing from another origin and nothing fails to load. "Get
  started" and the ticket link to Matinee's repository. The About carries the
  demo's poster sentence, the Plex, Jellyfin and TMDB credits, and the poster
  notice last. The About takes the keys, and Back closes it. The site's own
  words (`index.html` and `README.md`) never say "roll again".
- **The page copy** (`tests/page-copy.test.mjs`): the copy holds exactly the
  files `PAGE_FILES` lists, and every one matches its checksum except
  `static/js/api.js`, which equals `tools/api.js`. Where a Matinee checkout is
  at hand (`MATINEE_CHECKOUT`, or a `matinee` folder beside the site), every
  checksum also matches the file at the commit in `MATINEE_COMMIT`. Elsewhere
  that half is skipped.
- **The stand-in** (`tests/stand-in.test.mjs`): every canned walk step is
  answered by its own answers. Each branch's films come round in turn, seven
  draws deep. Before a branch, the door's branches deal. The boot replies, the
  first screen, a film card and a note are answered. An unknown call, a missing
  film and a failed read each give a failure, and a failed read is tried again.
- **The canned files** (`tests/canned.test.mjs`): five doors open in order with
  no source question. Every answer leads to a canned step. Each branch reveals
  three films, none twice, each with its card and its backdrop, and none marked
  as the films running out. Each revealed film stands behind its own branch.
  Every card links to its TMDB page with no picture path and no synopsis. The
  picture source is the site's own. Every film a screen shows has its poster at
  every size, and no picture is kept for a film no screen shows. No canned file
  holds an item id, a `{tmdb-` marker, a path under `/home/` or `/mnt/`, the
  placeholder address, an address other than TMDB's and DoesTheDogDie's, or a
  private field by name.
- **The walk** (`tests/demo-walk.test.mjs`): on a desktop and on a phone, every
  branch of every door walks to a pick, round its three films in the canned
  order and back to the first, then "Start over". The walk fails on Matinee's problem
  screen, a page error, an unhandled rejection, a step whose next screen does
  not appear in time, and any request to another origin. The corner mark inside
  the demo starts over in place at `/demo/`.
- **The frames** (`tests/frames.test.mjs`): both screens open on the doors
  question. A per-frame watch sees no front door in either frame through Change
  avatar, Switch profiles, Delete profile and a reload. Each frame stays at
  `/demo/`. A window that widens past a phone's width gets its monitor's demo
  once.
- **The mirror** (`tests/mirror.test.mjs`): a walk on the monitor moves the
  drawn phone to the pick, through "Not that one" and back to the start. A walk on the
  drawn phone moves the monitor, and the phone's Back and the desktop's trail move
  both. "Just pick one!" mid-walk and the phone's Back on a pick move both. A
  menu or About closes in both by Escape, by a press beside it and by About's
  Back, and About's Back moves the other screen nowhere. A frame reloaded
  mid-walk brings both back together at the doors, with at most two reloads. At
  full motion the screens keep step through a pick and "Not that one". A wheel
  over a frame moves the deck. A flick that scrolls inside a frame, even to its
  end, leaves the deck where it is.
- **The phone's demo** (`tests/phone-demo.test.mjs`): a phone sees only the
  drawn phone and "Try the demo", which opens Matinee full screen on the doors
  question with the "Demo ✕" chip. Back returns to slide two. The chip closes
  the demo even after Matinee's About opened inside it, and leaves the page's
  history as it stood.

## 9. Interfaces

These are the shapes another program parses: the stand-in reads the canned
files, the builder reads and writes the film list, and the page-copy test reads
the commit record and the checksums. Matinee's page requests the pictures by
path, and the builder reads `img/.made-with.json` back to decide whether to
remake them.

### 9.1 The canned files

All live under `canned/`. Each is one line of compact JSON. Every reply body is
Matinee's own reply shape for that route, as specified in Matinee's spec; only
the layout of the files is the site's.

```text
canned/boot.json             { "admission": …, "setup": …, "quips": …, "pictures": …,
                               "door": …, "open": …, "note": null }
canned/first.json            Matinee's /api/first reply
canned/walk/<tree>.json      { "<answers key>": <Matinee's /api/walk reply>, … }
canned/picks.json            { "<tree>/<branch>": [ <pick reply>, <pick reply>, <pick reply> ], … }
canned/film/<tmdb id>.json   Matinee's /api/film/<id> reply
```

(`tools/build_demo.py::canned_files`, `tools/build_demo.py::record`)

- `<tree>` is one of `comedy`, `horror`, `scifi`, `kids`, `nonfiction`.
- An answers key joins each answer as `question:option`, with commas. The empty
  key `""` is the door's first step.
  (`tools/build_demo.py::key`, `tools/api.js::keyOf`)
- `<branch>` is the door's first answer as `question:option`, or `_` for a door
  that asks nothing. (`tools/build_demo.py::branches`)
- These fields hold the same values on every build, except that `tmdb` and
  `link` name each card's own film (`tools/build_demo.py::card`,
  `tools/build_demo.py::canned_files`, `tools/build_demo.py::record`):

```json
{ "pictures": { "source": "server", "posters": {} } }
```

```json
{ "tmdb": 105, "synopsis": null, "link": "https://www.themoviedb.org/movie/105",
  "link_to": "tmdb", "backdrop_path": null }
```

  The first block is a part of `boot.json`. The second is a part of every film
  card. Separately, `first.json` always carries `"source": null`.

### 9.2 The pictures

```text
img/poster/<tmdb id>/xs | s | m | l     WebP, 100 / 160 / 320 / 640 px wide, no extension
img/backdrop/<tmdb id>/l                WebP, 1600 px wide, no extension
img/.made-with.json                     {"quality": 72, "poster": {"xs": 100, "s": 160, "m": 320, "l": 640}, "backdrop": {"l": 1600}}
```

(`tools/build_demo.py::pictures`, `tools/build_demo.py::convert`)

### 9.3 `tools/demo-films.json`

```json
{
  "exclude": [176],
  "reveal": {
    "comedy/room:0": [105, 14160, 862],
    "nonfiction/_": [1667, 158999, 1430]
  }
}
```

`exclude` lists TMDB ids the site must never show. `reveal` maps each branch to
its three TMDB ids, in film-id order, which is the order "Not that one" deals
them. The builder writes `exclude` sorted and `reveal` for every branch.
(`tools/build_demo.py::main`, `tools/build_demo.py::choose_all`)

### 9.4 `MATINEE_COMMIT` and `PAGE_FILES`

`MATINEE_COMMIT` holds one line: the full 40-character hash of the Matinee
commit the page copy came from.

`PAGE_FILES` holds one line per copied file: the file's SHA-256 checksum as
that commit has it, two spaces, and its path in the site. The stand-in's path
is listed with Matinee's checksum, not the stand-in's.

```text
22954ac9be51ede5d4927389c362103ddbe366018aec2e3a93bf39dd3098f00f  static/avatars/3d-glasses-256.webp
```

(`tools/copy_page.sh`; read by `tests/page-copy.test.mjs`)

# Known limits

As the code stood on 2026-10-07.

1. **Safari is unmeasured.** The tests run in Chromium only. Whether Safari
   paints a poster served with no extension, as `application/octet-stream` with
   `nosniff`, has not been checked.
2. **No synopsis on demo cards.** TMDB's terms forbid keeping its data longer
   than six months, and a public repository's history keeps every committed file
   for good, so no canned card carries TMDB's synopsis.
3. **The canned walk is a snapshot.** It records the library, the shipped
   labels, Matinee's trees and Matinee's lines as they stood when the builder
   ran. A later change to any of them reaches the site only through a rebuild.
   The page copy is likewise one Matinee commit. Nothing checks that the canned
   files were built from the commit in `MATINEE_COMMIT`.
4. **The commit half of the page-copy check needs a Matinee checkout.** Without
   one, the test checks the copy against `PAGE_FILES` only.
5. **The leak check runs only beside its own checkout.** On a machine without
   it, the hook runs `./check.sh` alone. The builder's refusals (section 6.5)
   and the canned-file test still run everywhere.
6. **"Roll again" is checked in the site's own words only**: `index.html` and
   `README.md`. Matinee's page copy and the canned replies carry Matinee's own
   text.
7. **The demo keeps nothing.** A changed avatar, a deleted profile and a note
   are answered and forgotten. A reload starts at the doors.
8. **Two live frames on a modest laptop are unmeasured.** No test measures how
   smoothly the monitor and the phone run together on slow hardware.

---

# Part 2 — Map

A pointer to where each part lives, never proof of what it does. Every entry
was verified against the source on 2026-10-07. Search by the symbol.

### The deck

| Handle | What it guarantees |
|---|---|
| `site/deck.js::deck` | The deck over the slides: wheel, finger, keys and bulbs; one flick moves one slide; `busy()` hands the input to an overlay; `arrived()` runs on each move |
| `site/deck.js::place` | Where a slide stands for a deck position: rising, sinking and fading, or crossfading under reduced motion |
| `site/deck.js::scrollsInside` | A slide overflowing by more than 8 px scrolls inside itself before the deck moves |
| `site/deck.js::deck` → `keyTarget` | The slide a key moves to, or none |
| `site/deck.js::QUIET_MS` | 200 ms of quiet ends a gesture; the mirror shares it for a wheel over a frame |

### The slides and the About

| Handle | What it guarantees |
|---|---|
| `index.html` | The three slides, the top bar, the bulbs, the About and the full-screen demo's shell, with every word the site says |
| `site/site.css` | The curtain, the slides' layout and fit, the drawn monitor and phone, the poster cases, the ticket, the scrim, the phone layout at 600 px, reduced motion, and the frames' fade |
| `site/site.css::.handset .demo-frame` | On a phone the drawn phone is a preview that takes no input |
| `site/site.css::.demo-chip` | The "Demo ✕" chip at the top centre, clear of Matinee's bar |
| `site/site.js::marquee` | Lays Matinee's wide and narrow marquee drawings into slide one from the page copy |
| `site/site.js::typeLine` | Types a line once, gold then cream, at two characters every 24 ms, holding its shape, with no caret |
| `site/site.js::overlay` | An overlay is a history step: Back closes it, and its own close steps back over every step since it opened |
| `site/site.js::openDemo` | Makes the full-screen frame on first open, keeps it, and opens the overlay |
| `site/site.js::mountDesk` | The monitor's frame on a wide screen, or once when the window widens, joined to the phone by the mirror |

### The demo

| Handle | What it guarantees |
|---|---|
| `tools/copy_page.sh` | Copies Matinee's page from one commit, records `PAGE_FILES` before placing the stand-in, and writes `MATINEE_COMMIT` |
| `tools/api.js` (copied to `static/js/api.js`) | The stand-in: Matinee's four helpers, answered from the canned files |
| `tools/api.js::canned` | Reads a canned file once; forgets a failed read so it is tried again |
| `tools/api.js::dealFrom` | The branches a pick deals from: the branch, the door's branches, or every branch |
| `tools/api.js::pick` | The film at the count of films seen, modulo the deal: cycles without end |
| `tools/api.js::walk` | A walk step by its answers key |
| `tools/api.js::get` / `post` / `put` / `del` (exported through `call`) | Answers every route the page calls; an unknown `get` or `post` route answers 404; a failed read answers 500 with a warning |
| `tools/api.js::seeded` | Matinee's quip draws come from one fixed sequence in every frame; every other `Math.random` stays native |
| `site/demo.js::mountDemo` | A frame of `/demo/` at a screen's size, scaled to its glass, resolving once a visitor can use it |
| `site/demo.js::keepPastDoor` | Presses the Guest tile while the frame is hidden whenever the front door stands; shows the frame at the doors |
| `site/demo.js::guestTile` / `atDoors` | The front door's Guest tile when pressable; whether the doors question stands |
| `site/mirror.js::mirror` | Replays each frame's presses, Escape, presses beside a control and history steps in the other, in order; `resync` reloads every frame together |
| `site/mirror.js::signature` / `sameKind` / `counterpart` | Finds a control's twin by tag and classes, words and index; a phone pick's Back falls back to the last way back on the trail |
| `site/mirror.js::replay` | Waits up to 4 s for the twin, then reports failure |
| `site/mirror.js::scrollsHere` | Whether a wheel over a frame scrolls something inside it |

### The canned-walk builder

| Handle | What it guarantees |
|---|---|
| `tools/build_demo.py::client` | Matinee's own app in process on a copy of the film table; the table's record of the library replaces the media server; no synopsis |
| `tools/build_demo.py::Library` | The library as the table recorded it; answers no synopsis |
| `tools/build_demo.py::record` | The boot replies, the Guest profile, the first screen, every walk and one pick template, all as "only what we can watch" |
| `tools/build_demo.py::walk_door` | Walks every answer path behind one door and records each step's reply |
| `tools/build_demo.py::branches` | A door's branches: its first answers, or `_` |
| `tools/build_demo.py::usable_poster` | A real poster: width over height between 0.6 and 0.75 |
| `tools/build_demo.py::Revealable.allows` | Real poster, backdrop, year 1985 or later, and labelled behind the door (Documentaries by Matinee's rule) |
| `tools/build_demo.py::choose_all` / `choose` | Keeps listed films that still qualify, reserves them first, fills the rest with the most-voted films, keeps each branch's three in film-id order, with no film in two branches |
| `tools/build_demo.py::check_reveal` | Refuses a branch without three films, a film off its branch, or a film in two branches |
| `tools/build_demo.py::card` | A card linked to TMDB with no synopsis and no backdrop path |
| `tools/build_demo.py::canned_files` | The canned files in memory: walls of real-poster films in film-id order, the first wall as every door's films, `source` null |
| `tools/build_demo.py::PRIVATE_FIELDS` / `private_fields` / `leaks` | Refuses a private field by name, a setting's value, a folder marker or an item id before anything is written |
| `tools/build_demo.py::pictures` / `convert` | WebP at Matinee's widths, quality 72, metadata stripped; written under a working name and renamed whole; remade when the widths or quality change |
| `tools/build_demo.py::write_canned` | Swaps the canned set in whole; restores an interrupted swap |
| `tools/build_demo.py::prune` | Removes the pictures of films no longer shown, last |
| `tools/build_demo.py::main` | The order: pictures, canned files, film list by rename, prune |
| `tools/demo-films.json` | Three films per branch and the films the site never shows |

### Tests and the gate

| Handle | What it guarantees |
|---|---|
| `check.sh` | ESLint, then every test file in turn, within 600 s |
| `bootstrap.sh` | Installs the development tools and Chromium, and points git at `.githooks/` |
| `.githooks/pre-commit` | The leak check where its checkout stands beside the site, then `./check.sh` |
| `eslint.config.js` | Matinee's lint rules over the site's scripts, the stand-in and the tests |
| `tests/serve.mjs::serve` | A static server that answers as GitHub Pages does |
| `tests/deck.test.mjs` | The deck's gestures, judged by where the slides stand |
| `tests/site.test.mjs` | Fit at eleven sizes, no other origin, the links, the About, no "roll again" |
| `tests/page-copy.test.mjs` | The copy against `PAGE_FILES`, and against the commit where a checkout is at hand |
| `tests/stand-in.test.mjs` | Every walk key, the cycle, the boot replies, failures and the retry |
| `tests/canned.test.mjs` | The canned files' completeness, branch membership, links, picture source, pictures and privacy |
| `tests/demo-walk.test.mjs` | Every branch walked to a pick and round its films, on a desktop and a phone |
| `tests/frames.test.mjs` | No front door ever visible in a frame; the late monitor |
| `tests/mirror.test.mjs` | Both screens keep step through walks, picks, menus, About, reloads and the wheel |
| `tests/phone-demo.test.mjs` | The phone's full-screen demo, its chip and Back |
| `.nojekyll` | Pages serves the files as they stand |
