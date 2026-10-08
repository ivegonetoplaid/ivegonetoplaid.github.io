// The demo's player: one screen of Matinee's demo, on rails. It builds Matinee's own screens in Matinee's own
// markup, so Matinee's stylesheet dresses them, and plays each press as a fixed script from the canned files:
// a genre, its subgenre question, the hunt and the reveal, "Not that one", "Just pick one!", the ways back and
// "Start over". Every screen of the demo runs this player and is handed the same presses at the same moment by
// the site's conductor (site/conductor.js); the player draws nothing at random, so every screen shows the same
// thing at once. Controls off the script (the profile menu's items, a note's Save) are shown and do nothing.

import { clear, h, isPhone, prefersLessMotion, sentenceCase, wait } from "/static/js/dom.js";
import { cornerMark } from "/static/js/flight.js";
import { initials, mark } from "/static/js/mark.js";
import { typeLine } from "/static/js/type.js";
import { DemoWall, posterUrl, seedOf } from "./player-wall.js";
import { scrollsHere } from "./scrolls.js";

const READ_MS = 1000; // Matinee's reply is read this long before the hunt starts, as in Matinee
const BEAT_MS = 500; // the grown poster holds one beat before it moves to rest
const SETTLE_MS = 1300; // the poster's move to rest
const PHONE_HOLD_MS = 2200; // a phone holds the poster before its screen scrolls to the film's details
const POSTER_RATIO = 1.5;
const POSTER_MIN_H = 160;
const QUIP_SETS = { comedy: "comedy", horror: "horror", action: "action" }; // a genre with lines of its own

const stage = document.getElementById("stage");
const wall = new DemoWall(document.getElementById("wall"));
const conductor = window.parent !== window ? window.parent.demoConductor : null;
let data = null;
let state = { screen: "doors" };
let round = 0; // each screen the player shows is a round; a step left behind by a newer one stops

// ---------- the canned files ----------

async function canned(name) {
  const res = await fetch(`/canned/${name}`);
  if (!res.ok) throw new Error(`/canned/${name} answered ${res.status}`);
  return res.json();
}

async function load() {
  const [boot, first, picks] = await Promise.all([canned("boot.json"), canned("first.json"), canned("picks.json")]);
  const trees = first.options.map((o) => o.tree);
  const walks = Object.fromEntries(await Promise.all(trees.map(async (tree) => [tree, await canned(`walk/${tree}.json`)])));
  return { boot, first, picks, walks };
}

// ---------- presses ----------

const SCREENS = new Set(["start", "door", "answer", "rush", "nope", "back", "crumb"]);

// Every button on the screen stops answering, so the first press on a screen wins, as in Matinee.
function lockStage() {
  for (const b of stage.querySelectorAll("button")) b.disabled = true;
}

// A press goes to the conductor, which hands it to every screen at once; with no conductor (the demo opened on
// its own) this screen plays it now. A press that changes the screen locks this one at once.
function press(intent) {
  if (SCREENS.has(intent.kind)) lockStage();
  if (conductor) conductor.press(intent);
  else run(intent);
}

function run(intent, still = false) {
  if (SCREENS.has(intent.kind)) {
    lockStage();
    wall.endPick();
  }
  const steps = {
    start: () => doors(still),
    door: () => openDoor(intent.tree, still),
    answer: () => pick({ mode: "answer", key: intent.key }, still),
    rush: () => pick({ mode: "rush" }, still),
    nope: () => pick({ mode: "nope" }, still),
    back: () => back(still),
    crumb: () => (intent.to === 0 ? doors(still) : openDoor(state.tree, still)),
    menu: () => showMenu(intent.open),
    note: () => showNote(intent.open),
  };
  return steps[intent.kind]?.();
}

// ---------- the words ----------

