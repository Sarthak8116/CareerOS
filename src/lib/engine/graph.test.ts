import { describe, it, expect } from "vitest";
import { buildOpportunityGraph } from "@/lib/engine/graph";
import { getCompanyIntel } from "@/lib/engine/company";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

describe("buildOpportunityGraph", () => {
  const graph = buildOpportunityGraph({
    candidate: demoCandidate,
    job: demoJob,
    people: demoPeople,
    company: getCompanyIntel(demoJob),
  });

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  it("emits the core candidate, job, and company nodes", () => {
    const byType = (type: string) => graph.nodes.filter((n) => n.type === type);
    expect(byType("candidate").length).toBeGreaterThan(0);
    expect(byType("job").length).toBeGreaterThan(0);
    expect(byType("company").length).toBeGreaterThan(0);

    // The core entities use their source ids as node ids.
    expect(nodeIds.has(demoCandidate.id)).toBe(true);
    expect(nodeIds.has(demoJob.id)).toBe(true);
  });

  it("adds a node for every scouted person", () => {
    for (const p of demoPeople) {
      expect(nodeIds.has(p.id)).toBe(true);
    }
  });

  it("gives every node a unique id", () => {
    expect(nodeIds.size).toBe(graph.nodes.length);
  });

  it("has edges that only reference existing node ids", () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it("returns a non-empty warmest path whose ids all exist as nodes", () => {
    expect(Array.isArray(graph.warmestPath)).toBe(true);
    expect(graph.warmestPath.length).toBeGreaterThan(0);
    for (const id of graph.warmestPath) {
      expect(nodeIds.has(id)).toBe(true);
    }
    // The warmest path starts at the candidate and terminates at the job.
    expect(graph.warmestPath[0]).toBe(demoCandidate.id);
    expect(graph.warmestPath[graph.warmestPath.length - 1]).toBe(demoJob.id);
  });

  it("resolves skill edges for imported evidence ids", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      evidence: demoCandidate.evidence.map((evidence, index) => ({
        ...evidence,
        id: `imported_${index}`,
      })),
    };
    const importedGraph = buildOpportunityGraph({
      candidate: imported,
      job: demoJob,
      people: demoPeople,
      company: getCompanyIntel(demoJob),
    });

    expect(
      importedGraph.edges.some(
        (edge) => edge.source === imported.id && edge.target === "skill_systems_debug",
      ),
    ).toBe(true);
  });
});
