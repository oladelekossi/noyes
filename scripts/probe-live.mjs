// Live contract probe: checks wheel's X adapter (extension/x.js) against the
// real For You feed, so drift is found before a user finds it.
//
//   WHEEL_PROFILE_DIR=~/wheel-probe-profile node scripts/probe-live.mjs
//
// Read-only and manual; never run in CI. It never clicks, likes, dismisses,
// or opens a menu, and prints counts and booleans only: no post text,
// handles, or IDs. `--fixture` runs the same checks on the synthetic test
// feed, to check the probe itself without an account.
//
// Exit 0: every probed row passes. Exit 1: failing rows listed by number.
// Exit 2: setup error.
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { fixture } from "../tests/fixture.mjs";

const FOR_YOU_WAIT = 20000;
const MAX_VIEWPORTS = 3;
const adapter = readFileSync(resolve("extension/x.js"), "utf8");
const selfTest = process.argv.includes("--fixture");

function profile() {
  if (selfTest) return "";
  const directory = process.env.WHEEL_PROFILE_DIR;
  if (!directory)
    throw new Error(
      "set WHEEL_PROFILE_DIR to a Chrome profile directory for the probe (create it first, e.g. mkdir ~/wheel-probe-profile)",
    );
  if (!existsSync(directory))
    throw new Error(`WHEEL_PROFILE_DIR does not exist: ${directory}`);
  return directory;
}

async function waitForYou({ page }) {
  try {
    await page.waitForFunction(() => globalThis.__wheel.x.onForYou(), null, {
      timeout: FOR_YOU_WAIT,
    });
    return true;
  } catch {
    return false;
  }
}

async function loginOnce({ page }) {
  if (selfTest || !process.stdin.isTTY) return false;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await prompt.question(
    "For You not detected. Log in to X in the opened window, then press Enter. ",
  );
  prompt.close();
  await page.goto("https://x.com/home");
  await page.evaluate(adapter);
  return waitForYou({ page });
}

// Runs in the page. Returns counts and booleans only.
function measure() {
  const x = globalThis.__wheel.x;
  const root = x.column();
  const health = root ? x.health({ root }) : null;
  const posts = root ? x.posts({ root }) : [];
  const onScreen = posts.filter(
    (post) =>
      x.visible(post) &&
      post.getBoundingClientRect().bottom > x.layout.headerHeight &&
      post.getBoundingClientRect().top < innerHeight,
  );
  // Adjacent posts in neighboring cells whose edges touch: where X draws a
  // conversation rail, if it is one. Report which rail limit rejected the
  // nearest thin line, so a threshold change in X is visible.
  const limits = x.contract.rail;
  const failures = {};
  let pairs = 0;
  let joined = 0;
  for (const [index, post] of posts.entries()) {
    const next = posts[index + 1];
    if (!next) break;
    const cell = x.cell({ post });
    if (!cell || cell.nextElementSibling !== x.cell({ post: next })) continue;
    pairs += 1;
    if (x.isConversationRail({ post, next })) {
      joined += 1;
      continue;
    }
    const avatar = x.avatar({ post });
    if (!avatar) continue;
    const avatarRect = avatar.getBoundingClientRect();
    const postRect = post.getBoundingClientRect();
    const center = avatarRect.left + avatarRect.width / 2;
    const line = [...post.querySelectorAll("div")].find((div) => {
      const rect = div.getBoundingClientRect();
      return (
        !div.childElementCount &&
        rect.width > 0 &&
        rect.width <= limits.maxWidth * 2 &&
        Math.abs(rect.left + rect.width / 2 - center) <
          limits.centerTolerance * 2
      );
    });
    if (!line) continue;
    const rect = line.getBoundingClientRect();
    const failed = [
      ["width", rect.width < limits.minWidth || rect.width > limits.maxWidth],
      ["height", rect.height <= limits.minHeight],
      [
        "center",
        Math.abs(rect.left + rect.width / 2 - center) >= limits.centerTolerance,
      ],
      ["top", rect.top < avatarRect.bottom - limits.edgeTolerance],
      [
        "bottom",
        Math.abs(rect.bottom - postRect.bottom) > limits.edgeTolerance,
      ],
    ];
    for (const [name, failedHere] of failed)
      if (failedHere) failures[name] = (failures[name] || 0) + 1;
  }
  // X's sticky header: the nearest sticky or fixed ancestor of the For You
  // tab. Its bottom edge is what x.layout.headerHeight stands in for.
  const selectedTab = root?.querySelector(x.contract.tab);
  let header = selectedTab;
  for (let node = selectedTab; node && node !== root; node = node.parentElement)
    if (/sticky|fixed/.test(getComputedStyle(node).position)) {
      header = node;
      break;
    }
  const first = onScreen[0];
  return {
    health,
    cells: posts.filter((post) => x.cell({ post })).length,
    firstHasCaret: first ? !!x.caret({ post: first }) : null,
    overlayAtRest: x.overlayOpen(),
    tabBottom: header
      ? Math.round(header.getBoundingClientRect().bottom)
      : null,
    rail: { pairs, joined, failures },
  };
}

