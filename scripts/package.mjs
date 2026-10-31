import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const directory = resolve("extension");
const { version } = JSON.parse(
  readFileSync(resolve(directory, "manifest.json"), "utf8"),
);
const output = resolve(`dist/noyes-${version}.zip`);
mkdirSync(resolve("dist"), { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-q", output, ...readdirSync(directory)], {
  cwd: directory,
});
console.log(output);
