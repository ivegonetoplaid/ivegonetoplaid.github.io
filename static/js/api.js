// The demo's stand-in for Matinee's api.js: the only page file the site replaces. Every call is answered from
// the canned files under /canned/, recorded from Matinee's own server, and comes back as { ok, status, data } as
// the real helpers' calls do. Nothing here talks to a server.
//
// The walk is answered by its answers; a pick by its branch (the door's first answer): each branch reveals its
// three films in turn, without end, and "Just pick one!" before a branch is chosen deals from every branch of
// the door, or of every door.

// The demo's two screens show one demo, so they say the same lines. The page's quip deck shuffles with
// Math.random, which it reads once, when it starts; this module is read before it. So every shuffle the deck
// makes draws from one fixed sequence, the same in every frame, while every other use of Math.random (the wall)
// stays random.
const native = Math.random;
let seed = 0x6d61746e; // any fixed number; the same in every frame
function seeded() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = () => (/\/quips\.js/.test(new Error().stack || "") ? seeded() : native());

const files = new Map();

// A canned file, fetched once.
function canned(name) {
  if (!files.has(name)) {
    files.set(
      name,
      fetch(`/canned/${name}`)
        .then((res) => {
          if (!res.ok) throw new Error(`/canned/${name} answered ${res.status}`);
          return res.json();
        })
        .catch((err) => {
          files.delete(name); // a file that could not be read is asked for again next time
          throw err;
        }),
    );
  }
  return files.get(name);
}

const reply = (data, status = 200) => ({ ok: status < 400, status, data });
const missing = (what) => reply({ error: "not_found", message: `The demo has no answer for ${what}.` }, 404);

// The walk's answers as the canned walk keys them: question:option, joined with commas.
const keyOf = (answers = []) => answers.map((a) => `${a.question}:${a.option}`).join(",");

// The films a pick deals from, as the branches' names in picks.json.
function dealFrom(picks, tree, answers = []) {
  const names = Object.keys(picks);
  if (!tree) return names;
  const door = names.filter((n) => n.startsWith(`${tree}/`));
  if (!answers.length) return door;
  const branch = `${tree}/${keyOf(answers.slice(0, 1))}`;
  return names.includes(branch) ? [branch] : door;
}

async function pick(body) {
  const picks = await canned("picks.json");
  const deal = dealFrom(picks, body.tree, body.answers).flatMap((n) => picks[n]);
  if (!deal.length) return missing("that pick");
  return reply(deal[(body.seen || []).length % deal.length]);
}

async function walk(body) {
  const steps = await canned(`walk/${body.tree}.json`);
  const step = steps[keyOf(body.answers)];
  return step ? reply(step) : missing("that walk");
}

const BOOT = { "/api/admission": "admission", "/api/setup": "setup", "/api/quips": "quips", "/api/pictures": "pictures", "/api/door": "door" };

async function get(path) {
  if (BOOT[path]) return reply((await canned("boot.json"))[BOOT[path]]);
  const film = /^\/api\/film\/(\d+)$/.exec(path);
  if (film) return reply(await canned(`film/${film[1]}.json`));
  return missing(path);
}

async function post(path, body = {}) {
  if (path === "/api/first") return reply(await canned("first.json"));
  if (path === "/api/walk") return walk(body);
  if (path === "/api/pick") return pick(body);
  if (/^\/api\/profiles\/\d+\/open$/.test(path)) return reply((await canned("boot.json")).open);
  if (path === "/api/notes") return reply({ lines: ["Thanks for that. On a real Matinee it goes to whoever runs it.", "This is only the demo."] });
  return missing(path);
}

// A profile's changes (its avatar, deleting it) are taken and forgotten: the demo keeps no state.
async function put(path, body = {}) {
  const seat = (await canned("boot.json")).open;
  if (/\/avatar$/.test(path)) return reply({ ...seat, avatar: body.avatar ?? seat.avatar });
  return reply(seat);
}

async function del() {
  return reply((await canned("boot.json")).open);
}

// Every answer comes back as { ok, status, data }; a canned file that cannot be read is a failure the page shows.
async function call(answer) {
  try {
    return await answer();
  } catch (err) {
    console.warn("the demo could not answer from its canned files", err);
    return reply({ error: "refused", message: "The demo could not read its canned answers." }, 500);
  }
}

const getCall = (path) => call(() => get(path));
const postCall = (path, body) => call(() => post(path, body));
const putCall = (path, body) => call(() => put(path, body));
const delCall = (path) => call(() => del(path));

export { getCall as get, postCall as post, putCall as put, delCall as del };
