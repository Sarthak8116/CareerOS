import { describe, it, expect } from "vitest";
import { getCampaignProvider } from "@/lib/providers/ai";
import { buildOpportunityGraph } from "@/lib/engine/graph";
import { getCompanyIntel } from "@/lib/engine/company";
import { generateAllOutreach } from "@/lib/engine/outreach";
import { getInterviewQuestions } from "@/lib/engine/interview";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

/**
 * DEMO DRY RUN — exercises the full §19 demo script end to end through the real
 * engines (no browser, no store). Doubles as an integration test proving the
 * whole pipeline produces the intended content deterministically.
 */
describe("§19 demo flow — end to end", () => {
  it("Scene 1 — candidate profile has an evidence graph with public proof", () => {
    expect(demoCandidate.name).toBe("Ava Chen");
    expect(demoCandidate.evidence.length).toBeGreaterThanOrEqual(5);
    expect(demoCandidate.evidence.some((e) => e.publicProof)).toBe(true);
    expect(demoCandidate.links.github).toContain("avechen");
  });

  it("Scene 2 — the demo job is the NVIDIA systems role, pre-parsed", () => {
    expect(demoJob.company).toBe("NVIDIA");
    expect(demoJob.normalizedTitle).toMatch(/systems software/i);
    expect(demoJob.requirements.length).toBeGreaterThan(0);
  });

  it("Scenes 3–7 — Build My Campaign produces a full, grounded campaign", async () => {
    const c = await getCampaignProvider().buildCampaign({
      candidate: demoCandidate,
      job: demoJob,
      createdAt: "2026-07-14T00:00:00.000Z",
    });

    // Scene 3: visible multi-agent activity feed.
    expect(c.activity.length).toBeGreaterThanOrEqual(6);

    // Scene 4: six categorical fit dimensions; one true gap + one wording gap.
    expect(c.fit).toHaveLength(6);
    expect(c.gaps.filter((g) => g.classification === "true-skill-gap")).toHaveLength(1);
    expect(c.gaps.filter((g) => g.classification === "resume-wording-gap")).toHaveLength(1);

    // Scene 5: hiring network has a first-priority alumnus contact.
    const first = c.people.find((p) => p.outreachPriority === "first");
    expect(first).toBeDefined();
    expect(first!.connection.toLowerCase()).toContain("alumn");

    // Scene 7: the plan spans outreach, application, and interview.
    const categories = new Set(c.tasks.map((t) => t.category));
    expect(categories.has("outreach")).toBe(true);
    expect(categories.has("application")).toBe(true);
    expect(categories.has("interview")).toBe(true);
    expect(c.nextAction.trim().length).toBeGreaterThan(0);
  });

  it("Scene 5 — opportunity graph has a warmest path ending at the job", () => {
    const graph = buildOpportunityGraph({
      candidate: demoCandidate,
      job: demoJob,
      people: demoPeople,
      company: getCompanyIntel(demoJob),
    });
    expect(graph.nodes.length).toBeGreaterThan(5);
    expect(graph.warmestPath.length).toBeGreaterThan(1);
    // Every warmest-path id must be a real node.
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const id of graph.warmestPath) expect(nodeIds.has(id)).toBe(true);
    // Path ends at the job.
    expect(graph.warmestPath[graph.warmestPath.length - 1]).toBe(demoJob.id);
  });

  it("Scene 6 — outreach to the alumnus is evidence-backed", () => {
    const messages = generateAllOutreach(demoCandidate, demoJob, demoPeople);
    expect(messages.length).toBe(demoPeople.length);
    const alum = demoPeople.find((p) => p.outreachPriority === "first")!;
    const msg = messages.find((m) => m.personId === alum.id)!;
    expect(msg.subject.trim().length).toBeGreaterThan(0);
    expect(msg.evidenceUsed.length).toBeGreaterThan(0);
    expect(msg.full.trim().length).toBeGreaterThan(0);
  });

  it("Scene 8 — interview prep returns role-specific questions", () => {
    const qs = getInterviewQuestions(demoCandidate, demoJob);
    expect(qs.length).toBeGreaterThanOrEqual(6);
    expect(qs.some((q) => q.category === "technical" || q.category === "domain")).toBe(true);
    expect(qs.some((q) => q.category === "project-deep-dive")).toBe(true);
  });
});
