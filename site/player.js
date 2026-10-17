// The demo's player: one screen of Matinee's demo, on rails. It builds Matinee's own screens in Matinee's own
// markup, so Matinee's stylesheet dresses them, and plays each press as a fixed script from the canned files:
// a genre, its subgenre question, the hunt and the reveal, "Show me another", "Just pick one!", the ways back and
// "Start over". Every screen of the demo runs this player and is handed the same presses at the same moment by
// the site's conductor (site/conductor.js); the player draws nothing at random, so every screen shows the same
// thing at once. On the pick, "Rate it" rates the film for as long as the page stays open, and the poster rests in
// its rating's case; nothing is stored. Controls off the script (the profile menu's items, a note's Save, the hide
// lengths) are shown and do nothing.

import { clear, h, isPhone, prefersLessMotion, sentenceCase, wait } from "/static/js/dom.js";
import { cornerMark } from "/static/js/flight.js";
import { initials, mark } from "/static/js/mark.js";
import { CASES, filmCase } from "/static/js/cases.js";
import { panelAction, pickPanel } from "/static/js/panel.js";
import { ANSWERS } from "/static/js/ratings.js";
import { typeLine } from "/static/js/type.js";
import { DemoWall, fetchSheets, posterUrl, seedOf } from "./player-wall.js";
import { scrollsHere } from "./scrolls.js";

const READ_MS = 1000; // Matinee's reply is read this long before the hunt starts, as in Matinee
const BEAT_MS = 500; // the grown poster holds one beat before it moves to rest
const SETTLE_MS = 1300; // the poster's move to rest
const PHONE_HOLD_MS = 2200; // a phone holds the poster before its screen scrolls to the film's details
const POSTER_RATIO = 1.5;
const POSTER_MIN_H = 160;
const STRIP_H = 44; // the poster link's strip, beneath the poster, as in Matinee
const CASE_RATIO = 932 / 600; // the case art's height over its width, as in Matinee
// The guest's ratings when the demo opens: a few films already rest in their cases. Ratings made in the demo join
// them and last until the page is left; nothing is stored.
const RATED = { 762: 5, 105: 4, 18785: 3 }; // Monty Python and the Holy Grail, Back to the Future, The Hangover
const ratings = new Map(Object.entries(RATED).map(([t, score]) => [Number(t), score]));
const QUIP_SETS = { comedy: "comedy", horror: "horror", action: "action" }; // a genre with lines of its own

const stage = document.getElementById("stage");
const wall = new DemoWall(document.getElementById("wall"));
const conductor = window.parent !== window ? window.parent.demoConductor : null;
let data = null;
let state = { screen: "doors" };
let round = 0; // each screen the player shows is a round; a step left behind by a newer one stops
let resting = null; // the pick at rest: { frame, film, link, openers, open } where `open` names the panel showing

// ---------- the canned files ----------

