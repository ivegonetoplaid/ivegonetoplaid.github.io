// The deck: three slides layered over one curtain. The page itself never scrolls. A pull toward the next or
// previous slide moves the deck a little as it comes (a wheel magnified so a short nudge shows, a finger one to
// one); short of the threshold it springs back once input is quiet, and past it the next slide rises over the
// curtain while the one beneath sinks and fades. The rest of that wheel gesture is ignored, so one flick moves
// one slide. A pull past either end moves stiffly and springs back.

const COMMIT_PX = 60; // a wheel pull this long moves the deck
const SWIPE_SHARE = 1 / 8; // a finger pull this share of the screen's height moves the deck
const SWIPE_SPEED = 0.35; // or a flick faster than this, in px per ms
const WHEEL_GAIN = 3; // a wheel pull shows magnified
const END_GIVE = 0.25; // past either end the deck gives this share of the pull
const END_MAX = 0.06; // and never more than this share of the screen
const SETTLE_MS = 820; // the next slide rising into place
const BACK_MS = 360; // a pull springing back
export const QUIET_MS = 200; // input quiet this long ends a gesture
const STILL_MS = 200; // the crossfade under reduced motion
const SINK = 0.08; // the slide beneath shrinks by this much as the next one rises
const SLIVER_PX = 8; // a slide overflowing by no more than this does not scroll inside itself
const WHEEL_UNIT = [1, 16, 0]; // pixels per wheel delta unit: pixels, lines, pages (pages use the screen's height)
const KEY_STEPS = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
const ARROW_SCROLL_PX = 40; // an arrow key scrolls a tall slide this far; a page key 90 % of its height
const RELEASE_MS = 100; // a finger's flick speed is measured over its last 100 ms

const easeOut = (t) => 1 - (1 - t) ** 4;

// Where slide `slide` stands when the deck is `d` slides from it: below the screen while it waits, rising over
// the curtain as it arrives, sinking and fading once the next one covers it.
function place(slide, d, still) {
  let y = 0;
  let scale = 1;
  let opacity = 1;
  if (still) opacity = Math.max(0, 1 - Math.abs(d) * 1.6);
  else if (d > 0) y = Math.min(d, 1) * 100;
  else if (d < 0) {
    scale = 1 + Math.max(d, -1) * SINK;
    opacity = Math.max(0, 1 + d * 2.5);
  }
  slide.style.transform = `translate3d(0, ${y.toFixed(3)}%, 0) scale(${scale.toFixed(4)})`;
  slide.style.opacity = opacity.toFixed(3);
  slide.style.visibility = d >= 1 || opacity === 0 ? "hidden" : "visible";
}

// Whether `slide` scrolls inside itself in direction `dy` before the deck moves.
function scrollsInside(slide, dy) {
  if (slide.scrollHeight - slide.clientHeight <= SLIVER_PX) return false;
  if (dy > 0) return slide.scrollTop + slide.clientHeight < slide.scrollHeight - 1;
  return dy < 0 && slide.scrollTop > 0;
}

