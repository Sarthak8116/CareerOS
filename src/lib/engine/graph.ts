import type {
  Candidate,
  CompanyIntel,
  GraphEdge,
  GraphNode,
  Job,
  OpportunityGraph,
  Person,
  TrustLabel,
} from "@/lib/types";
import { matchSkill } from "@/lib/engine/skills";

/**
 * Opportunity graph builder (§5.12).
 *
 * Turns a campaign's candidate + job + people (+ optional company intel) into a
 * small, honest graph that answers three questions:
 *   1. Who should I contact first?          -> candidate "should contact" edge
 *   2. What's the warmest path in?           -> `warmestPath` (alumni route)
 *   3. Which of my evidence supports the role? -> candidate/project "demonstrates"
 *                                               + job "requires"/"prefers" a skill
 *
 * Design rules (§15, §16, §20 reliability):
 *  - Deterministic: no Math.random, no Date. Same input -> same graph.
 *  - Honest trust: inferred relationships (team membership, alumni connection)
 *    carry inference trust labels; only user- or source-provided facts are
 *    labeled as such. Nothing inferred is presented as confirmed.
 *
 * ---------------------------------------------------------------------------
 * NODE-ID SCHEME (stable; the UI references these, esp. for warmestPath)
 * ---------------------------------------------------------------------------
 *   candidate   candidate.id                       e.g. "cand_ave"
 *   job         job.id                             e.g. "job_nvidia_syssw"
 *   company     `company_${slug(company)}`         e.g. "company_nvidia"
 *   team        `team_${job.id}`                   e.g. "team_job_nvidia_syssw"
 *   university  `university_${slug(university)}`    e.g. "university_university_of_illinois_urbana_champaign"
 *   person      person.id                          e.g. "person_alum"
 *   skill       `skill_${skillKey}`                e.g. "skill_c_cpp"
 *   project     `project_${evidence.id}`           e.g. "project_ev_cachesim"
 *
 * Edge ids: `e_${source}__${relSlug}__${target}` (deterministic + unique).
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Rank warmth so the warmest live contact wins the path. Higher is warmer. */
const WARMTH_RANK: Record<NonNullable<Person["warmth"]>["level"], number> = {
  strong: 3,
  moderate: 2,
  limited: 1,
  none: 0,
};

/**
 * Edge wording per overlap kind. Each names WHAT is shared, never "knows" or
 * "is connected to", which the data does not support.
 */
const WARMTH_EDGE_LABEL: Record<
  NonNullable<Person["warmth"]>["signals"][number]["kind"],
  string
> = {
  "same-school": "shares a school with",
  "same-past-employer": "shares a former employer with",
  "same-city": "is in the same city as",
  "shared-skill": "shares skills with",
};

/** Rank trust labels so we can pick the strongest supporting evidence. */
const TRUST_RANK: Record<TrustLabel, number> = {
  verified: 5,
  "source-backed": 4,
  "user-provided": 3,
  "strong-inference": 2,
  "weak-inference": 1,
  unknown: 0,
};

/** Readable labels for canonical skill keys (falls back to the key). */
const SKILL_LABELS: Record<string, string> = {
  c_cpp: "C / C++",
  os_arch: "Operating Systems & Architecture",
  systems_debug: "Low-level Debugging",
  cuda: "GPU / CUDA",
  python: "Python",
  parallel: "Parallel & Performance",
  degree: "CS / CE / EE Degree",
  backend_api: "Backend & APIs",
  shipping: "Shipped to Real Users",
  ml_basics: "ML Fundamentals",
  devops: "Docker / CI / Cloud",
  communication: "Written Communication",
};

