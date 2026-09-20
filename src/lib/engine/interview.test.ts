import { describe, expect, it } from "vitest";
import { getInterviewQuestions } from "@/lib/engine/interview";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

describe("getInterviewQuestions", () => {
  it("never falls back to demo evidence ids for an imported profile", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: [
        {
          ...demoCandidate.evidence[0],
          id: "real_python",
          claim: "Built a private data-processing tool in Python",
        },
      ],
    };

    const questions = getInterviewQuestions(imported, demoJob);
    for (const question of questions) {
      for (const evidence of question.evidenceToUse) {
        expect(evidence).not.toMatch(/^ev_/);
      }
    }
  });
});
