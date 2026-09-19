import type { PackageDocumentKind } from "@/lib/types";

/**
 * Filename safety for the application package.
 *
 * WHY THIS MODULE EXISTS: `folderName` and every `fileName` derive from the job
 * title and company, which came off a SCRAPED POSTING and are untrusted. JSZip
 * does not sanitize entry names — handed "../../etc/evil" it writes exactly
 * that, producing a Zip Slip archive. Modern extractors refuse traversal, but
 * that is THEIR defence, not ours: we must not generate the malicious archive
 * in the first place.
 *
 * The rule is a whitelist, not a blacklist. Only `[A-Za-z0-9]` survives from
 * untrusted input; everything else (path separators, dots, colons, drive
 * letters, NUL, RTL overrides, whitespace) collapses to a single "-". Dots are
 * dropped entirely rather than "carefully handled", which is what makes ".."
 * impossible to express — extensions are appended by US, from a literal, after
 * sanitization.
 *
 * Non-ASCII letters do not survive ("Renée" → "Ren-e"). That is a deliberate
 * trade: a mangled but safe folder name costs the user nothing, and widening
 * the charset to Unicode reopens homoglyph and normalization questions this
 * module has no business answering.
 *
 * Pure: no I/O, no Date, no randomness. Same input, same name, every time.
 */

/** Everything outside this whitelist collapses to a separator. */
const UNSAFE = /[^A-Za-z0-9]+/g;

/** Per-segment cap. Long enough to stay readable, short enough to stay safe. */
export const SEGMENT_MAX = 60;

/** Folder names carry company + title, so they get a little more room. */
export const FOLDER_MAX = 80;

/** Used whenever sanitization leaves nothing at all. */
export const FOLDER_FALLBACK = "application-package";
export const SLUG_FALLBACK = "application";

/**
 * Windows reserved device names. A file called "CON" or "NUL" is not a
 * traversal risk but is unopenable on Windows, and a package the user cannot
 * extract is as broken as one that is unsafe.
 */
const RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/**
 * Reduce one untrusted string to a safe path segment.
 *
 * Never returns "", "." or "..", never contains "/", "\" or any dot, and is
 * never longer than `max`. Returns `fallback` when nothing survives.
 */
export function sanitizeSegment(
  raw: string | null | undefined,
  fallback: string,
  max: number = SEGMENT_MAX,
): string {
  const collapsed = String(raw ?? "")
    .replace(UNSAFE, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  const capped = collapsed.slice(0, max).replace(/-+$/g, "");
  if (!capped) return fallback;
  if (RESERVED.has(capped.toUpperCase())) return `${capped}-file`;
  return capped;
}

/** Job fields the naming helpers read. Kept structural so tests need no full Job. */
export interface NamedJob {
  title: string;
  company: string;
}

/** "NVIDIA-Systems-Software-Intern-Summer-2026" — one folder, no separators. */
export function packageFolderName(job: NamedJob): string {
  return sanitizeSegment(
    `${job.company} ${job.title}`,
    FOLDER_FALLBACK,
    FOLDER_MAX,
  );
}

/**
 * "cover-letter-NVIDIA-Systems-Software-Intern.md".
 *
 * The `kind` half is one of our own literals and needs no sanitizing; the
 * slug half is untrusted and always does. The extension is appended here,
 * after sanitization, so it cannot be spoofed by the posting.
 */
export function documentFileName(kind: PackageDocumentKind, job: NamedJob): string {
  const slug = sanitizeSegment(`${job.company} ${job.title}`, SLUG_FALLBACK);
  return `${kind}-${slug}.md`;
}

/**
 * Last line of defence before anything is written into an archive.
 *
 * Every entry path is built from the helpers above, so this should never
 * throw — which is exactly why it is worth asserting. A future edit that
 * interpolates a raw title into a path fails here rather than shipping a
 * traversal archive to a user.
 */
export function assertSafeEntryPath(path: string): string {
  const parts = path.split("/");
  if (parts.length !== 2) {
    throw new Error(`Unsafe package entry (expected "folder/file"): ${path}`);
  }
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error(`Unsafe package entry segment: ${path}`);
    }
    if (/[\\/]/.test(part) || part.includes("..")) {
      throw new Error(`Unsafe package entry segment: ${path}`);
    }
  }
  return path;
}
