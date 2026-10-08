// The site's demo frames: on the second slide both screens stand on the doors question, greeting the guest, and
// the profile menu's items (Change avatar, Switch profiles, Delete profile, About Matinee) do nothing but close
// it. Each frame keeps to /demo/, nothing leaves the site, and a window that widens past a phone's width gets its
// monitor's demo.
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

// The frame titled `title` stands live on its doors question, at /demo/.
async function atDoors(page, title) {
  await page.waitForFunction(
    (t) => {
      const frame = document.querySelector(`iframe[title="${t}"]`);
      const doc = frame?.contentDocument;
      return frame?.classList.contains("live") && doc?.querySelector(".answers.many:not([hidden]) .letterbox");
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

test("both screens open on the doors question, and the profile menu's items leave them there", { timeout: 300000 }, async () => {
  const { page, context, trouble } = await open({ width: 1440, height: 900 });
  await page.keyboard.press("ArrowDown");
  await atDoors(page, DESK);
  await atDoors(page, PHONE);
  for (const title of [DESK, PHONE]) {
    const frame = await frameNamed(page, title);
    for (const item of ["Change avatar", "Switch profiles", "Delete profile", "About Matinee"]) {
      await fromMenu(frame, item);
      await atDoors(page, title);
      await frame.locator(".viewer-menu").waitFor({ state: "hidden", timeout: STEP_MS }); // the item closes the menu
    }
    assert.match(await frame.locator(".line").textContent(), /right this way, guest/i);
  }
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
