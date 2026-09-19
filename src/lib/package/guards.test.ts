import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * STATIC MODULE GUARDS, in the style of `harvest/client.test.ts`.
 *
 * Two properties this package depends on are invisible to a type checker and
 * to every behavioural test:
 *
 *  1. Exactly one module here reaches the network, and it opens with the
 *     `server-only` guard on line 1. If that guard is ever dropped, the
 *     Anthropic key becomes reachable from a client bundle and nothing else
 *     in the suite notices.
 *  2. Everything else is PURE. A `new Date()` or a `Math.random()` slipped
 *     into the builder would not fail a test — it would just make packages
 *     stop being reproducible, quietly.
 */

const DIR = path.join(process.cwd(), "src", "lib", "package");
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");

const SOURCES = readdirSync(DIR).filter(
  (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
);

/** The one module allowed to reach the model. */
const NETWORK_MODULE = "live.ts";

describe("server-only guard", () => {
  it("the module that reaches the model opens with the guard", () => {
    expect(read(NETWORK_MODULE).split("\n")[0].trim()).toBe('import "server-only";');
  });

  it("no other module carries it, so the engine stays testable and client-safe", () => {
    for (const file of SOURCES.filter((f) => f !== NETWORK_MODULE)) {
      expect(read(file), file).not.toContain('import "server-only"');
    }
  });

  it("never logs, so a key or a candidate's data cannot leak into a console", () => {
    expect(read(NETWORK_MODULE)).not.toMatch(/console\.(log|warn|error|info)/);
  });
});

describe("purity", () => {
  it("no module in the package engine reads a clock or a random source", () => {
    for (const file of SOURCES) {
      expect(read(file), file).not.toMatch(/new Date\(|Date\.now\(|Math\.random\(/);
    }
  });

  it("covers every source file in the directory, including ones added later", () => {
    expect(SOURCES).toContain(NETWORK_MODULE);
    expect(SOURCES.length).toBeGreaterThanOrEqual(9);
  });
});