/** Short labels for project evidence (falls back to the full claim). */
const PROJECT_LABELS: Record<string, string> = {
  ev_cachesim: "CPU Cache Simulator",
  ev_nn: "Neural-Net Training Library",
};

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function buildOpportunityGraph(input: {
  candidate: Candidate;
  job: Job;
  people: Person[];
  company?: CompanyIntel;
}): OpportunityGraph {
  const { candidate, job, people, company } = input;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  const addNode = (node: GraphNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const addEdge = (
    source: string,
    target: string,
    relationship: string,
    trust: TrustLabel,
  ) => {
    const id = `e_${source}__${slug(relationship)}__${target}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target, relationship, trust });
  };

  /* ---- Core entity node ids ---- */
  const candidateId = candidate.id;
  const jobId = job.id;
  const companyName = company?.company ?? job.company;
  const companyId = `company_${slug(companyName)}`;
  const teamId = `team_${job.id}`;
  const universityId = `university_${slug(candidate.university)}`;
  const skillNodeId = (skillKey: string) => `skill_${skillKey}`;
  const projectNodeId = (evidenceId: string) => `project_${evidenceId}`;

  /* ---- Core nodes ---- */
  addNode({
    id: candidateId,
    type: "candidate",
    label: candidate.name,
    sublabel: candidate.headline,
    trust: "user-provided",
  });
  addNode({
    id: jobId,
    type: "job",
    label: job.title,
    sublabel: `${job.company} · ${job.location}`,
    trust: "source-backed",
  });
  addNode({
    id: companyId,
    type: "company",
    label: companyName,
    sublabel: company?.description ?? job.company,
    trust: "source-backed",
  });
  addNode({
    id: teamId,
    type: "team",
    label: job.team ?? `${job.company} team`,
    sublabel: company?.relevantOrg,
    trust: job.team ? "source-backed" : "strong-inference",
  });
  addNode({
    id: universityId,
    type: "university",
    label: candidate.university,
    sublabel: `${candidate.degree} · ${candidate.graduationYear}`,
    trust: "user-provided",
  });

  /* ---- Skill nodes (canonical requirement skills, excluding degree) ---- */
  const skillKeys: string[] = [];
  for (const req of job.requirements) {
    const key = req.skillKey;
    if (!key || key === "degree") continue; // degree is captured by the university node
    if (skillKeys.includes(key)) continue;
    skillKeys.push(key);
    addNode({
      id: skillNodeId(key),
      type: "skill",
      label: SKILL_LABELS[key] ?? key,
      sublabel: req.kind === "minimum" ? "required" : "preferred",
      trust: "source-backed",
    });
  }

  /* ---- Project nodes (candidate evidence with category === "project") ---- */
  const projectEvidence = candidate.evidence.filter((e) => e.category === "project");
  for (const ev of projectEvidence) {
    addNode({
      id: projectNodeId(ev.id),
      type: "project",
      label: PROJECT_LABELS[ev.id] ?? ev.claim,
      sublabel: ev.sourceReference,
      trust: ev.trust,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Structural edges (who sits where)                                   */
  /* ------------------------------------------------------------------ */

  addEdge(candidateId, jobId, "is targeting", "user-provided");
  addEdge(jobId, companyId, "role at", "source-backed");
  addEdge(
    jobId,
    teamId,
    "within team",
    job.team ? "source-backed" : "strong-inference",
  );
  addEdge(teamId, companyId, "part of", job.team ? "source-backed" : "strong-inference");

  // candidate studied at university, a fact the user supplied.
  addEdge(candidateId, universityId, "studied at", "user-provided");

  /* ------------------------------------------------------------------ */
  /* Evidence edges (which evidence supports the role)                   */
  /* ------------------------------------------------------------------ */

  // Job -> skill: requires / prefers.
  for (const req of job.requirements) {
    const key = req.skillKey;
    if (!key || key === "degree") continue;
    addEdge(
      jobId,
      skillNodeId(key),
      req.kind === "minimum" ? "requires" : "prefers",
      "source-backed",
    );
  }

  // Candidate -> skill: demonstrates (or "interested in" when only weak signal).
  for (const key of skillKeys) {
    const supportIds = matchSkill(key, candidate).supportingEvidenceIds;
    if (supportIds.length === 0) continue; // no honest link, leave the gap visible

    const supporting = candidate.evidence.filter((e) => supportIds.includes(e.id));
    const best = supporting.reduce((a, b) =>
      TRUST_RANK[b.trust] > TRUST_RANK[a.trust] ? b : a,
    );
    // Real demonstrable skill vs. mere expressed interest.
    const isDemonstrated = TRUST_RANK[best.trust] >= TRUST_RANK["user-provided"];
    addEdge(
      candidateId,
      skillNodeId(key),
      isDemonstrated ? "demonstrates" : "interested in",
      best.trust,
    );
  }

  // Candidate -> project (built it); project -> skill (matches requirement).
  for (const ev of projectEvidence) {
    addEdge(candidateId, projectNodeId(ev.id), "built", ev.trust);
    for (const key of skillKeys) {
      if (!matchSkill(key, candidate).supportingEvidenceIds.includes(ev.id)) continue;
      addEdge(projectNodeId(ev.id), skillNodeId(key), "matches", "source-backed");
    }
  }

  /* ------------------------------------------------------------------ */
  /* People edges (who to contact, and how warm the path is)             */
  /* ------------------------------------------------------------------ */

  // Detect the alumni connection (shared university), heuristic, honestly labeled.
  const isAlumnusOf = (p: Person) =>
    /alumn/i.test(p.connection) ||
    /univers|alma\s*mater/i.test(`${p.connection} ${p.commonality ?? ""}`);

  /**
   * Pick the warmest contact.
   *
   * When live contacts carry overlap-scored `warmth`, use the highest-scoring
   * one, that is a measured overlap rather than a regex guess. With no warmth
   * data (demo mode, or a live run without enrichment) this falls back to the
   * original alumni heuristic, so existing behavior is untouched.
   */
  const scored = people.filter((p) => p.warmth && p.warmth.level !== "none");
  const warmest =
    scored.length > 0
      ? scored.reduce((a, b) =>
          WARMTH_RANK[b.warmth!.level] > WARMTH_RANK[a.warmth!.level] ? b : a,
        )
      : undefined;

  const alumnus =
    warmest ??
    people.find(isAlumnusOf) ??
    people.find((p) => p.trust === "strong-inference") ??
    people[0];

  const firstContact =
    people.find((p) => p.outreachPriority === "first") ??
    people.find((p) => p.outreachPriority === "high") ??
    people[0];

  for (const p of people) {
    addNode({
      id: p.id,
      type: "person",
      label: p.name,
      sublabel: p.title,
      trust: p.trust,
    });

    // person -> company: works at (trust exactly as scouted).
    addEdge(p.id, companyId, "works at", p.trust);

    // person -> team OR job, depending on their inferred role.
    if (/recruit/i.test(p.title)) {
      addEdge(p.id, jobId, "recruits for", p.trust);
    } else if (/manager|director|head|lead/i.test(p.title)) {
      addEdge(p.id, teamId, "may manage", p.trust);
    } else {
      addEdge(p.id, teamId, "likely on", p.trust);
    }

    // The warmest contact shares something with the candidate, still an
    // inference, and the edge names WHAT is shared rather than implying a tie.
    if (alumnus && p.id === alumnus.id) {
      const topSignal = p.warmth?.signals[0];
      if (!topSignal || topSignal.kind === "same-school") {
        // Only claim the university hop when a school is actually shared.
        addEdge(p.id, universityId, "alumnus of", "strong-inference");
      }
      addEdge(
        candidateId,
        p.id,
        topSignal ? WARMTH_EDGE_LABEL[topSignal.kind] : "shares affiliation with",
        topSignal?.trust ?? "strong-inference",
      );
    }
  }

  // Candidate -> first contact: the recommended opening move.
  if (firstContact) {
    addEdge(candidateId, firstContact.id, "should contact first", "strong-inference");
  }

  /* ------------------------------------------------------------------ */
  /* Warmest path into the team.                                         */
  /*                                                                      */
  /* Routes through the university only when a school is genuinely shared  */
  /*, otherwise the hop would assert a link that does not exist:          */
  /*   shared school: [candidate -> university -> person -> team -> job]   */
  /*   other overlap: [candidate -> person -> team -> job]                 */
  /* ------------------------------------------------------------------ */

  const topSignalKind = alumnus?.warmth?.signals[0]?.kind;
  const viaUniversity = !topSignalKind || topSignalKind === "same-school";

  const warmestPath: string[] = [candidateId];
  if (viaUniversity) warmestPath.push(universityId);
  if (alumnus) warmestPath.push(alumnus.id);
  warmestPath.push(teamId, jobId);

  return { nodes, edges, warmestPath };
}
