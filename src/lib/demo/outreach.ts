import type { Candidate, Person } from "@/lib/types";

/**
 * Reusable outreach copy + safety helpers (build directive §5.13, §5.14).
 *
 * The copy here is deliberately restrained: no fabricated familiarity, no
 * exaggerated admiration, no early/aggressive referral asks, no generic
 * praise, and no invented shared interests. Every personalization point is
 * grounded in a real Person field (connection / commonality) or a real
 * Candidate evidence claim. All output is DETERMINISTIC — no randomness,
 * no clock reads. Timing is expressed as relative strings.
 */

/* ------------------------------------------------------------------ */
/* Role model                                                          */
/* ------------------------------------------------------------------ */

export type OutreachRole = "alumnus" | "recruiter" | "likely-manager" | "networking";

/** Objective/subject/body bundle a copy builder returns. */
export interface OutreachCopy {
  objective: string;
  subject: string;
  full: string;
  concise: string;
}

/**
 * Resolved facts a copy builder needs. The engine assembles this from the
 * Candidate/Job/Person so the templates stay free of lookup logic.
 */
export interface OutreachContext {
  candidateFirstName: string;
  candidateFullName: string;
  university: string;
  /** One sentence introducing the candidate, built from THEIR profile. */
  intro: string;
  personFirstName: string;
  jobTitle: string;
  company: string;
  team?: string;
  /**
   * Candidate evidence claims resolved from the evidence graph. Absent when the
   * candidate has recorded nothing relevant — the copy then says less rather
   * than describing a background nobody recorded.
   */
  projectClaim?: string;
  supportingClaims: string[];
  workAuth: string;
}

/* ------------------------------------------------------------------ */
/* Timing (relative strings only — never a real Date)                  */
/* ------------------------------------------------------------------ */

export const FOLLOW_UP = "+5 business days";

export function recommendedSendTime(channel: "email" | "linkedin"): string {
  return channel === "email"
    ? "Tuesday–Thursday, 8–10am recipient's local time"
    : "Tuesday–Thursday, mid-morning recipient's local time";
}

/* ------------------------------------------------------------------ */
/* Role-specific copy builders                                         */
/* ------------------------------------------------------------------ */

/**
 * The copy builders describe ONLY what the context carries. They used to be
 * written for one persona ("CS senior… low-level systems… 2026 internship"),
 * which put that biography into every user's draft.
 */
const workArea = (ctx: OutreachContext) => ctx.team ?? `the ${ctx.jobTitle} role`;

const projectLine = (ctx: OutreachContext, lead: string) =>
  ctx.projectClaim ? `${lead} ${ctx.projectClaim}.` : undefined;

const lines = (parts: Array<string | undefined>) =>
  parts.filter((part): part is string => part !== undefined).join("\n");

/**
 * Alumnus → informational chat + a SOFT question about the consideration path.
 * No direct "refer me" ask.
 */
export function buildAlumnusCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `Fellow ${ctx.university} alum — quick question about ${workArea(ctx)} at ${ctx.company}`;
  const project = projectLine(ctx, "Most recently I worked on:");

  const full = lines([
    `Hi ${ctx.personFirstName},`,
    ``,
    `${ctx.intro} I'm interested in the ${ctx.jobTitle} role at ${ctx.company}, and as someone who also came through ${ctx.university} I'd value your perspective.`,
    ``,
    project,
    project ? `` : undefined,
    `Would you be open to a short 15-minute chat about your experience on the team? If it feels useful, I'd also appreciate any pointers on how candidates are typically considered. Completely understand if you're heads-down.`,
    ``,
    `Thanks for reading,`,
    ctx.candidateFirstName,
  ]);

  const concise = `Hi ${ctx.personFirstName} — fellow ${ctx.university} alum here, interested in the ${ctx.jobTitle} role at ${ctx.company}.${ctx.projectClaim ? ` I recently worked on ${ctx.projectClaim}.` : ""} Would you be open to a quick 15-min chat about your experience there, and how candidates are typically considered? Thanks either way. — ${ctx.candidateFirstName}`;

  return {
    objective: `Request a brief informational chat with a fellow alum, and softly learn the consideration path — no direct referral ask.`,
    subject,
    full,
    concise,
  };
}