// Builds the deck over `slides`, marked by `dots`. `busy()` is true while an overlay (About, the phone's demo)
// takes the input.
export function deck({ slides, dots, busy = () => false }) {
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;
  let pos = 0;
  let frame = 0;

  const render = (p) => {
    pos = p;
    slides.forEach((s, j) => place(s, j - p, still.matches));
  };
  const glide = (target, ms) => {
    cancelAnimationFrame(frame);
    const from = pos;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      render(from + (target - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const canGo = (dir) => dir !== 0 && index + dir >= 0 && index + dir < slides.length;
  // How far the deck follows a pull that has not committed: as far as it goes toward a slide, and stiffly, never
  // more than a sliver, past either end.
  const follow = (share, dir) => {
    if (canGo(dir)) return share;
    return Math.max(-END_MAX, Math.min(END_MAX, share * END_GIVE));
  };
  // A pull starts from wherever the deck stands, so a pull that begins while a slide is still settling never
  // snaps it.
  let base = 0;
  const go = (to) => {
    index = Math.max(0, Math.min(slides.length - 1, to));
    slides.forEach((s, j) => {
      s.inert = j !== index;
    });
    dots.forEach((d, j) => d.setAttribute("aria-current", String(j === index)));
    document.body.dataset.slide = String(index);
    glide(index, still.matches ? STILL_MS : SETTLE_MS);
  };

  // A wheel gesture: it builds a pull until it commits or input goes quiet; once committed, the rest of the
  // gesture is spent until input has been quiet. A gesture that scrolled a tall slide inside itself is spent the
  // same way when the slide reaches its end, so one flick does one thing.
  let pull = 0;
  let lastWheel = 0;
  let spent = false;
  let inside = false;
  let springBack = 0;
  // True when the wheel scrolls the slide inside itself, which the browser does.
  const scrollingInside = (dy, now) => {
    if (spent || pull !== 0 || !scrollsInside(slides[index], dy)) return false;
    lastWheel = now;
    inside = true;
    return true;
  };
  // True while the rest of a spent gesture arrives; input quiet for QUIET_MS starts a new one.
  const swallowed = (now) => {
    const gap = now - lastWheel;
    lastWheel = now;
    if ((spent || inside) && gap < QUIET_MS) return true;
    spent = false;
    inside = false;
    return false;
  };
  const onWheel = (e) => {
    if (busy()) return;
    const dy = e.deltaY * (WHEEL_UNIT[e.deltaMode] || innerHeight);
    const now = performance.now();
    if (scrollingInside(dy, now)) return;
    e.preventDefault();
    if (swallowed(now)) return;
    if (pull === 0) base = pos;
    pull += dy;
    const dir = Math.sign(pull);
    clearTimeout(springBack);
    if (Math.abs(pull) >= COMMIT_PX && canGo(dir)) {
      pull = 0;
      spent = true;
      go(index + dir);
      return;
    }
    cancelAnimationFrame(frame);
    render(base + follow((pull * WHEEL_GAIN) / innerHeight, dir));
    springBack = setTimeout(() => {
      pull = 0;
      glide(index, BACK_MS);
    }, QUIET_MS);
  };

  // A finger: followed one to one, then moved on by distance or by the speed it leaves at, or sprung back. A
  // second finger ends the gesture where it stands, so the deck returns to its slide.
  let touch = null;
  const onTouchStart = (e) => {
    if (touch && !touch.native && e.touches.length > 1) glide(index, BACK_MS);
    if (e.touches.length !== 1 || busy()) {
      touch = null;
      return;
    }
    base = pos;
    touch = { y: e.touches[0].clientY, native: null, dy: 0, samples: [{ dy: 0, t: performance.now() }] };
  };
  const onTouchMove = (e) => {
    if (!touch) return;
    touch.dy = touch.y - e.touches[0].clientY;
    const now = performance.now();
    touch.samples.push({ dy: touch.dy, t: now });
    while (touch.samples.length > 2 && now - touch.samples[0].t > RELEASE_MS) touch.samples.shift();
    if (touch.native === null) touch.native = scrollsInside(slides[index], touch.dy);
    if (touch.native || !e.cancelable) return;
    e.preventDefault();
    cancelAnimationFrame(frame);
    render(base + follow(touch.dy / innerHeight, Math.sign(touch.dy)));
  };
  const onTouchEnd = () => {
    if (!touch || touch.native) {
      touch = null;
      return;
    }
    const { dy, samples } = touch;
    touch = null;
    const dir = Math.sign(dy);
    const from = samples[0];
    const speed = Math.abs(dy - from.dy) / Math.max(1, performance.now() - from.t);
    if (canGo(dir) && (Math.abs(dy) >= innerHeight * SWIPE_SHARE || speed > SWIPE_SPEED)) go(index + dir);
    else glide(index, BACK_MS);
  };

  // A key scrolls a tall slide inside itself before it moves the deck. True when it scrolled.
  const scrollKey = (key) => {
    const step = KEY_STEPS[key];
    const slide = slides[index];
    if (!step || !scrollsInside(slide, step)) return false;
    const amount = key.startsWith("Arrow") ? ARROW_SCROLL_PX : slide.clientHeight * 0.9;
    slide.scrollBy({ top: step * amount });
    return true;
  };
  // The slide a key moves to, or null for a key the deck leaves alone.
  const keyTarget = (key) => {
    if (key === "Home") return 0;
    if (key === "End") return slides.length - 1;
    return KEY_STEPS[key] ? index + KEY_STEPS[key] : null;
  };
  const onKey = (e) => {
    if (busy() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === " " && e.target.closest?.("button, a, input")) return;
    if (scrollKey(e.key)) {
      e.preventDefault();
      return;
    }
    const to = keyTarget(e.key);
    if (to === null) return;
    go(to);
    e.preventDefault();
  };

  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", onTouchMove, { passive: false });
  addEventListener("touchend", onTouchEnd);
  addEventListener("touchcancel", () => {
    touch = null;
    glide(index, BACK_MS);
  });
  addEventListener("keydown", onKey);
  dots.forEach((d, j) => d.addEventListener("click", () => go(j)));
  addEventListener("resize", () => render(pos));
  go(0);
  return { go, index: () => index };
}
