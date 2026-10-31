import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const probe = ({ env }) =>
  spawnSync(process.execPath, [resolve("scripts/probe-live.mjs")], {
    encoding: "utf8",
    env: { ...process.env, WHEEL_PROFILE_DIR: "", ...env },
  });

test("probe without WHEEL_PROFILE_DIR is a setup error naming it", () => {
  const result = probe({ env: { WHEEL_PROFILE_DIR: "" } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /set WHEEL_PROFILE_DIR/);
});

test("probe with a missing profile directory is a setup error", () => {
  const result = probe({ env: { WHEEL_PROFILE_DIR: "/no/such/wheel-dir" } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /does not exist/);
});
