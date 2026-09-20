import type {
  ApplicationAutofillKey,
  ApplicationForm,
  ApplicationQuestion,
  ApplicationQuestionCategory,
  ApplicationQuestionKind,
  RequirementStatus,
} from "@/lib/types";
import type { AdapterOutput, IntakeAdapter, IntakeResponse } from "@/lib/intake/types";
import {
  GreenhouseJob,
  type GreenhouseQuestion,
  parseOne,
} from "@/lib/intake/schemas";
import {
  decodeEntities,
  extractHeadingAnchoredLists,
  htmlToText,
} from "@/lib/intake/html";
import {
  DESCRIPTION_FULL_MAX,
  buildJob,
  createCleaner,
  dedupeQuestions,
  extractRequirements,
  questionId,
  seniorityFromTitle,
  sponsorshipFromText,
  statusFromRequired,
} from "@/lib/intake/map";
import {
  greenhouseApiUrl,
  canonicalPostingUrl,
  parseIntakeUrl,
} from "@/lib/intake/urls";
import { slugId } from "@/lib/utils";

/**
 * Greenhouse adapter, the only P1 board that publishes its whole application
 * form, which makes it the only one where ABSENCE IS INFORMATIVE: if there is
 * no cover-letter field, the form genuinely does not ask for one.
 *
 * Its `content` field is HTML-ENTITY-ESCAPED inside the JSON (the string
 * literally contains "&lt;div&gt;"), so it is decoded exactly once before any
 * tag handling. No other board does this and none of the others are decoded.
 */

/** Greenhouse field types → our question kinds. */
const KIND_BY_FIELD_TYPE: Record<string, ApplicationQuestionKind> = {
  input_text: "short-text",
  textarea: "long-text",
  input_file: "file",
  multi_value_single_select: "single-select",
  multi_value_multi_select: "multi-select",
};

/** Exact field names Greenhouse uses for its standard fields. */
const AUTOFILL_BY_FIELD_NAME: Record<string, ApplicationAutofillKey> = {
  first_name: "first-name",
  last_name: "last-name",
  name: "name",
  email: "email",
  phone: "phone",
  location: "location",
  resume: "resume",
  cover_letter: "cover-letter",
};

const PERSONAL_FIELD_NAMES = new Set([
  "first_name",
  "last_name",
  "name",
  "email",
  "phone",
  "location",
]);

const WORK_AUTH = /sponsorship|work authoriz|visa|legally (?:work )?authoriz|right to work/i;

/** Fields that are page plumbing, never a question a human answers. */
function isHiddenField(type: string | null | undefined): boolean {
  return type === "input_hidden";
}

function categoryFor(
  fieldName: string | undefined,
  prompt: string,
): ApplicationQuestionCategory {
  if (fieldName && PERSONAL_FIELD_NAMES.has(fieldName)) return "personal-info";
  if (fieldName === "resume" || fieldName === "cover_letter") return "experience";
  if (WORK_AUTH.test(prompt)) return "work-authorization";
  return "other";
}

/**
 * Map one Greenhouse question.
 *
 * Returns `undefined` when every field is hidden (the Longitude/Latitude pair
 * in `location_questions`) or when the label is empty, showing a user
 * "Longitude" as an application question would be nonsense.
 */
function toQuestion(
  jobId: string,
  raw: GreenhouseQuestion,
  clean: (v: string | null | undefined, max?: number) => string | undefined,
): ApplicationQuestion | undefined {
  const fields = (raw.fields ?? []).filter((f) => !isHiddenField(f.type));
  if (fields.length === 0) return undefined;

  const prompt = clean(raw.label, 500);
  if (!prompt) return undefined;

  // A question may carry several fields (Resume/CV is input_file + textarea);
  // the first non-hidden one determines how we render it.
  const primary = fields[0];
  const fieldName = primary.name ?? undefined;
  const kind = KIND_BY_FIELD_TYPE[primary.type ?? ""] ?? "unknown";

  const options = (primary.values ?? [])
    .map((v) => clean(v.label, 160))
    .filter((v): v is string => !!v);

  const helpText = clean(raw.description, 400);
  const autofillKey = fieldName ? AUTOFILL_BY_FIELD_NAME[fieldName] : undefined;

  return {
    id: questionId(jobId, prompt),
    prompt,
    kind,
    category: categoryFor(fieldName, prompt),
    // Greenhouse states this authoritatively, so we set it rather than leaving
    // it absent, absent would mean "we didn't read it", which is not the case.
    required: raw.required === true,
    ...(options.length > 0 ? { options } : {}),
    ...(helpText ? { helpText } : {}),
    ...(autofillKey ? { autofillKey } : {}),
    trust: "source-backed",
  };
}

/** Does any question expose a field with this exact Greenhouse field name? */
function fieldStatus(
  questions: GreenhouseQuestion[],
  fieldName: string,
): RequirementStatus {
  const match = questions.find((q) =>
    (q.fields ?? []).some((f) => f.name === fieldName),
  );
  // The form is fully enumerated, so absence is a FACT: it does not ask.
  if (!match) return "not-requested";
  return statusFromRequired(match.required);
}

