/**
 * Untrusted-content guard for CareerOS.
 *
 * Job descriptions, resumes, and scraped web pages are UNTRUSTED input. They may
 * carry prompt-injection payloads that attempt to override the assistant's
 * instructions ("ignore previous instructions", "you are now...", fake tool
 * calls, data-exfiltration asks, etc.).
 *
 * This module is a pure, deterministic, dependency-free string guard. It NEVER
 * executes anything and NEVER interprets the content as instructions — it only
 * inspects and rewrites strings.
 *
 * IMPORTANT FOR CALLERS: the `clean` string returned by {@link sanitizeUntrusted}
 * must be treated strictly as DATA — quoted/retrieved text to reason ABOUT — and
 * NEVER spliced into a system/instruction position or forwarded to a tool as a
 * command. The returned `flags` are advisory signals for logging, UI warnings,
 * or human review; they do not change how the text should be handled (always as
 * data), only how loudly you should warn about it.
 */

/**
 * A single detection rule: a human-readable flag paired with the pattern that
 * raises it. Patterns are case-insensitive and operate on the raw text.
 */
interface InjectionRule {
  readonly flag: string;
  readonly pattern: RegExp;
}

const INJECTION_RULES: readonly InjectionRule[] = [
  // Instruction-override phrases.
  {
    flag: "instruction-override: 'ignore/disregard ... instructions'",
    pattern:
      /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|prior|earlier|above|all|any)\b[^.\n]{0,40}\b(?:instruction|instructions|prompt|prompts|context|rule|rules|direction|directions|command|commands)\b/i,
  },
  {
    flag: "instruction-override: 'disregard/ignore the above'",
    pattern: /\b(?:disregard|ignore|forget)\b[^.\n]{0,20}\b(?:the\s+)?above\b/i,
  },
  {
    flag: "instruction-override: 'new instructions'",
    pattern: /\b(?:new|updated|revised|the\s+following)\s+(?:instruction|instructions|rules|directive|directives)\b/i,
  },
  // Role hijack.
  {
    flag: "role-hijack: 'you are now' / 'act as'",
    pattern: /\byou\s+are\s+(?:now|no\s+longer)\b|\b(?:act|behave|roleplay|pretend)\s+(?:as|like)\b|\bfrom\s+now\s+on\b/i,
  },
  {
    flag: "role-hijack: 'pretend/imagine you are'",
    pattern: /\b(?:pretend|imagine|assume)\b[^.\n]{0,20}\byou\s+(?:are|were|have)\b/i,
  },
  // System / assistant role markers (chat-template smuggling).
  {
    flag: "role-marker: system/assistant/user role token",
    pattern:
      /(?:^|[\n\r>|\-\s])\s*(?:system|assistant|user|developer)\s*[:\]]|<\/?(?:system|assistant|user|im_start|im_end|s)\b|\[\/?(?:INST|SYS)\]|<\|[^>]*\|>/i,
  },
  // Embedded tool / function-call syntax.
  {
    flag: "tool-call: embedded function/tool invocation syntax",
    pattern:
      /<(?:tool_call|function_call|tool_use|invoke|antml:invoke|antml:function_calls)\b|"(?:tool_calls?|function_call)"\s*:|\bcall\s+(?:the\s+)?(?:tool|function|api)\b/i,
  },
  // Data-exfiltration asks.
  {
    flag: "exfiltration: reveal/send system prompt or secrets",
    pattern:
      /\b(?:reveal|show|print|repeat|output|expose|leak|dump|send|forward|exfiltrate|email)\b[^.\n]{0,50}\b(?:system\s+prompt|prompt|instructions|api\s*key|api[_-]?keys|secret|secrets|password|passwords|credential|credentials|token|tokens|env|environment\s+variable)\b/i,
  },
  {
    flag: "exfiltration: 'what were your instructions / initial prompt'",
    pattern: /\b(?:your|the)\s+(?:initial|original|system|hidden)\s+(?:prompt|instructions|rules)\b/i,
  },
  // URL + credential patterns (beacon / callback with embedded secret).
  {
    flag: "url-credential: URL with embedded credentials or key param",
    pattern:
      /https?:\/\/[^\s/@]+:[^\s/@]+@|https?:\/\/[^\s]*[?&](?:api[_-]?key|token|secret|password|access[_-]?token|auth)=/i,
  },
];