/**
 * Recruiter → express specific interest in the role and ask about the
 * application + timeline process.
 */
export function buildRecruiterCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `${ctx.jobTitle} at ${ctx.company} — interested candidate`;
  const background =
    ctx.supportingClaims.length > 0
      ? `Relevant background: ${ctx.supportingClaims.join("; ")}. On work authorization: ${ctx.workAuth}.`
      : `On work authorization: ${ctx.workAuth}.`;

  const full = lines([
    `Hi ${ctx.personFirstName},`,
    ``,
    `${ctx.intro} I'm applying for the ${ctx.jobTitle} role at ${ctx.company} and wanted to reach out directly.`,
    ``,
    background,
    ``,
    `Could you point me to the best way to make sure my application is considered, and share the rough timeline for this requisition? Happy to send my resume.`,
    ``,
    `Thank you,`,
    ctx.candidateFullName,
  ]);

  const concise = `Hi ${ctx.personFirstName} — I'm applying for the ${ctx.jobTitle} role at ${ctx.company}.${ctx.supportingClaims.length > 0 ? ` Relevant background: ${ctx.supportingClaims.join("; ")}.` : ""} (${ctx.workAuth}) Could you share the best way to get my application considered and the rough timeline? Happy to send my resume. Thanks! — ${ctx.candidateFirstName}`;

  return {
    objective: `Express specific interest in the ${ctx.jobTitle} role and ask the recruiter about the application path and timeline.`,
    subject,
    full,
    concise,
  };
}

/**
 * Likely-manager → ONE open question about the team's work. Explicitly not
 * asking for a referral, an interview, or application help. The question is
 * left for the user to sharpen: a specific technical question written by a
 * template would be a claim about what the user is curious about.
 */
export function buildManagerCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `A question about ${workArea(ctx)} at ${ctx.company}`;
  const project = projectLine(ctx, "I recently worked on");

  const full = lines([
    `Hi ${ctx.personFirstName},`,
    ``,
    `${ctx.intro} I'm not writing to ask for anything — just to learn from someone close to ${workArea(ctx)} at ${ctx.company}.`,
    ``,
    `${project ? `${project} ` : ""}It left me curious: what is the hardest trade-off your team is working through right now?`,
    ``,
    `Totally understand if you don't have time to reply.`,
    ``,
    `Best,`,
    ctx.candidateFirstName,
  ]);

  const concise = `Hi ${ctx.personFirstName} — not asking for anything.${ctx.projectClaim ? ` After working on ${ctx.projectClaim}, I got curious:` : ""} what is the hardest trade-off your team is working through on ${workArea(ctx)} right now? Understand if you're too busy. — ${ctx.candidateFirstName}`;

  return {
    objective: `Ask one open question about the team's work — no referral, interview, or application ask. Sharpen the question before sending.`,
    subject,
    full,
    concise,
  };
}

/** Fallback for a contact whose role doesn't map cleanly — soft networking. */
export function buildNetworkingCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `Interested in ${workArea(ctx)} at ${ctx.company}`;
  const project = projectLine(ctx, "Most recently I worked on:");

  const full = lines([
    `Hi ${ctx.personFirstName},`,
    ``,
    `${ctx.intro} I'm interested in the ${ctx.jobTitle} role, and I'm trying to learn from people closer to ${ctx.company}'s work.`,
    ``,
    project,
    project ? `` : undefined,
    `If you have a few minutes sometime, I'd value any perspective you're willing to share about the team and the kind of work it does. No pressure at all.`,
    ``,
    `Thanks,`,
    ctx.candidateFirstName,
  ]);

  const concise = `Hi ${ctx.personFirstName} — I'm interested in the ${ctx.jobTitle} role at ${ctx.company}.${ctx.projectClaim ? ` I recently worked on ${ctx.projectClaim}.` : ""} I'd value any perspective you're willing to share about the team's work. No pressure. — ${ctx.candidateFirstName}`;

  return {
    objective: `Open a low-pressure networking conversation and learn about the team's work.`,
    subject,
    full,
    concise,
  };
}

