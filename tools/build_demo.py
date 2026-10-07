"""Builds the demo's canned replies and pictures from a Matinee checkout, a film table and the film folders.

Run it with the Python of a Matinee checkout, so it can import Matinee (`<matinee>/.venv/bin/python
tools/build_demo.py`). It runs Matinee's own server code in this process against a copy of the film table, with
the library the table was built from standing in as the media server, and records every reply the demo's page
asks for. The pictures are made from each film's own folder: `folder.jpg` for its poster and `backdrop.jpg` for
its backdrop, as WebP at each size Matinee's page asks for.

Settings, read from the environment and never written out:
  FILM_TABLE   a films.sqlite that Matinee's nightly rebuild wrote with a library
  FILM_DIRS    the film folders, colon-separated; each film's folder name carries `{tmdb-N}`

The films the demo reveals are listed in tools/demo-films.json, three per branch (a door's first answer), with
`exclude` naming any film the site must never show. A branch with no list gets three films chosen here, and the
file is written back. Removing a film is one entry under `exclude`; the next build drops it and its pictures.

Usage: FILM_TABLE=... FILM_DIRS=... <matinee>/.venv/bin/python tools/build_demo.py
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from matinee.engine import load_catalog
from matinee.labels import load_labels
from matinee.library.choice import MediaServer
from matinee.store import Store
from matinee.table import load_table, library_films
from matinee.web.app import IMAGE_WIDTHS, create_app
from matinee.web.config import Config
from matinee.web.theatre import Theatre

SITE = Path(__file__).resolve().parent.parent
CANNED = SITE / "canned"
IMG = SITE / "img"
FILMS_FILE = SITE / "tools" / "demo-films.json"
DOORS = ("comedy", "horror", "scifi", "kids", "nonfiction")  # the demo's doors, in the doors question's order
RULED = {"nonfiction"}  # doors whose films Matinee places by its own rule, not by the labels
GUEST = {"name": "Guest", "avatar": "popcorn"}
POSTER_WIDTHS = IMAGE_WIDTHS["poster"]
BACKDROP_WIDTHS = {"l": IMAGE_WIDTHS["backdrop"]["l"]}  # the only backdrop size the page asks for
MAGICK_S = 120  # the most one picture command may take
STAMP = IMG / ".made-with.json"  # the widths and quality the pictures were made with
POSTER_RATIO = (0.6, 0.75)  # width over height of a real poster; a video frame is wide
MODERN = 1985  # a revealed film is from this year or later
QUALITY = 72
TMDB_FILM = "https://www.themoviedb.org/movie"


@dataclass(frozen=True)
class Folder:
    """A film's own folder on disk, found by the TMDB id in its name."""

    path: Path

    @property
    def poster(self) -> Path:
        return self.path / "folder.jpg"

    @property
    def backdrop(self) -> Path:
        return self.path / "backdrop.jpg"


def setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is not set; see this script's docstring")
    return value


def folders(dirs: list[Path]) -> dict[int, Folder]:
    """Every film folder under `dirs`, by the TMDB id in its name."""
    found: dict[int, Folder] = {}
    for d in dirs:
        for entry in d.iterdir():
            m = re.search(r"\{tmdb-(\d+)\}", entry.name)
            if m and entry.is_dir():
                found.setdefault(int(m.group(1)), Folder(entry))
    return found


def dimensions(paths: list[Path]) -> dict[Path, tuple[int, int]]:
    """Width and height of each picture that exists, read without decoding it."""
    have = [p for p in paths if p.is_file()]

    def one(p: Path) -> tuple[Path, tuple[int, int]] | None:
        out = subprocess.run(
            ["magick", "identify", "-ping", "-format", "%w %h", f"{p}[0]"], capture_output=True, text=True, timeout=MAGICK_S
        )
        if out.returncode != 0:
            print(f"warning: a picture could not be read ({out.stderr.strip()[:120]})", file=sys.stderr)
            return None
        w, h = out.stdout.split()
        return p, (int(w), int(h))

    with ThreadPoolExecutor(8) as pool:
        return dict(r for r in pool.map(one, have) if r)


