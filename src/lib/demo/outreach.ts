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
  personFirstName: string;
  jobTitle: string;
  company: string;
  team?: string;
  /** Candidate evidence claims, already resolved from the evidence graph. */
  projectClaim: string; // cache simulator
  cClaim: string; // systems C
  osClaim: string; // OS / architecture coursework
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
 * Alumnus → informational chat + a SOFT question about the referral/consideration
 * path. No direct "refer me" ask.
 */
export function buildAlumnusCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `${ctx.university.includes("Illinois") ? "UIUC" : "Fellow"} student — quick question about ${ctx.team ?? "systems software"} at ${ctx.company}`;

  const full = [
    `Hi ${ctx.personFirstName},`,
    ``,
    `I'm a CS senior at ${ctx.university} heading toward a 2026 systems software internship. I came across your work on the ${ctx.team ?? "systems"} team, and as a fellow ${ctx.university} grad from the systems track I'd value your perspective.`,
    ``,
      `To go deeper than coursework I've been building low-level projects — most recently: ${ctx.projectClaim}. ${ctx.company}'s work at the hardware/software boundary is exactly where I want to grow.`,
    ``,
    `Would you be open to a short 15-minute chat about your experience on the team? If it feels useful, I'd also appreciate any pointers on how internship candidates are typically considered. Completely understand if you're heads-down.`,
    ``,
    `Thanks for reading,`,
    ctx.candidateFirstName,
  ].join("\n");

  const concise = `Hi ${ctx.personFirstName} — I'm a ${ctx.university.includes("Illinois") ? "UIUC" : ctx.university} CS senior on the same systems track, aiming for a 2026 systems internship. I recently worked on ${ctx.projectClaim}, and the ${ctx.team ?? "systems software"} work at ${ctx.company} is exactly where I want to grow. Would you be open to a quick 15-min chat about your experience there, and how interns are typically considered? Thanks either way. — ${ctx.candidateFirstName}`;

  return {
    objective: `Request a brief informational chat with a fellow alum on the team, and softly learn the internship-consideration path — no direct referral ask.`,
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
  const subject = `${ctx.jobTitle} (2026) — interested ${ctx.university.includes("Illinois") ? "UIUC" : ""} candidate`.replace(/\s+/g, " ").trim();

  const full = [
    `Hi ${ctx.personFirstName},`,
    ``,
    `I saw your posts about ${ctx.company}'s engineering internships and wanted to reach out directly. I'm a CS senior at ${ctx.university} targeting the ${ctx.jobTitle} role for 2026.`,
    ``,
      `My background lines up with the core requirements: ${ctx.cClaim}; ${ctx.osClaim}. On work authorization: ${ctx.workAuth}.`,
    ``,
    `Could you point me to the best way to make sure my application is considered, and share the rough timeline for this requisition? Happy to send my resume and GitHub.`,
    ``,
    `Thank you,`,
    ctx.candidateFullName,
  ].join("\n");

  const concise = `Hi ${ctx.personFirstName} — I'm a ${ctx.university.includes("Illinois") ? "UIUC" : ctx.university} CS senior applying for the 2026 ${ctx.jobTitle} role. My evidence includes ${ctx.cClaim} and ${ctx.osClaim} (${ctx.workAuth}). Could you share the best way to get my application considered and the rough timeline? Happy to send resume + GitHub. Thanks! — ${ctx.candidateFirstName}`;

  return {
    objective: `Express specific interest in the ${ctx.jobTitle} role and ask the recruiter about the application path and timeline.`,
    subject,
    full,
    concise,
  };
}

/**
 * Likely-manager → ONE thoughtful, specific question about the team's work.
 * Explicitly not asking for a referral, an interview, or application help.
 */
export function buildManagerCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `A question about ${ctx.team ?? "systems software"} from a ${ctx.university.includes("Illinois") ? "UIUC" : ""} student`.replace(/\s+/g, " ").trim();

  const full = [
    `Hi ${ctx.personFirstName},`,
    ``,
    `I'm a CS senior at ${ctx.university} focused on low-level systems, and I follow the kind of ${ctx.team ?? "systems software"} work your org does. I'm not writing to ask for anything — just to learn from someone closer to it.`,
    ``,
      `I recently worked on ${ctx.projectClaim}. It left me curious: on the ${ctx.team ?? "runtime/driver"} side, how does your team weigh raw throughput against debuggability when designing systems-software abstractions?`,
    ``,
    `Totally understand if you don't have time to reply. Thanks for the work your team ships.`,
    ``,
    `Best,`,
    ctx.candidateFirstName,
  ].join("\n");

  const concise = `Hi ${ctx.personFirstName} — ${ctx.university.includes("Illinois") ? "UIUC" : ctx.university} CS senior focused on low-level systems here, not asking for anything. After working on ${ctx.projectClaim}, I got curious: on the ${ctx.team ?? "runtime"} side, how does your team weigh raw throughput against debuggability when designing systems-software abstractions? Understand if you're too busy. — ${ctx.candidateFirstName}`;

  return {
    objective: `Ask one thoughtful, specific question about the team's systems-software work — no referral, interview, or application ask.`,
    subject,
    full,
    concise,
  };
}

/** Fallback for a contact whose role doesn't map cleanly — soft networking. */
export function buildNetworkingCopy(ctx: OutreachContext): OutreachCopy {
  const subject = `${ctx.university.includes("Illinois") ? "UIUC" : ""} student interested in ${ctx.company}`.replace(/\s+/g, " ").trim();

  const full = [
    `Hi ${ctx.personFirstName},`,
    ``,
    `I'm a CS senior at ${ctx.university} working toward a 2026 systems software internship, and I'm trying to learn from people closer to ${ctx.company}'s work.`,
    ``,
      `I've been building low-level projects — most recently: ${ctx.projectClaim}. If you have a few minutes sometime, I'd value any perspective you're willing to share about the team and the kind of work it does. No pressure at all.`,
    ``,
    `Thanks,`,
    ctx.candidateFirstName,
  ].join("\n");

  const concise = `Hi ${ctx.personFirstName} — ${ctx.university.includes("Illinois") ? "UIUC" : ctx.university} CS senior aiming for a 2026 systems internship. I recently worked on ${ctx.projectClaim} and would value any perspective you're willing to share about ${ctx.company}'s work. No pressure. — ${ctx.candidateFirstName}`;

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
  primaryEvidenceClaim: string,
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
  facts.push(`Candidate evidence referenced: ${primaryEvidenceClaim}`);
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
