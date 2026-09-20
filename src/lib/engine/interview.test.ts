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

describe("interview prep for a candidate who is not the demo persona", () => {
  it("never serves the demo bank's biography, and asks about THIS posting", async () => {
    const { getInterviewQuestions } = await import("@/lib/engine/interview");
    const { demoCandidate } = await import("@/lib/demo/candidate");
    const { demoJob } = await import("@/lib/demo/job");
    const designer = {
      ...demoCandidate,
      id: "cand_designer",
      evidence: [
        {
          id: "ev_d1",
          claim: "Strong programming work in C on an embedded flight controller",
          category: "project" as const,
          sourceType: "github" as const,
          sourceReference: "github.com/example/fc",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: true,
          trust: "source-backed" as const,
        },
      ],
    };
    const questions = getInterviewQuestions(designer, demoJob);
    expect(questions.length).toBeGreaterThan(2);
    const text = JSON.stringify(questions);
    expect(text).not.toMatch(/cache simulator|neural-mini|CS undergrad|ev_cachesim|ev_nn/i);
    expect(questions.some((q) => q.category === "role-specific")).toBe(true);
    for (const q of questions) {
      for (const ref of q.evidenceToUse) expect(ref.startsWith("ev_d1")).toBe(true);
    }
    // The demo candidate still gets the curated bank.
    expect(JSON.stringify(getInterviewQuestions(demoCandidate, demoJob))).toMatch(/ev_cachesim/);
  });
});
