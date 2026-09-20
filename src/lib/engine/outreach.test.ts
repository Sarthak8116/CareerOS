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

  it("uses only the imported candidate's evidence and copy", () => {
    const imported = {
      ...demoCandidate,
      id: "cand_imported",
      name: "Rosalind Ashgrove",
      evidence: [
        {
          id: "real_project",
          claim: "Built an embedded flight controller verification harness",
          category: "project" as const,
          sourceType: "github" as const,
          sourceReference: "github.com/rashgrove/flight-check",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: true,
          trust: "source-backed" as const,
        },
        {
          id: "real_c",
          claim: "Developed C systems code for an embedded flight controller",
          category: "skill" as const,
          sourceType: "github" as const,
          sourceReference: "github.com/rashgrove/flight-check",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: true,
          trust: "source-backed" as const,
        },
        {
          id: "real_os",
          claim: "Completed operating systems coursework",
          category: "education" as const,
          sourceType: "resume" as const,
          sourceReference: "resume",
          strength: "moderate" as const,
          recency: "recent" as const,
          publicProof: false,
          trust: "user-provided" as const,
        },
      ],
    };

    const importedMessages = generateAllOutreach(imported, demoJob, demoPeople);
    for (const message of importedMessages) {
      expect(message.full.toLowerCase()).not.toContain("cache simulator");
      for (const claim of message.evidenceUsed) {
        expect(imported.evidence.map((evidence) => evidence.claim)).toContain(claim);
      }
    }
  });
});

describe("outreach copy is about THIS user, not the demo persona", () => {
  it("never writes the demo biography into another candidate's draft", async () => {
    const { generateOutreach } = await import("@/lib/engine/outreach");
    const { demoCandidate } = await import("@/lib/demo/candidate");
    const { demoJob } = await import("@/lib/demo/job");
    const { demoPeople } = await import("@/lib/demo/people");
    const designer = {
      ...demoCandidate,
      name: "Rosalind Ashgrove",
      headline: "Product designer focused on accessibility",
      university: "Rhode Island School of Design",
      degree: "BFA Graphic Design",
      evidence: [
        {
          id: "ev_d1",
          claim: "Redesigned a checkout flow used by a regional grocery chain",
          category: "project" as const,
          sourceType: "resume" as const,
          sourceReference: "resume",
          strength: "strong" as const,
          recency: "current" as const,
          publicProof: false,
          trust: "user-provided" as const,
        },
      ],
    };
    for (const person of demoPeople) {
      const message = generateOutreach({ candidate: designer, job: demoJob, person });
      const text = `${message.subject}\n${message.full}\n${message.concise}`;
      expect(text).not.toMatch(/CS senior|UIUC|low-level|systems track|systems internship|2026/i);
      expect(text).not.toMatch(/my recorded/i);
      expect(message.evidenceUsed.every((claim) => claim === designer.evidence[0].claim)).toBe(true);
    }
  });
});
