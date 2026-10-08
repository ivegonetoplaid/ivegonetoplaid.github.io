// One script on two screens: a press on either screen plays on both at once, through the walk to a reveal,
// "Not that one" and "Start over", by the desktop's trail and the phone's "Back" too, and both show the same
// films. The profile menu opens and closes on both and its items do nothing; "More on TMDB" and a note's Save do nothing. A
// screen reloaded mid-walk rejoins where the other stands. A wheel turned over a screen moves the deck, unless it
// scrolls something inside the screen.
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
  let now = await same(desk, phone, (s) => s.answers.length > 0 && /foolishness/i.test(s.line));
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
  const asked = await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.answers.length > 2);
  await named(phone, asked.answers[0]).click();
  await same(desk, phone, (s) => s.film !== null);
  await phone.locator("button.back").click();
  await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.film === null);
  await named(phone, asked.answers[1]).click();
  const first = await same(desk, phone, (s) => s.film !== null);
  await desk.locator(".trail button.crumb").last().click();
  await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.film === null);
  await named(desk, asked.answers[2]).click();
  await same(desk, phone, (s) => s.film !== null && s.film !== first.film);
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

test("the profile menu opens and closes on both screens, by Escape and a press beside it, and its items do nothing", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  const both = async (check, want) => {
    const until = Date.now() + STEP_MS;
    while (Date.now() < until && (await Promise.all([check(desk), check(phone)])).some((v) => v !== want)) await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await Promise.all([check(desk), check(phone)]), [want, want]);
  };
  const line = (await screenOf(desk)).line;
  await desk.locator(".viewer-button").click();
  await both(menuOpen, true);
  await desk.locator("body").press("Escape");
  await both(menuOpen, false);
  await desk.locator(".viewer-button").click();
  await both(menuOpen, true);
  const box = await desk.page().locator(`iframe[title="${DESK}"]`).boundingBox();
  await desk.page().mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9); // an empty stretch of the wall
  await both(menuOpen, false);
  await phone.locator(".viewer-button").click();
  await phone.getByRole("menuitem", { name: "Delete profile" }).click();
  await both(menuOpen, false);
  assert.equal((await screenOf(desk)).line, line, "the menu's items took neither screen anywhere");
  assert.equal((await screenOf(phone)).line, line);
  assert.deepEqual(trouble, []);
  await context.close();
});

test("More on TMDB opens nothing, and a note's panel opens on both screens while its Save does nothing", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open();
  await named(desk, "Documentaries").click();
  const now = await same(desk, phone, (s) => s.film !== null);
  const pages = context.pages().length;
  await desk.getByRole("button", { name: "More on TMDB ↗" }).click();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(context.pages().length, pages, "More on TMDB opened no page");
  assert.equal((await screenOf(desk)).film, now.film, "More on TMDB took the screen nowhere");
  await desk.getByRole("button", { name: "Something wrong with this pick?" }).click();
  const panelOpen = (f) => f.evaluate(() => !document.querySelector(".correct-panel").hidden);
  await same(desk, phone, () => true);
  for (let i = 0; i < 20 && !((await panelOpen(desk)) && (await panelOpen(phone))); i++) await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual([await panelOpen(desk), await panelOpen(phone)], [true, true]);
  await desk.getByRole("button", { name: "Save" }).click();
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal((await screenOf(desk)).film, now.film, "Save took the screen nowhere");
  assert.equal(await panelOpen(desk), true, "Save left the panel as it was");
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a screen reloaded mid-walk rejoins where the other stands", { timeout: 300000 }, async () => {
  const { page, context, desk, phone } = await open();
  await named(desk, "Horror").click();
  const asked = await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.answers.length > 0);
  await phone.evaluate(() => location.reload());
  await page.waitForFunction((t) => document.querySelector(`iframe[title="${t}"]`)?.classList.contains("live"), PHONE, { timeout: STEP_MS });
  const p = await frameNamed(page, PHONE);
  const d = await frameNamed(page, DESK);
  await same(d, p, (s) => s.line === asked.line && s.answers.length > 0);
  await named(p, asked.answers[0]).click();
  await same(d, p, (s) => s.film !== null);
  await context.close();
});

test("at full motion both screens reach every reveal within 100 ms of each other, on the same film", { timeout: 300000 }, async () => {
  const { context, trouble, desk, phone } = await open({ motion: "no-preference" });
  const watch = (f) =>
    f.evaluate(() => {
      window.__reveals = [];
      let had = null;
      setInterval(() => {
        const title = document.querySelector(".film-title")?.textContent || null;
        if (title && title !== had) window.__reveals.push(Date.now());
        had = title;
      }, 5);
    });
  await watch(desk);
  await watch(phone);
  await named(desk, "Horror").click();
  const asked = await same(desk, phone, (s) => /nightmare/i.test(s.line) && s.answers.length > 0);
  await named(phone, asked.answers[1]).click();
  for (let i = 0; i < 2; i++) {
    await phone.getByRole("button", { name: "Not that one" }).waitFor({ timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    await desk.getByRole("button", { name: "Not that one" }).click();
  }
  await phone.waitForFunction(() => window.__reveals.length >= 3, null, { timeout: 30000 });
  await desk.waitForFunction(() => window.__reveals.length >= 3, null, { timeout: 30000 });
  const [a, b] = [await desk.evaluate(() => window.__reveals), await phone.evaluate(() => window.__reveals)];
  const gaps = a.slice(0, 3).map((t, k) => Math.abs(t - b[k]));
  assert.ok(gaps.every((g) => g <= 100), `the screens revealed ${gaps.join(", ")} ms apart`);
  await same(desk, phone, (st) => st.film !== null); // and they landed on the same film
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a flick that scrolls something inside a screen, even to its end, leaves the deck where it is", { timeout: 120000 }, async () => {
  const { page, context, desk, phone } = await open();
  await named(desk, "Documentaries").click();
  await same(desk, phone, (s) => s.film !== null);
  const showing = () => phone.evaluate(() => document.querySelector(".showing").scrollTop);
  await phone.waitForFunction(() => document.querySelector(".showing")?.scrollTop > 0, null, { timeout: STEP_MS });
  const box = await page.locator(`iframe[title="${PHONE}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, -Math.max(6, 60 - i));
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(1200);
  assert.equal(await showing(), 0, "the phone's reveal scrolled back to its top");
  assert.equal(await page.evaluate(() => document.body.dataset.slide), "1");
  await context.close();
});
