// The demo's poster wall: Matinee's wall as the demo plays it. The posters of the films still in the running
// drift upward in a repeating grid, laid out by Matinee's own grid rules, and a pick hunts across them to the
// picked film with Matinee's own hop easing. The hunt is on rails: its hops and their times come from a seed
// alone, never from the screen's size, so two screens that start a hunt together land together.

import { isPhone, prefersLessMotion } from "/static/js/dom.js";
import { GOLD, posterGlow } from "/static/js/glow.js";
import { HOP_TABLE, SETTLE_EASE, SETTLE_S, bezier, centreOf, hopCell, settledCamera } from "/static/js/hunt-plan.js";
import { camCell, cellBox, filmIndex, pictureSize, posterAcross, screenCells, wallLayout } from "/static/js/wall-grid.js";

const DRIFT_PX_S = 10; // upward, as Matinee's wall drifts
const AWAY = 0.34; // the layer's strength once a pick has landed: the posters fall from 35 to 12 per cent
const GROW = 2.4; // the landed poster grows to this many times its cell
const GROW_MS = 750;
const GROW_EASE = bezier(0.2, 0.8, 0.2, 1);
const HOP_COUNTS = [1, 2, 2, 3, 3, 3]; // one, two or three hops, weighted 1, 2 and 3 in 6, as Matinee draws them
const FIRST_ACROSS = 0.6; // the first hop runs across more often than down
const VERTICAL_SCALE = 0.7; // rows are taller than columns are wide
const GLOW = { blur: 0.25, spread: 0.033, alpha: 0.35 }; // the glow, as shares of the grown poster's width

export const posterUrl = (id, size) => `/img/poster/${id}/${size}`;