/* ------------------------------------------------------------------ */
/* Risk scanner (§5.14) — flags the patterns messages must avoid       */
/* ------------------------------------------------------------------ */

const RISK_CHECKS: Array<[RegExp, string]> = [
  [
    /\b(as you know|we both know|you and i both|like you,? i|as a friend|we go way back)\b/i,
    "Possible fake familiarity — verify any claimed closeness is real before sending.",
  ],
  [
    /\b(huge fan|biggest fan|admire your|amazing|incredible|revolutionary|world-class|genius|deeply honored)\b/i,
    "Possible exaggerated admiration — keep praise specific, restrained, and true.",
  ],
  [
    /\b(great company|love your work|impressive work|awesome team|amazing team|big fan of)\b/i,
    "Possible generic praise — replace with a concrete, specific reference.",
  ],
  [
    /\b(refer me|referral to|get me an interview|hire me|guarantee me|forward my resume to the hiring)\b/i,
    "Contains an early/aggressive ask — soften to a low-pressure request.",
  ],
  [
    /\b(we share a passion|our shared love|we both love|as fellow enthusiasts)\b/i,
    "Possible fabricated shared interest — only reference commonalities backed by a real signal.",
  ],
];

const MAX_BODY_CHARS = 900;

/** Scans produced copy for the patterns §5.14 says outreach must avoid. */
export function scanMessageRisks(copy: OutreachCopy): string[] {
  const warnings: string[] = [];
  const text = `${copy.subject}\n${copy.full}\n${copy.concise}`;
  for (const [re, msg] of RISK_CHECKS) {
    if (re.test(text)) warnings.push(msg);
  }
  if (copy.full.length > MAX_BODY_CHARS) {
    warnings.push("Message body is long — trim it to respect the reader's time.");
  }
  return warnings;
}

/* ------------------------------------------------------------------ */
/* Shared derivations                                                  */
/* ------------------------------------------------------------------ */

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Personalization facts drawn from the Person's connection/commonality plus a
 * referenced Candidate evidence claim. Inferred commonalities are labeled.
 */
export function buildPersonalizationFacts(
  person: Person,
  candidate: Candidate,
  primaryEvidenceClaim: string | undefined,
): string[] {
  const facts: string[] = [person.connection];
  if (person.commonality) {
    // A sourced PROFILE (trust "source-backed") does not make an OVERLAP
    // confirmed: when the commonality came from warmth scoring it is always an
    // inference, whatever the profile's own trust label says.
    const confirmed =
      !person.warmth &&
      (person.trust === "verified" || person.trust === "source-backed");
    facts.push(`${person.commonality}${confirmed ? "" : " (inferred — not confirmed)"}`);
  }
  if (primaryEvidenceClaim) {
    facts.push(`Candidate evidence referenced: ${primaryEvidenceClaim}`);
  }
  facts.push(`Candidate at ${candidate.university}, graduating ${candidate.graduationYear}`);
  return facts;
}

/** Role/relationship assumptions that must be verified before relying on them. */
export function buildClaimsToVerify(person: Person): string[] {
  const claims: string[] = [];
  const trusted = person.trust === "verified" || person.trust === "user-provided";
  if (!trusted) {
    claims.push(
      `Role inference "${person.inferredRole}" is unconfirmed (${person.trust}, confidence ${person.confidence}) — verify before relying on it.`,
    );
  }
  if (
    person.commonality &&
    // Same rule as above: warmth-derived common ground is always an inference.
    (person.warmth ||
      (person.trust !== "verified" && person.trust !== "source-backed"))
  ) {
    claims.push(
      `Shared-background point ("${person.commonality}") is inferred from public signals, not confirmed.`,
    );
  }
  return claims;
}
