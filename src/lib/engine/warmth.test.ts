import { describe, it, expect } from "vitest";
import {
  candidateWarmthProfile,
  computeWarmth,
  type WarmthProfile,
} from "@/lib/engine/warmth";
import { demoCandidate } from "@/lib/demo/candidate";

const candidate: WarmthProfile = {
  schools: ["University of Illinois Urbana-Champaign"],
  employers: ["Intel Corporation"],
  city: "Urbana, Illinois",
  skills: ["C++", "Python"],
};

describe("computeWarmth", () => {
  it("returns none with nothing in common, and says so plainly", () => {
    const warmth = computeWarmth(candidate, {
      schools: ["Some Other College"],
      employers: ["Unrelated Co"],
      city: "Berlin",
      skills: ["Figma"],
    });
    expect(warmth.level).toBe("none");
    expect(warmth.signals).toHaveLength(0);
    expect(warmth.note).toMatch(/cold approach/i);
  });

  it("scores a shared school as moderate on its own", () => {
    const warmth = computeWarmth(candidate, {
      schools: ["University of Illinois at Urbana Champaign"],
      employers: [],
      skills: [],
    });
    expect(warmth.level).toBe("moderate");
    expect(warmth.signals[0].kind).toBe("same-school");
    expect(warmth.signals[0].trust).toBe("strong-inference");
  });

  it("scores a strong signal plus another overlap as strong", () => {
    const warmth = computeWarmth(candidate, {
      schools: ["University of Illinois Urbana-Champaign"],
      employers: [],
      city: "Urbana, IL",
      skills: [],
    });
    expect(warmth.level).toBe("strong");
    expect(warmth.signals).toHaveLength(2);
  });

  it("scores weak-only overlap as limited", () => {
    const warmth = computeWarmth(candidate, {
      schools: [],
      employers: [],
      city: "Urbana, Illinois",
      skills: ["C++"],
    });
    expect(warmth.level).toBe("limited");
    expect(warmth.signals.every((s) => s.trust === "weak-inference")).toBe(true);
  });

  it("normalizes company suffixes so 'Intel Inc.' matches 'Intel Corporation'", () => {
    const warmth = computeWarmth(candidate, {
      schools: [],
      employers: ["Intel Inc."],
      skills: [],
    });
    expect(warmth.signals.some((s) => s.kind === "same-past-employer")).toBe(true);
  });

  it("NEVER labels an overlap as a confirmed connection", () => {
    const warmth = computeWarmth(candidate, {
      schools: ["University of Illinois Urbana-Champaign"],
      employers: ["Intel Corporation"],
      city: "Urbana, Illinois",
      skills: ["C++"],
    });
    // Every signal must be an inference label, never "verified"/"source-backed".
    for (const signal of warmth.signals) {
      expect(["strong-inference", "weak-inference"]).toContain(signal.trust);
    }
    expect(warmth.note).toMatch(/not a confirmed connection/i);
  });

  it("is deterministic and order-independent in its output", () => {
    const contact: WarmthProfile = {
      schools: ["University of Illinois Urbana-Champaign"],
      employers: ["Intel Corporation"],
      city: "Urbana, Illinois",
      skills: ["Python", "C++"],
    };
    const a = computeWarmth(candidate, contact);
    const b = computeWarmth(candidate, contact);
    expect(a).toEqual(b);

    // Reordering the contact's own lists must not change the result.
    const reordered = computeWarmth(candidate, {
      ...contact,
      skills: ["C++", "Python"],
    });
    expect(reordered).toEqual(a);
  });

  it("dedupes a repeated overlap into a single signal", () => {
    const warmth = computeWarmth(candidate, {
      schools: [
        "University of Illinois Urbana-Champaign",
        "University of Illinois, Urbana Champaign",
      ],
      employers: [],
      skills: [],
    });
    expect(warmth.signals.filter((s) => s.kind === "same-school")).toHaveLength(1);
  });
});

describe("candidateWarmthProfile", () => {
  it("derives schools, employers and skills from the candidate's own record", () => {
    const profile = candidateWarmthProfile(demoCandidate);
    expect(profile.schools).toContain(demoCandidate.university);
    expect(profile.city).toBe(demoCandidate.location);
    expect(Array.isArray(profile.employers)).toBe(true);
    expect(Array.isArray(profile.skills)).toBe(true);
  });

  it("is deterministic", () => {
    expect(candidateWarmthProfile(demoCandidate)).toEqual(
      candidateWarmthProfile(demoCandidate),
    );
  });
});
