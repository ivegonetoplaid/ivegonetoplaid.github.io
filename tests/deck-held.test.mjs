// A pick inside a demo frame never moves the deck. Matinee's pick brings its card into view, and Firefox (like
// Safari) carries that out of the frame to every box around it; Chromium does not, so this runs in Firefox.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { firefox } from "playwright";

import { serve } from "./serve.mjs";

let site;
let browser;

before(async () => {
  site = await serve();
  browser = await firefox.launch();
});

after(async () => {
  await browser.close();
  await site.stop();
});

test("a walk to a pick on the desktop screen leaves the deck where it stands", { timeout: 180000 }, async () => {
  const page = await (await browser.newContext({ viewport: { width: 1873, height: 1131 } })).newPage();
  await page.goto(`${site.origin}/`);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelectorAll("iframe.demo-frame.live").length === 2, null, { timeout: 30000 });
  const desk = await page.frameLocator("iframe[title='Matinee on a desktop']");
  await desk.getByRole("button", { name: /^comedy$/i }).click();
  const title = desk.locator(".film-title");
  const answer = desk.locator(".answers:not([hidden]) .letterbox:not([disabled])").first();
  for (let k = 0; k < 4; k += 1) {
    await Promise.race([title.waitFor({ timeout: 30000 }), answer.waitFor({ timeout: 30000 })]);
    if (await title.count()) break;
    await answer.click();
  }
  await title.waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000); // the phone's card is brought into view after it holds the pick
  assert.equal(await page.evaluate(() => document.querySelector(".deck").scrollTop), 0);
});