// Asked of the site each time, never taken from a kept copy unasked: GitHub Pages lets a browser keep a file 10
// minutes, and a kept reply from before a deploy would not match the player that deploy brought.
async function canned(name) {
  const res = await fetch(`/canned/${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`/canned/${name} answered ${res.status}`);
  return res.json();
}

async function load() {
  const [boot, first, picks] = await Promise.all([canned("boot.json"), canned("first.json"), canned("picks.json")]);
  const trees = first.options.map((o) => o.tree);
  const walks = Object.fromEntries(await Promise.all(trees.map(async (tree) => [tree, await canned(`walk/${tree}.json`)])));
  await fetchSheets([first.wall, ...Object.values(walks).flatMap((w) => Object.values(w).map((step) => step.wall))], first.wall);
  return { boot, first, picks, walks };
}

// ---------- presses ----------

const SCREENS = new Set(["start", "door", "answer", "rush", "nope", "back"]);

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
    menu: () => showMenu(intent.open),
    panel: () => showPanel(intent.which),
    rate: () => rate(intent.tmdb, intent.score),
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

// A question screen's way back, at the foot's left at every width: "Start over", since one step back from the
// demo's one question reaches its first screen.
function wayBack() {
  const again = h("button", { class: "action cream", type: "button", onclick: () => press({ kind: "start" }) }, "Start over");
  return h("nav", { class: "way-back", "aria-label": "Way back" }, again);
}

const genreSay = () => data.first.options.find((o) => o.tree === state.tree)?.say;

// ---------- the question screens ----------

function letterbox(say, intent) {
  return h("button", { class: "letterbox", type: "button", onclick: () => press(intent) }, sentenceCase(say));
}

async function ask({ gold, question, options, count, footnote = null, many = false, back = false, still }) {
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
    h("div", { class: "bottombar" }, back ? wayBack() : null),
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
  wall.show(first.wall);
  const options = first.options.map((o) => letterbox(o.say, { kind: "door", tree: o.tree }));
  // Matinee greets the viewer by name: "Right this way, Guest."
  const gold = first.name ? first.lines[0].replace(/\.$/, `, ${first.name}.`) : first.lines[0];
  return ask({ gold, question: first.lines[1], options, count: first.wall.count, many: true, still });
}

function openDoor(tree, still) {
  state = { screen: "question", tree };
  const step = data.walks[tree][""];
  preload(paths().flatMap((name) => data.picks[name]));
  if (!step.question) return pick({ mode: "door" }, still);
  wall.show(step.wall);
  const q = step.question;
  const options = q.options.map((o) => letterbox(o.say, { kind: "answer", key: `${q.id}:${o.index}` }));
  return ask({ gold: step.line, question: q.ask, options, count: step.wall.count, footnote: q.footnote, back: true, still });
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
    new Image().src = posterUrl(r.film.tmdb);
    if (!isPhone()) new Image().src = `/img/backdrop/${r.film.tmdb}/l`;
  }
}

// What the pick says in gold before the hunt: the reply to the answer, the genre's opening line for a genre
// that asks nothing, or Matinee's line for "Just pick one!" or "Show me another".
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
  if (how.mode === "answer") wall.show(data.walks[state.tree][state.key].wall, { resting: true });
  if (how.mode === "door") wall.show(data.walks[state.tree][""].wall, { resting: true });
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

// The pick's screen, as Matinee 0.3 lays it out: the line in the aside, which a phone keeps at the foot of its
// screen, and the foot bar, whose row is kept from the start on a desktop so nothing moves when its actions arrive.
function pickFrame() {
  const line = h("h1", { class: "line pick-line", "aria-live": "polite" });
  const aside = h("div", { class: "aside" }, line);
  const phone = isPhone();
  const left = h("div", { class: "pick-left" }, phone ? null : aside);
  const showing = h("section", { class: "showing" }, left);
  const bar = h("div", { class: "foot-bar" }, h("div"), h("div"), h("div", { class: "bar-right" }));
  const foot = h("footer", { class: "bottombar" }, phone ? null : bar);
  resting = null;
  stage.classList.remove("revealed");
  clear(stage).append(topbar(), showing, ...(phone ? [aside] : []), foot);
  const frame = { line, aside, left, showing, bar };
  // A panel closed on this screen (its ×, Escape, a tap outside) closes on every screen.
  frame.panel = pickPanel(stage, frame, { opened() {}, closed: () => press({ kind: "panel", which: null }) });
  return frame;
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

// What the pick says about the film beyond its title: its rank with its standing, then its tags. On a desktop it
// stands under Matinee's line; on a phone, under the film's title.
function facts(film) {
  const rank = film.rank ? h("p", { class: "rank" }, h("span", { class: "rank-words" }, film.rank), " ", h("span", { class: "rank-by" }, film.standing)) : null;
  const tags = film.tags?.length ? h("ul", { class: "tags", "aria-label": "Tags" }, film.tags.map((t) => h("li", { class: "tag" }, sentenceCase(t)))) : null;
  return rank || tags ? h("div", { class: "facts" }, rank, tags) : null;
}

// The resting page: the film's details rise, its facts stand under the line, the foot bar fills, and the grown
// poster moves from the wall to its place at the foot of the left column.
async function rest(frame, film, still) {
  stage.classList.add("revealed");
  const phone = isPhone();
  const backdrop = phone ? null : h("img", { class: "backdrop", src: `/img/backdrop/${film.tmdb}/l`, alt: "" });
  const title = h("h2", { class: "film-title" }, film.title, film.year ? h("span", { class: "film-year" }, ` ${film.year}`) : null);
  const synopsis = h("p", { class: "synopsis" }, film.synopsis || "");
  const feature = h("div", { class: "feature" }, backdrop, h("div", { class: "feature-text" }, title, phone ? facts(film) : null, synopsis));
  frame.showing.append(feature);
  if (!phone) {
    frame.line.classList.add("rested");
    const said = facts(film);
    if (said) frame.line.after(said);
  }
  // The poster's strip names TMDB, as Matinee's does, and leads nowhere: the demo opens no other site.
  const link = h("a", { class: "poster-link", href: "#", "aria-label": `${film.title}: more on TMDB`, onclick: (e) => e.preventDefault() }, h("span", { class: "poster-strip" }, "More on TMDB ↗"));
  resting = { frame, film, link, openers: pickBar(frame), open: null };
  settle(film, frame, link, still);
  if (!phone || still) return;
  await wait(PHONE_HOLD_MS);
  frame.showing.scrollTo({ top: feature.offsetTop, behavior: prefersLessMotion() ? "auto" : "smooth" });
}

// The foot bar: "‹ Back", "Something wrong?" and "Rate it" at its left, "Show me another" and "Hide film" at its
// centre. On a phone the bar stands at the foot of Matinee's words. Returns the actions that open a panel.
function pickBar(frame) {
  const opener = (words, which) => panelAction(words, () => press({ kind: "panel", which: resting?.open === which ? null : which }));
  const openers = { note: opener("Something wrong?", "note"), rate: opener("Rate it", "rate"), hide: opener("Hide film", "hide") };
  const back = h("button", { class: "action cream", type: "button", onclick: () => press({ kind: "back" }) }, "‹ Back");
  const nope = h("button", { class: "action rose lead", type: "button", onclick: () => press({ kind: "nope" }) }, "Show me another");
  frame.bar.replaceChildren(h("div", { class: "bar-left" }, back, openers.note, openers.rate), h("div", { class: "bar-centre" }, nope, openers.hide), frame.bar.lastElementChild);
  if (isPhone()) frame.aside.append(frame.bar);
  return openers;
}

// The link takes the glow the poster carried on its flight at full strength, as in Matinee.
function landed(link) {
  link.style.transition = "none";
  link.classList.add("landed");
  getComputedStyle(link).boxShadow;
  link.style.transition = "";
}

// A rated film's poster rests in its rating's case, `height` tall, the title on its plate; an unrated film's rests
// bare. The poster is the one already on the page either way, so a rating made on the pick keeps it where it is.
function dress(poster, link, film, height) {
  const score = ratings.get(film.tmdb) ?? null;
  const was = link.querySelector(".case") ?? poster;
  if (CASES[score]) {
    const say = ANSWERS.find((a) => a.score === score).say;
    const spot = document.createComment("");
    was.before(spot);
    poster.className = "";
    poster.removeAttribute("style");
    const box = filmCase({ title: film.title, picture: poster, score, label: `${film.title}, ${say}` });
    box.style.height = `${height}px`;
    box.style.width = `${height / CASE_RATIO}px`;
    spot.replaceWith(box);
    if (was !== poster) was.remove();
  } else {
    poster.className = "slot-poster";
    Object.assign(poster.style, { width: `${height / POSTER_RATIO}px`, height: `${height}px` });
    if (was !== poster) was.replaceWith(poster);
  }
  link.classList.toggle("cased", Boolean(CASES[score]));
}

// Carries the grown poster from the wall into its link at the foot of the left column, as Matinee does; a rated
// film's into its case's window, its glow fading on the way, since a case wears none.
function settle(film, frame, link, still) {
  const from = wall.frontBox();
  const slot = h("div", { class: "poster-slot" });
  frame.left.append(slot);
  const box = slot.getBoundingClientRect();
  const height = Math.min(box.width * POSTER_RATIO, Math.max(POSTER_MIN_H, box.height - STRIP_H));
  const poster = h("img", { src: posterUrl(film.tmdb), alt: `${film.title} poster` });
  link.style.setProperty("--poster-glow", wall.glowAt(height / POSTER_RATIO));
  link.prepend(poster);
  dress(poster, link, film, height);
  slot.append(link);
  wall.dropFront();
  // A screen that replays reaches here before the grown poster's colour is read, so the poster reads its own.
  poster.decode().then(
    () => {
      wall.glow(poster, height / POSTER_RATIO);
      poster.style.boxShadow = "";
      link.style.setProperty("--poster-glow", wall.glowAt(height / POSTER_RATIO));
    },
    () => undefined,
  );
  const to = poster.getBoundingClientRect();
  if (still || prefersLessMotion() || !from || !to.width) return landed(link);
  const shift = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  const shine = wall.glowAt(to.width);
  const after = link.classList.contains("cased") ? "0 0 0 0 rgba(0, 0, 0, 0)" : shine;
  poster.style.transformOrigin = "top left";
  const move = poster.animate([{ transform: shift, boxShadow: shine }, { transform: "none", boxShadow: after }], { duration: SETTLE_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  return move.finished.then(
    () => landed(link),
    () => landed(link),
  );
}

// ---------- the pick's panels ----------

// "Rate it": the five answers, best first, as Matinee shows them. An answer rates the film and closes the panel, so
// the poster shows in its case at once; Matinee keeps the panel open for a short review, which the demo leaves out.
function ratePanel(film) {
  const score = ratings.get(film.tmdb) ?? null;
  const answers = ANSWERS.map((a) =>
    h("button", { class: "letterbox ticked", type: "button", "aria-pressed": String(a.score === score), onclick: () => press({ kind: "rate", tmdb: film.tmdb, score: a.score }) }, a.say),
  );
  return [
    h("p", { class: "panel-lede" }, `Seen ${film.title}? Your answer is kept on My profile, where you can change it.`),
    h("div", { class: "rate-answers", role: "group", "aria-label": "Your answer" }, answers),
  ];
}

// "Hide film": the four lengths, none chosen, as Matinee shows them; each only closes the panel.
function hidePanel(film) {
  const lengths = ["3 months", "6 months", "1 year", "For good"].map((say) => h("button", { class: "letterbox", type: "button", onclick: () => press({ kind: "panel", which: null }) }, say));
  return [
    h("p", { class: "panel-lede" }, `Matinee won't pick ${film.title} for you until then, and rolls again now. You can bring it back any time from My profile.`),
    h("div", { class: "panel-mid" }, lengths),
  ];
}

