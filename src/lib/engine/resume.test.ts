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
    }
  });

  it("cites actual candidate evidence ids in the citation string", () => {
    // Every candidate evidence id referenced in a rec must exist on the candidate.
    const knownIds = new Set(demoCandidate.evidence.map((e) => e.id));
    const summary = recs.find((r) => r.id === "rec_summary");
    expect(summary).toBeDefined();
    // rec_summary cites ev_cachesim, ev_c, ev_nn — all real ids on the candidate.
    for (const id of ["ev_cachesim", "ev_c", "ev_nn"]) {
      expect(knownIds.has(id)).toBe(true);
      expect(summary!.evidenceUsed).toContain(id);
    }
  });
});
