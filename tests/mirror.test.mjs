// One demo on two screens: a choice made in either frame moves the other to the same screen, through the walk to
// a pick, "Not that one" and "Start over", by the desktop's trail and the phone's "Back" too; both show the same
// films. A wheel turned over a frame still moves the deck.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

import { serve } from "./serve.mjs";

const STEP_MS = 20000;
const DESK = "Matinee on a desktop";
const PHONE = "Matinee on a phone";
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

async function open({ motion = "reduce" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
  const page = await context.newPage();
  const trouble = [];
  page.on("pageerror", (e) => trouble.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" || (m.type() === "warning" && !m.text().startsWith("the other screen"))) trouble.push(`console: ${m.text()}`);
  });
  await page.goto(`${site.origin}/`);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelectorAll("iframe.demo-frame.live").length === 2, null, { timeout: STEP_MS });
  return { page, context, trouble, desk: await frameNamed(page, DESK), phone: await frameNamed(page, PHONE) };
}

async function frameNamed(page, title) {
  for (const f of page.frames()) {
    const el = await f.frameElement().catch(() => null);
    if (el && (await el.getAttribute("title")) === title) return f;
  }
  throw new Error(`no frame titled ${title}`);
}

// What a frame's screen shows once it has settled: Matinee's line, the answers on offer, and the film picked.
const screenOf = (frame) =>
  frame.evaluate(() => ({
    line: document.querySelector(".line")?.getAttribute("aria-label") || document.querySelector(".line")?.textContent || "",
    answers: [...document.querySelectorAll(".answers:not([hidden]) .letterbox, .answers:not([hidden]) .pail")].map((b) => b.textContent.trim()),
    film: document.querySelector(".film-title")?.textContent || null,
  }));