class Library:
    """The media server, as the film table recorded it: the films it held when the table was built."""

    def __init__(self, table: Path) -> None:
        self._films = library_films(load_table(table))

    def films(self) -> list[Any]:
        return self._films

    def synopsis(self, item_id: str) -> None:
        return None  # the demo shows no synopsis: TMDB's text is not kept on the site


def client(table: Path, work: Path) -> TestClient:
    """Matinee's own server, in this process, on a copy of the film table."""
    shutil.copy(table, work / "films.sqlite")
    labels = load_labels()
    theatre = Theatre(
        Library(work / "films.sqlite"),
        work / "films.sqlite",
        catalog_of=lambda t: load_catalog(t, labels=labels),
        listed=labels.films(),
    )
    config = Config(MediaServer("jellyfin", "http://library.invalid", "unused"), work, None, None)
    return TestClient(create_app(config, theatre, Store(work / "store.sqlite"), None), base_url="https://demo.invalid")


def ok(reply: Any) -> Any:
    if reply.status_code != 200:
        raise SystemExit(f"Matinee answered {reply.status_code} to {reply.request.method} {reply.request.url.path}")
    return reply.json()


@dataclass
class Walks:
    """Every walk reply a door gives, keyed by its answers as `question:option` joined with commas."""

    tree: str
    steps: dict[str, Any]


def walk_door(c: TestClient, viewer: dict[str, int], tree: str) -> Walks:
    steps: dict[str, Any] = {}
    todo: list[list[dict[str, Any]]] = [[]]
    while todo:
        answers = todo.pop()
        body = {"tree": tree, "answers": answers, "viewer": viewer, "source": "held"}
        step = ok(c.post("/api/walk", json=body))
        steps[key(answers)] = step
        question = step["question"]
        if question:
            todo += [[*answers, {"question": question["id"], "option": o["index"]}] for o in question["options"]]
    return Walks(tree, steps)


def key(answers: list[dict[str, Any]]) -> str:
    return ",".join(f"{a['question']}:{a['option']}" for a in answers)


def branches(walks: Walks) -> dict[str, list[int]]:
    """Each branch of a door (its first answer, or "_" for a door that asks nothing) and the films behind it."""
    first = walks.steps[""]
    if not first["question"]:
        return {"_": first["pool"]}
    q = first["question"]["id"]
    return {f"{q}:{o['index']}": walks.steps[f"{q}:{o['index']}"]["pool"] for o in first["question"]["options"]}


def usable_poster(dims: dict[Path, tuple[int, int]], folder: Folder | None) -> bool:
    if folder is None or folder.poster not in dims:
        return False
    w, h = dims[folder.poster]
    return POSTER_RATIO[0] <= w / h <= POSTER_RATIO[1]


@dataclass(frozen=True)
class Revealable:
    """What a film needs to be revealed: a real poster and a backdrop on disk, a year no earlier than MODERN, and,
    on a door the labels place, a place behind that door in the labels."""

    fit: set[int]
    backdrops: set[int]
    films: Any
    labelled: dict[str, frozenset[int]]

    def allows(self, tree: str, tmdb: int) -> bool:
        if tmdb not in self.fit or tmdb not in self.backdrops or tmdb not in self.films.index:
            return False
        if (self.films.at[tmdb, "year"] or 0) < MODERN:
            return False
        return tree in RULED or tmdb in self.labelled[tree]


def choose(tree: str, pool: list[int], need: int, taken: set[int], can: Revealable) -> list[int]:
    """`need` films to reveal from `pool`, the most-voted first, none revealed by another branch."""
    ids = [t for t in pool if t not in taken and can.allows(tree, t)]
    chosen = [int(t) for t in can.films.loc[ids].sort_values("vote_count", ascending=False).index[:need]]
    if len(chosen) < need:
        raise SystemExit(f"{tree} has too few films to reveal for a branch; list three by hand in {FILMS_FILE.name}")
    return chosen