export const greenhouseAdapter: IntakeAdapter = {
  key: "greenhouse",
  label: "Greenhouse",

  matches(url) {
    return parseIntakeUrl(url.toString())?.adapter === "greenhouse";
  },

  plan(url) {
    const parsed = parseIntakeUrl(url.toString());
    if (!parsed?.org || !parsed.postingId) return [];
    return [
      { url: greenhouseApiUrl(parsed.org, parsed.postingId), kind: "posting" },
    ];
  },

  parse({ responses, url, fetchedAt }): AdapterOutput {
    const cleaner = createCleaner();
    const clean = cleaner.clean;
    const posting = responses.find((r: IntakeResponse) => r.kind === "posting");
    const raw = parseOne(GreenhouseJob, posting?.json);

    const canonical = canonicalPostingUrl(url) ?? url;
    const applyUrl = raw?.absolute_url ?? canonical;
    const jobId = slugId("job", canonical);

    if (!raw) {
      return {
        job: undefined,
        form: emptyForm(jobId, applyUrl, fetchedAt, cleaner.flags()),
        fieldOrigins: {},
        assumptions: [],
        warnings: cleaner.flags(),
        descriptionFull: "",
        partial: { url: canonical, applyUrl },
      };
    }

    // ENTITY-DECODE FIRST, before tag handling and before the injection
    // scanner runs inside `clean`, so a payload hidden as "&lt;system&gt;…"
    // is seen in its real form rather than walking past every rule.
    const decoded = decodeEntities(raw.content ?? "");
    const descriptionFull = clean(htmlToText(decoded), DESCRIPTION_FULL_MAX) ?? "";

    const title = clean(raw.title, 200);
    const company = clean(raw.company_name, 160);
    const locationName = clean(raw.location?.name, 200);

    // Greenhouse publishes no workplace field. The location string is the only
    // explicit signal, and we read it ONLY when it names a workplace mode,
    // never inferred from description prose.
    let remote: "remote" | "hybrid" | undefined;
    if (locationName && /\bremote\b/i.test(locationName)) remote = "remote";
    else if (locationName && /\bhybrid\b/i.test(locationName)) remote = "hybrid";

    const isIntern = title ? /\bintern(ship)?\b/i.test(title) : false;

    const built = buildJob({
      source: "greenhouse",
      url: canonical,
      title,
      company,
      location: locationName,
      remote,
      employmentType: isIntern ? "internship" : undefined,
      seniority: title ? seniorityFromTitle(title) : undefined,
      description: descriptionFull,
      postedAt: raw.first_published ?? undefined,
      deadline: raw.application_deadline ?? undefined,
      sponsorship: sponsorshipFromText(descriptionFull),
      requirements: [],
      origins: {
        ...(remote ? { remote: "derived" as const } : {}),
        ...(isIntern ? { employmentType: "derived" as const } : {}),
      },
    });

    if (!built) {
      return {
        job: undefined,
        form: emptyForm(jobId, applyUrl, fetchedAt, cleaner.flags()),
        fieldOrigins: {},
        assumptions: [],
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
      extractHeadingAnchoredLists(decoded),
      cleaner,
    );

    return {
      job: built.job,
      form: buildForm(built.job.id, raw, applyUrl, fetchedAt, cleaner),
      fieldOrigins: built.fieldOrigins,
      assumptions: built.assumptions,
      warnings: cleaner.flags(),
      descriptionFull,
    };
  },
};

/** A form placeholder for the paths where we never got a usable payload. */
function emptyForm(
  jobId: string,
  applyUrl: string,
  fetchedAt: string,
  warnings: string[],
): ApplicationForm {
  return {
    jobId,
    source: "none",
    adapter: "greenhouse",
    applyUrl,
    fetchedAt,
    completeness: "none",
    resume: "unknown",
    coverLetter: "unknown",
    portfolio: "unknown",
    questions: [],
    excludedSections: [],
    unknowns: ["We could not read this posting's application form."],
    warnings,
    trust: "unknown",
  };
}

/**
 * Build the full application form.
 *
 * `location_questions` are walked too, but every field in them is hidden
 * plumbing and `toQuestion` drops them, we iterate rather than skip so a
 * future real question there is not silently lost.
 */
function buildForm(
  jobId: string,
  raw: ReturnType<typeof parseOne<typeof GreenhouseJob>>,
  applyUrl: string,
  fetchedAt: string,
  cleaner: ReturnType<typeof createCleaner>,
): ApplicationForm {
  const clean = cleaner.clean;
  const core = raw?.questions ?? [];
  const location = raw?.location_questions ?? [];

  const questions: ApplicationQuestion[] = [];
  for (const raw0 of [...core, ...location]) {
    const q = toQuestion(jobId, raw0, clean);
    if (q) questions.push(q);
  }

  // Demographic (EEO) questions are DELIBERATELY NOT INGESTED.
  //
  // They ask about race, gender identity, disability and veteran status. We
  // name the section so the user knows it is coming and will complete it on the
  // employer's site, but we do not copy the wording, store the options, or put
  // them anywhere a model could later be asked to draft an answer. Not holding
  // the data at all is a stronger guarantee than holding it and promising not
  // to use it, and un-excluding this later is an additive change, whereas
  // un-leaking it would not be.
  const excludedSections: string[] = [];
  const demographic = raw?.demographic_questions?.questions ?? [];
  if (demographic.length > 0) {
    excludedSections.push(
      clean(raw?.demographic_questions?.header, 120) ??
        "Equal employment opportunity questions",
    );
  }

  return {
    jobId,
    source: "fetched",
    adapter: "greenhouse",
    applyUrl,
    fetchedAt,
    // The board publishes the entire form, so absence of a field is a fact.
    completeness: "complete",
    resume: fieldStatus(core, "resume"),
    coverLetter: fieldStatus(core, "cover_letter"),
    // Greenhouse has no standard portfolio field; a board that wants one asks
    // it as a custom question, which is already in `questions`.
    portfolio: "not-requested",
    questions: dedupeQuestions(questions),
    excludedSections,
    unknowns: [],
    warnings: cleaner.flags(),
    trust: "source-backed",
  };
}
