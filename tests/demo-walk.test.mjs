// The demo's player served from the site, driven headless. One path is walked whole on a phone and on a
// desktop: the door, its answer, the reveal, "Not that one" round the path's three films and back to the first,
// then "Start over". Every door's first screen is opened once on the desktop, where it must not scroll inside
// itself. Every path runs the same player code; the canned test checks each path's data without a browser.
// A walk fails on a page error or an unhandled rejection, a step whose next screen does not appear in time, a
// desktop screen that scrolls inside itself, and any request to an origin other than the site's own.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

import { serve } from "./serve.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const first = JSON.parse(readFileSync(`${ROOT}canned/first.json`, "utf8"));
const picks = JSON.parse(readFileSync(`${ROOT}canned/picks.json`, "utf8"));
const walks = Object.fromEntries(
  readdirSync(`${ROOT}canned/walk`).map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(`${ROOT}canned/walk/${f}`, "utf8"))]),
);
const STEP_MS = 15000;

// A button whose words are `say`, whatever case the page sets them in.
const named = (page, say) => page.getByRole("button", { name: new RegExp(`^${say.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });

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

// A door's first path: its first question's first answer, or "_" for a door that asks nothing.
function firstPath(tree) {
  const q = walks[tree][""].question;
  return q ? { name: `${q.id}:${q.options[0].index}`, say: q.options[0].say } : { name: "_", say: null };
}

async function open(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", isMobile: viewport.width <= 600, hasTouch: viewport.width <= 600 });
  const page = await context.newPage();
  const trouble = [];
  page.on("pageerror", (e) => trouble.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") trouble.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    if (!r.url().startsWith(site.origin)) trouble.push(`left the site: ${r.url()}`);
  });
  await page.addInitScript(() => {
    addEventListener("unhandledrejection", (e) => console.error(`unhandled rejection: ${e.reason}`));
  });
  await page.goto(`${site.origin}/demo/`);
  await atDoors(page);
  return { page, context, trouble };
}

const atDoors = (page) => page.locator(".answers.many .letterbox").first().waitFor({ timeout: STEP_MS });

// Fails on the problem screen, which offers "Try again".
async function noProblem(page, where) {
  const shown = await page.locator(".talk .action", { hasText: "Try again" }).count();
  assert.equal(shown, 0, `a problem screen at ${where}: ${await page.locator(".line").first().textContent()}`);
}

// Presses `button`, then waits until the screen has moved on: the pick stands, or a fresh set of answers.
async function press(page, button) {
  await page.evaluate(() => {
    window.__old = document.querySelector(".answers");
  });
  await button.click({ timeout: STEP_MS });
  await page.waitForFunction(
    () => {
      const picked = [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Not that one" && b.offsetParent);
      const fresh = document.querySelector(".answers:not([hidden])");
      return picked || Boolean(fresh && fresh !== window.__old && fresh.querySelector(".letterbox, .pail"));
    },
    null,
    { timeout: STEP_MS },
  );
}

// Answers until the pick screen stands: the door's own answer `say` first, then the first answer each time.
async function walkTo(page, say) {
  if (say) await press(page, named(page, say));
  for (let i = 0; i < 6; i++) {
    await noInnerScroll(page, `${say} step ${i}`);
    if (await page.getByRole("button", { name: "Not that one" }).isVisible()) return;
    await press(page, page.locator(".answers .letterbox, .answers .pail").first());
  }
  throw new Error("the walk did not reach a pick");
}

// Fails when the desktop's screen scrolls inside itself: the drawn monitor shows the whole of every screen.
async function noInnerScroll(page, where) {
  if (page.viewportSize().width <= 600) return;
  const over = await page.evaluate(() => {
    const stage = document.querySelector("main.stage");
    return stage ? stage.scrollHeight - stage.clientHeight : 0;
  });
  assert.ok(over <= 1, `the desktop screen scrolls ${over} px inside itself at ${where}`);
}

// The title the pick screen shows.
const pickedTitle = (page) => page.locator(".film-title").first().textContent({ timeout: STEP_MS });

// Walks `door`'s first path to its reveal, round its three films and back to the first, then starts over.
async function walkPath(page, door) {
  const path = firstPath(door.tree);
  await press(page, named(page, door.say));
  await walkTo(page, path.say);
  const titles = [await pickedTitle(page)];
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Not that one" }).click({ timeout: STEP_MS });
    await page.locator(".film-title", { hasNotText: titles.at(-1) }).first().waitFor({ timeout: STEP_MS });
    titles.push(await pickedTitle(page));
  }
  const expected = picks[`${door.tree}/${path.name}`].map((r) => [r.film.title, r.film.year].filter(Boolean).join(" "));
  assert.deepEqual(titles, [...expected, expected[0]], `${door.tree}/${path.name} cycles its three films`);
  await noProblem(page, `${door.tree}/${path.name}`);
  await page.getByRole("button", { name: "Start over" }).first().click({ timeout: STEP_MS });
  await atDoors(page);
}

for (const [label, viewport] of [
  ["a desktop", { width: 1680, height: 1050 }],
  ["a phone", { width: 390, height: 844 }],
]) {
  test(`on ${label}, a path walks to its reveal, round its three films, and starts over`, { timeout: 120000 }, async () => {
    const { page, context, trouble } = await open(viewport);
    await walkPath(page, first.options[0]);
    assert.deepEqual(trouble, []);
    await context.close();
  });
}

test("on a desktop, every door's first screen fits without scrolling inside itself", { timeout: 120000 }, async () => {
  const { page, context, trouble } = await open({ width: 1680, height: 1050 });
  for (const door of first.options) {
    await press(page, named(page, door.say));
    await noInnerScroll(page, door.say);
    await page.locator(".wordmark").click({ timeout: STEP_MS });
    await atDoors(page);
  }
  assert.deepEqual(trouble, []);
  await context.close();
});

test("the corner mark inside the demo starts over in place and never loads the site inside it", async () => {
  const { page, context, trouble } = await open({ width: 1280, height: 800 });
  await press(page, named(page, first.options[0].say));
  await page.locator(".wordmark").click({ timeout: STEP_MS });
  await atDoors(page);
  assert.equal(new URL(page.url()).pathname, "/demo/");
  assert.equal(await page.locator(".deck").count(), 0, "the site's own page is not inside the demo");
  assert.deepEqual(trouble, []);
  await context.close();
});

test("the demo fetches every canned file the site carries, and no other", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const fetched = new Set();
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/canned/")) fetched.add(path.slice("/canned/".length));
  });
  await page.goto(`${site.origin}/demo/`);
  await atDoors(page);
  const carried = ["boot.json", "first.json", "picks.json", ...readdirSync(`${ROOT}canned/walk`).map((f) => `walk/${f}`)];
  assert.deepEqual([...fetched].sort(), carried.sort());
  await context.close();
});

test("a canned file that does not arrive leaves both screens saying so", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.route("**/canned/walk/scifi.json", (route) => route.abort());
  await page.goto(`${site.origin}/`);
  for (const frame of ["#desk-glass iframe", "#phone-glass iframe"]) {
    // Slide two stands off screen, so the frames count as hidden: attached is what can be waited on.
    await page.locator(`${frame}.live`).waitFor({ state: "attached", timeout: STEP_MS });
    await page.frameLocator(frame).getByText("The demo didn't load.").waitFor({ state: "attached", timeout: STEP_MS });
  }
  await context.close();
});

test("a hunt left by the trail stops: the doors wall only drifts", { timeout: 60000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${site.origin}/demo/`);
  await press(page, named(page, first.options[0].say));
  const answers = page.locator(".answers:not([hidden]) .letterbox");
  await answers.first().click({ timeout: STEP_MS });
  await page.waitForTimeout(2200); // the gold line has typed and its read has passed: the hunt is under way
  await page.locator("button.crumb").first().click({ timeout: STEP_MS });
  await page.waitForTimeout(300);
  const at = () => page.evaluate(() => [...document.querySelectorAll(".wall-tiles")].at(-1).style.transform.match(/-?[\d.]+/g).map(Number));
  const [x0, y0] = await at();
  await page.waitForTimeout(2000);
  const [x1, y1] = await at();
  assert.equal(x1, x0, "the wall moved sideways after the hunt was left");
  assert.ok(Math.abs(y1 - y0) <= 25, `the wall moved ${Math.abs(y1 - y0)} px down in 2 s; a drift moves 20`);
  await context.close();
});
