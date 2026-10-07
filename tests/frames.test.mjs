// The site's demo frames: on the second slide both screens stand on the doors question, and a visitor never
// sees Matinee's front door in either, whatever they press (Change avatar, Switch profiles, Delete profile) and
// even after a frame reloads. Each frame keeps to /demo/, nothing leaves the site, and a window that widens past
// a phone's width gets its monitor's demo.
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

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const trouble = [];
  page.on("pageerror", (e) => trouble.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") trouble.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    if (!r.url().startsWith(site.origin)) trouble.push(`left the site: ${r.url()}`);
  });
  await page.goto(`${site.origin}/`);
  return { page, context, trouble };
}

// Records every moment a frame can be seen while its page stands on the front door.
const watchForDoor = (page) =>
  page.evaluate(() => {
    window.__doorSeen = [];
    const look = () => {
      for (const frame of document.querySelectorAll("iframe.demo-frame")) {
        const doc = frame.contentDocument;
        const atDoor = doc?.getElementById("stage")?.classList.contains("at-door") || doc?.querySelector(".seats");
        if (atDoor && Number(getComputedStyle(frame).opacity) > 0.02) window.__doorSeen.push(frame.title);
      }
      requestAnimationFrame(look);
    };
    look();
  });

// The frame titled `title` stands live on its doors question, at /demo/.
async function atDoors(page, title) {
  await page.waitForFunction(
    (t) => {
      const frame = document.querySelector(`iframe[title="${t}"]`);
      const doc = frame?.contentDocument;
      return frame?.classList.contains("live") && doc?.querySelector(".answers.many .letterbox") && !doc.getElementById("stage").classList.contains("at-door");
    },
    title,
    { timeout: STEP_MS },
  );
  assert.equal(await page.evaluate((t) => document.querySelector(`iframe[title="${t}"]`).contentWindow.location.pathname, title), "/demo/");
}

async function frameNamed(page, title) {
  for (const f of page.frames()) {
    const el = await f.frameElement().catch(() => null);
    if (el && (await el.getAttribute("title")) === title) return f;
  }
  throw new Error(`no frame titled ${title}`);
}

async function fromMenu(frame, item) {
  await frame.locator(".viewer-button").click({ timeout: STEP_MS });
  await frame.getByRole("menuitem", { name: item }).click({ timeout: STEP_MS });
}

test("both screens open on the doors question, and the front door never shows in either", { timeout: 300000 }, async () => {
  const { page, context, trouble } = await open({ width: 1440, height: 900 });
  await page.keyboard.press("ArrowDown");
  await atDoors(page, DESK);
  await atDoors(page, PHONE);
  await watchForDoor(page);
  for (const title of [DESK, PHONE]) {
    let frame = await frameNamed(page, title);
    await fromMenu(frame, "Change avatar");
    await frame.locator(".avatar-choice").first().click({ timeout: STEP_MS });
    await page.keyboard.press("Escape");
    await fromMenu(frame, "Switch profiles");
    await atDoors(page, title);
    frame = await frameNamed(page, title);
    await fromMenu(frame, "Delete profile");
    await frame.getByRole("button", { name: /yes, delete it/i }).click({ timeout: STEP_MS });
    await atDoors(page, title);
    frame = await frameNamed(page, title);
    await frame.evaluate(() => location.reload());
    await atDoors(page, title);
  }
  assert.deepEqual(await page.evaluate(() => window.__doorSeen), [], "the front door showed in a frame");
  assert.deepEqual(trouble, []);
  await context.close();
});

test("a window that widens past a phone's width gets its monitor's demo, once", { timeout: 120000 }, async () => {
  const { page, context, trouble } = await open({ width: 560, height: 900 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#desk-glass iframe").count(), 0);
  for (const width of [1440, 560, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("ArrowDown");
  await atDoors(page, DESK);
  assert.equal(await page.locator("#desk-glass iframe").count(), 1);
  assert.deepEqual(trouble, []);
  await context.close();
});
