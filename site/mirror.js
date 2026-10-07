// One demo on two screens: a choice made in either frame is made in the other, so both always show the same
// screen. A control is found again in the other frame by what it is (its tag and classes), what it says, and
// which of its kind it is; Matinee's page builds the desktop's trail and the phone's "Back" on every screen and
// lets the stylesheet show one, so the same control stands in both frames, shown or not. The one control with no
// twin is a phone's "Back" on a pick, which the trail's last way back stands for. Escape, a press beside a menu
// and a step back through history close a menu or About in every frame alike. Should the frames still part (a
// frame reloaded, a press with no twin to follow), every frame starts again together at the doors. Links that leave the demo (a
// film's page) are not repeated, nor the profile tiles each frame presses on its own to get past its door. A wheel turned over a frame moves the deck, unless the frame scrolls under it.

import { QUIET_MS } from "./deck.js";

const CONTROL = "button, a[href], [role=menuitem], input[type=radio], input[type=checkbox]";
const FIND_MS = 4000; // the other frame may still be typing or moving; it is given this long to catch up
const LOOK_MS = 50;

const words = (el) => (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || "").trim().toLowerCase();

// What a control is, in terms the other frame can find it by.
function signature(el) {
  const kind = `${el.tagName}.${[...el.classList].sort().join(".")}`;
  const said = words(el);
  const twins = [...el.ownerDocument.querySelectorAll(CONTROL)].filter((c) => sameKind(c, kind, said));
  return { kind, said, nth: twins.indexOf(el) };
}

const sameKind = (c, kind, said) => `${c.tagName}.${[...c.classList].sort().join(".")}` === kind && words(c) === said;

// The other frame's control for `sig`, or for a phone's "Back" with no twin, the trail's last way back.
function counterpart(doc, sig) {
  const twins = [...doc.querySelectorAll(CONTROL)].filter((c) => sameKind(c, sig.kind, sig.said));
  const twin = twins[sig.nth] ?? null;
  if (twin || !sig.kind.split(".").includes("back")) return twin;
  return [...doc.querySelectorAll(".trail button.crumb")].at(-1) ?? null;
}

// Waits for the other frame to show the control, then presses it with `press`. False when it never shows.
async function replay(frame, sig, press) {
  const until = performance.now() + FIND_MS;
  while (performance.now() < until) {
    const doc = frame.contentDocument;
    const el = doc && counterpart(doc, sig);
    if (el && !el.disabled && el.isConnected) {
      press(el);
      return true;
    }
    await new Promise((r) => setTimeout(r, LOOK_MS));
  }
  console.warn("the other screen has no control to follow, so both screens start again", sig);
  return false;
}

// Whether a wheel turned over `el` scrolls something inside the frame.
function scrollsHere(el, dy) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const style = n.ownerDocument.defaultView.getComputedStyle(n);
    if (!/(auto|scroll)/.test(style.overflowY) || n.scrollHeight - n.clientHeight <= 8) continue;
    if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
  }
  return false;
}

// Joins `frames`: each choice in one is made in the others, in the order made. `mirroring` is true only while a
// repeated press or key runs, so it is not repeated back. Returns `resync`, which starts every frame again at the
// doors together.
export function mirror(frames) {
  let mirroring = false;
  const reloading = new Set(); // frames the mirror itself is reloading
  const queues = new Map(frames.map((f) => [f, Promise.resolve()]));
  const quietly = (act) => {
    mirroring = true;
    try {
      act();
    } finally {
      mirroring = false;
    }
  };
  const resync = () => {
    for (const frame of frames) {
      reloading.add(frame);
      queues.set(frame, Promise.resolve());
      frame.contentWindow.location.reload();
    }
  };
  const others = (frame) => frames.filter((f) => f !== frame);

  const onClick = (frame, e) => {
    const el = e.target.closest?.(CONTROL);
    if (mirroring || !el || el.closest(".seats") || (el.tagName === "A" && el.target === "_blank")) return;
    const sig = signature(el);
    for (const other of others(frame)) {
      const next = queues.get(other).then(async () => {
        if (!(await replay(other, sig, (twin) => quietly(() => twin.click())))) resync();
      });
      queues.set(other, next);
    }
  };
  // Escape, a press beside a control and a step back through history, each in every frame alike.
  const echo = (frame, make, target) => {
    if (mirroring) return;
    for (const other of others(frame)) quietly(() => target(other).dispatchEvent(make()));
  };
  const watchKeys = (frame) => {
    const doc = frame.contentDocument;
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape") echo(frame, () => new KeyboardEvent("keydown", { key: "Escape", bubbles: true }), (o) => o.contentDocument);
    });
    doc.addEventListener("pointerdown", (e) => {
      if (!e.target.closest?.(CONTROL)) echo(frame, () => new PointerEvent("pointerdown", { bubbles: true }), (o) => o.contentDocument.body);
    });
    frame.contentWindow.addEventListener("popstate", () => echo(frame, () => new PopStateEvent("popstate"), (o) => o.contentWindow));
  };
  // A wheel turned over a frame moves the deck, unless it scrolls something inside the frame; a gesture that
  // scrolled inside is left to the frame until input has been quiet.
  const watchWheel = (frame) => {
    let inside = -Infinity;
    frame.contentWindow.addEventListener(
      "wheel",
      (e) => {
        const now = performance.now();
        if (scrollsHere(e.target, e.deltaY) || now - inside < QUIET_MS) {
          inside = now;
          return;
        }
        dispatchEvent(new WheelEvent("wheel", { deltaY: e.deltaY, deltaMode: e.deltaMode, cancelable: true }));
      },
      { passive: true },
    );
  };
  const watch = (frame) => {
    frame.contentDocument.addEventListener("click", (e) => onClick(frame, e), true);
    watchKeys(frame);
    watchWheel(frame);
  };
  for (const frame of frames) {
    if (frame.contentDocument?.readyState === "complete") watch(frame);
    frame.addEventListener("load", () => {
      watch(frame);
      if (reloading.delete(frame)) return;
      for (const other of others(frame)) {
        reloading.add(other);
        other.contentWindow.location.reload(); // a frame that reloaded on its own takes the others with it
      }
    });
  }
  return { resync };
}
