// The site's slides: each fits without scrolling inside itself from 1024 x 768 up and on phones 390 px wide and
// wider, the page fetches nothing from any other service, the links reach Matinee's repository, the About ends
// on the poster notice, and the public words never say "roll again".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

import { serve } from "./serve.mjs";

const REPO = "https://github.com/ivegonetoplaid/matinee";
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

const SIZES = [
  [1024, 768],
  [1280, 720],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [390, 844],
  [390, 740],
  [412, 915],
  [430, 932],
];

for (const [width, height] of SIZES) {
  test(`every slide fits without scrolling inside itself at ${width} x ${height}`, async () => {
    const phone = width <= 600;
    const context = await browser.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone });
    const page = await context.newPage();
    await page.goto(`${site.origin}/`);
    await page.waitForFunction(() => document.querySelectorAll(".mq-frame").length === 2);
    await page.evaluate(() => document.fonts.ready);
    const over = await page.evaluate(() => [...document.querySelectorAll(".slide")].map((s) => s.scrollHeight - s.clientHeight));
    assert.ok(over.every((o) => o <= 8), `overflow by slide: ${over}`);
    await context.close();
  });
}

test("the page fetches nothing from any other service, and nothing fails to load", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const away = [];
  const failed = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(site.origin)) away.push(r.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${site.origin}/`);
  for (const key of ["End", "Home"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1200);
  }
  await page.click("#open-about");
  await page.waitForTimeout(500);
  assert.deepEqual(away, []);
  assert.deepEqual(failed, []);
  await page.close();
});

test("Get started and the ticket lead to Matinee's repository", async () => {
  const page = await browser.newPage();
  await page.goto(`${site.origin}/`);
  assert.equal(await page.getAttribute(".topbar .action", "href"), REPO);
  assert.equal(await page.getAttribute(".cta", "href"), REPO);
  await page.close();
});

test("the About carries Matinee's About with the demo's poster sentence, the credits, and the poster notice last", async () => {
  const page = await browser.newPage();
  await page.goto(`${site.origin}/`);
  const about = await page.$$eval(".about-panel p", (ps) => ps.map((p) => p.textContent.trim()));
  assert.ok(about.includes("On this demo, the posters come from my own film library."));
  assert.ok(about.some((p) => p.includes("Plex and the Plex logo are trademarks of Plex and used under a license")));
  assert.ok(about.some((p) => p.includes("The Jellyfin logo is by the Jellyfin contributors, CC BY-SA 4.0")));
  assert.ok(about.some((p) => p.includes("This product uses the TMDB API but is not endorsed or certified by TMDB.")));
  assert.equal(
    about.at(-1),
    "The posters on this site belong to their studios and are shown to illustrate the software. If one is yours, open an issue on the site's repository and it comes down.",
  );
  await page.close();
});

test("the site's own words never say roll again", () => {
  const words = [readFileSync(new URL("../index.html", import.meta.url), "utf8"), readFileSync(new URL("../README.md", import.meta.url), "utf8")];
  assert.ok(words.every((w) => !/roll again/i.test(w)));
});

test("About opens over everything, takes the keys, and Back closes it", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${site.origin}/`);
  await page.click("#open-about");
  assert.equal(await page.isVisible("#about"), true);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.body.dataset.slide), "0", "the deck stays put while About is open");
  await page.goBack();
  await page.waitForTimeout(200);
  assert.equal(await page.isVisible("#about"), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "open-about");
  await page.close();
});
