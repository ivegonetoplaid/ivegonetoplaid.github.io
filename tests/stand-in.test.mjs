// The stand-in api.js on its own, with the canned files served from disk: it answers every canned walk step by
// its answers, cycles each path's three films without end, answers each film card and the boot replies, and
// answers a call it has no canned file for as a failure the page can show, not as a crash.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
let failNext = false;
globalThis.fetch = async (url) => {
  if (failNext) {
    failNext = false;
    throw new TypeError("the network failed");
  }
  try {
    const body = readFileSync(`${ROOT}${url.replace(/^\//, "")}`, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};
globalThis.console.warn = () => {};
const api = await import(`${ROOT}tools/api.js`);
const read = (name) => JSON.parse(readFileSync(`${ROOT}canned/${name}`, "utf8"));
const answersOf = (key) => (key ? key.split(",").map((kv) => ({ question: kv.split(":")[0], option: Number(kv.split(":")[1]) })) : []);

test("every canned walk step is answered by its answers", async () => {
  for (const f of readdirSync(`${ROOT}canned/walk`)) {
    const tree = f.replace(".json", "");
    for (const [key, step] of Object.entries(read(`walk/${f}`))) {
      const got = await api.post("/api/walk", { tree, answers: answersOf(key), viewer: {}, source: "all" });
      assert.ok(got.ok, `${tree} ${key}`);
      assert.deepEqual(got.data, step);
    }
  }
});

test("each path's films come round in turn without end, and before a path every path of the door deals", async () => {
  const picks = read("picks.json");
  for (const [path, replies] of Object.entries(picks)) {
    const [tree, answer] = path.split("/");
    const answers = answer === "_" ? [] : answersOf(answer);
    for (let seen = 0; seen < 7; seen++) {
      const got = await api.post("/api/pick", { tree, answers, seen: Array(seen).fill(1) });
      assert.equal(got.data.film.tmdb, replies[seen % 3].film.tmdb, `${path} after ${seen}`);
    }
  }
  const door = Object.keys(picks).filter((n) => n.startsWith("comedy/")).flatMap((n) => picks[n]);
  const got = await api.post("/api/pick", { tree: "comedy", answers: [], seen: [] });
  assert.equal(got.data.film.tmdb, door[0].film.tmdb);
  assert.ok((await api.post("/api/pick", { tree: null, answers: [], seen: [] })).ok);
});

test("the boot replies, the first screen, a film card and a note are answered", async () => {
  for (const path of ["/api/admission", "/api/setup", "/api/quips", "/api/pictures", "/api/door"]) assert.ok((await api.get(path)).ok, path);
  assert.deepEqual((await api.post("/api/first", { viewer: {} })).data, read("first.json"));
  const film = readdirSync(`${ROOT}canned/film`)[0];
  assert.deepEqual((await api.get(`/api/film/${film.replace(".json", "")}`)).data, read(`film/${film}`));
  assert.ok((await api.post("/api/notes", {})).data.lines.length);
  assert.ok((await api.post("/api/profiles/1/open", { pin: null })).ok);
});

test("an unknown call, a missing film or a failed read is a failure the page can show, and a failed read is tried again", async () => {
  assert.equal((await api.get("/api/nothing")).status, 404);
  assert.equal((await api.get("/api/film/1")).ok, false);
  const unread = readdirSync(`${ROOT}canned/film`)[1].replace(".json", "");
  failNext = true;
  const failed = await api.get(`/api/film/${unread}`);
  assert.equal(failed.ok, false);
  assert.ok(failed.data.message);
  assert.ok((await api.get(`/api/film/${unread}`)).ok, "a card is read again after a failed read");
});
