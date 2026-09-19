import type { Job } from "@/lib/types";
import type { AdapterOutput, IntakeAdapter, IntakeResponse } from "@/lib/intake/types";
import { LeverPosting, parseOne } from "@/lib/intake/schemas";
import { htmlToText, listItems, type HeadingList } from "@/lib/intake/html";
import {
  DESCRIPTION_FULL_MAX,
  buildJob,
  createCleaner,
  extractRequirements,
  seniorityFromTitle,
  sponsorshipFromText,
  unreadableForm,
} from "@/lib/intake/map";
import { canonicalPostingUrl, leverApiUrl, parseIntakeUrl } from "@/lib/intake/urls";
import { slugId } from "@/lib/utils";

/**
 * Lever adapter.
 *
 * Lever's `lists[]` is the best requirements source of any P1 board: it is
 * REAL heading-anchored structure ({ text: heading, content: "<li>…" }), so we
 * never have to guess at markup. Its HTML is raw and must NOT be entity-decoded.
 *
 * The public postings API carries no application questions, so the form is
 * always "none" and the user is asked to paste them.
 */

/** Lever's workplaceType is lowercase and maps straight onto our enum. */
const REMOTE_BY_WORKPLACE: Record<string, Job["remote"]> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  // "unspecified" deliberately absent — it means the employer didn't say.
};

/**
 * `categories.commitment` is FREE TEXT, not an enum — real values include
 * null, "Regular Full Time (Salary)" and "Remote". We only map on an
 * unambiguous hit and otherwise leave the type unstated.
 */
function employmentFromCommitment(
  commitment: string | null | undefined,
): Job["employmentType"] | undefined {
  if (!commitment) return undefined;
  if (/\bintern(ship)?\b/i.test(commitment)) return "internship";
  if (/\bcontract(or)?\b|\btemporary\b/i.test(commitment)) return "contract";
  if (/\bfull[\s-]?time\b/i.test(commitment)) return "full-time";
  return undefined;
}

/** "acme-corp" -> "Acme Corp". The board slug is all Lever gives us. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const leverAdapter: IntakeAdapter = {
  key: "lever",
  label: "Lever",

  matches(url) {
    return parseIntakeUrl(url.toString())?.adapter === "lever";
  },

  plan(url) {
    const parsed = parseIntakeUrl(url.toString());
    if (!parsed?.org || !parsed.postingId) return [];
    return [{ url: leverApiUrl(parsed.org, parsed.postingId), kind: "posting" }];
  },

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const clean = cleaner.clean;
    const posting = responses.find((r: IntakeResponse) => r.kind === "posting");
    const raw = parseOne(LeverPosting, posting?.json);

    const parsedUrl = parseIntakeUrl(url);
    const canonical = canonicalPostingUrl(url) ?? url;
    const applyUrl = raw?.applyUrl ?? raw?.hostedUrl ?? canonical;
    const fallbackId = slugId("job", canonical);

    if (!raw) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "lever",
          applyUrl,
          fetchedAt,
          warnings: cleaner.flags(),
        }),
        fieldOrigins: {},
        assumptions: [],
        warnings: cleaner.flags(),
        descriptionFull: "",
        partial: { url: canonical, applyUrl },
      };
    }

    // Lever splits the posting across several fields. All of it is the
    // employer's own text, so the analyzer gets the whole thing assembled in
    // the order the page shows it.
    const lists: HeadingList[] = (raw.lists ?? [])
      .map((l) => ({
        heading: htmlToText(l.text ?? "").trim(),
        items: listItems(l.content ?? ""),
      }))
      .filter((l) => l.heading && l.items.length > 0);

    const sections = [
      htmlToText(raw.opening ?? ""),
      htmlToText(raw.descriptionBody ?? raw.description ?? ""),
      ...lists.map((l) => `${l.heading}\n${l.items.map((i) => `- ${i}`).join("\n")}`),
      htmlToText(raw.additional ?? ""),
    ].filter((s) => s.trim().length > 0);

    const descriptionFull = clean(sections.join("\n\n"), DESCRIPTION_FULL_MAX) ?? "";

    const title = clean(raw.text, 200);
    const company = parsedUrl?.org ? titleCaseSlug(parsedUrl.org) : undefined;
    const workplace = raw.workplaceType?.toLowerCase() ?? "";
    const remote = REMOTE_BY_WORKPLACE[workplace];
    const employmentType = employmentFromCommitment(raw.categories?.commitment);

    // Epoch MILLISECONDS, not an ISO string. Guard the conversion — an invalid
    // number must leave `postedAt` absent rather than produce "Invalid Date".
    let postedAt: string | undefined;
    if (typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)) {
      const date = new Date(raw.createdAt);
      if (!Number.isNaN(date.getTime())) postedAt = date.toISOString();
    }

    const assumptions: string[] = [];
    if (company) {
      assumptions.push(
        `The company name comes from the job board URL ("${parsedUrl?.org}"), not from the posting itself.`,
      );
    }

    const built = buildJob({
      source: "lever",
      url: canonical,
      title,
      company,
      team: clean(raw.categories?.team, 160),
      location: clean(raw.categories?.location, 200),
      remote,
      employmentType,
      ...(raw.categories?.commitment
        ? { employmentTypeRaw: raw.categories.commitment }
        : {}),
      seniority: title ? seniorityFromTitle(title) : undefined,
      description: descriptionFull,
      postedAt,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        ...(company ? { company: "derived" as const } : {}),
        ...(remote ? { remote: "stated" as const } : {}),
        ...(employmentType ? { employmentType: "derived" as const } : {}),
      },
      assumptions,
    });

    if (!built) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "lever",
          applyUrl,
          fetchedAt,
          warnings: cleaner.flags(),
        }),
        fieldOrigins: {},
        assumptions,
        warnings: cleaner.flags(),
        descriptionFull,
        partial: {
          url: canonical,
          applyUrl,
          ...(title ? { title } : {}),
          ...(company ? { company } : {}),
        },
      };
    }

    built.job.requirements = extractRequirements(built.job.id, lists, cleaner);

    return {
      job: built.job,
      form: unreadableForm({
        jobId: built.job.id,
        adapter: "lever",
        applyUrl,
        fetchedAt,
        warnings: cleaner.flags(),
      }),
      fieldOrigins: built.fieldOrigins,
      assumptions: built.assumptions,
      warnings: cleaner.flags(),
      descriptionFull,
    };
  },
};