// "Something wrong?": Matinee's note form, whose Save does nothing.
function notePanel() {
  const label = (genreSay() || "this kind of film").toLowerCase();
  const tick = (say) => h("label", { class: "tree-choice" }, h("input", { type: "checkbox", name: "what-wrong" }), h("span", {}, say));
  const said = [genreSay(), state.key ? answerSay() : null, state.rushed ? "Just pick one!" : null].filter(Boolean);
  return h(
    "div",
    { class: "note-form" },
    h("p", { class: "panel-lede" }, "This goes to whoever runs Matinee as a note. It changes nothing you are shown."),
    h("p", { class: "panel-section" }, "How you got here"),
    h("ol", { class: "path" }, said.map((step) => h("li", {}, sentenceCase(step)))),
    h(
      "fieldset",
      { class: "what-wrong" },
      h("legend", { class: "panel-section" }, "What's wrong? Tick any, or just tell me below."),
      tick(`Not ${label} at all`),
      tick(`${sentenceCase(label)}, but not the kind I asked for`),
      tick("The right kind, just not a good pick"),
      tick("The tags don't fit it"),
    ),
    h("textarea", { maxlength: 500, rows: 3, placeholder: "Tell me more (optional)", "aria-label": "Tell me more (optional)" }),
    h("div", { class: "panel-foot" }, h("button", { class: "action gold", type: "button" }, "Save")),
  );
}

const PANELS = {
  rate: { title: "Rate it", body: (film) => ratePanel(film) },
  hide: { title: "Hide film", body: (film) => hidePanel(film) },
  note: { title: "Something wrong?", body: () => [notePanel()] },
};

// Opens the panel `which` names on the pick at rest, or closes the one showing when `which` is null.
function showPanel(which) {
  if (!resting || resting.open === which) return;
  const { frame, film, openers } = resting;
  resting.open = which;
  if (!which) return frame.panel.closedByBack();
  const panel = PANELS[which];
  frame.panel.closedByBack();
  return frame.panel.open(openers[which], panel.title, ...panel.body(film));
}

// A rating for `tmdb`: kept for as long as the page stays open. The panel closes and the poster at rest moves into
// the rating's case.
function rate(tmdb, score) {
  ratings.set(tmdb, score);
  if (resting?.film.tmdb !== tmdb) return;
  showPanel(null);
  const { link } = resting;
  const poster = link.querySelector("img");
  if (poster && link.classList.contains("landed")) dress(poster, link, resting.film, (link.querySelector(".case") ?? poster).getBoundingClientRect().height);
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