// A draw of numbers from 0 to 1 that depends on `seed` alone, the same in every screen.
export function sequence(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A number for `text`, the same in every screen.
export function seedOf(text) {
  let n = 0x811c9dc5;
  for (let k = 0; k < text.length; k += 1) n = Math.imul(n ^ text.charCodeAt(k), 0x01000193);
  return n;
}

// Resolves after `ms`, calling `step(t)` each frame with t from 0 to 1; resolves early, without stepping, once
// `live()` turns false.
function tween(ms, step, live = () => true) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      if (!live()) return resolve();
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      step(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

const pause = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

// The hops of a hunt from cell `from`, drawn from `seed`: their axes, lengths, times and pauses come from the
// seed, and only how far a hop must run to leave the screen comes from `layout`.
export function huntPlan(seed, layout, from) {
  const rand = sequence(seed);
  const n = HOP_COUNTS[Math.floor(rand() * HOP_COUNTS.length)];
  const table = HOP_TABLE[n];
  let axis = rand() < FIRST_ACROSS ? "x" : "y";
  const signs = { x: rand() < 0.5 ? -1 : 1, y: 1 };
  const reach = { x: layout.screenCols + 1, y: layout.screenRows + 1 };
  const spacing = { x: layout.sx, y: layout.sy };
  let cell = { ...from };
  const hops = table.move.map((seconds, k) => {
    const [lo, hi] = table.lengths[k];
    const drawn = lo + Math.floor(rand() * (hi - lo + 1));
    let cells = axis === "y" && drawn > 1 ? Math.max(1, Math.round(drawn * VERTICAL_SCALE)) : drawn;
    if (k === 0) cells = Math.max(cells, reach[axis]);
    const sign = signs[axis];
    cell = axis === "x" ? { i: cell.i + sign * cells, j: cell.j } : { i: cell.i, j: cell.j + sign * cells };
    const hop = { axis, sign, cells, dist: cells * spacing[axis], seconds, pause: table.pause[k], to: cell };
    axis = axis === "x" ? "y" : "x";
    return hop;
  });
  return { hops, landing: cell };
}

// The order a pool's films stand in: by a number drawn from each film's id, the same in every screen.
const ordered = (pool) => [...pool].sort((a, b) => seedOf(String(a)) - seedOf(String(b)) || a - b);

export class DemoWall {
  constructor(root) {
    this.root = root;
    this.layer = null;
    this.layout = null;
    this.order = [];
    this.resting = false;
    this.tiles = new Map(); // "i,j" -> the tile drawn in that cell
    this.placed = new Map(); // "i,j" -> the film a hunt put in that cell
    this.cam = { x: 0, y: 0 };
    this.lift = 0; // px the camera's aim stands above the screen's centre (a phone lands above its words)
    this.drifting = true;
    this.front = null; // the landed poster, grown over the wall
    this.landing = null;
    this.hunts = 0; // each hunt's number; a hunt stops once a newer one starts or its pick ends
    this.last = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  // Lays the wall out for `pool`; `resting` sets the posters to the size they keep through a pick, as Matinee's
  // wall does once the last question is answered. A new pool fades in over the old one; the same pool at the
  // same size changes nothing.
  show(pool, { resting = false } = {}) {
    const order = ordered(pool);
    const same = order.length === this.order.length && order.every((t, k) => t === this.order[k]);
    if (this.layer && same && resting === this.resting) return;
    this.order = order;
    this.resting = resting;
    this.placed = new Map();
    const old = this.layer;
    this.layer = document.createElement("div");
    this.layer.className = "wall-tiles";
    this.tiles = new Map();
    this.root.append(this.layer);
    this.relay();
    if (old) {
      old.style.opacity = "0";
      setTimeout(() => old.remove(), 450);
    }
  }

  relay() {
    const phone = isPhone();
    this.layout = wallLayout(innerWidth, innerHeight, posterAcross(this.order.length, phone, this.resting), phone, this.order.length);
  }

  frame(now) {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (this.drifting && !prefersLessMotion()) this.cam.y += DRIFT_PX_S * dt;
    if (this.layout && this.layout.vw !== innerWidth) this.relay();
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  filmAt(i, j) {
    return this.placed.get(`${i},${j}`) ?? this.order[filmIndex(this.layout, i, j)];
  }

  draw() {
    const L = this.layout;
    if (!L || !this.layer) return;
    this.layer.style.transform = `translate3d(${L.vw / 2 - this.cam.x}px, ${L.vh / 2 - this.cam.y}px, 0)`;
    const size = pictureSize(L.w, devicePixelRatio || 1);
    const seen = new Set();
    for (const { i, j } of screenCells(L, this.cam)) {
      const key = `${i},${j}`;
      seen.add(key);
      this.place(this.tileAt(key), i, j, size);
    }
    for (const [key, img] of this.tiles) {
      if (seen.has(key)) continue;
      img.remove();
      this.tiles.delete(key);
    }
  }

  // The tile drawn in cell `key`, made when the cell first comes on screen.
  tileAt(key) {
    let img = this.tiles.get(key);
    if (!img) {
      img = document.createElement("img");
      img.className = "tile";
      img.alt = "";
      img.decoding = "async";
      this.tiles.set(key, img);
      this.layer.append(img);
    }
    return img;
  }

  // Draws `img` in cell i, j: its film's poster at `size`, hidden while the grown poster stands in for it.
  place(img, i, j, size) {
    const L = this.layout;
    const src = posterUrl(this.filmAt(i, j), size);
    if (img.dataset.src !== src) img.src = img.dataset.src = src;
    img.style.width = `${L.w}px`;
    img.style.height = `${L.h}px`;
    img.style.transform = `translate(${i * L.sx}px, ${j * L.sy}px)`;
    img.style.visibility = this.front && `${i},${j}` === this.landing ? "hidden" : "";
  }

  aim(cell) {
    this.cam = centreOf({ i: cell.i, j: cell.j + this.lift / this.layout.sy }, this.layout);
  }

  // The hunt for film `id`, on rails from `seed`: the drift stops, the wall eases to the next whole row, and
  // each hop runs its planned time and pause. Resolves to the last hop's pause, in seconds. Under reduced
  // motion, or `still`, the camera stands at the landing at once. A hunt left behind stops where it stands.
  async hunt(id, seed, { lift = 0, still = false } = {}) {
    const mine = ++this.hunts;
    const live = () => mine === this.hunts;
    const L = this.layout;
    this.drifting = false;
    this.lift = lift;
    const settled = settledCamera({ x: this.cam.x, y: this.cam.y }, L);
    const from = camCell(L, settled);
    const plan = huntPlan(seed, L, from);
    this.placed.set(`${plan.landing.i},${plan.landing.j}`, id);
    this.landing = `${plan.landing.i},${plan.landing.j}`;
    if (still || prefersLessMotion()) {
      this.aim(plan.landing);
      return 0;
    }
    const start = { ...this.cam };
    const end = centreOf({ i: from.i, j: from.j + lift / L.sy }, L);
    await tween(SETTLE_S * 1000, (t) => {
      const e = SETTLE_EASE(t);
      this.cam = { x: start.x + (end.x - start.x) * e, y: start.y + (end.y - start.y) * e };
    }, live);
    let cell = from;
    for (const [k, hop] of plan.hops.entries()) {
      const at = cell;
      await tween(hop.seconds * 1000, (t) => this.aim(hopCell(at, hop, t)), live);
      cell = hop.to;
      if (k < plan.hops.length - 1) await pause(hop.pause);
      if (!live()) return 0;
    }
    return plan.hops.at(-1).pause;
  }

  // The landed poster grows over the wall in its own glow while the rest of the wall dims. Resolves once grown.
  async grow(id, { still = false } = {}) {
    const [i, j] = this.landing.split(",").map(Number);
    const box = cellBox(this.layout, this.cam, { i, j });
    const img = document.createElement("img");
    img.className = "tile";
    img.alt = "";
    img.src = posterUrl(id, "l");
    Object.assign(img.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, opacity: "1" });
    img.style.transformOrigin = "50% 50%";
    this.front = img;
    this.root.append(img);
    this.layer.style.opacity = String(AWAY);
    // The glow is set at the cell's size; growing scales it with the poster.
    img.decode().then(() => this.glow(img, box.w), () => this.glow(img, box.w));
    if (still || prefersLessMotion()) {
      img.style.transform = `scale(${GROW})`;
      return;
    }
    await tween(GROW_MS, (t) => {
      img.style.transform = `scale(${1 + (GROW - 1) * GROW_EASE(t)})`;
    });
  }

  glow(img, width) {
    let rgb = GOLD;
    try {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = [32, 48];
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      rgb = posterGlow(context.getImageData(0, 0, canvas.width, canvas.height).data);
    } catch (err) {
      console.warn("the poster's glow colour could not be read; it glows gold", err);
    }
    this.glowColour = rgb;
    img.style.boxShadow = this.glowAt(width);
  }

  // The glow a poster `width` px wide wears, in the landed poster's colour.
  glowAt(width) {
    const [r, g, b] = this.glowColour || GOLD;
    return `0 0 ${GLOW.blur * width}px ${GLOW.spread * width}px rgba(${r}, ${g}, ${b}, ${GLOW.alpha})`;
  }

  // Where the grown poster hangs on the screen, or null when none does.
  frontBox() {
    return this.front?.getBoundingClientRect() ?? null;
  }

  // The grown poster leaves the wall (it has moved to its resting place); its cell stays empty until the pick ends.
  dropFront() {
    this.front?.remove();
  }

  // Ends a pick: the landed poster goes, the wall comes back to strength and drifts again.
  endPick() {
    this.hunts += 1;
    this.front?.remove();
    this.front = null;
    this.landing = null;
    if (this.layer) this.layer.style.opacity = "";
    this.lift = 0;
    this.drifting = true;
  }
}
