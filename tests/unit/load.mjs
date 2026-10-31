// Loads extension scripts the way Chrome does: classic scripts, in order, in
// one shared global. Pre-seed `globals.__wheel` with fakes for the modules a
// test does not load; the real ones are simply left out of `files`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

export function load({ files, globals = {} }) {
  const context = vm.createContext({
    performance,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  for (const file of files) {
    const path = resolve("extension", file);
    vm.runInContext(readFileSync(path, "utf8"), context, { filename: path });
  }
  return context.__wheel;
}

// A manual clock: time moves only when a test calls `tick`.
export function fakeClock() {
  let time = 0;
  let id = 0;
  const timers = new Map();
  const flush = () => new Promise((done) => setImmediate(done));
  return {
    performance: { now: () => time },
    // Same signature as the global it replaces.
    setTimeout: (...args) => {
      const [callback, ms = 0] = args;
      timers.set(++id, { at: time + ms, callback });
      return id;
    },
    clearTimeout: (handle) => timers.delete(handle),
    now: () => time,
    async tick(ms = 0) {
      const end = time + ms;
      while (true) {
        await flush();
        let handle;
        let next;
        for (const [candidate, timer] of timers)
          if (!next || timer.at < next.at) [handle, next] = [candidate, timer];
        if (!next || next.at > end) break;
        timers.delete(handle);
        time = next.at;
        next.callback();
      }
      time = end;
      await flush();
    },
  };
}
