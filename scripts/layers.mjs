// Enforces the module layering in docs/architecture.md:
//   Rule A: only extension/x.js may name X's selectors, labels, or URL shapes.
//   Rule B: each file may reference only the noyes.* modules listed below.
// Exit 0: clean. Exit 1: violations. Exit 2: setup or input error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors the dependency rule: a file may use only files above it.
const ALLOWED = {
  "x.js": [],
  "ui.js": [],
  "feed.js": ["x"],
  "selection.js": ["x", "feed"],
  "feedback.js": ["x", "ui", "feed", "selection"],
  "input.js": ["x", "feed", "selection", "feedback"],
  "main.js": ["x", "ui", "feed", "selection", "feedback", "input"],
};
const X_KNOWLEDGE =
  /data-testid|\[role=|\/status\/|not interested|placementTracking|promotedIndicator/i;
const REFERENCE = /(?<![\w$])(?:__)?noyes\.([A-Za-z_$][\w$]*)/g;
// `const { feed, x } = noyes;` references feed and x.
const DESTRUCTURE =
  /\{([^{}]*)\}\s*=\s*(?:globalThis\.)?(?:__)?noyes(?![\w$.])/g;

const moduleName = (file) => file.replace(/\.js$/, "");
const lines = (source) => source.split("\n");

function setup({ root }) {
  const directory = join(root, "extension");
  const manifestPath = join(directory, "manifest.json");
  if (!existsSync(manifestPath))
    throw new Error(`missing ${join("extension", "manifest.json")}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const listed = manifest.content_scripts.flatMap((entry) => entry.js || []);
  const onDisk = readdirSync(directory).filter((file) => file.endsWith(".js"));
  const absent = listed.filter((file) => !onDisk.includes(file));
  const unlisted = onDisk.filter((file) => !listed.includes(file));
  const unknown = listed.filter((file) => !(file in ALLOWED));
  if (absent.length)
    throw new Error(`listed in manifest but missing: ${absent.join(", ")}`);
  if (unlisted.length)
    throw new Error(`present but not in manifest: ${unlisted.join(", ")}`);
  if (unknown.length)
    throw new Error(
      `no layer entry in scripts/layers.mjs: ${unknown.join(", ")}`,
    );
  return { directory, files: listed };
}

function violations({ directory, file }) {
  const found = [];
  const allowed = new Set([moduleName(file), ...ALLOWED[file]]);
  const source = lines(readFileSync(join(directory, file), "utf8"));
  for (const [index, text] of source.entries()) {
    const at = `extension/${file}:${index + 1}`;
    const knowledge = file !== "x.js" && text.match(X_KNOWLEDGE);
    if (knowledge)
      found.push(`${at}: X knowledge outside x.js: "${knowledge[0]}"`);
    const destructured = [...text.matchAll(DESTRUCTURE)].flatMap(([, names]) =>
      names.split(",").map((name) => name.split(":")[0].trim()),
    );
    const names = [
      ...[...text.matchAll(REFERENCE)].map(([, name]) => name),
      ...destructured.filter(Boolean),
    ];
    for (const name of names)
      if (!allowed.has(name))
        found.push(`${at}: ${file} may not use noyes.${name}`);
  }
  return found;
}

function main() {
  const { directory, files } = setup({ root: process.cwd() });
  const found = files.flatMap((file) => violations({ directory, file }));
  if (found.length) {
    for (const line of found) console.log(line);
    process.exitCode = 1;
    return;
  }
  console.log(`layers: ${files.length} files checked; no violations.`);
}

try {
  main();
} catch (error) {
  console.error(`layers: ${error.message}`);
  process.exitCode = 2;
}
