import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/layers.mjs");
const temps = [];
after(() => {
  for (const temp of temps) rmSync(temp, { recursive: true, force: true });
});

// A copy of the real extension directory, optionally edited.
function tree({ edit = () => {} } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "noyes-layers-test-"));
  temps.push(temp);
  cpSync(resolve("extension"), join(temp, "extension"), { recursive: true });
  edit({ directory: join(temp, "extension") });
  return spawnSync(process.execPath, [script], { cwd: temp, encoding: "utf8" });
}

const manifest = ({ directory }) => join(directory, "manifest.json");
const listed = ({ directory }) =>
  JSON.parse(readFileSync(manifest({ directory }), "utf8")).content_scripts[0]
    .js;
const nonAdapter = ({ directory }) =>
  listed({ directory }).find((file) => file !== "x.js");

test("the real tree passes", () => {
  const result = tree();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^layers: \d+ files checked; no violations\.$/m);
});

test("an X selector outside x.js fails with its file and line", () => {
  let file;
  const result = tree({
    edit: ({ directory }) => {
      file = nonAdapter({ directory });
      const path = join(directory, file);
      writeFileSync(
        path,
        `${readFileSync(path, "utf8")}document.querySelector('[data-testid="like"]');\n`,
      );
    },
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    new RegExp(`extension/${file.replace(".", "\\.")}:\\d+: X knowledge`),
  );
});

test("a reference up the layer order fails", () => {
  const result = tree({
    edit: ({ directory }) => {
      const path = join(directory, "feed.js");
      writeFileSync(
        path,
        `globalThis.__noyes.feed = { read: () => noyes.feedback };\n${readFileSync(path, "utf8")}`,
      );
    },
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /extension\/feed\.js:1: feed\.js may not use noyes\.feedback/,
  );
});

test("a destructured reference up the layer order fails", () => {
  const result = tree({
    edit: ({ directory }) => {
      const path = join(directory, "feed.js");
      writeFileSync(
        path,
        `${readFileSync(path, "utf8")}const { selection, x } = globalThis.__noyes;\n`,
      );
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /feed\.js may not use noyes\.selection/);
  assert.doesNotMatch(result.stdout, /noyes\.x\b/);
});

test("a script on disk but missing from the manifest is a setup error", () => {
  const result = tree({
    edit: ({ directory }) =>
      writeFileSync(join(directory, "stray.js"), "void 0;\n"),
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not in manifest: stray\.js/);
});

test("a script in the manifest but missing on disk is a setup error", () => {
  const result = tree({
    edit: ({ directory }) => {
      const path = manifest({ directory });
      const data = JSON.parse(readFileSync(path, "utf8"));
      data.content_scripts[0].js.push("ghost.js");
      writeFileSync(path, JSON.stringify(data));
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing: ghost\.js/);
});
