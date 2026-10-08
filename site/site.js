// The site's page: the deck over the curtain, Matinee's marquee on the first slide, the lines typing as their
// slides arrive, and About over everything.
import { deck } from "./deck.js";
import { mountDemo } from "./demo.js";
import { mirror } from "./mirror.js";

const CHARS_PER_TICK = 2; // Matinee's own pace: two characters every 24 ms
const TICK_MS = 24;
const TYPE_DELAY_MS = 260; // a line starts once its slide is mostly in place
const still = matchMedia("(prefers-reduced-motion: reduce)");

// The marquee: Matinee's own drawing, wide and narrow, laid into the page so its bulbs chase; the stylesheet
// shows one. Its letter board already reads "Now showing" over "Whatever you're in the mood for".
async function marquee() {
  const holder = document.getElementById("marquee");
  for (const key of ["wide", "narrow"]) {
    const res = await fetch(`/static/marquee/marquee-${key}.svg`);
    if (!res.ok) throw new Error(`the marquee drawing ${key} answered ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
    const svg = document.importNode(doc.documentElement, true);
    svg.setAttribute("aria-hidden", "true");
    const frame = document.createElement("div");
    frame.className = `mq-frame mq-frame-${key}`;
    frame.append(svg);
    holder.append(frame);
  }
}

// Types `line` once, gold then cream, at Matinee's pace and with no caret. The untyped rest stands in place,
// unseen, so the line holds its final shape while it types. Under reduced motion it appears whole.
function typeLine(line) {
  if (line.dataset.typed) return;
  line.dataset.typed = "1";
  const parts = [...line.querySelectorAll(".ack, .ask")].filter((el) => el.getClientRects().length);
  const texts = parts.map((el) => el.textContent);
  line.setAttribute("aria-label", texts.join(" "));
  const views = parts.map((el, i) => {
    const typed = document.createElement("span");
    const rest = document.createElement("span");
    rest.className = "rest";
    rest.textContent = texts[i];
    el.replaceChildren(typed, rest);
    el.setAttribute("aria-hidden", "true");
    return { typed, rest, text: texts[i] };
  });
  const total = texts.join("").length;
  let n = still.matches ? total : 0;
  const paint = () => {
    let left = n;
    for (const v of views) {
      const k = Math.max(0, Math.min(v.text.length, left));
      v.typed.textContent = v.text.slice(0, k);
      v.rest.textContent = v.text.slice(k);
      left -= v.text.length;
    }
  };
  paint();
  if (n >= total) return;
  const timer = setInterval(() => {
    n = Math.min(total, n + CHARS_PER_TICK);
    paint();
    if (n >= total) clearInterval(timer);
  }, TICK_MS);
}

// An overlay (About, the phone's demo) opens as a history step, so the browser's Back closes it; while open it
// takes the wheel, the keys and the touch. Its own close steps back over every history step taken since it
// opened, the demo's own included (Matinee's About inside it adds one), so the page is left as it was.
function overlay(layer, opener, first) {
  let start = 0;
  const close = () => {
    if (layer.hidden) return;
    layer.hidden = true;
    opener.focus();
  };
  const open = () => {
    layer.hidden = false;
    history.pushState({ overlay: layer.id }, "");
    start = history.length;
    first.focus();
  };
  const back = () => {
    if (layer.hidden) return;
    const steps = history.length - start + 1;
    close();
    history.go(-steps);
  };
  addEventListener("popstate", close);
  return { open, back, isOpen: () => !layer.hidden };
}

const about = overlay(document.getElementById("about"), document.getElementById("open-about"), document.getElementById("close-about"));
document.getElementById("open-about").addEventListener("click", about.open);
document.getElementById("close-about").addEventListener("click", about.back);
document.getElementById("about").addEventListener("click", (e) => {
  if (e.target.id === "about") about.back();
});
// The phone's demo: Matinee full screen, with the site's own chip to leave it. Its frame is made the first time
// it opens, and kept, so a second visit finds the demo as it was left.
const demo = overlay(document.getElementById("demo"), document.getElementById("open-demo"), document.getElementById("close-demo"));
let fullScreen = null;
function openDemo() {
  fullScreen ??= mountDemo(document.getElementById("full-glass"), { natural: true, title: "Matinee, full screen" });
  demo.open();
}
document.getElementById("open-demo").addEventListener("click", openDemo);
document.querySelector(".handset").addEventListener("click", () => {
  if (!wideScreen()) openDemo();
});
document.getElementById("close-demo").addEventListener("click", demo.back);

addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (demo.isOpen()) demo.back();
  else if (about.isOpen()) about.back();
});

const slides = [...document.querySelectorAll(".slide")];
deck({
  slides,
  dots: [...document.querySelectorAll(".dots button")],
  busy: () => about.isOpen() || demo.isOpen(),
  arrived: (k) => {
    for (const line of slides[k].querySelectorAll(".line")) setTimeout(() => typeLine(line), still.matches ? 0 : TYPE_DELAY_MS);
  },
});
marquee().catch((err) => console.warn("The marquee drawing could not be loaded.", err));

// The demo's two screens: a phone always, and a desktop monitor where the screen is wide enough to show one.
const wide = matchMedia("(min-width: 601px)");
function wideScreen() {
  return wide.matches;
}
const STATUS_BAR = 58; // the drawn phone's status bar, in the phone's own pixels
const phone = mountDemo(document.getElementById("phone-glass"), { width: 390, height: 844 - STATUS_BAR, top: STATUS_BAR, title: "Matinee on a phone" });
// A window that widens past a phone's width gets its monitor's demo then, once; the phone, which may have walked
// on meanwhile, starts again with it.
function mountDesk(late) {
  wide.removeEventListener("change", widened);
  const desk = mountDemo(document.getElementById("desk-glass"), { width: 1680, height: 1050, title: "Matinee on a desktop" });
  Promise.all([phone, desk]).then((frames) => {
    const joined = mirror(frames);
    if (late) joined.resync();
  });
}
const widened = () => mountDesk(true);
if (wide.matches) mountDesk(false);
else wide.addEventListener("change", widened);
