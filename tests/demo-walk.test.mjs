// A headless walk of every canned branch on a phone and a desktop, through Matinee's real page served from the
// site: past the front door as the site's demo goes, into each door, down its first answer and then the first
// answer of each later question to the pick, "Not that one" round the branch's three films and back to the
// first, then "Start over". It fails on a problem screen, a page error or an unhandled rejection, a step whose
// next screen does not appear in time, and any request to an origin other than the site's own.
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

// The branches of a door: its first question's answers, or "_" for a door that asks nothing.
function branchesOf(tree) {
  const q = walks[tree][""].question;
  return q ? q.options.map((o) => ({ name: `${q.id}:${o.index}`, say: o.say })) : [{ name: "_", say: null }];
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
  await page.locator(".seats .seat:not(.new)").click({ timeout: STEP_MS });
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
    if (await page.getByRole("button", { name: "Not that one" }).isVisible()) return;
    await press(page, page.locator(".answers .letterbox, .answers .pail").first());
  }
  throw new Error("the walk did not reach a pick");
}

// The title the pick screen shows.
const pickedTitle = (page) => page.locator(".film-title").first().textContent({ timeout: STEP_MS });

async function walkDoor(page, door) {
  for (const branch of branchesOf(door.tree)) {
    await press(page, named(page, door.say));
    await walkTo(page, branch.say);
    const titles = [await pickedTitle(page)];
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Not that one" }).click({ timeout: STEP_MS });
      await page.locator(".film-title", { hasNotText: titles.at(-1) }).first().waitFor({ timeout: STEP_MS });
      titles.push(await pickedTitle(page));
    }
    const expected = picks[`${door.tree}/${branch.name}`].map((r) => [r.film.title, r.film.year].filter(Boolean).join(" "));
    assert.deepEqual(titles, [...expected, expected[0]], `${door.tree}/${branch.name} cycles its three films`);
    await noProblem(page, `${door.tree}/${branch.name}`);
    await page.getByRole("button", { name: "Start over" }).first().click({ timeout: STEP_MS });
    await atDoors(page);
  }
}

for (const [label, viewport] of [
  ["a desktop", { width: 1280, height: 800 }],
  ["a phone", { width: 390, height: 844 }],
]) {
  for (const door of first.options) {
    test(`on ${label}, every branch behind ${door.say} walks to a pick and round its three films`, { timeout: 600000 }, async () => {
      const { page, context, trouble } = await open(viewport);
      await walkDoor(page, door);
      assert.deepEqual(trouble, []);
      await context.close();
    });
  }
}

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
