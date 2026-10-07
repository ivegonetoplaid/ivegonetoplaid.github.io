// The demo runs Matinee's own page: every copied page file is byte for byte as the commit in MATINEE_COMMIT has
// it, except static/js/api.js, the site's stand-in. Where a Matinee checkout is at hand (MATINEE_CHECKOUT, or a
// sibling `matinee` folder), the checksums themselves are checked against that commit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const listed = new Map(
  readFileSync(join(ROOT, "PAGE_FILES"), "utf8")
    .trim()
    .split("\n")
    .map((line) => [line.slice(66), line.slice(0, 64)]),
);
const commit = readFileSync(join(ROOT, "MATINEE_COMMIT"), "utf8").trim();

function filesUnder(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
}

test("every copied page file is as Matinee's commit has it, except the stand-in api.js", () => {
  const present = [...filesUnder("static"), "demo/index.html"];
  assert.deepEqual(present.sort(), [...listed.keys()].sort(), "the copy holds exactly the page's files");
  const changed = present.filter((f) => sha(readFileSync(join(ROOT, f))) !== listed.get(f));
  assert.deepEqual(changed, ["static/js/api.js"]);
  assert.equal(readFileSync(join(ROOT, "static/js/api.js"), "utf8"), readFileSync(join(ROOT, "tools/api.js"), "utf8"));
});

const checkout = process.env.MATINEE_CHECKOUT || join(ROOT, "../matinee");
test("the checksums are those of the recorded Matinee commit", { skip: !existsSync(join(checkout, ".git")) && "no Matinee checkout" }, () => {
  for (const [file, hash] of listed) {
    const inRepo = file === "demo/index.html" ? "index.html" : file.slice("static/".length);
    const bytes = execFileSync("git", ["-C", checkout, "show", `${commit}:src/matinee/web/static/${inRepo}`], { maxBuffer: 1 << 26 });
    assert.equal(sha(bytes), hash, file);
  }
});
