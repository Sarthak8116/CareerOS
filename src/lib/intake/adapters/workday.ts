import type { Job } from "@/lib/types";
import type { AdapterOutput, IntakeAdapter, IntakeResponse } from "@/lib/intake/types";
import { WorkdayJob, parseOne } from "@/lib/intake/schemas";
import { extractHeadingAnchoredLists, htmlToText } from "@/lib/intake/html";
import {
  DESCRIPTION_FULL_MAX,
  buildJob,
  createCleaner,
  extractRequirements,
  seniorityFromTitle,
  sponsorshipFromText,
  unreadableForm,
} from "@/lib/intake/map";
import {
  canonicalPostingUrl,
  parseIntakeUrl,
  toUrl,
  workdayApiUrl,
} from "@/lib/intake/urls";
import { slugId } from "@/lib/utils";

/**
 * Workday adapter.
 *
 * The public page is a JS shell; the data lives at an internal CXS endpoint
 * derived by inserting `/wday/cxs/{tenant}/` before the site id. When that
 * 404s the tenant/site pair was not derivable and we fall back to paste — we
 * never retry with guessed site ids, because a guess that happens to resolve
 * would attribute the WRONG company's posting.
 *
 * Two traps this adapter exists to avoid:
 *  - `postedOn` is RELATIVE TEXT ("Posted Today"), not a date. It never reaches
 *    `Job.postedAt`, and it is never converted using the current clock.
 *  - `hiringOrganization.name` is a LEGAL ENTITY ("2100 NVIDIA USA"), not the
 *    brand. We keep it verbatim and tell the user where it came from rather
 *    than rewriting an employer's own name.
 */

/** Workday writes these with a space: "Full time" / "Part time". */
function employmentFromTimeType(
  value: string | null | undefined,
): Job["employmentType"] | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized.startsWith("intern")) return "internship";
  if (normalized === "fulltime") return "full-time";
  if (normalized === "contract" || normalized === "contractor") return "contract";
  // "Part time" intentionally unmapped — no honest member exists for it.
  return undefined;
}

export const workdayAdapter: IntakeAdapter = {
  key: "workday",
  label: "Workday",

  matches(url) {
    return parseIntakeUrl(url.toString())?.adapter === "workday";
  },

  plan(url) {
    const parsed = parseIntakeUrl(url.toString());
    if (!parsed?.org || !parsed.siteId || !parsed.externalPath) return [];
    const parsedUrl = toUrl(url.toString());
    if (!parsedUrl) return [];
    return [
      {
        url: workdayApiUrl(parsedUrl, parsed.org, parsed.siteId, parsed.externalPath),
        kind: "posting",
      },
    ];
  },

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const clean = cleaner.clean;
    const posting = responses.find((r: IntakeResponse) => r.kind === "posting");
    const raw = parseOne(WorkdayJob, posting?.json);
    const info = raw?.jobPostingInfo;

    const canonical = canonicalPostingUrl(url) ?? url;
    const applyUrl = info?.externalUrl ?? canonical;
    const fallbackId = slugId("job", canonical);

    if (!info) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "workday",
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

    // Raw HTML — NOT entity-escaped, so it must not be decoded.
    const descriptionHtml = info.jobDescription ?? "";
    const descriptionFull =
      clean(htmlToText(descriptionHtml), DESCRIPTION_FULL_MAX) ?? "";

    const title = clean(info.title, 200);
    const company = clean(raw?.hiringOrganization?.name, 160);
    const employmentType = employmentFromTimeType(info.timeType);

    const assumptions: string[] = [];
    if (company) {
      assumptions.push(
        "The company name comes from the employer's Workday tenant record and may be a legal entity name rather than the brand you know.",
      );
    }
    if (info.postedOn) {
      // Preserve what the page said without turning it into a date we cannot
      // justify. "Posted Today" relative to WHEN is unknowable after the fact.
      assumptions.push(
        `This posting reports its date as "${info.postedOn}", which is relative text rather than a date, so no posting date is recorded.`,
      );
    }

    const built = buildJob({
      source: "workday",
      url: canonical,
      title,
      company,
      location: clean(info.location, 200),
      // Workday exposes no workplace field at all on this endpoint.
      remote: undefined,
      employmentType,
      ...(info.timeType ? { employmentTypeRaw: info.timeType } : {}),
      seniority: title ? seniorityFromTitle(title) : undefined,
      description: descriptionFull,
      // Deliberately absent: see the assumption above.
      postedAt: undefined,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        ...(company ? { company: "derived" as const } : {}),
        ...(employmentType ? { employmentType: "stated" as const } : {}),
      },
      assumptions,
    });

    if (!built) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "workday",
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

    built.job.requirements = extractRequirements(
      built.job.id,
      extractHeadingAnchoredLists(descriptionHtml),
      cleaner,
    );

    return {
      job: built.job,
      form: unreadableForm({
        jobId: built.job.id,
        adapter: "workday",
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