def card(c: TestClient, tmdb: int) -> dict[str, Any]:
    """A film card as the demo serves it: linked to TMDB, with no synopsis and no TMDB picture path."""
    got = ok(c.get(f"/api/film/{tmdb}"))
    return {**got, "synopsis": None, "link": f"{TMDB_FILM}/{tmdb}", "link_to": "tmdb", "backdrop_path": None}


def pick(template: dict[str, Any], film: dict[str, Any]) -> dict[str, Any]:
    return {**template, "film": {"tmdb": film["tmdb"], "title": film["title"], "year": film["year"]}}


def convert(job: tuple[Path, Path, dict[str, int], bool]) -> int:
    """Writes `source` as WebP at each width to `out/<size>`, skipping sizes already newer than the source unless
    `fresh` asks for every one."""
    source, out, widths, fresh = job
    out.mkdir(parents=True, exist_ok=True)
    todo = {
        s: w
        for s, w in widths.items()
        if fresh or not (out / s).exists() or (out / s).stat().st_mtime < source.stat().st_mtime
    }
    if not todo:
        return 0
    # Each size is written under a working name and renamed into place once whole, so a failed run never leaves a
    # cut-off picture that looks newer than its source.
    args = ["magick", f"{source}[0]", "-strip", "-colorspace", "sRGB", "-write", "mpr:p", "+delete"]
    for size, width in todo.items():
        args += ["mpr:p", "-resize", f"{width}x", "-quality", str(QUALITY), "-write", f"webp:{out / size}.part", "+delete"]
    args += ["null:"]
    done = subprocess.run(args, capture_output=True, text=True, timeout=MAGICK_S)
    if done.returncode != 0:
        raise SystemExit(f"a picture could not be converted: {done.stderr.strip()[:200]}")
    for size in todo:
        (out / f"{size}.part").replace(out / size)
    return len(todo)


def prune(root: Path, keep: set[int]) -> int:
    """Removes the pictures of films the demo no longer shows."""
    gone = 0
    if root.is_dir():
        for d in root.iterdir():
            if not d.name.isdigit() or int(d.name) not in keep:
                shutil.rmtree(d)
                gone += 1
    return gone


