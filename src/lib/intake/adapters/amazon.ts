import type { AdapterOutput, IntakeAdapter } from "@/lib/intake/types";
import { decodeEntities, htmlToText, type HeadingList } from "@/lib/intake/html";
import {
  DESCRIPTION_FULL_MAX,
  buildJob,
  createCleaner,
  extractRequirements,
  seniorityFromTitle,
  sponsorshipFromText,
  unreadableForm,
} from "@/lib/intake/map";

/**
 * amazon.jobs, Amazon's own careers site.
 *
 * The posting is server-rendered but carries no JSON-LD, so the generic
 * adapter (which refuses to guess at markup) cannot read it. The markup is
 * stable and specific, which is what makes reading it here a parse rather than
 * a guess:
 *
 *   <h1 class="title">…</h1>
 *   <p class="meta">Job ID: 123 | Amazon.com Services LLC</p>
 *   <div class="section"><h2>Basic Qualifications</h2><p>- a<br/>- b</p></div>
 *
 * Qualifications are dash-prefixed LINES inside one <p>, not list items. Only
 * the leading run of bullet lines under a heading is taken: Amazon appends its
 * EEO statement and pay ranges to the last section as plain paragraphs, and a
 * legal notice is not a job requirement.
 */

const HOSTS = new Set(["amazon.jobs", "www.amazon.jobs"]);
const POSTING_PATH = /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?jobs\/(\d+)(?:\/|$)/;
const INTERN = /\bintern(ship)?\b|co-?op/i;
const BULLET = /^\s*(?:[-•*–·]|\d+[.)])\s+/;

function firstMatch(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html);
  return match ? htmlToText(decodeEntities(match[1])).trim() || undefined : undefined;
}

/** Split one section body into its lines, as the page breaks them. */
function sectionLines(bodyHtml: string): string[] {
  return bodyHtml
    .split(/<br\s*\/?>|<\/p>|<\/li>/i)
    // Amazon double-encodes apostrophes ("&amp;#39;"), hence the second pass.
    .map((line) => decodeEntities(htmlToText(decodeEntities(line))).replace(/\s+/g, " ").trim());
}

/**
 * Bullet runs under a section, each attributed to the nearest heading: the
 * section's <h2>, or a plain line directly above the run ("Key job
 * responsibilities"). A run ends at the first non-bullet line.
 */
function bulletRuns(sectionHeading: string, bodyHtml: string): HeadingList[] {
  const runs: HeadingList[] = [];
  let heading = sectionHeading;
  let current: string[] | null = null;
  for (const line of sectionLines(bodyHtml)) {
    if (BULLET.test(line)) {
      if (!current) {
        current = [];
        runs.push({ heading, items: current });
      }
      current.push(line.replace(BULLET, ""));
    } else {
      current = null;
      if (line) heading = line.length <= 80 ? line : sectionHeading;
    }
  }
  return runs;
}

export const amazonAdapter: IntakeAdapter = {
  key: "amazon",
  label: "Amazon Jobs",

  matches: (url) => HOSTS.has(url.hostname.toLowerCase()) && POSTING_PATH.test(url.pathname),

  plan: (url) => [{ url: url.toString(), kind: "posting" }],

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const html = responses.find((r) => r.kind === "posting")?.text ?? "";
    const jobNumber = POSTING_PATH.exec(new URL(url).pathname)?.[1] ?? "unknown";

    const title = cleaner.clean(firstMatch(html, /<h1\b[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i), 200);
    const entity = cleaner.clean(
      firstMatch(html, /<p\b[^>]*class="[^"]*\bmeta\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.split("|")[1],
      160,
    );
    const applyUrl =
      /<a\b[^>]*id="apply-button"[^>]*href="(https:\/\/www\.amazon\.jobs\/[^"]+)"/i.exec(html)?.[1] ?? url;

    const sections = [...html.matchAll(/<div class="section">\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/div>/gi)].map(
      (m) => ({ heading: htmlToText(m[1]).trim(), body: m[2] }),
    );
    const descriptionFull =
      cleaner.clean(
        sections.map((s) => `${s.heading}\n${sectionLines(s.body).join("\n")}`).join("\n\n"),
        DESCRIPTION_FULL_MAX,
      ) ?? "";

    // "Job details" lists one location per <li>, ahead of the team links.
    const details = /<h2[^>]*>\s*Job details\s*<\/h2>([\s\S]*?)<\/ul>\s*<\/div>/i.exec(html)?.[1] ?? "";
    const locations = [...details.matchAll(/<li>([^<]{2,80})<\/li>/g)].map((m) => decodeEntities(m[1]).trim());
    const location = cleaner.clean(locations.join(" · "), 200);

    const failed = (): AdapterOutput => ({
      job: undefined,
      form: unreadableForm({ jobId: `amazon_${jobNumber}`, adapter: "amazon", applyUrl, fetchedAt, warnings: cleaner.flags() }),
      fieldOrigins: {},
      assumptions: [],
      warnings: cleaner.flags(),
      descriptionFull,
      partial: { url, applyUrl, ...(title ? { title } : {}), company: "Amazon" },
    });
    if (!title || sections.length === 0) return failed();

    const built = buildJob({
      source: "amazon",
      url,
      title,
      // The page is Amazon's own careers site; the legal hiring entity it
      // names ("Amazon.com Services LLC") is recorded as an assumption note.
      company: "Amazon",
      location,
      employmentType: INTERN.test(title) ? "internship" : undefined,
      seniority: seniorityFromTitle(title) ?? (INTERN.test(title) ? "Internship" : undefined),
      description: descriptionFull,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        company: "derived",
        ...(INTERN.test(title) ? { employmentType: "derived" as const, seniority: "derived" as const } : {}),
      },
      assumptions: entity ? [`The posting names the hiring entity as "${entity}"; shown here as Amazon.`] : [],
    });
    if (!built) return failed();

    built.job.requirements = extractRequirements(
      built.job.id,
      sections.flatMap((s) => bulletRuns(s.heading, s.body)),
      cleaner,
    );

    return {
      job: built.job,
      form: unreadableForm({ jobId: built.job.id, adapter: "amazon", applyUrl, fetchedAt, warnings: cleaner.flags() }),
      fieldOrigins: built.fieldOrigins,
      assumptions: built.assumptions,
      warnings: cleaner.flags(),
      descriptionFull,
    };
  },
};