// Matinee's line, typed as Matinee types it; `still` paints it whole at once.
function say(line, gold, white, { still = false, shown = 0 } = {}) {
  if (!still) return typeLine(line, gold, white, { shown });
  const ack = sentenceCase(gold || "");
  const ask = /,\s*$/.test(ack) ? white || "" : sentenceCase(white || "");
  line.setAttribute("aria-label", [ack, ask].filter(Boolean).join(" "));
  line.replaceChildren(h("span", { class: "ack" }, ack), ask ? h("span", { class: "ask" }, ask) : "");
  return Promise.resolve();
}

// A quip from Matinee's own lines: `set` is reveal, nope or rush, from the genre's lines where it has its own.
// The same place in the walk always draws the same line.
function quip(set, place) {
  const sets = data.boot.quips.categories;
  const lines = sets[QUIP_SETS[state.tree]]?.[set] || sets.universal[set];
  return lines[(seedOf(`${set}/${place}`) >>> 0) % lines.length];
}

// ---------- the top bar ----------

function wordmark() {
  const go = (e) => {
    e.preventDefault();
    press({ kind: "start" });
  };
  return h("a", { class: "wordmark", href: "/demo/", onclick: go }, cornerMark("Matinee"));
}

// The guest's tag. Its menu opens, but nothing in it does anything: the demo has one guest and no settings.
function nameTag() {
  const guest = data.boot.open;
  const button = h(
    "button",
    { class: "viewer-button", type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": `${guest.name}, profile menu` },
    mark(guest, "bar"),
    h("span", { class: "viewer-name", "aria-hidden": "true" }, guest.name),
    h("span", { class: "viewer-initials", "aria-hidden": "true" }, initials(guest.name)),
  );
  button.addEventListener("click", () => press({ kind: "menu", open: menuClosed() }));
  const item = (text, danger = false) =>
    h("button", { class: danger ? "viewer-item danger" : "viewer-item", type: "button", role: "menuitem", onclick: () => press({ kind: "menu", open: false }) }, text);
  const menu = h(
    "div",
    { class: "viewer-menu", role: "menu", "aria-label": "Profile", hidden: true },
    item("Change avatar"),
    item("Switch profiles"),
    item("Delete profile", true),
    item("About Matinee"),
  );
  return h("div", { class: "viewer has-avatar" }, button, menu);
}

const menuClosed = () => stage.querySelector(".viewer-menu")?.hidden ?? true;

function showMenu(open) {
  const menu = stage.querySelector(".viewer-menu");
  if (!menu) return;
  menu.hidden = !open;
  stage.querySelector(".viewer-button")?.setAttribute("aria-expanded", String(open));
}

function topbar() {
  return h("header", { class: "topbar" }, wordmark(), nameTag());
}

// ---------- the ways back ----------

// The trail at the foot of a desktop's screen: each crumb before `here` leads back to its screen.
function trail(says, here) {
  if (says.length < 2) return null;
  const items = says.map((say, i) => {
    const words = sentenceCase(say);
    const crumb =
      i === here
        ? h("span", { class: "crumb here", "aria-current": "page", title: words }, words)
        : h("button", { class: "crumb", type: "button", title: words, onclick: () => press({ kind: "crumb", to: i }) }, words);
    return h("li", i <= 1 ? { class: "keep" } : {}, crumb);
  });
  return h("nav", { class: "trail", "aria-label": "The way here" }, h("ol", {}, items));
}

// A phone's way back from a question, in the trail's place: "Start over".
function wayBack() {
  const again = h("button", { class: "action cream", type: "button", onclick: () => press({ kind: "start" }) }, "Start over");
  return h("nav", { class: "way-back", "aria-label": "Way back" }, again);
}

const genreSay = () => data.first.options.find((o) => o.tree === state.tree)?.say;

// ---------- the question screens ----------

function letterbox(say, intent) {
  return h("button", { class: "letterbox", type: "button", onclick: () => press(intent) }, sentenceCase(say));
}

async function ask({ gold, question, options, count, footnote = null, many = false, says = [], still }) {
  const mine = ++round;
  const line = h("h1", { class: "line", "aria-live": "polite" });
  const answers = h("div", { class: `answers${many ? " many" : ""}`, role: "group", "aria-label": "Your answers", hidden: true }, options);
  const note = footnote ? h("p", { class: "footnote", hidden: true }, footnote) : null;
  const rush = h("button", { class: "action gold just-pick", type: "button", onclick: () => press({ kind: "rush" }) }, "Just pick one!");
  const row = h("div", { class: "just-pick-row", hidden: true }, rush, h("span", { class: "count" }, `${count.toLocaleString("en")} films to choose from`));
  stage.classList.remove("revealed");
  clear(stage).append(
    topbar(),
    h("section", { class: "talk" }, line, answers, note, row),
    h("div", { class: "bottombar" }, trail(says, says.length - 1), says.length ? wayBack() : null, h("span")),
  );
  await say(line, gold, question, { still });
  if (mine !== round) return;
  answers.hidden = false;
  if (note) note.hidden = false;
  row.hidden = false;
}

function doors(still) {
  state = { screen: "doors" };
  const { first } = data;
  wall.show(first.pool);
  const options = first.options.map((o) => letterbox(o.say, { kind: "door", tree: o.tree }));
  // Matinee greets the viewer by name: "Right this way, Guest."
  const gold = first.name ? first.lines[0].replace(/\.$/, `, ${first.name}.`) : first.lines[0];
  return ask({ gold, question: first.lines[1], options, count: first.pool.length, many: true, still });
}

function openDoor(tree, still) {
  state = { screen: "question", tree };
  const step = data.walks[tree][""];
  preload(paths().flatMap((name) => data.picks[name]));
  if (!step.question) return pick({ mode: "door" }, still);
  wall.show(step.pool);
  const q = step.question;
  const options = q.options.map((o) => letterbox(o.say, { kind: "answer", key: `${q.id}:${o.index}` }));
  return ask({ gold: step.line, question: q.ask, options, count: step.pool.length, footnote: q.footnote, says: ["Start", genreSay()], still });
}

function back(still) {
  const toQuestion = state.tree && data.walks[state.tree][""].question && (state.key || state.rushed);
  return toQuestion ? openDoor(state.tree, still) : doors(still);
}

// ---------- the pick ----------

// Every path a pick deals from: the path chosen, else the genre's paths, else every path.
function paths() {
  const names = Object.keys(data.picks);
  if (state.key) return [`${state.tree}/${state.key}`];
  if (state.tree) return names.filter((n) => n.startsWith(`${state.tree}/`));
  return names;
}

function preload(replies) {
  for (const r of replies) {
    new Image().src = posterUrl(r.film.tmdb, "l");
    if (!isPhone()) new Image().src = `/img/backdrop/${r.film.tmdb}/l`;
  }
}

// What the pick says in gold before the hunt: the reply to the answer, the genre's opening line for a genre
// that asks nothing, or Matinee's line for "Just pick one!" or "Not that one".
function goldLine(mode, place) {
  if (mode === "answer") return data.walks[state.tree][state.key].line;
  if (mode === "door") return data.walks[state.tree][""].line;
  return quip(mode === "nope" ? "nope" : "rush", place);
}

function nextState(how) {
  if (how.mode === "nope") return { ...state, draw: (state.draw || 0) + 1 };
  const key = how.mode === "answer" ? how.key : null;
  return { screen: "pick", tree: state.tree, key, rushed: how.mode === "rush", draw: 0 };
}

async function pick(how, still) {
  const mine = ++round;
  state = nextState(how);
  const deal = paths().flatMap((name) => data.picks[name]);
  const film = deal[state.draw % deal.length].film;
  const place = `${paths().join("+")}/${state.draw}`;
  const gold = goldLine(how.mode, place);
  const frame = pickFrame();
  if (how.mode === "answer") wall.show(data.walks[state.tree][state.key].pool, { resting: true });
  if (how.mode === "door") wall.show(data.walks[state.tree][""].pool, { resting: true });
  await say(frame.line, gold, "", { still });
  if (!still) await wait(READ_MS);
  if (mine !== round) return;
  const pause = await wall.hunt(film.tmdb, seedOf(place), { lift: huntLift(frame), still });
  if (mine !== round) return;
  const typing = wait(still ? 0 : pause * 1000).then(() => say(frame.line, gold, quip("reveal", place), { still, shown: gold.length }));
  await wall.grow(film.tmdb, { still });
  if (!still) await wait(BEAT_MS);
  if (mine !== round) return;
  await rest(frame, film, still);
  await typing;
}

// The pick's screen: the line and its actions in the aside, which a phone keeps at the foot of its screen.
function pickFrame() {
  const line = h("h1", { class: "line pick-line", "aria-live": "polite" });
  const aside = h("div", { class: "aside" }, line);
  const phone = isPhone();
  const left = h("div", { class: "pick-left" }, phone ? null : aside);
  const showing = h("section", { class: "showing" }, left);
  const says = ["Start", genreSay(), state.key ? answerSay() : null].filter(Boolean);
  const foot = h("footer", { class: "bottombar" }, state.tree ? trail(says, state.rushed ? -1 : says.length - 1) : null, h("span"));
  stage.classList.remove("revealed");
  clear(stage).append(topbar(), showing, ...(phone ? [aside] : []), foot);
  return { line, aside, left, showing };
}

function answerSay() {
  const q = data.walks[state.tree][""].question;
  return q.options.find((o) => `${q.id}:${o.index}` === state.key)?.say;
}

// On a phone the hunt lands in the middle of the space between the top bar and the words at the foot.
function huntLift(frame) {
  if (!isPhone()) return 0;
  const top = stage.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  const foot = frame.aside.getBoundingClientRect().top;
  return innerHeight / 2 - (top + foot) / 2;
}

// The resting page: the film's details rise, its actions stand under the line, and the grown poster moves from
// the wall to its place at the foot of the left column.
async function rest(frame, film, still) {
  stage.classList.add("revealed");
  const phone = isPhone();
  const backdrop = phone ? null : h("img", { class: "backdrop", src: `/img/backdrop/${film.tmdb}/l`, alt: "" });
  const title = h("h2", { class: "film-title" }, film.title, film.year ? h("span", { class: "film-year" }, ` ${film.year}`) : null);
  const synopsis = h("p", { class: "synopsis" }, film.synopsis || "");
  const feature = h("div", { class: "feature" }, backdrop, h("div", { class: "feature-text" }, title, synopsis));
  frame.showing.append(feature);
  frame.aside.append(choices(), noteLink());
  settle(film, frame.left, still);
  if (!phone || still) return;
  await wait(PHONE_HOLD_MS);
  frame.showing.scrollTo({ top: feature.offsetTop, behavior: prefersLessMotion() ? "auto" : "smooth" });
}

function choices() {
  const button = (cls, text, intent) => h("button", { class: `action ${cls}`, type: "button", onclick: () => press(intent) }, text);
  return h(
    "div",
    { class: "choices" },
    button("rose", "Not that one", { kind: "nope" }),
    h("button", { class: "action petrol", type: "button" }, "More on TMDB ↗"), // shown, leading nowhere
    isPhone() ? button("cream back", "Back", { kind: "back" }) : null,
    button("cream start-over", "Start over", { kind: "start" }),
  );
}

// Carries the grown poster from the wall to its slot, as Matinee does.
function settle(film, left, still) {
  const from = wall.frontBox();
  const slot = h("div", { class: "poster-slot" });
  left.append(slot);
  const box = slot.getBoundingClientRect();
  const height = Math.min(box.width * POSTER_RATIO, Math.max(POSTER_MIN_H, box.height));
  const width = height / POSTER_RATIO;
  const poster = h("img", { class: "slot-poster", src: posterUrl(film.tmdb, "l"), alt: `${film.title} poster` });
  Object.assign(poster.style, { width: `${width}px`, height: `${height}px`, boxShadow: `${wall.glowAt(width)}, 0 24px 60px rgba(0, 0, 0, 0.6)` });
  // A screen that replays reaches here before the grown poster's colour is read, so the poster reads its own.
  const lit = () => {
    wall.glow(poster, width);
    poster.style.boxShadow = `${wall.glowAt(width)}, 0 24px 60px rgba(0, 0, 0, 0.6)`;
  };
  poster.decode().then(lit, lit);
  slot.append(poster);
  wall.dropFront();
  const to = poster.getBoundingClientRect();
  if (still || prefersLessMotion() || !from || !to.width) return;
  const shift = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  poster.style.transformOrigin = "top left";
  poster.animate([{ transform: shift }, { transform: "none" }], { duration: SETTLE_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
}

// "Something wrong with this pick?": its panel opens as Matinee's does, and Save does nothing.
function noteLink() {
  const label = (genreSay() || "this kind of film").toLowerCase();
  const open = h("button", { class: "action cream", type: "button", "aria-expanded": "false", onclick: () => press({ kind: "note", open: open.getAttribute("aria-expanded") !== "true" }) }, "Something wrong with this pick?");
  const radio = (say) => h("label", {}, h("input", { type: "radio", name: "what-wrong" }), h("span", {}, say));
  const says = ["Start", genreSay(), state.key ? answerSay() : null, state.rushed ? "Just pick one!" : null].filter(Boolean).slice(1);
  const panel = h(
    "div",
    { class: "correct-panel", hidden: true },
    h("p", { class: "note" }, "How you got here:"),
    h("ol", { class: "path" }, says.map((s) => h("li", {}, sentenceCase(s)))),
    h("fieldset", { class: "what-wrong" }, h("legend", { class: "note" }, "What's wrong with it?"), radio(`Not ${label} at all`), radio(`${sentenceCase(label)}, but not the kind I asked for`)),
    h("textarea", { maxlength: 500, rows: 3, placeholder: "Why? (optional)", "aria-label": "Why? (optional)" }),
    h("button", { class: "action gold", type: "button" }, "Save"),
  );
  return h("div", { class: "correct" }, open, panel);
}

function showNote(open) {
  const panel = stage.querySelector(".correct-panel");
  if (!panel) return;
  panel.hidden = !open;
  stage.querySelector(".correct > .action")?.setAttribute("aria-expanded", String(open));
}

// ---------- the start ----------

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menuClosed()) press({ kind: "menu", open: false });
});
// A wheel that scrolls nothing on this screen reaches the site's deck through the conductor alone: stopped here, a
// browser (Safari's engine) cannot also pass it to the page around the frame, so a flick that scrolls a box to its
// end never moves the deck.
if (conductor) {
  addEventListener(
    "wheel",
    (e) => {
      if (!scrollsHere(e.target, e.deltaY)) e.preventDefault();
    },
    { passive: false },
  );
}
document.addEventListener("pointerdown", (e) => {
  if (!menuClosed() && !e.target.closest?.(".viewer")) press({ kind: "menu", open: false });
});

// The player as the conductor reaches it: `apply` plays a press at `at` (a Date.now() time), and `replay` brings a
// screen that joins late to where the others stand, at once.
window.matineeDemo = {
  apply(intent, at) {
    setTimeout(() => run(intent), Math.max(0, at - Date.now()));
  },
  async replay(intents) {
    await doors(true);
    for (const intent of intents) await run(intent, true);
  },
};

// A demo whose canned files did not arrive says so on its screen, and stays out of the conductor's script.
try {
  data = await load();
} catch (err) {
  console.warn("The demo's canned files could not be loaded.", err);
  const line = h("h1", { class: "line" });
  clear(stage).append(h("section", { class: "talk" }, line));
  say(line, "The demo didn't load.", "Reload the page to try again.", { still: true });
  conductor?.show(window);
}
if (data && conductor) conductor.join(window);
else if (data) doors(false);
