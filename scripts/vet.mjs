import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  Analyzer,
  defaultConfig,
  loadConfigFile,
  analyzeWorkflowFile,
} from "@vet/typescript/dist/index.js";
import {
  sortDiagnostics,
  renderText,
  renderJSON,
} from "@vet/typescript/dist/diagnostic.js";
import { withReasons } from "@vet/typescript/dist/reason.js";

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  if (args.some((arg) => arg.startsWith("-") && arg !== "--json"))
    throw new Error("Usage: npm run vet -- [--json] [file.js ...]");
  const explicit = args.filter((arg) => arg !== "--json");
  const candidates = explicit.length
    ? explicit
    : execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { encoding: "utf8" },
      ).split("\0");
  const files = [...new Set(candidates)].filter(
    (file) =>
      /\.(?:[cm]?js)$/.test(file) ||
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file),
  );
  if (!files.some((file) => /\.(?:[cm]?js)$/.test(file)))
    throw new Error("No source files selected; refusing an empty vet check.");
  if (explicit.some((file) => !files.includes(file)))
    throw new Error(
      "Unsupported input file; select JavaScript or .github/workflows YAML files.",
    );

  const config = loadConfigFile({
    path: "vet.yaml",
    base: defaultConfig(),
    language: "typescript",
  });
  const analyzer = new Analyzer(config);
  const diagnostics = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (/\.ya?ml$/.test(file)) {
      diagnostics.push(
        ...analyzeWorkflowFile({
          path: file,
          source,
          enabled: config.githubActionsPinned.enabled,
        }),
      );
      continue;
    }
    // Upstream discovery skips JS; its analyzer accepts source text directly.
    // Check syntax separately: upstream formatting can skip unparseable input.
    if (/\.[cm]?js$/.test(file)) {
      const syntax = spawnSync(process.execPath, ["--check", file], {
        encoding: "utf8",
      });
      if (syntax.error) throw syntax.error;
      if (syntax.status !== 0)
        throw new Error(syntax.stderr || `Syntax check failed: ${file}`);
    }
    diagnostics.push(...(await analyzer.analyzeFile({ path: file, source })));
  }
  const sorted = sortDiagnostics(withReasons(config, diagnostics));
  if (json) process.stdout.write(renderJSON(sorted));
  else if (sorted.length) process.stdout.write(renderText(sorted));
  else console.log(`vet: ${files.length} files checked; no violations.`);
  process.exitCode = sorted.length ? 1 : 0;
}

main().catch((error) => {
  console.error(`vet: ${error.message}`);
  process.exitCode = 2;
});
