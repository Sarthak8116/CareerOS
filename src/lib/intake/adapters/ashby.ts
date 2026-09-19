import type { Job } from "@/lib/types";
import type { AdapterOutput, IntakeAdapter, IntakeResponse } from "@/lib/intake/types";
import { AshbyBoard, parseOne } from "@/lib/intake/schemas";
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
import { ashbyApiUrl, canonicalPostingUrl, parseIntakeUrl } from "@/lib/intake/urls";
import { titleCaseSlug } from "@/lib/intake/adapters/lever";
import { slugId } from "@/lib/utils";

/**
 * Ashby adapter.
 *
 * Ashby publishes no single-posting endpoint, so we fetch the whole board and
 * filter by the id in the URL. `includeCompensation=true` is required or the
 * `compensation` key is ABSENT rather than null — which reads identically to
 * "this employer publishes no pay range" and would silently lose real data.
 *
 * Its `workplaceType` is CAPITALISED ("Hybrid") where Lever's is lowercase, so
 * the two are never shared. Real Ashby titles ship with a LEADING SPACE.
 *
 * Application questions load through an internal API after JS runs, so a plain
 * fetch cannot see them (verified against a captured apply page: no
 * `applicationForm`, `formField` or `questions` anywhere in the HTML). The form
 * is therefore always "none" and the user is asked to paste.
 */

const REMOTE_BY_WORKPLACE: Record<string, Job["remote"]> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
};

/**
 * Ashby writes employment types without separators ("FullTime").
 *
 * "PartTime" returns `undefined` on purpose: our enum has no honest member for
 * it, so the type stays unstated and the verbatim wording is preserved in
 * `employmentTypeRaw` rather than being forced into a neighbouring value.
 */
function employmentFromAshby(
  value: string | null | undefined,
): Job["employmentType"] | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized.startsWith("intern")) return "internship";
  if (normalized === "fulltime") return "full-time";
  if (normalized === "contract" || normalized === "temporary") return "contract";
  return undefined;
}

export const ashbyAdapter: IntakeAdapter = {
  key: "ashby",
  label: "Ashby",

  matches(url) {
    return parseIntakeUrl(url.toString())?.adapter === "ashby";
  },

  plan(url) {
    const parsed = parseIntakeUrl(url.toString());
    if (!parsed?.org) return [];
    return [{ url: ashbyApiUrl(parsed.org), kind: "posting" }];
  },

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const clean = cleaner.clean;
    const posting = responses.find((r: IntakeResponse) => r.kind === "posting");
    const board = parseOne(AshbyBoard, posting?.json);

    const parsedUrl = parseIntakeUrl(url);
    const canonical = canonicalPostingUrl(url) ?? url;
    const fallbackId = slugId("job", canonical);

    const wanted = parsedUrl?.postingId?.toLowerCase();
    const raw = (board?.jobs ?? []).find(
      (j) => j.id && j.id.toLowerCase() === wanted,
    );

    const applyUrl = raw?.applyUrl ?? raw?.jobUrl ?? canonical;

    // A delisted posting is not an error, but it is also not something we will
    // present as a live opportunity.
    if (!raw || raw.isListed === false) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "ashby",
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

    const descriptionHtml = raw.descriptionHtml ?? "";
    const descriptionFull =
      clean(
        descriptionHtml ? htmlToText(descriptionHtml) : (raw.descriptionPlain ?? ""),
        DESCRIPTION_FULL_MAX,
      ) ?? "";

    // `clean` trims, which matters here: live Ashby titles carry a leading space.
    const title = clean(raw.title, 200);
    const company = parsedUrl?.org ? titleCaseSlug(parsedUrl.org) : undefined;

    const workplace = raw.workplaceType?.toLowerCase() ?? "";
    let remote = REMOTE_BY_WORKPLACE[workplace];
    // `isRemote` is a weaker signal than an explicit workplaceType, so it only
    // fills a gap — it never overrides what the employer selected.
    if (!remote && raw.isRemote === true) remote = "remote";

    const employmentType = employmentFromAshby(raw.employmentType);

    const assumptions: string[] = [];
    if (company) {
      assumptions.push(
        `The company name comes from the job board URL ("${parsedUrl?.org}"), not from the posting itself.`,
      );
    }

    const built = buildJob({
      source: "ashby",
      url: canonical,
      title,
      company,
      team: clean(raw.team ?? raw.department, 160),
      location: clean(raw.location, 200),
      remote,
      employmentType,
      ...(raw.employmentType ? { employmentTypeRaw: raw.employmentType } : {}),
      seniority: title ? seniorityFromTitle(title) : undefined,
      description: descriptionFull,
      postedAt: raw.publishedAt ?? undefined,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        ...(company ? { company: "derived" as const } : {}),
        ...(remote ? { remote: "stated" as const } : {}),
        ...(employmentType ? { employmentType: "stated" as const } : {}),
      },
      assumptions,
    });

    if (!built) {
      return {
        job: undefined,
        form: unreadableForm({
          jobId: fallbackId,
          adapter: "ashby",
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
        adapter: "ashby",
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