// Both frames show the same screen, and it is the screen `expect` describes, if given.
async function same(desk, phone, expect = () => true) {
  const until = Date.now() + STEP_MS;
  let a;
  let b;
  while (Date.now() < until) {
    try {
      [a, b] = await Promise.all([screenOf(desk), screenOf(phone)]);
      if (JSON.stringify(a) === JSON.stringify(b) && expect(a)) return a;
    } catch (err) {
      if (!/context was destroyed|navigat/i.test(err.message)) throw err; // a frame mid-reload is read again
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.deepEqual(b, a, "both screens show the same screen");
  return a;
}

const named = (frame, say) => frame.getByRole("button", { name: new RegExp(`^${say.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });

test("a walk made on the desktop moves the phone, to the pick, round its films and back to the start", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  await named(desk, "Comedy").click();
  let now = await same(desk, phone, (s) => s.answers.length > 0 && /respectable/i.test(s.line));
  await named(desk, now.answers[0]).click();
  now = await same(desk, phone, (s) => s.answers.length > 0 && !/respectable/i.test(s.line));
  await named(desk, now.answers[1]).click();
  now = await same(desk, phone, (s) => s.film !== null);
  const seen = [now.film];
  for (let i = 0; i < 2; i++) {
    await desk.getByRole("button", { name: "Not that one" }).click();
    now = await same(desk, phone, (s) => s.film !== null && !seen.includes(s.film));
    seen.push(now.film);
  }
  await desk.getByRole("button", { name: "Start over" }).first().click();
  await same(desk, phone, (s) => s.answers.includes("Comedy"));
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a walk made on the phone moves the desktop, and the phone's Back and the desktop's trail move both", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  await named(phone, "Horror").click();
  let now = await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.answers.length > 0);
  await named(phone, now.answers[0]).click();
  now = await same(desk, phone, (s) => /blood/i.test(s.line) && s.answers.length > 0);
  const gore = now.line;
  await phone.locator(".way-back button", { hasText: "Back" }).click();
  await same(desk, phone, (s) => /nightmare/i.test(s.line));
  await named(phone, now.answers.length ? (await screenOf(phone)).answers[0] : "").click();
  await same(desk, phone, (s) => s.line === gore);
  await desk.locator(".trail button.crumb").last().click();
  await same(desk, phone, (s) => /nightmare/i.test(s.line));
  await named(desk, (await screenOf(desk)).answers[1]).click();
  now = await same(desk, phone, (s) => /blood/i.test(s.line));
  await named(phone, now.answers[0]).click();
  await same(desk, phone, (s) => s.film !== null || /decade|era/i.test(s.line));
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a wheel turned over a frame moves the deck", async () => {
  const { page, context } = await open();
  await page.waitForTimeout(1200);
  const box = await page.locator(`iframe[title="${DESK}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => document.body.dataset.slide === "2", null, { timeout: STEP_MS });
  await context.close();
});

const menuOpen = (frame) => frame.evaluate(() => Boolean(document.querySelector(".viewer-menu:not([hidden])")));
const aboutOpen = (frame) => frame.evaluate(() => Boolean(document.querySelector(".about")));

test("Just pick one! mid-walk and the phone's Back on a pick move both screens", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  await named(phone, "Sci-fi").click();
  await same(desk, phone, (s) => s.answers.length > 0 && !s.answers.includes("Comedy"));
  await phone.getByRole("button", { name: "Just pick one!" }).click();
  await same(desk, phone, (s) => s.film !== null);
  await phone.locator("button.back").click();
  await same(desk, phone, (s) => s.answers.length > 0 && s.film === null);
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a menu or About opened in one screen closes in both, by Escape, by a press beside it and by About's Back", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  const both = async (check, want) => {
    const until = Date.now() + STEP_MS;
    while (Date.now() < until && (await Promise.all([check(desk), check(phone)])).some((v) => v !== want)) await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await Promise.all([check(desk), check(phone)]), [want, want]);
  };
  await desk.locator(".viewer-button").click();
  await both(menuOpen, true);
  await desk.locator("body").press("Escape");
  await both(menuOpen, false);
  await desk.locator(".viewer-button").click();
  await both(menuOpen, true);
  const box = await desk.page().locator(`iframe[title="${DESK}"]`).boundingBox();
  await desk.page().mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9); // an empty stretch of the wall
  await both(menuOpen, false);
  const line = (await screenOf(desk)).line;
  await phone.locator(".viewer-button").click();
  await phone.getByRole("menuitem", { name: /about/i }).click();
  await both(aboutOpen, true);
  await phone.locator(".about button", { hasText: "Back" }).click();
  await both(aboutOpen, false);
  assert.equal((await screenOf(desk)).line, line, "About's Back took the desktop nowhere");
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a frame reloaded mid-walk brings both screens back together at the doors", { timeout: 300000 }, async () => {
  const { page, context, desk, phone } = await open();
  await named(desk, "Horror").click();
  await same(desk, phone, (s) => /nightmare/i.test(s.line));
  const loads = await page.evaluate(() => {
    window.__loads = 0;
    for (const f of document.querySelectorAll("iframe.demo-frame")) f.addEventListener("load", () => (window.__loads += 1));
  });
  void loads;
  await phone.evaluate(() => location.reload());
  const d = await frameNamed(page, DESK);
  const p = await frameNamed(page, PHONE);
  await same(d, p, (s) => s.answers.includes("Comedy"));
  await new Promise((r) => setTimeout(r, 4000));
  assert.ok((await page.evaluate(() => window.__loads)) <= 2, "the frames do not reload each other without end");
  await context.close();
});

test("at full motion the screens keep step through a pick and Not that one", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open({ motion: "no-preference" });
  await named(desk, "For the kids").click();
  let now = await same(desk, phone, (s) => s.answers.length > 0 && !s.answers.includes("Comedy"));
  const age = now.line;
  await named(desk, now.answers[0]).click();
  now = await same(desk, phone, (s) => s.answers.length > 0 && s.film === null && s.line !== age);
  await named(phone, now.answers[0]).click();
  now = await same(desk, phone, (s) => s.film !== null);
  await desk.getByRole("button", { name: "Not that one" }).click();
  await same(desk, phone, (s) => s.film !== null && s.film !== now.film);
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a flick that scrolls something inside a frame, even to its end, leaves the deck where it is", { timeout: 120000 }, async () => {
  const { page, context, desk } = await open();
  await desk.locator(".viewer-button").click();
  await desk.getByRole("menuitem", { name: /about/i }).click();
  await desk.locator(".about").waitFor();
  const box = await page.locator(`iframe[title="${DESK}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, Math.max(6, 60 - i));
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(1200);
  assert.ok((await desk.evaluate(() => document.querySelector(".about").scrollTop)) > 0, "About scrolled");
  assert.equal(await page.evaluate(() => document.body.dataset.slide), "1");
  await context.close();
});
