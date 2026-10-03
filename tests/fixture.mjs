import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./feed.html", import.meta.url), "utf8");
const script = readFileSync(new URL("./feed.js", import.meta.url), "utf8");
export const fixture = html.replace(
  '<script src="./feed.js"></script>',
  () => `<script>${script}</script>`,
);
