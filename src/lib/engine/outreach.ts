import type { Candidate, Job, Person, OutreachMessage } from "@/lib/types";
import { LEVEL_RANK, matchSkill } from "@/lib/engine/skills";
import {
  type OutreachRole,
  type OutreachContext,
  type OutreachCopy,
  buildAlumnusCopy,
  buildRecruiterCopy,
  buildManagerCopy,
  buildNetworkingCopy,
  buildPersonalizationFacts,
  buildClaimsToVerify,
  scanMessageRisks,
  recommendedSendTime,
  firstNameOf,
  FOLLOW_UP,
} from "@/lib/demo/outreach";

/**
 * Outreach message engine (build directive §5.13, §5.14).
 *
 * The objective ADAPTS to the person's inferred role:
 *   - alumnus        → informational chat + soft referral-path question
 *   - recruiter      → express role interest + ask about the process
 *   - likely-manager → one thoughtful, specific question (no aggressive ask)
 *
 * Fully DETERMINISTIC: no Math.random, no `new Date`. Timing is emitted as
 * relative strings ("+5 business days", weekday windows). Every message is
 * scanned for the risky patterns §5.14 forbids and flags them in `warnings`.
 */

/* ------------------------------------------------------------------ */
/* Role classification                                                 */
/* ------------------------------------------------------------------ */

/** Maps a Person's inferred role/title/connection to an outreach role. */
export function classifyOutreachRole(person: Person): OutreachRole {
  const hay = `${person.inferredRole} ${person.title} ${person.connection}`.toLowerCase();
  if (/recruit/.test(hay)) return "recruiter";
  if (/manager|managing|hiring manager|director|head of|vp |vice president/.test(hay)) {
    return "likely-manager";
  }
  if (/alum|alumni|alumnus|same university|university as candidate|classmate/.test(hay)) {
    return "alumnus";
  }
  return "networking";
}

/** Channel choice per role, deterministic. */
function channelForRole(role: OutreachRole): "email" | "linkedin" {
  return role === "recruiter" ? "email" : "linkedin";
}

/* ------------------------------------------------------------------ */
/* Context + evidence resolution                                       */
/* ------------------------------------------------------------------ */

type ResolvedOutreachEvidence = {
  project?: Candidate["evidence"][number];
  c?: Candidate["evidence"][number];
  os?: Candidate["evidence"][number];
};

function resolveEvidence(
  candidate: Candidate,
  skillKey: string,
  preferredCategory: Candidate["evidence"][number]["category"],
): Candidate["evidence"][number] | undefined {
  const supportingIds = new Set(matchSkill(skillKey, candidate).supportingEvidenceIds);
  return [...candidate.evidence]
    .filter((evidence) => supportingIds.has(evidence.id))
    .sort((left, right) => {
      const leftCategory = left.category === preferredCategory ? 1 : 0;
      const rightCategory = right.category === preferredCategory ? 1 : 0;
      if (leftCategory !== rightCategory) return rightCategory - leftCategory;
      if (left.publicProof !== right.publicProof) return left.publicProof ? -1 : 1;
      return LEVEL_RANK[right.strength] - LEVEL_RANK[left.strength];
    })[0];
}

/** One sentence of self-introduction, from the candidate's own profile only. */
function introFor(candidate: Candidate): string {
  const headline = candidate.headline.trim();
  if (headline) return `I'm ${firstNameOf(candidate.name)}, ${headline.replace(/\.$/, "")}.`;
  const degree = candidate.degree.trim();
  const university = candidate.university.trim();
  if (degree && university) {
    return `I'm ${firstNameOf(candidate.name)}; I studied ${degree} at ${university}.`;
  }
  return `I'm ${firstNameOf(candidate.name)}.`;
}

/**
 * When none of the job-keyed skills resolve, fall back to the strongest thing
 * the candidate actually recorded, never to a description of a background.
 */
function strongestEvidence(
  candidate: Candidate,
): Candidate["evidence"][number] | undefined {
  return [...candidate.evidence]
    .filter((item) => item.trust !== "weak-inference" && item.trust !== "unknown")
    .sort((left, right) => {
      if (left.publicProof !== right.publicProof) return left.publicProof ? -1 : 1;
      return LEVEL_RANK[right.strength] - LEVEL_RANK[left.strength];
    })[0];
}

