// The demo's conductor: one script for every screen. Each screen's player sends its presses here, and the
// conductor hands each press to every screen with one start time a moment ahead, so all of them play it
// together; a player draws nothing at random and times every step by its own fixed clock, so they stay
// together. A screen that joins late (a monitor shown once a window widens, a frame reloaded) is brought to
// where the others stand from the presses made since the last "Start over". A wheel turned over a screen
// moves the deck, unless it scrolls something inside the screen.

import { QUIET_MS } from "./deck.js";
import { scrollsHere } from "./scrolls.js";

const LEAD_MS = 120; // a press starts this long after it is made, so every screen has it in hand

// A gesture that scrolled inside a screen is left to the screen until input has been quiet.
function forwardWheel(win) {
  let inside = -Infinity;
  win.addEventListener(
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
}

// The frame a player's window stands in, marked live once it shows the demo.
function frameOf(win) {
  return [...document.querySelectorAll("iframe.demo-frame")].find((f) => f.contentWindow === win) ?? null;
}

export function conductor() {
  const players = new Set();
  const log = []; // every press since the last "Start over", in order
  return {
    press(intent) {
      if (intent.kind === "start") log.length = 0;
      else log.push(intent);
      const at = Date.now() + LEAD_MS;
      for (const win of [...players]) {
        if (win.closed || !win.matineeDemo) players.delete(win);
        else win.matineeDemo.apply(intent, at);
      }
    },
    async join(win) {
      players.add(win);
      forwardWheel(win);
      await win.matineeDemo.replay([...log]); // a press made mid-replay reaches the screen once, by `apply`
      this.show(win);
    },
    // Shows a screen's frame without playing the script on it (a demo that could not load says so there).
    show(win) {
      frameOf(win)?.classList.add("live");
    },
  };
}
