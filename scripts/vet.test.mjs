import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const temp = mkdtempSync(join(tmpdir(), "wheel-vet-test-"));
const script = resolve("scripts/vet.mjs");
writeFileSync(join(temp, "vet.yaml"), readFileSync("vet.yaml"));
after(() => rmSync(temp, { recursive: true, force: true }));

function check({ source, name = "fixture.js", extra = [] }) {
  writeFileSync(join(temp, name), source);
  return spawnSync(process.execPath, [script, "--json", name, ...extra], {
    cwd: temp,
    encoding: "utf8",
  });
}

test("JavaScript receives the real upstream parameter diagnostic", () => {
  const result = check({
    source: "function example(a, b) {\n  return a + b;\n}\n",
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].rule_id, "VET001");
});

test("JavaScript formatting violations fail", () => {
  const result = check({ source: "const value=1;\n" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].rule_id, "VET008");
});

test("invalid JavaScript cannot silently pass the formatter", () => {
  const result = check({ source: "function {" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /SyntaxError/);
});

test("formatted options-object functions pass", () => {
  const result = check({
    source: "function example({ a, b }) {\n  return a + b;\n}\n",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).diagnostics, []);
});

test("an empty source selection fails instead of giving false confidence", () => {
  const result = check({ name: "empty.txt", source: "" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No source files selected/);
});

test("workflow actions must be pinned", () => {
  mkdirSync(join(temp, ".github/workflows"), { recursive: true });
  writeFileSync(
    join(temp, ".github/workflows/test.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );
  const result = check({
    source: "const value = 1;\n",
    extra: [".github/workflows/test.yml"],
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].rule_id, "VET014");
});