function resolveContext(candidate: Candidate, job: Job, person: Person): {
  ctx: OutreachContext;
  evidence: ResolvedOutreachEvidence;
} {
  const evidence: ResolvedOutreachEvidence = {
    // The draft and its `evidenceUsed` list read the same slot, so they agree.
    project:
      resolveEvidence(candidate, "systems_debug", "project") ??
      strongestEvidence(candidate),
    c: resolveEvidence(candidate, "c_cpp", "skill"),
    os: resolveEvidence(candidate, "os_arch", "education"),
  };

  const ctx: OutreachContext = {
    candidateFirstName: firstNameOf(candidate.name),
    candidateFullName: candidate.name,
    university: candidate.university,
    personFirstName: firstNameOf(person.name),
    jobTitle: job.title,
    company: job.company,
    team: job.team,
    intro: introFor(candidate),
    projectClaim: evidence.project?.claim,
    supportingClaims: [
      ...new Set(
        [evidence.c, evidence.os]
          .filter((item): item is Candidate["evidence"][number] => Boolean(item))
          .map((item) => item.claim),
      ),
    ],
    workAuth: candidate.workAuthorization,
  };
  return { ctx, evidence };
}

function copyForRole(role: OutreachRole, ctx: OutreachContext): OutreachCopy {
  switch (role) {
    case "alumnus":
      return buildAlumnusCopy(ctx);
    case "recruiter":
      return buildRecruiterCopy(ctx);
    case "likely-manager":
      return buildManagerCopy(ctx);
    default:
      return buildNetworkingCopy(ctx);
  }
}

/** Which candidate evidence claims each role's copy actually references. */
function evidenceUsedForRole(
  role: OutreachRole,
  evidence: ResolvedOutreachEvidence,
): string[] {
  const selected =
    role === "recruiter"
      ? [evidence.c, evidence.project, evidence.os]
      : role === "likely-manager"
        ? [evidence.project]
        : [evidence.project, evidence.c];
  return [
    ...new Set(
      selected
        .filter((item): item is Candidate["evidence"][number] => Boolean(item))
        .map((item) => item.claim),
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function generateOutreach(input: {
  candidate: Candidate;
  job: Job;
  person: Person;
}): OutreachMessage {
  const { candidate, job, person } = input;
  const role = classifyOutreachRole(person);
  const channel = channelForRole(role);
  const { ctx, evidence } = resolveContext(candidate, job, person);

  const copy = copyForRole(role, ctx);

  // Warnings: scanner findings + relationship-confidence caution, deduped.
  const warnings = scanMessageRisks(copy);
  if (person.trust === "weak-inference" || person.confidence === "low") {
    warnings.push(
      `Relationship/role is a weak inference (${person.trust}, confidence ${person.confidence}), keep every claim tentative and verify before acting.`,
    );
  }

  /**
   * Live-enrichment extras. Both are optional and absent in demo mode, so this
   * block is a no-op there and the message is byte-identical to before.
   */
  const personalizationFacts = buildPersonalizationFacts(
    person,
    candidate,
    ctx.projectClaim,
  );
  // Recent public posts are genuine, citable personalization material.
  for (const activity of person.recentActivity ?? []) {
    personalizationFacts.push(`From their recent LinkedIn post: "${activity}"`);
  }

  const claimsToVerify = buildClaimsToVerify(person);
  if (person.email) {
    // The provider checked that the mailbox answers. That is NOT confirmation
    // that it belongs to this person or that they read it, so it goes in the
    // verify list every time, never presented as a verified address.
    claimsToVerify.push(
      `Email address "${person.email.address}" was ${person.email.status}. Confirm it is the right person before sending.`,
    );
  }
  if ((person.recentActivity?.length ?? 0) > 0) {
    claimsToVerify.push(
      "Post excerpts are quoted from their public LinkedIn activity, re-read the original before referencing it, in case the excerpt lost context.",
    );
  }

  return {
    id: `outreach_${person.id}`,
    personId: person.id,
    objective: copy.objective,
    channel,
    subject: copy.subject,
    full: copy.full,
    concise: copy.concise,
    personalizationFacts,
    evidenceUsed: evidenceUsedForRole(role, evidence),
    claimsToVerify,
    recommendedSendTime: recommendedSendTime(channel),
    followUpDate: FOLLOW_UP,
    warnings: Array.from(new Set(warnings)),
  };
}

export function generateAllOutreach(
  candidate: Candidate,
  job: Job,
  people: Person[],
): OutreachMessage[] {
  return people.map((person) => generateOutreach({ candidate, job, person }));
}
