/**
 * HTML / JSON-LD extraction helpers for job postings.
 *
 * PURE string work — no DOM, no network, no clock. Job descriptions arrive as
 * HTML from every ATS, and this module turns that into plain text WITHOUT
 * interpreting any of it.
 *
 * ORDERING IS LOAD-BEARING. Greenhouse double-encodes its description: the
 * JSON string literally contains "&lt;div&gt;", so it must be entity-decoded
 * ONCE before any tag handling. Lever, Ashby and Workday send raw HTML and must
 * NOT be decoded — decoding those would corrupt legitimate text like "A&B" and,
 * worse, could manufacture markup out of escaped content the employer typed.
 *
 * Nothing here sanitizes. Callers pass the output of `htmlToText` through
 * `sanitizeUntrusted` (see `map.ts`), and the decode MUST happen first so the
 * injection scanner sees the real payload rather than its escaped form.
 */

/** Named entities worth handling; everything else falls to numeric decoding. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  eacute: "é",
  uuml: "ü",
};

/**
 * Decode HTML entities exactly ONCE.
 *
 * Deliberately not applied repeatedly: decoding until stable would turn
 * "&amp;lt;script&gt;" — text an employer legitimately typed to SHOW markup —
 * into live-looking markup. One pass reverses one layer of encoding, which is
 * precisely what Greenhouse applies.
 */
export function decodeEntities(html: string): string {
  if (!html) return "";
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});/gi, (match, body: string) => {
    const token = body.toLowerCase();
    if (token.startsWith("#x")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code, match) : match;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? safeFromCodePoint(code, match) : match;
    }
    return NAMED_ENTITIES[token] ?? match;
  });
}

/** Guard against out-of-range code points, which would throw. */
function safeFromCodePoint(code: number, fallback: string): string {
  if (code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Block-level boundaries that should become line breaks in plain text. */
const BLOCK_BOUNDARY =
  /<\/(?:p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote)\s*>|<br\s*\/?>/gi;

/**
 * Convert HTML to readable plain text.
 *
 * Structure is preserved as line breaks and "- " bullets so the description
 * stays legible; everything else is dropped. Tags are removed here, and the
 * caller's `sanitizeUntrusted` pass escapes anything that survives.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return (
    html
      // Drop non-content elements wholesale, including their contents.
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // List items become bullets before the generic tag strip loses them.
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(BLOCK_BOUNDARY, "\n")
      .replace(/<[^>]+>/g, "")
      // Tidy the whitespace the tag strip leaves behind.
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

const LD_JSON_BLOCK =
  /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Is this node a schema.org JobPosting? `@type` may be a string or an array. */
function isJobPosting(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  if (typeof type === "string") return type === "JobPosting";
  if (Array.isArray(type)) return type.includes("JobPosting");
  return false;
}

/**
 * Walk a parsed JSON-LD value for the first JobPosting node.
 *
 * Handles the three real-world arrangements: a bare object, a top-level array,
 * and an `@graph` wrapper. Depth is capped so a hostile document cannot make
 * this recurse without bound.
 */
function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6 || !node || typeof node !== "object") return undefined;
  if (isJobPosting(node)) return node;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findJobPosting(child, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  const graph = (node as Record<string, unknown>)["@graph"];
  return graph ? findJobPosting(graph, depth + 1) : undefined;
}

/**
 * Extract the first schema.org JobPosting from a page's JSON-LD.
 *
 * Returns `undefined` when the page has no JSON-LD or none of it is a
 * JobPosting. That is a normal outcome, not an error: most ATS career pages are
 * client-rendered SPAs with no server-rendered structured data at all, and the
 * generic adapter is expected to fail honestly rather than fall back to
 * scraping headings out of the visible markup.
 */
export function extractJsonLdJobPosting(
  html: string,
): Record<string, unknown> | undefined {
  if (!html) return undefined;
  LD_JSON_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LD_JSON_BLOCK.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A malformed block is skipped, not fatal — pages often carry several.
      continue;
    }
    const posting = findJobPosting(parsed);
    if (posting) return posting;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Heading-anchored lists (the requirements source)                    */
/* ------------------------------------------------------------------ */

export interface HeadingList {
  heading: string;
  items: string[];
}

/** Pull the text of each `<li>` out of a list fragment. */
export function listItems(html: string): string[] {
  if (!html) return [];
  const items: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = htmlToText(match[1] ?? "")
      .replace(/^-\s*/, "")
      .trim();
    if (text) items.push(text);
  }
  return items;
}

/**
 * A heading immediately followed by a list. Matches `<h1>`–`<h6>` and the
 * bolded-paragraph form (`<p><strong>…</strong></p>`) that several ATS
 * WYSIWYG editors emit instead of a real heading.
 */
const HEADING_THEN_LIST =
  /(?:<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<p\b[^>]*>\s*<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*<\/p>|<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>)\s*(?:<p\b[^>]*>\s*<\/p>\s*)*(<(?:ul|ol)\b[^>]*>[\s\S]*?<\/(?:ul|ol)>)/gi;

/**
 * Find every `<ul>`/`<ol>` that sits directly under a heading, paired with that
 * heading's text.
 *
 * Requirements are only ever emitted from a list whose HEADING we recognise —
 * we never judge a sentence to decide whether it is a requirement. A list under
 * an unrecognised heading yields nothing, which is the honest result.
 */
export function extractHeadingAnchoredLists(html: string): HeadingList[] {
  if (!html) return [];
  const out: HeadingList[] = [];
  HEADING_THEN_LIST.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING_THEN_LIST.exec(html)) !== null) {
    const rawHeading = match[1] ?? match[2] ?? match[3] ?? "";
    const heading = htmlToText(rawHeading).trim();
    const items = listItems(match[4] ?? "");
    if (heading && items.length > 0) out.push({ heading, items });
  }
  return out;
}
