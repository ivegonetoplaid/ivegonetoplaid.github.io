// A phone visitor: the demo slide shows only the drawn phone and "Try the demo"; a tap opens Matinee full screen
// on the doors question, with the site's chip "Demo ✕" over it. The phone's Back closes it, and the chip closes it
// whatever history steps the demo took (Matinee's About inside it), leaving the visitor on the slide.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

import { serve } from "./serve.mjs";

const STEP_MS = 20000;
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

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const trouble = [];
  page.on("pageerror", (e) => trouble.push(`page error: ${e.message}`));
  page.on("request", (r) => {
    if (!r.url().startsWith(site.origin)) trouble.push(`left the site: ${r.url()}`);
  });
  await page.goto(`${site.origin}/`);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.body.dataset.slide === "1");
  return { page, context, trouble };
}

const fullLive = (page) =>
  page.waitForFunction(
    () => {
      const f = document.querySelector("#full-glass iframe.demo-frame.live");
      return f && f.contentDocument.querySelector(".answers.many .letterbox");
    },
    null,
    { timeout: STEP_MS },
  );

async function fullFrame(page) {
  for (const f of page.frames()) {
    const el = await f.frameElement().catch(() => null);
    if (el && (await el.getAttribute("title")) === "Matinee, full screen") return f;
  }
  throw new Error("no full-screen frame");
}

test("a phone sees only the drawn phone and Try the demo, which opens Matinee full screen; Back closes it", { timeout: 120000 }, async () => {
  const { page, context, trouble } = await open();
  assert.equal(await page.locator("#desk-glass iframe").count(), 0, "no desktop demo on a phone");
  assert.equal(await page.isVisible(".desk-set"), false);
  assert.equal(await page.isVisible("#open-demo"), true);
  await page.click("#open-demo");
  await fullLive(page);
  assert.equal(await page.isVisible("#close-demo"), true);
  assert.match(await page.textContent("#close-demo"), /Demo\s*✕/);
  await page.goBack();
  await page.waitForFunction(() => document.getElementById("demo").hidden);
  assert.equal(await page.evaluate(() => document.body.dataset.slide), "1", "back on the demo slide");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.body.dataset.slide === "2");
  assert.deepEqual(trouble, []);
  await context.close();
});

test("the chip closes the demo even after Matinee's About opened inside it, and leaves the page's history as it was", { timeout: 120000 }, async () => {
  const { page, context, trouble } = await open();
  const before = await page.evaluate(() => history.length);
  await page.locator(".handset").tap();
  await fullLive(page);
  const frame = await fullFrame(page);
  await frame.locator(".viewer-button").click();
  await frame.getByRole("menuitem", { name: /about/i }).click();
  await frame.locator(".about").waitFor();
  await page.click("#close-demo");
  await page.waitForFunction(() => document.getElementById("demo").hidden);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.getElementById("demo").hidden), true, "the demo stays closed");
  assert.equal(await page.evaluate(() => history.state?.overlay ?? null), null, "the page stands where it stood before the demo");
  assert.ok((await page.evaluate(() => history.length)) >= before);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.body.dataset.slide === "2");
  assert.deepEqual(trouble, []);
  await context.close();
});
