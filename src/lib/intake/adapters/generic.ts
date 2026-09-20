import type { Job } from "@/lib/types";
import type { AdapterOutput, IntakeAdapter, IntakeResponse } from "@/lib/intake/types";
import { JsonLdJobPosting, parseOne } from "@/lib/intake/schemas";
import {
  extractHeadingAnchoredLists,
  extractJsonLdJobPosting,
  htmlToText,
} from "@/lib/intake/html";
import {
  DESCRIPTION_FULL_MAX,
  buildJob,
  createCleaner,
  extractRequirements,
  seniorityFromTitle,
  sponsorshipFromText,
  unreadableForm,
} from "@/lib/intake/map";
import { canonicalPostingUrl } from "@/lib/intake/urls";
import { slugId } from "@/lib/utils";

/**
 * Generic adapter, any board we don't have a dedicated adapter for.
 *
 * It reads ONLY server-rendered schema.org JSON-LD (`<script
 * type="application/ld+json">` with `"@type": "JobPosting"`). If a page has
 * none, this fails honestly and the user pastes the posting.
 *
 * It deliberately does NOT scrape `<h1>`/`<title>` into a Job. Heuristic prose
 * extraction is exactly the mechanism that invents a location or an employment
 * type the posting never stated; a wrong Job that looks right is worse than no
 * Job at all. Page text is used only as unverified PREFILL on the failure path,
 * where the user must confirm it before anything is saved.
 *
 * JSON-LD is inconsistent across the industry, it is present on Ashby's apply
 * pages and absent from Lever's, and most career sites are client-rendered
 * SPAs that inject any SEO markup after load, invisible to a plain fetch. So a
 * miss here is the expected case, not a bug.
 */

/** schema.org employment types → ours, where an honest equivalent exists. */
const EMPLOYMENT_BY_SCHEMA: Record<string, Job["employmentType"]> = {
  FULL_TIME: "full-time",
  CONTRACTOR: "contract",
  TEMPORARY: "contract",
  INTERN: "internship",
  // PART_TIME, VOLUNTEER, PER_DIEM and OTHER deliberately absent, our enum
  // has no honest member for them, so they stay unstated and survive verbatim
  // in `employmentTypeRaw`.
};

/** `employmentType` may be a string or an array of strings. */
function firstEmploymentToken(
  value: string | string[] | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : undefined;
}

/** `hiringOrganization` may be a bare string or an Organization object. */
function organizationName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

/** Flatten a schema.org PostalAddress into a display string. */
function locationText(value: unknown): string | undefined {
  if (!value) return undefined;
  const node = Array.isArray(value) ? value[0] : value;
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return undefined;
  const address = (node as { address?: unknown }).address;
  if (typeof address === "string") return address;
  if (!address || typeof address !== "object") return undefined;
  const a = address as Record<string, unknown>;
  const parts = [a.addressLocality, a.addressRegion]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  if (parts.length === 0 && typeof a.addressCountry === "string") {
    parts.push(a.addressCountry);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** A page `<title>`, used ONLY as unverified prefill on the failure path. */
function pageTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  const text = match ? htmlToText(match[1] ?? "").trim() : "";
  return text || undefined;
}

export const genericAdapter: IntakeAdapter = {
  key: "generic",
  label: "Job posting",

  // Always last in the chain, so it accepts anything that reached it.
  matches() {
    return true;
  },

  plan(url) {
    return [{ url: url.toString(), kind: "posting" }];
  },

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const clean = cleaner.clean;
    const posting = responses.find((r: IntakeResponse) => r.kind === "posting");
    const html = posting?.text ?? "";

    const canonical = canonicalPostingUrl(url) ?? url;
    const fallbackId = slugId("job", canonical);

    const node = extractJsonLdJobPosting(html);
    const raw = node ? parseOne(JsonLdJobPosting, node) : undefined;

    // No structured data: fail honestly rather than guessing at the markup.
    if (!raw) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "generic",
          applyUrl: canonical,
          fetchedAt,
          warnings: cleaner.flags(),
        }),
        fieldOrigins: {},
        assumptions: [],
        warnings: cleaner.flags(),
        descriptionFull: "",
        partial: {
          url: canonical,
          applyUrl: canonical,
          // Unverified. Prefill only; never persisted without confirmation.
          ...(pageTitle(html) ? { title: pageTitle(html) } : {}),
        },
      };
    }

    const descriptionHtml = raw.description ?? "";
    const descriptionFull =
      clean(htmlToText(descriptionHtml), DESCRIPTION_FULL_MAX) ?? "";

    const title = clean(raw.title, 200);
    const company = clean(organizationName(raw.hiringOrganization), 160);
    const location = clean(locationText(raw.jobLocation), 200);

    const schemaToken = firstEmploymentToken(raw.employmentType);
    const employmentType = schemaToken
      ? EMPLOYMENT_BY_SCHEMA[schemaToken.toUpperCase().replace(/[\s-]/g, "_")]
      : undefined;

    // TELECOMMUTE is schema.org's explicit remote marker. Anything else leaves
    // the field unstated, we never read remoteness out of description prose.
    const remote: Job["remote"] | undefined =
      raw.jobLocationType && /telecommute/i.test(raw.jobLocationType)
        ? "remote"
        : undefined;

    const built = buildJob({
      source: "generic",
      url: canonical,
      title,
      company,
      location,
      remote,
      employmentType,
      ...(schemaToken ? { employmentTypeRaw: schemaToken } : {}),
      seniority: title ? seniorityFromTitle(title) : undefined,
      description: descriptionFull,
      postedAt: raw.datePosted ?? undefined,
      deadline: raw.validThrough ?? undefined,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        ...(remote ? { remote: "stated" as const } : {}),
        ...(employmentType ? { employmentType: "stated" as const } : {}),
      },
    });

    if (!built) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "generic",
          applyUrl: canonical,
          fetchedAt,
          warnings: cleaner.flags(),
        }),
        fieldOrigins: {},
        assumptions: [],
        warnings: cleaner.flags(),
        descriptionFull,
        partial: {
          url: canonical,
          applyUrl: canonical,
          ...(title ? { title } : {}),
          ...(company ? { company } : {}),
        },
      };
    }

    built.job.requirements = extractRequirements(
      built.job.id,
      extractHeadingAnchoredLists(descriptionHtml),
      cleaner,
    );

    return {
      job: built.job,
      form: unreadableForm({
        jobId: built.job.id,
        adapter: "generic",
        applyUrl: canonical,
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
