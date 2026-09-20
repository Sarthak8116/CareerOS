import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Key-handling guards for the Nemotron provider swap (P2.5).
 *
 * FROZEN CONTRACT (careeros/contract/p2.5-nemotron-provider): four distinct
 * keys, NVIDIA_API_KEY_PARSE / _NANO / _SUPER / _LIGHTNING, read from
 * process.env, server-only, never logged, never returned to the client.
 * Anthropic's ANTHROPIC_API_KEY is being removed entirely.
 *
 * This suite does NOT hardcode which file ends up reading the keys. It scans
 * every non-test .ts/.tsx file under src/ for a file that READS an
 * NVIDIA_API_KEY* var (a literal `process.env.NVIDIA_API_KEY_X` expression,
 * the form nemotron.ts actually uses, see its `ownKey`/`configuredKeys`) and
 * asserts, for every file it finds:
 *
 * Deliberately NOT selected on merely naming a var: jobs/live/page.tsx is a
 * `"use client"` page that (at one point) printed a variable NAME in its
 * "live mode is off" copy so a user could set it, it cannot import
 * server-only (that throws in a client bundle) and doing so on a bare mention
 * would be a false positive, not a real guard. Reading is the property that
 * matters; naming a var in UI copy is not a leak.
 *
 *   1. `import "server-only";` is the literal first line (excluding Next.js
 *      `app/api/**\/route.ts` handlers, which are inherently server-only and
 *      by this codebase's own convention, see the harvest routes, don't
 *      carry the guard themselves; they call into a guarded lib module).
 *   2. No console.log/warn/error/info/debug call anywhere in the file.
 *   3. No line naming an NVIDIA_API_KEY* env var also appears on the same
 *      line as a console.* call or a NextResponse.json(...) call, the
 *      cheap, reliable half of "never logged / never client-visible" that a
 *      static scan can actually prove without guessing at a specific
 *      env-lookup style (dynamic `process.env[name]` via a name table is a
 *      legitimate pattern here and must not be flagged as if it were a leak).
 *
 * The much stronger property, that the key VALUE itself, not just its env
 * var name, never survives an error round-trip (e.g. an API echoing back an
 * Authorization header, or a network exception message), can't be proven
 * by reading source; it's asserted behaviorally with a canary value in
 * nemotron.test.ts's "key material never survives an error round-trip"
 * suite. Treat the two as complementary, not redundant.
 *
 * Mirrors src/lib/harvest/client.test.ts's "server-only guard" tests for the
 * Harvest client, extended because the Nemotron swap touches FOUR keys
 * across (at least) a provider module, a campaign builder, and a
 * cover-letter generator, more surface than one client file.
 *
 * If this file finds zero matching source files, the swap hasn't landed yet:
 * we emit a single it.todo rather than a vacuous pass, so the gap is visible
 * instead of silently green.
 */

const SRC_DIR = path.join(process.cwd(), "src");
const KEY_PATTERN = /NVIDIA_API_KEY/;
/** Selects files on READING a key, not just naming one (see header comment). */
const KEY_READ = /process\.env\.NVIDIA_API_KEY\w*/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "__fixtures__" ||
      entry.startsWith(".")
    )
      continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry))
      out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR).filter((f) =>
  KEY_READ.test(readFileSync(f, "utf8")),
);

const isNextApiRoute = (rel: string) =>
  /^app[\\/]api[\\/].*route\.tsx?$/.test(rel);

describe("Nemotron key-handling guards", () => {
  if (files.length === 0) {
    it.todo(
      "no module under src/ reads (process.env.NVIDIA_API_KEY*) an NVIDIA key " +
        "yet, the Nemotron provider swap (contract: " +
        "careeros/contract/p2.5-nemotron-provider) hasn't landed. Re-run once " +
        "coder-nemotron reports; this suite auto-discovers whichever file(s) " +
        "they created.",
    );
    return;
  }

  for (const file of files) {
    const rel = path.relative(SRC_DIR, file);
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");

    describe(rel, () => {
      if (!isNextApiRoute(rel)) {
        it("imports server-only as the first line", () => {
          const firstLine = lines[0].trim();
          expect(
            firstLine,
            `${rel} can read an NVIDIA key and must open with the server-only guard`,
          ).toBe('import "server-only";');
        });
      }

      it("never logs", () => {
        expect(source).not.toMatch(/console\.(log|warn|error|info|debug)/);
      });

      it("never names an NVIDIA_API_KEY var on the same line as a log or client response call", () => {
        lines.forEach((line, i) => {
          if (!KEY_PATTERN.test(line)) return;
          const onSameLineAsSink = /console\.|NextResponse\.json\(/.test(line);
          expect(
            onSameLineAsSink,
            `${rel}:${i + 1} names an NVIDIA_API_KEY var on the same line as ` +
              `a console.*/NextResponse.json call:\n  ${line.trim()}`,
          ).toBe(false);
        });
      });
    });
  }
});
