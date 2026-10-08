// The demo's canned files: every answer a canned question offers leads to a canned step; every film a screen
// shows has its poster at each size the page asks for; every revealed film has its card and its backdrop; the
// cards link to TMDB and carry no TMDB picture path; the picture source is the site's own; each path reveals
// three films and no film is revealed by two paths.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (name) => JSON.parse(readFileSync(join(ROOT, "canned", name), "utf8"));
const walks = Object.fromEntries(readdirSync(join(ROOT, "canned/walk")).map((f) => [f.replace(".json", ""), read(`walk/${f}`)]));
const picks = read("picks.json");
const first = read("first.json");
const boot = read("boot.json");

test("the demo opens five doors on the doors question, with no source question", () => {
  assert.deepEqual(first.options.map((o) => o.tree), ["comedy", "horror", "scifi", "kids", "nonfiction"]);
  assert.equal(first.source, null);
  assert.equal(first.lines[1], "What are we in the mood for?");
  assert.deepEqual(Object.keys(walks).sort(), ["comedy", "horror", "kids", "nonfiction", "scifi"]);
});

test("every answer a canned question offers leads to a canned step", () => {
  for (const [tree, steps] of Object.entries(walks)) {
    for (const [key, step] of Object.entries(steps)) {
      for (const o of step.question?.options ?? []) {
        const next = [key, `${step.question.id}:${o.index}`].filter(Boolean).join(",");
        assert.ok(steps[next], `${tree} ${next}`);
      }
    }
  }
});

test("each path reveals three films, no film twice, each with its card, its backdrop and the demo's own synopsis", () => {
  const seen = new Set();
  for (const [path, replies] of Object.entries(picks)) {
    assert.equal(replies.length, 3, path);
    for (const r of replies) {
      assert.ok(!seen.has(r.film.tmdb), `${r.film.tmdb} is revealed by two paths`);
      seen.add(r.film.tmdb);
      assert.ok(existsSync(join(ROOT, "canned/film", `${r.film.tmdb}.json`)), `card ${r.film.tmdb}`);
      assert.ok(existsSync(join(ROOT, "img/backdrop", String(r.film.tmdb), "l")), `backdrop ${r.film.tmdb}`);
      assert.equal(r.exhausted, null);
      assert.ok(r.film.synopsis?.length > 20, `synopsis ${r.film.tmdb}`);
    }
  }
});

test("every canned card links to its TMDB page and carries no TMDB picture path or synopsis", () => {
  for (const f of readdirSync(join(ROOT, "canned/film"))) {
    const c = read(`film/${f}`);
    assert.equal(c.link, `https://www.themoviedb.org/movie/${c.tmdb}`);
    assert.equal(c.link_to, "tmdb");
    assert.equal(c.backdrop_path, null);
    assert.equal(c.synopsis, null);
  }
});

test("the picture source is the site's own, with no TMDB paths", () => {
  assert.deepEqual(boot.pictures, { source: "server", posters: {} });
  assert.equal(boot.door.posters_from, "server");
});

test("every film a screen shows has its poster at every size", () => {
  const shown = new Set([...first.pool, ...Object.values(walks).flatMap((s) => Object.values(s).flatMap((x) => x.pool))]);
  const missing = [...shown].filter((t) => !["xs", "s", "m", "l"].every((size) => existsSync(join(ROOT, "img/poster", String(t), size))));
  assert.deepEqual(missing, []);
});

test("the canned files hold nothing from the operator's machines", () => {
  for (const dir of ["canned", "canned/walk", "canned/film"]) {
    for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith(".json"))) {
      const text = readFileSync(join(ROOT, dir, f), "utf8");
      assert.doesNotMatch(
        text,
        /\b[0-9a-f]{32}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\{tmdb-|\/mnt\/|\/home\/|library\.invalid|https?:\/\/(?!www\.themoviedb\.org|www\.doesthedogdie\.com)/i,
        `${dir}/${f}`,
      );
    }
  }
});

test("each revealed film stands behind its own path", () => {
  for (const [path, replies] of Object.entries(picks)) {
    const [tree, answer] = path.split("/");
    const pool = new Set(walks[tree][answer === "_" ? "" : answer].pool);
    for (const r of replies) assert.ok(pool.has(r.film.tmdb), `${r.film.title} is not behind ${path}`);
  }
});

test("the pictures hold no film that no screen shows", () => {
  const shown = new Set([...first.pool, ...Object.values(walks).flatMap((s) => Object.values(s).flatMap((x) => x.pool))].map(String));
  const revealed = new Set(Object.values(picks).flatMap((rs) => rs.map((r) => String(r.film.tmdb))));
  assert.deepEqual(readdirSync(join(ROOT, "img/poster")).filter((d) => !shown.has(d)), []);
  assert.deepEqual(readdirSync(join(ROOT, "img/backdrop")).filter((d) => !revealed.has(d)), []);
});

// Fields that only ever carry something from the operator's machines, whatever their values look like.
const PRIVATE = new Set(["item_id", "itemid", "path", "file", "folder", "server", "host", "url", "key", "token", "library"]);
function privateFields(data, found = []) {
  if (Array.isArray(data)) data.forEach((v) => privateFields(v, found));
  else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (PRIVATE.has(k.toLowerCase())) found.push(k);
      privateFields(v, found);
    }
  }
  return found;
}

test("no canned reply carries a field that only holds something from the operator's machines", () => {
  for (const dir of ["canned", "canned/walk", "canned/film"]) {
    for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith(".json"))) {
      assert.deepEqual(privateFields(JSON.parse(readFileSync(join(ROOT, dir, f), "utf8"))), [], `${dir}/${f}`);
    }
  }
});
