import { describe, it, expect } from "vitest";
import { verifyClaims, getResumeRecommendations } from "@/lib/engine/resume";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

describe("verifyClaims", () => {
  const flags = verifyClaims(demoCandidate);

  it("flags the C++ coursework claim as weak evidence", () => {
    const cppClaim = demoCandidate.evidence.find((e) => e.id === "ev_cpp")!.claim;
    const cppFlag = flags.find((f) => f.text === cppClaim);
    expect(cppFlag).toBeDefined();
    expect(cppFlag!.issue).toBe("weak-evidence");
    expect(cppFlag!.severity).toBe("limited");
  });

  it("flags the GPU-interest claim as unsupported", () => {
    const gpuClaim = demoCandidate.evidence.find((e) => e.id === "ev_gpu")!.claim;
    const gpuFlag = flags.find((f) => f.text === gpuClaim);
    expect(gpuFlag).toBeDefined();
    expect(gpuFlag!.issue).toBe("unsupported");
    expect(gpuFlag!.severity).toBe("moderate");
  });

  it("does not fabricate flags on a clean, source-backed claim", () => {
    // ev_cachesim ("Built a CPU cache simulator…") is strong, public, and free
    // of vague wording — there is nothing to flag.
    const cacheClaim = demoCandidate.evidence.find((e) => e.id === "ev_cachesim")!.claim;
    expect(flags.some((f) => f.text === cacheClaim)).toBe(false);
  });

  it("flags vague wording ('proficient') even when the evidence is strong", () => {
    // The Python claim is source-backed, but "Proficient in…" is a vague
    // buzzword the claim-verifier should still surface (§5.8).
    const pyClaim = demoCandidate.evidence.find((e) => e.id === "ev_py")!.claim;
    const pyFlag = flags.find((f) => f.text === pyClaim);
    expect(pyFlag).toBeDefined();
    expect(pyFlag!.issue).toBe("vague-buzzword");
  });
});

describe("getResumeRecommendations", () => {
  const recs = getResumeRecommendations(demoCandidate, demoJob);

  it("returns a non-empty set of recommendations", () => {
    expect(recs.length).toBeGreaterThan(0);
  });

  it("traces every recommendation to real evidence and starts it pending", () => {
    for (const rec of recs) {
      expect(rec.status).toBe("pending");
      // evidenceUsed is a human-readable citation string — never empty.
      expect(typeof rec.evidenceUsed).toBe("string");
      expect(rec.evidenceUsed.trim().length).toBeGreaterThan(0);
      // A real recommendation also carries its rewrite and the requirement it addresses.
      expect(rec.suggested.trim().length).toBeGreaterThan(0);
      expect(rec.requirementAddressed.trim().length).toBeGreaterThan(0);
      // Before -> after, and they actually differ.
      expect(rec.original.trim().length).toBeGreaterThan(0);
      expect(rec.suggested).not.toBe(rec.original);
    }
  });

  it("addresses a requirement this job actually lists", () => {
    const listed = new Set(demoJob.requirements.map((r) => r.text));
    for (const rec of recs) expect(listed.has(rec.requirementAddressed)).toBe(true);
  });

  it("cites evidence ids that exist on the candidate it was given", () => {
    const knownIds = demoCandidate.evidence.map((e) => e.id);
    for (const rec of recs) {
      const cited = knownIds.filter((id) => rec.evidenceUsed.includes(`${id}:`));
      expect(cited.length).toBeGreaterThan(0);
    }
  });

  /**
   * THE REGRESSION THIS PHASE EXISTS FOR.
   *
   * The recommendations used to be a hardcoded bank of prose keyed to the demo
   * candidate's evidence ids, and `citeEvidence` degraded SILENTLY to raw ids
   * for anyone else — it did not fail, it emitted confident sentences about a
   * different person. The failure is invisible unless a test names a different
   * candidate and checks whose evidence came back.
   */
  it("for a DIFFERENT candidate, never cites the demo candidate's evidence", () => {
    const other = {
      ...demoCandidate,
      id: "cand_other",
      name: "Rosalind Ashgrove",
      evidence: [
        {
          id: "candidate_cache_project",
          claim: "Built a CPU cache simulator modeling associativity and replacement policies",
          category: "project" as const,
          sourceType: "github" as const,
          sourceReference: "github.com/rashgrove/cache-project",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: true,
          trust: "source-backed" as const,
        },
      ],
    };

    const otherRecs = getResumeRecommendations(other, demoJob);
    const otherIds = new Set(other.evidence.map((e) => e.id));

    // Without this guard, every assertion below passes vacuously when the
    // real-user path silently produces no recommendations.
    expect(otherRecs.length).toBeGreaterThan(0);

    for (const rec of otherRecs) {
      for (const demoId of demoCandidate.evidence.map((e) => e.id)) {
        expect(rec.evidenceUsed).not.toContain(demoId);
      }
      const cited = [...otherIds].filter((id) => rec.evidenceUsed.includes(`${id}:`));
      expect(cited.length).toBeGreaterThan(0);
      // The rewrite is built from that candidate's own claim, verbatim.
      expect(rec.suggested).toContain(other.evidence[0].claim);
    }
  });

  it("returns an empty list rather than prose when no evidence supports a rewrite", () => {
    const empty = { ...demoCandidate, id: "cand_empty", evidence: [] };
    expect(getResumeRecommendations(empty, demoJob)).toEqual([]);
  });

  it("adds no digit the cited evidence does not already contain", () => {
    for (const rec of recs) {
      const cited = demoCandidate.evidence.filter((e) =>
        rec.evidenceUsed.includes(`${e.id}:`),
      );
      const source = cited.map((e) => e.claim).join(" ");
      for (const run of rec.suggested.match(/\d+/g) ?? []) {
        expect(source).toContain(run);
      }
    }
  });

  it("never offers a rewrite built on weak-inference evidence", () => {
    // ev_gpu is a stated interest with no shipped artifact. verifyClaims calls
    // that unsupported, and the rewrite gate reuses it rather than a softer rule.
    for (const rec of recs) expect(rec.evidenceUsed).not.toContain("ev_gpu:");
  });

  it("applies a learned preference against merged bullets", () => {
    const styled = getResumeRecommendations(demoCandidate, demoJob, {
      proofLinks: "more",
      mergedBullets: "less",
    });
    const debug = styled.find((rec) => rec.id === "rec_req_debug");

    expect(debug).toBeDefined();
    expect(debug!.suggested).not.toContain("; ");
    expect(debug!.suggested).toContain("github.com/avechen/cachesim");
  });
});