/**
 * Scan untrusted text for prompt-injection and related manipulation patterns.
 *
 * Deterministic and side-effect free: it only reads `text`. Nothing is executed
 * or interpreted as an instruction.
 *
 * @param text arbitrary untrusted input (job description, resume, web page, ...)
 * @returns a list of human-readable flags for each suspicious pattern found,
 *          or an empty array when the text appears clean. Each rule contributes
 *          at most one flag, and the list is deduplicated.
 */
export function detectInjection(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) {
    return [];
  }

  // Scan BOTH the raw text and its entity-decoded form. Decoding matters
  // because "&#73;gnore all previous instructions" reads as an instruction to a
  // model but matches no literal /\bignore\b/ pattern — scanning only the raw
  // bytes missed it entirely. Scanning both means an encoded payload is caught
  // without losing any rule that depends on the original punctuation.
  const decoded = decodeEntities(text);
  const haystacks = decoded === text ? [text] : [text, decoded];

  const flags: string[] = [];
  for (const rule of INJECTION_RULES) {
    // Non-global patterns: `.test` is stateless, so this is safe to reuse.
    if (haystacks.some((h) => rule.pattern.test(h))) {
      flags.push(rule.flag);
    }
  }
  return Array.from(new Set(flags));
}

/**
 * Matches HTML/XML-ish tags so they can be stripped from untrusted text.
 * Deliberately broad: opening, closing, self-closing, and comment forms.
 */
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*?>/g;

/** Control characters (except tab, newline, carriage return) to collapse. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape the five HTML-significant characters so residual markup is inert. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** The named entities worth resolving; numeric forms are handled generically. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  tab: "\t",
  newline: "\n",
};

/** Bound the decode loop so nested encoding cannot spin forever. */
const MAX_DECODE_PASSES = 3;

/**
 * Decode HTML entities so injection detection sees what a MODEL would read,
 * not the literal bytes.
 *
 * This is a DETECTION aid, not an output transform — {@link sanitizeUntrusted}
 * still escapes on the way out, so nothing decoded here can render as markup.
 *
 * Runs up to {@link MAX_DECODE_PASSES} times because payloads are sometimes
 * double-encoded ("&amp;#73;gnore"), and stops early once a pass changes
 * nothing. The cap prevents an adversarial input from causing unbounded work.
 */
export function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    const next = out
      // Numeric: &#73; and &#x49;
      .replace(/&#x([0-9a-f]+);?/gi, (match, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      })
      .replace(/&#(\d+);?/g, (match, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      })
      // Named: &amp; &lt; &nbsp; …
      .replace(/&([a-z]+);/gi, (match, name: string) => {
        const decoded = NAMED_ENTITIES[name.toLowerCase()];
        return decoded ?? match;
      });

    if (next === out) break; // nothing left to decode
    out = next;
  }
  return out;
}

/**
 * Sanitize untrusted text into an inert, safe-to-display DATA string and report
 * any injection signals detected in the ORIGINAL input.
 *
 * Steps (pure string work, nothing is executed):
 *  1. Detect injection patterns on the raw text (before mutation) so payloads
 *     hidden inside markup are still flagged.
 *  2. Strip HTML/XML tags and comments.
 *  3. Collapse control characters to spaces.
 *  4. Escape any remaining HTML-significant characters so leftover markup can
 *     never render or be misread as structure.
 *  5. Normalize excess whitespace.
 *
 * IMPORTANT FOR CALLERS: treat the returned `clean` string as DATA only — quoted
 * content to reason about — never as instructions and never forwarded to a tool
 * as a command.
 *
 * @param text arbitrary untrusted input
 * @returns `{ clean, flags }` where `clean` is the sanitized DATA string and
 *          `flags` is the {@link detectInjection} result for the original text.
 */
export function sanitizeUntrusted(text: string): { clean: string; flags: string[] } {
  if (typeof text !== "string" || text.length === 0) {
    return { clean: "", flags: [] };
  }

  // `detectInjection` now scans the entity-decoded form as well as the raw
  // text, so an encoded payload cannot slip past unflagged.
  const flags = detectInjection(text);

  const clean = escapeHtml(
    text
      .replace(HTML_TAG, " ")
      .replace(CONTROL_CHARS, " "),
  )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { clean, flags };
}
