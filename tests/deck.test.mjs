// The deck's gestures, driven in a headless browser and judged by where the slides stand, not by a counter: a
// short nudge springs back, one flick moves one slide however long its momentum runs, keys move one slide (and
// scroll a tall slide first), a pull past either end gives a sliver and springs back, and a finger moves on by
// distance or by speed.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

import { serve } from "./serve.mjs";

let site;
let browser;

before(async () => {
  site = await serve();
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await site.stop();
});

async function open({ width = 1280, height = 800, touch = false, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion });
  const page = await context.newPage();
  await page.goto(`${site.origin}/`);
  await page.waitForFunction(() => document.body.dataset.slide === "0");
  await page.waitForTimeout(900);
  if (!touch) await page.mouse.move(width / 2, height / 2);
  return page;
}

// Every slide as it stands: its rise (the translate's percentage), its opacity, whether it is inert and visible.
const standing = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".slide")].map((s) => {
      const m = /translate3d\(0px?, ([-\d.]+)%/.exec(s.style.transform);
      return { rise: m ? Number(m[1]) : 0, opacity: Number(s.style.opacity || 1), inert: s.inert, hidden: s.style.visibility === "hidden" };
    }),
  );

// Slide `k` rests in place, whole and live; every other slide is inert and out of sight; bulb `k` alone is lit.
async function rests(page, k) {
  const slides = await standing(page);
  assert.equal(slides[k].rise, 0, `slide ${k} rests in place`);
  assert.equal(slides[k].opacity, 1, `slide ${k} is whole`);
  assert.equal(slides[k].inert, false, `slide ${k} takes input`);
  slides.forEach((s, j) => {
    if (j === k) return;
    assert.ok(s.inert, `slide ${j} is inert`);
    assert.ok(s.hidden || s.rise === 100, `slide ${j} is out of sight`);
  });
  const lit = await page.evaluate(() => [...document.querySelectorAll(".dots button")].map((d) => d.getAttribute("aria-current")));
  assert.deepEqual(lit, lit.map((_, j) => String(j === k)));
}

// A trackpad flick: many small deltas, the last ones arriving as momentum after the finger lifts.
async function flick(page, dir, events = 30, gapMs = 16) {
  for (let i = 0; i < events; i++) {
    await page.mouse.wheel(0, dir * Math.max(4, 40 - i));
    await page.waitForTimeout(gapMs);
  }
}

// The lowest opacity and the furthest rise a slide reaches while `act` runs, sampled every frame.
async function extremes(page, k, act) {
  await page.evaluate((n) => {
    window.__seen = { low: 1, far: 0 };
    const look = () => {
      const s = document.querySelectorAll(".slide")[n];
      const m = /translate3d\(0px?, ([-\d.]+)%/.exec(s.style.transform);
      window.__seen.low = Math.min(window.__seen.low, Number(s.style.opacity || 1));
      window.__seen.far = Math.max(window.__seen.far, Math.abs(m ? Number(m[1]) : 0));
      window.__look = requestAnimationFrame(look);
    };
    look();
  }, k);
  await act();
  return page.evaluate(() => {
    cancelAnimationFrame(window.__look);
    return window.__seen;
  });
}

test("a short nudge moves the deck a little, then springs back", async () => {
  const page = await open();
  await page.mouse.wheel(0, 20);
  await page.waitForTimeout(60);
  const pulled = (await standing(page))[1].rise;
  assert.ok(pulled < 100 && pulled > 80, `the next slide shows a little of itself (${pulled})`);
  await page.waitForTimeout(900);
  await rests(page, 0);
  await page.close();
});

test("one flick moves one slide, however long its momentum runs, and the slide rises in about 0.8 s", async () => {
  const page = await open();
  await flick(page, 1, 60);
  await page.waitForTimeout(1200);
  await rests(page, 1);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  const midway = (await standing(page))[2].rise;
  assert.ok(midway > 0 && midway < 15, `the rising slide is near, not yet home, at 0.4 s (${midway})`);
  await page.waitForTimeout(600);
  await rests(page, 2);
  await flick(page, -1, 60);
  await page.waitForTimeout(1200);
  await rests(page, 1);
  await page.close();
});

test("the keys move one slide at a time, Home and End to either end, and Space on a button presses it", async () => {
  const page = await open();
  for (const [key, k] of [
    ["ArrowDown", 1],
    ["PageDown", 2],
    ["ArrowUp", 1],
    ["Home", 0],
    ["End", 2],
    ["PageUp", 1],
    [" ", 2],
  ]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1000);
    await rests(page, k);
  }
  await page.locator(".dots button").nth(0).focus();
  await page.keyboard.press(" ");
  await page.waitForTimeout(1000);
  await rests(page, 0); // the bulb was pressed; Space did not also step the deck
  await page.close();
});

test("a pull past either end gives a sliver, never blanks the screen, and springs back", async () => {
  const page = await open();
  const first = await extremes(page, 0, () => flick(page, -1, 60));
  assert.ok(first.far > 0 && first.far < 10, `the first slide gives, a little (${first.far})`);
  await page.waitForTimeout(900);
  await rests(page, 0);
  await page.keyboard.press("End");
  await page.waitForTimeout(1000);
  const last = await extremes(page, 2, () => flick(page, 1, 20));
  assert.ok(last.low > 0.8, `the last slide never fades out (${last.low})`);
  await page.waitForTimeout(900);
  await rests(page, 2);
  await page.close();
});