async function scan({ page }) {
  let best = await page.evaluate(measure);
  for (let viewport = 1; viewport < MAX_VIEWPORTS; viewport += 1) {
    if (best.rail.joined > 0) break;
    await page.evaluate(() => window.scrollBy(0, innerHeight));
    await page.waitForTimeout(800);
    const now = await page.evaluate(measure);
    best = {
      ...now,
      firstHasCaret: best.firstHasCaret,
      tabBottom: best.tabBottom,
      rail: {
        pairs: best.rail.pairs + now.rail.pairs,
        joined: best.rail.joined + now.rail.joined,
        failures: { ...best.rail.failures, ...now.rail.failures },
      },
    };
  }
  return best;
}

// One verdict per inventory row in docs/resilience-plan.md §2.1.
function rows({ found, headerHeight }) {
  const h = found.health;
  const unseen = "not observed";
  const unprobed = "not probed";
  return {
    1: !!h && h.post > 0,
    2: found.cells > 0,
    3: !!h?.column,
    4: !!h?.forYou,
    5: !!h && h.withId > 0 && h.withId >= h.post - h.ads,
    6: h?.ads > 0 ? true : unseen,
    7: !!h && h.avatar > 0,
    8: found.rail.joined > 0 ? true : found.rail.pairs ? false : unseen,
    9: !!h && h.like + h.liked > 0,
    10: found.firstHasCaret,
    11: unprobed,
    12: unprobed,
    13: unprobed,
    14: unprobed,
    15: found.overlayAtRest === false,
    16:
      found.tabBottom === null
        ? false
        : Math.abs(found.tabBottom - headerHeight) <= 8,
  };
}

async function main() {
  const directory = profile();
  const context = await chromium.launchPersistentContext(directory, {
    headless: selfTest,
    bypassCSP: true,
    viewport: { width: 1080, height: 820 },
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    if (selfTest)
      await page.route("https://x.com/**", (route) =>
        route.fulfill({ contentType: "text/html", body: fixture }),
      );
    await page.goto("https://x.com/home");
    await page.evaluate(adapter);
    if (!(await waitForYou({ page })) && !(await loginOnce({ page }))) {
      console.log(JSON.stringify({ failing: [3, 4] }, null, 2));
      console.error("probe: For You not detected (rows 3–4).");
      process.exitCode = 1;
      return;
    }
    await page.waitForTimeout(1500);
    const found = await scan({ page });
    const { headerHeight } = await page.evaluate(
      () => globalThis.__wheel.x.layout,
    );
    const verdicts = rows({ found, headerHeight });
    const failing = Object.entries(verdicts)
      .filter(([, verdict]) => verdict === false)
      .map(([row]) => Number(row));
    console.log(
      JSON.stringify(
        {
          rows: verdicts,
          counts: found.health,
          rail: found.rail,
          headerBottom: found.tabBottom,
          failing,
        },
        null,
        2,
      ),
    );
    if (failing.length) {
      console.error(`probe: failing rows ${failing.join(", ")}`);
      process.exitCode = 1;
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(`probe: ${error.message}`);
  process.exitCode = 2;
});
