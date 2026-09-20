import type {
  ApplicationAutofillKey,
  ApplicationForm,
  ApplicationQuestion,
  Candidate,
  PackageClaim,
  PackageDocumentStatus,
} from "@/lib/types";

/**
 * The personal-information sheet.
 *
 * Every value here is read from the stored profile. NOTHING is invented and
 * nothing is derived by guesswork: CareerOS does not store an email address or
 * a phone number, so those fields say so in plain language and appear in the
 * package's `missing` list rather than being filled with something plausible.
 *
 * The status is "reused", never "drafted", this sheet was pulled from the
 * user's profile, not written for this posting, and saying otherwise would
 * claim work the product did not do.
 *
 * Pure: no I/O, no Date, no randomness.
 */

/** Autofill keys this document answers. */
export const PERSONAL_AUTOFILL_KEYS: ReadonlySet<ApplicationAutofillKey> = new Set(
  [
    "name",
    "first-name",
    "last-name",
    "email",
    "phone",
    "location",
    "linkedin",
    "github",
    "portfolio",
    "work-authorization",
    "university",
    "degree",
    "graduation-year",
  ] as const,
);

/** Autofill keys owned by the resume and cover-letter documents instead. */
export const DOCUMENT_AUTOFILL_KEYS: ReadonlySet<ApplicationAutofillKey> = new Set(
  ["resume", "cover-letter"] as const,
);

/** What we show when the form was never read and we must guess at nothing. */
const DEFAULT_KEYS: ApplicationAutofillKey[] = [
  "name",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "work-authorization",
];

const LABELS: Record<ApplicationAutofillKey, string> = {
  name: "Full name",
  "first-name": "First name",
  "last-name": "Last name",
  email: "Email address",
  phone: "Phone number",
  location: "Location",
  linkedin: "LinkedIn",
  github: "GitHub",
  portfolio: "Portfolio",
  "work-authorization": "Work authorization",
  university: "University",
  degree: "Degree",
  "graduation-year": "Graduation year",
  resume: "Resume",
  "cover-letter": "Cover letter",
};

/** Why a field is blank. Worded for the user, not for a log. */
const NOT_STORED: Partial<Record<ApplicationAutofillKey, string>> = {
  email: "CareerOS does not store your email address, add it yourself.",
  phone: "CareerOS does not store your phone number, add it yourself.",
};

export interface PersonalField {
  key: ApplicationAutofillKey;
  label: string;
  /** The stored value, or undefined when the profile does not hold one. */
  value?: string;
  /** Present only when `value` is absent: what the user has to do. */
  note?: string;
}

function trimmed(value: string | undefined): string | undefined {
  const out = value?.trim();
  return out && out !== "Unknown" ? out : undefined;
}

/**
 * Split a stored full name ONLY when it is unambiguous.
 *
 * Two tokens split cleanly. Anything else ("Maria del Carmen Gonzalez Ruiz")
 * is a guess about which part is the family name, and guessing at someone's
 * name to save them one keystroke is not a trade this product makes.
 */
function nameParts(name: string): { first?: string; last?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return {};
  return { first: parts[0], last: parts[1] };
}

export function personalField(
  key: ApplicationAutofillKey,
  candidate: Candidate,
): PersonalField {
  const label = LABELS[key];
  const { first, last } = nameParts(candidate.name);

  const value = ((): string | undefined => {
    switch (key) {
      case "name":
        return trimmed(candidate.name);
      case "first-name":
        return trimmed(first);
      case "last-name":
        return trimmed(last);
      case "location":
        return trimmed(candidate.location);
      case "linkedin":
        return trimmed(candidate.links.linkedin);
      case "github":
        return trimmed(candidate.links.github);
      case "portfolio":
        return trimmed(candidate.links.portfolio);
      case "work-authorization":
        return trimmed(candidate.workAuthorization);
      case "university":
        return trimmed(candidate.university);
      case "degree":
        return trimmed(candidate.degree);
      case "graduation-year":
        return candidate.graduationYear
          ? String(candidate.graduationYear)
          : undefined;
      // Never stored, never invented.
      case "email":
      case "phone":
      default:
        return undefined;
    }
  })();

  if (value) return { key, label, value };

  const note =
    NOT_STORED[key] ??
    (key === "first-name" || key === "last-name"
      ? "Your profile stores one full name that does not split cleanly, enter this yourself."
      : "Not in your CareerOS profile, add it yourself.");
  return { key, label, note };
}

/** Which personal fields THIS application actually asks for. */
export function requestedPersonalKeys(
  form: ApplicationForm | undefined,
): { keys: ApplicationAutofillKey[]; fromForm: boolean } {
  const asked = (form?.questions ?? [])
    .map((q: ApplicationQuestion) => q.autofillKey)
    .filter((key): key is ApplicationAutofillKey =>
      Boolean(key && PERSONAL_AUTOFILL_KEYS.has(key)),
    );

  const unique = [...new Set(asked)];
  if (unique.length > 0) return { keys: unique, fromForm: true };

  // The form was read in full and asks for none of this: say so, don't invent.
  if (form?.completeness === "complete") return { keys: [], fromForm: true };

  return { keys: DEFAULT_KEYS, fromForm: false };
}

export interface PersonalInfoDocument {
  status: PackageDocumentStatus;
  content: string;
  claims: PackageClaim[];
  /** Plain-language gaps for the package's `missing` list. */
  missing: string[];
}

export function buildPersonalInfo(input: {
  candidate: Candidate;
  form?: ApplicationForm;
}): PersonalInfoDocument {
  const { keys, fromForm } = requestedPersonalKeys(input.form);

  if (keys.length === 0) {
    return {
      status: "not-requested",
      content: "",
      claims: [],
      missing: [],
    };
  }

  const fields = keys.map((key) => personalField(key, input.candidate));
  const filled = fields.filter((f) => f.value);
  const blank = fields.filter((f) => !f.value);

  const lines = [
    "# Personal information",
    "",
    fromForm
      ? "The fields this application asks for, filled from your CareerOS profile."
      : "CareerOS could not read this application's own fields, so these are the ones applications usually ask for. Check the employer's form for anything else.",
    "",
    ...fields.map((f) =>
      f.value ? `- **${f.label}:** ${f.value}` : `- **${f.label}:** ${f.note}`,
    ),
  ];

  return {
    status: blank.length > 0 ? "needs-you" : "reused",
    content: `${lines.join("\n")}\n`,
    // Profile fields are facts the USER gave us. They are never "evidenced",
    // no evidence row backs your phone number, and never "unsupported" either.
    claims: filled.map((f) => ({
      text: `${f.label}: ${f.value}`,
      support: "user-provided" as const,
    })),
    missing: blank.map((f) => `${f.label}, ${f.note}`),
  };
}
