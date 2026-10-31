// A development-only extension. The production folder and package stay unchanged.
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const output = resolve("dist/noyes-debug");
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync("extension", output, { recursive: true });
manifest.name += " — debug recorder";
const scripts = manifest.content_scripts[0].js;
// Before main installs window-capture listeners that consume shortcuts.
scripts.splice(scripts.indexOf("main.js"), 0, "recorder.js");
const template = readFileSync("debug/report.html", "utf8");
const build = Object.fromEntries(
  [
    ...scripts.filter((file) => file !== "recorder.js"),
    ...manifest.content_scripts[0].css,
  ].map((file) => [
    file,
    createHash("sha256")
      .update(readFileSync(resolve("extension", file)))
      .digest("hex"),
  ]),
);
const source = readFileSync("debug/recorder.js", "utf8")
  .replace('"__WHEEL_REPORT_TEMPLATE__"', () => JSON.stringify(template))
  .replace('"__WHEEL_BUILD__"', () => JSON.stringify(build));
writeFileSync(resolve(output, "recorder.js"), source);
writeFileSync(
  resolve(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(output);
