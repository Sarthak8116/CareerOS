import { describe, it, expect } from "vitest";
import { generateAllOutreach } from "@/lib/engine/outreach";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

const VALID_CHANNELS = new Set(["email", "linkedin"]);

describe("generateAllOutreach", () => {
  const messages = generateAllOutreach(demoCandidate, demoJob, demoPeople);

  it("returns exactly one message per person, keyed to that person", () => {
    expect(messages).toHaveLength(demoPeople.length);
    messages.forEach((m, i) => {
      expect(m.personId).toBe(demoPeople[i].id);
      expect(m.id).toBe(`outreach_${demoPeople[i].id}`);
    });
  });

  it("gives every message non-empty subject, full, and concise copy", () => {
    for (const m of messages) {
      expect(m.subject.trim().length).toBeGreaterThan(0);
      expect(m.full.trim().length).toBeGreaterThan(0);
      expect(m.concise.trim().length).toBeGreaterThan(0);
    }
  });

  it("grounds every message in at least one piece of candidate evidence", () => {
    for (const m of messages) {
      expect(Array.isArray(m.evidenceUsed)).toBe(true);
      expect(m.evidenceUsed.length).toBeGreaterThan(0);
      for (const claim of m.evidenceUsed) {
        expect(typeof claim).toBe("string");
        expect(claim.length).toBeGreaterThan(0);
      }
    }
  });

  it("assigns every message a valid channel", () => {
    for (const m of messages) {
      expect(VALID_CHANNELS.has(m.channel)).toBe(true);
    }
  });

  it("routes the recruiter to email and other roles to LinkedIn", () => {
    const recruiterMsg = messages.find((m) => m.personId === "person_recruiter");
    const alumMsg = messages.find((m) => m.personId === "person_alum");
    expect(recruiterMsg?.channel).toBe("email");
    expect(alumMsg?.channel).toBe("linkedin");
  });

  it("flags the likely-manager (weak inference) with a caution to verify", () => {
    // person_mgr is classified as likely-manager and carries trust
    // "weak-inference" / confidence "low", so the engine must caution the user.
    const managerMsg = messages.find((m) => m.personId === "person_mgr");
    expect(managerMsg).toBeDefined();

    // The engine appends a weak-inference relationship caution to warnings.
    expect(
      managerMsg!.warnings.some((w) => /weak inference/i.test(w)),
    ).toBe(true);

    // And the unconfirmed role/relationship assumptions surface in claimsToVerify.
    expect(managerMsg!.claimsToVerify.length).toBeGreaterThan(0);
    expect(
      managerMsg!.claimsToVerify.some((c) => /unconfirmed|inferred/i.test(c)),
    ).toBe(true);
  });
});