def as_text(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


ITEM_ID = re.compile(r"\b[0-9a-f]{32}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)


# Fields that only ever carry something from the operator's machines, whatever their values look like (a Plex
# item id is a plain number).
PRIVATE_FIELDS = {"item_id", "itemid", "path", "file", "folder", "server", "host", "url", "key", "token", "library"}


def private_fields(data: Any) -> Iterator[str]:
    """Every field in `data`, at any depth, whose name is one of PRIVATE_FIELDS."""
    if isinstance(data, dict):
        for k, v in data.items():
            if str(k).lower() in PRIVATE_FIELDS:
                yield str(k)
            yield from private_fields(v)
    elif isinstance(data, list):
        for v in data:
            yield from private_fields(v)


def leaks(files: dict[str, str], values: list[str]) -> list[str]:
    """Every canned file holding a setting's value, a film folder's marker, a media-server item id, or a field
    that only ever carries something from the operator's machines."""
    found = []
    for name, text in files.items():
        fields = sorted(set(private_fields(json.loads(text))))
        if fields:
            found.append(f"canned/{name} has a private field: {', '.join(fields)}")
        if any(v and v in text for v in values) or ITEM_ID.search(text):
            found.append(f"canned/{name} holds something from the operator's machines")
    return found


@dataclass
class Recorded:
    """What Matinee's server said: the boot replies, the first screen, each door's walk, a pick to copy."""

    boot: dict[str, Any]
    first: dict[str, Any]
    walks: dict[str, Walks]
    pick: dict[str, Any]
    films: Any


def record(c: TestClient) -> Recorded:
    boot = {
        "admission": ok(c.get("/api/admission")),
        "setup": ok(c.get("/api/setup")),
        "quips": ok(c.get("/api/quips")),
        "pictures": ok(c.get("/api/pictures")),
    }
    guest = ok(c.post("/api/profiles", json=GUEST))
    viewer = {"profile_id": guest["id"]}
    boot["door"] = ok(c.get("/api/door"))
    boot["open"] = ok(c.post(f"/api/profiles/{guest['id']}/open", json={"pin": None}))
    boot["note"] = None
    first = ok(c.post("/api/first", json={"viewer": viewer, "source": "held"}))
    walks = {tree: walk_door(c, viewer, tree) for tree in DOORS}
    template = ok(c.post("/api/pick", json={"tree": DOORS[0], "viewer": viewer, "source": "held"}))
    return Recorded(boot, first, walks, template, None)


def choose_all(rec: Recorded, plan: dict[str, Any], can: Revealable) -> dict[str, list[int]]:
    """Three films per branch. A listed film is kept while it is behind its branch and may be revealed; every kept
    film is reserved first, so a branch that needs more takes only films no other branch keeps."""
    exclude = set(plan["exclude"])
    pools = {f"{tree}/{b}": (tree, pool) for tree, w in rec.walks.items() for b, pool in branches(w).items()}
    kept = {
        name: [t for t in plan["reveal"].get(name, []) if t in pool and t not in exclude and can.allows(tree, t)][:3]
        for name, (tree, pool) in pools.items()
    }
    taken = {t for films in kept.values() for t in films}
    reveal: dict[str, list[int]] = {}
    for name, (tree, pool) in pools.items():
        more = choose(tree, pool, 3 - len(kept[name]), taken, can) if len(kept[name]) < 3 else []
        reveal[name] = kept[name] + more
        taken |= set(more)
    check_reveal(reveal, pools)
    return reveal


def check_reveal(reveal: dict[str, list[int]], pools: dict[str, tuple[str, list[int]]]) -> None:
    """Refuses a reveal list that breaks the demo: a branch without exactly three films, a film behind another
    branch, or a film in two branches."""
    seen: dict[int, str] = {}
    for name, films in reveal.items():
        if len(films) != 3:
            raise SystemExit(f"{name} reveals {len(films)} films, not three")
        for t in films:
            if t not in pools[name][1]:
                raise SystemExit(f"film {t} is not behind {name}")
            if t in seen:
                raise SystemExit(f"film {t} is revealed by both {seen[t]} and {name}")
            seen[t] = name


def canned_files(rec: Recorded, fit: set[int], reveal: dict[str, list[int]], cards: dict[int, dict[str, Any]]) -> dict[str, str]:
    """The canned replies, by file name. Every pool holds only films with a real poster, in film-id order."""

    def clean(pool: list[int]) -> list[int]:
        return sorted(t for t in pool if t in fit)

    doors = [o for o in rec.first["options"] if o["tree"] in DOORS]
    reachable = {t for w in rec.walks.values() for t in w.steps[""]["pool"]}
    files = {
        "boot.json": as_text(rec.boot),
        "first.json": as_text({**rec.first, "options": doors, "pool": clean(list(reachable)), "source": None}),
        "picks.json": as_text({name: [pick(rec.pick, cards[t]) for t in films] for name, films in reveal.items()}),
    }
    for tree, w in rec.walks.items():
        files[f"walk/{tree}.json"] = as_text({k: {**s, "pool": clean(s["pool"])} for k, s in w.steps.items()})
    for t, c in cards.items():
        files[f"film/{t}.json"] = as_text(c)
    return files


def write_canned(files: dict[str, str]) -> None:
    """Writes the canned files beside the old ones, then swaps them in, so a failed write leaves the old set. A
    swap cut short between its two renames left the old set as `.canned-old`; it is put back first."""
    fresh = SITE / ".canned-new"
    old = SITE / ".canned-old"
    if old.exists() and not CANNED.exists():
        old.rename(CANNED)
    shutil.rmtree(fresh, ignore_errors=True)
    shutil.rmtree(old, ignore_errors=True)
    for name, text in files.items():
        path = fresh / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    if CANNED.exists():
        CANNED.rename(old)
    fresh.rename(CANNED)
    shutil.rmtree(old, ignore_errors=True)


def pictures(on_disk: dict[int, Folder], posters: set[int], backdrops: set[int]) -> int:
    """Every picture the demo shows, made afresh where the widths or the quality have changed since the last build."""
    made_with = {"quality": QUALITY, "poster": POSTER_WIDTHS, "backdrop": BACKDROP_WIDTHS}
    fresh = not STAMP.exists() or json.loads(STAMP.read_text()) != made_with
    jobs = [(on_disk[t].poster, IMG / "poster" / str(t), POSTER_WIDTHS, fresh) for t in sorted(posters)]
    jobs += [(on_disk[t].backdrop, IMG / "backdrop" / str(t), BACKDROP_WIDTHS, fresh) for t in sorted(backdrops)]
    with ThreadPoolExecutor(6) as pool:
        made = sum(pool.map(convert, jobs))
    STAMP.write_text(json.dumps(made_with) + "\n")
    print(f"pictures written: {made}")
    return made


def main() -> int:
    table = Path(setting("FILM_TABLE"))
    dirs = [Path(d) for d in setting("FILM_DIRS").split(":")]
    on_disk = folders(dirs)
    plan = json.loads(FILMS_FILE.read_text()) if FILMS_FILE.exists() else {"exclude": [], "reveal": {}}
    exclude = set(plan["exclude"])

    work = Path(tempfile.mkdtemp())
    try:
        c = client(table, work)
        rec = record(c)
        films = load_table(work / "films.sqlite").films
        shown = {t for w in rec.walks.values() for s in w.steps.values() for t in s["pool"]} - exclude
        candidates = [on_disk[t].poster for t in shown if t in on_disk] + [on_disk[t].backdrop for t in shown if t in on_disk]
        dims = dimensions(candidates)
        fit = {t for t in shown if usable_poster(dims, on_disk.get(t))}
        has_backdrop = {t for t in fit if on_disk[t].backdrop in dims}
        labels = load_labels()
        labelled = {tree: frozenset(labels.of(tree).kinds) for tree in DOORS if tree not in RULED}
        reveal = choose_all(rec, plan, Revealable(fit, has_backdrop, films, labelled))
        revealed = {t for films_ in reveal.values() for t in films_}
        cards = {t: card(c, t) for t in revealed}
    finally:
        shutil.rmtree(work, ignore_errors=True)

    files = canned_files(rec, fit, reveal, cards)
    found = leaks(files, [str(d) for d in dirs] + [str(table), "{tmdb-", "library.invalid"])
    if found:
        raise SystemExit("; ".join(found))
    # The new pictures first: they only add. Then the canned files swap in whole, then the film list, and only
    # then do the pictures of films no longer shown go. A failure at any step leaves the last good set standing.
    pictures(on_disk, fit, revealed)
    write_canned(files)
    plan_text = json.dumps({"exclude": sorted(exclude), "reveal": reveal}, indent=2) + "\n"
    FILMS_FILE.with_suffix(".part").write_text(plan_text)
    FILMS_FILE.with_suffix(".part").replace(FILMS_FILE)
    gone = prune(IMG / "poster", fit) + prune(IMG / "backdrop", revealed)
    print(f"films' pictures removed: {gone}")
    print(f"films shown: {len(shown)}; with a real poster: {len(fit)}; revealed: {len(revealed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