test("a pull begun while a slide is settling moves on from where the deck stands", async () => {
  const page = await open();
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(210);
  const before = (await standing(page))[1].rise;
  await page.mouse.wheel(0, 10);
  await page.waitForTimeout(20);
  const after = (await standing(page))[1].rise;
  // Without the fix the new pull starts from the slide's resting place and the rising slide jumps home at once.
  assert.ok(after > 10 && after <= before + 5, `the rising slide moves on from where it stood (${before} to ${after})`);
  await page.waitForTimeout(1200);
  await rests(page, 1);
  await page.close();
});

test("a slide taller than the screen scrolls inside itself, by wheel and by key, before the deck moves", async () => {
  const page = await open();
  await page.evaluate(() => {
    const tall = document.createElement("div");
    tall.style.height = "2400px";
    tall.style.flex = "none";
    document.querySelector(".s1").append(tall);
  });
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => document.querySelector(".s1").scrollTop)) > 0, "the wheel scrolled the slide");
  await rests(page, 0);
  await page.waitForTimeout(400);
  const top = await page.evaluate(() => document.querySelector(".s1").scrollTop);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => document.querySelector(".s1").scrollTop);
  assert.ok(scrolled > top, `the arrow scrolled the slide (${top} to ${scrolled})`);
  await rests(page, 0);
  await page.evaluate(() => {
    const s = document.querySelector(".s1");
    s.scrollTop = s.scrollHeight;
  });
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1000);
  await rests(page, 1);
  await page.close();
});

test("an overflow of 8 px or less does not hold the deck", async () => {
  const page = await open({ height: 500 });
  await page.evaluate(() => {
    const s = document.querySelector(".s1");
    const style = getComputedStyle(s);
    const inner = s.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const pad = document.createElement("div");
    pad.style.height = `${inner + 8}px`;
    pad.style.flex = "none";
    s.replaceChildren(pad);
  });
  const over = await page.evaluate(() => {
    const s = document.querySelector(".s1");
    return s.scrollHeight - s.clientHeight;
  });
  assert.ok(over > 0 && over <= 8, `the slide overflows by a sliver (${over})`);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1000);
  await rests(page, 1);
  await page.close();
});

test("a bulb on the right moves to its slide", async () => {
  const page = await open();
  await page.locator(".dots button").nth(2).click();
  await page.waitForTimeout(1000);
  await rests(page, 2);
  await page.locator(".dots button").nth(1).click();
  await page.waitForTimeout(1000);
  await rests(page, 1);
  await page.close();
});

test("under reduced motion a slide change is a short crossfade, with no rise", async () => {
  const page = await open({ reducedMotion: "reduce" });
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(80);
  assert.equal((await standing(page))[1].rise, 0, "the next slide does not rise");
  await page.waitForTimeout(250);
  await rests(page, 1);
  await page.close();
});

// A swipe from `from` to `to` px over `ms`, in `steps` moves, and optionally a second finger landing halfway.
function swipe(page, { from, to, steps = 10, ms = 400, second = false }) {
  return page.evaluate(
    async ([a, b, n, t, two]) => {
      const finger = (id, y) => new Touch({ identifier: id, target: document.body, clientX: 200, clientY: y });
      const fire = (type, touches, changed) =>
        dispatchEvent(new TouchEvent(type, { touches, changedTouches: changed, cancelable: true, bubbles: true }));
      fire("touchstart", [finger(1, a)], [finger(1, a)]);
      let y = a;
      for (let i = 1; i <= n; i++) {
        await new Promise((r) => setTimeout(r, t / n));
        y = a + ((b - a) * i) / n;
        if (two && i === Math.floor(n / 2)) fire("touchstart", [finger(1, y), finger(2, 300)], [finger(2, 300)]);
        fire("touchmove", [finger(1, y)], [finger(1, y)]);
      }
      fire("touchend", [], [finger(1, y)]);
    },
    [from, to, steps, ms, second],
  );
}

test("a finger moves on past an eighth of the screen or on a quick flick, and otherwise springs back", async () => {
  const page = await open({ width: 390, height: 844, touch: true });
  await swipe(page, { from: 500, to: 470, ms: 400 }); // 30 px, slowly
  await page.waitForTimeout(600);
  await rests(page, 0);
  await swipe(page, { from: 700, to: 580, steps: 20, ms: 1600 }); // past an eighth, slowly
  await page.waitForTimeout(1100);
  await rests(page, 1);
  await swipe(page, { from: 500, to: 440, steps: 3, ms: 60 }); // short, but quick at release
  await page.waitForTimeout(1100);
  await rests(page, 2);
  await page.close();
});

test("a second finger landing mid-swipe returns the deck to its slide", async () => {
  const page = await open({ width: 390, height: 844, touch: true });
  await swipe(page, { from: 500, to: 450, ms: 400, second: true });
  await page.waitForTimeout(700);
  await rests(page, 0);
  await page.close();
});

test("a flick that scrolls a tall slide to its end does not also move the deck", async () => {
  const page = await open();
  await page.evaluate(() => {
    const tall = document.createElement("div");
    tall.style.height = "900px";
    tall.style.flex = "none";
    document.querySelector(".s1").append(tall);
  });
  await flick(page, 1, 80);
  await page.waitForTimeout(1200);
  const atEnd = await page.evaluate(() => {
    const s = document.querySelector(".s1");
    return s.scrollTop + s.clientHeight >= s.scrollHeight - 1;
  });
  assert.ok(atEnd, "the slide scrolled to its end");
  await rests(page, 0);
  await page.close();
});
