import { describe, it, expect } from "vitest";
import { matchSkill, matchAll, LEVEL_RANK } from "@/lib/engine/skills";
import { demoCandidate } from "@/lib/demo/candidate";

/**
 * matchSkill is deterministic and evidence-grounded: it must resolve each
 * canonical skillKey to the candidate's real evidence rows, never invent
 * experience. Evidence ids are opaque: matching must survive imports that
 * assign completely different ids to the same recorded claims.
 */

describe("matchSkill (demoCandidate)", () => {
  it("resolves python to a strong, high-confidence, source-backed match", () => {
    const m = matchSkill("python", demoCandidate);
    expect(m.skillKey).toBe("python");
    expect(m.level).toBe("strong");
    expect(m.confidence).toBe("high");
    // ev_py is the only supporting row and it exists on the candidate.
    expect(m.supportingEvidenceIds).toEqual(["ev_py", "ev_oss"]);
    const ids = demoCandidate.evidence.map((e) => e.id);
    for (const id of m.supportingEvidenceIds) expect(ids).toContain(id);
  });

  it("resolves cuda to a limited, low-confidence match (interest only, no proof)", () => {
    const m = matchSkill("cuda", demoCandidate);
    expect(m.level).toBe("limited");
    expect(LEVEL_RANK[m.level]).toBeLessThanOrEqual(1); // none/limited band
    expect(m.confidence).toBe("low");
    // Backed only by the weak-inference GPU-interest row.
    expect(m.supportingEvidenceIds).toEqual(["ev_gpu"]);
  });

  it("resolves degree to a strong, high-confidence profile-verified match", () => {
    const m = matchSkill("degree", demoCandidate);
    expect(m.level).toBe("strong");
    expect(m.confidence).toBe("high");
    // Degree is verified from the profile, not an evidence row.
    expect(m.supportingEvidenceIds).toEqual([]);
    expect(m.note).toContain(demoCandidate.degree);
  });

  it("returns a none/low match with no evidence for an unknown skillKey", () => {
    const m = matchSkill("rust", demoCandidate);
    expect(m.level).toBe("none");
    expect(m.confidence).toBe("low");
    expect(m.supportingEvidenceIds).toEqual([]);
  });

  it("only ever cites evidence ids that exist on the candidate", () => {
    const ids = new Set(demoCandidate.evidence.map((e) => e.id));
    const all = matchAll(["python", "cuda", "c_cpp", "systems_debug"], demoCandidate);
    for (const m of Object.values(all)) {
      for (const id of m.supportingEvidenceIds) expect(ids.has(id)).toBe(true);
    }
  });

  it("matches imported evidence by its claim, not by demo-specific ids", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: demoCandidate.evidence.map((evidence, index) => ({
        ...evidence,
        id: `imported_${index}`,
      })),
    };

    expect(matchSkill("python", imported).supportingEvidenceIds).toEqual([
      "imported_0",
      "imported_11",
    ]);
    expect(matchSkill("systems_debug", imported).supportingEvidenceIds).toEqual([
      "imported_1",
      "imported_3",
    ]);
    expect(matchSkill("cuda", imported).supportingEvidenceIds).toEqual([
      "imported_8",
    ]);
  });
});
