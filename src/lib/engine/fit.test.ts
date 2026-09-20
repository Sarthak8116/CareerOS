import { describe, it, expect } from "vitest";
import { computeFit, computeReadiness } from "@/lib/engine/fit";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

const LEVELS = ["strong", "moderate", "limited", "none"] as const;

/**
 * computeFit must return the six categorical fit dimensions (§5.3, §5.7), one
 * per FitCategory, each a Level + confidence + a plain-language explanation the
 * user can inspect. No single mystery score, no fake percentages.
 */

describe("computeFit (demoCandidate x demoJob x demoPeople)", () => {
  const fit = computeFit(demoCandidate, demoJob, demoPeople);

  it("returns exactly six dimensions covering every fit category", () => {
    expect(fit).toHaveLength(6);
    const categories = fit.map((f) => f.category);
    expect(new Set(categories)).toEqual(
      new Set(["role", "evidence", "preference", "network", "urgency", "improvement"]),
    );
  });

  it("gives every dimension a valid Level and a non-empty explanation", () => {
    for (const dim of fit) {
      expect(LEVELS).toContain(dim.level);
      expect(["high", "medium", "low"]).toContain(dim.confidence);
      expect(dim.explanation.trim().length).toBeGreaterThan(0);
      expect(dim.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("rates role fit above none (candidate meets the minimum bar)", () => {
    const role = fit.find((f) => f.category === "role");
    expect(role).toBeDefined();
    expect(role!.level).not.toBe("none");
  });
});

describe("computeReadiness", () => {
  it("derives a valid categorical Level from the fit dimensions", () => {
    const fit = computeFit(demoCandidate, demoJob, demoPeople);
    const readiness = computeReadiness(fit);
    expect(LEVELS).toContain(readiness);
  });
});
