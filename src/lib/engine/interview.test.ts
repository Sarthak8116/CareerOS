import { describe, expect, it } from "vitest";
import { getInterviewQuestions } from "@/lib/engine/interview";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";

describe("getInterviewQuestions", () => {
  it("adds a project deep-dive grounded in imported evidence", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: [
        {
          ...demoCandidate.evidence[0],
          id: "real_project",
          category: "project" as const,
          claim: "Built a private data-processing tool in Python",
        },
      ],
    };

    const questions = getInterviewQuestions(imported, demoJob);
    const project = questions.find((question) => question.id === "q_candidate_project_1");

    expect(project?.prompt).toContain("private data-processing tool in Python");
    expect(project?.evidenceToUse).toEqual([
      "real_project — Built a private data-processing tool in Python",
    ]);
  });

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

  it("adds an honest prompt for the first weak role requirement", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: [],
    };

    const gapQuestion = getInterviewQuestions(imported, demoJob).find(
      (question) => question.id === "q_gap_req_c",
    );

    expect(gapQuestion?.prompt).toContain("Strong programming skills in C or C++");
    expect(gapQuestion?.answerHints[0]).toContain("not yet demonstrated");
    expect(gapQuestion?.evidenceToUse).toEqual([]);
  });
});
