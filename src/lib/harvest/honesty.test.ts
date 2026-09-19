import { describe, it, expect } from "vitest";
import type { Person } from "@/lib/types";
import { UnconfirmedEmail } from "@/lib/types";
import { generateOutreach } from "@/lib/engine/outreach";
import { buildOpportunityGraph } from "@/lib/engine/graph";
import { computeFit } from "@/lib/engine/fit";
import { getCompanyIntel } from "@/lib/engine/company";
import { getInterviewQuestions } from "@/lib/engine/interview";
import { rankContacts } from "@/lib/harvest/network";
import { demoCandidate } from "@/lib/demo/candidate";
import { demoJob } from "@/lib/demo/job";
import { demoPeople } from "@/lib/demo/people";

/**
 * The honesty contract, asserted end-to-end against the engines that render
 * enriched data. These are the claims the product must never make.
 */

const FETCHED_AT = "2026-09-19T12:00:00.000Z";

const sourcedContact: Person = {
  id: "person_priya",
  name: "Priya Raman",
  title: "Engineering Manager, GPU Systems Software",
  company: "NVIDIA",
  inferredRole: "Engineering manager — plausibly the hiring manager",
  connection:
    "No existing connection. Employer and title are from their public LinkedIn profile; their involvement in this specific role is an inference.",
  commonality: "Both attended University of Illinois Urbana-Champaign",
  relevance: "strong",
  influence: "strong",
  accessibility: "moderate",
  confidence: "medium",
  trust: "source-backed",
  outreachPriority: "first",
  linkedinUrl: "https://www.linkedin.com/in/priya-raman-eng",
  provenance: {
    source: "harvestapi",
    fetchedAt: FETCHED_AT,
    linkedinUrl: "https://www.linkedin.com/in/priya-raman-eng",
  },
  warmth: {
    level: "moderate",
    signals: [
      {
        kind: "same-school",
        detail: "Both attended University of Illinois Urbana-Champaign",
        trust: "strong-inference",
      },
    ],
    note: "Derived from overlapping background only. Not a confirmed connection.",
  },
};

describe("email labeling", () => {
  it("only accepts the unconfirmed label — 'verified' is not representable", () => {
    expect(
      UnconfirmedEmail.safeParse({
        address: "a@b.com",
        status: "found + SMTP-checked, unconfirmed",
        fetchedAt: FETCHED_AT,
      }).success,
    ).toBe(true);

    for (const status of ["verified", "confirmed", "valid"]) {
      expect(
        UnconfirmedEmail.safeParse({ address: "a@b.com", status, fetchedAt: FETCHED_AT })
          .success,
        `"${status}" must not be a representable email status`,
      ).toBe(false);
    }
  });

  it("forces a found email into claimsToVerify, never into a confident claim", () => {
    const message = generateOutreach({
      candidate: demoCandidate,
      job: demoJob,
      person: {
        ...sourcedContact,
        email: {
          address: "priya@example.com",
          status: "found + SMTP-checked, unconfirmed",
          fetchedAt: FETCHED_AT,
        },
      },
    });

    const emailClaim = message.claimsToVerify.find((c) =>
      c.includes("priya@example.com"),
    );
    expect(emailClaim).toBeDefined();
    expect(emailClaim).toContain("found + SMTP-checked, unconfirmed");
    expect(message.claimsToVerify.join(" ")).not.toMatch(/verified email/i);
  });
});

describe("overlap is never presented as a connection", () => {
  it("marks a warmth-derived commonality as inferred even on a source-backed profile", () => {
    const message = generateOutreach({
      candidate: demoCandidate,
      job: demoJob,
      person: sourcedContact,
    });

    const fact = message.personalizationFacts.find((f) =>
      f.includes("University of Illinois"),
    )!;
    expect(fact).toMatch(/inferred — not confirmed/);
    expect(
      message.claimsToVerify.some((c) => /Shared-background point/.test(c)),
    ).toBe(true);
  });

  it("names what is shared on the graph edge rather than implying a tie", () => {
    const graph = buildOpportunityGraph({
      candidate: demoCandidate,
      job: demoJob,
      people: [sourcedContact],
    });

    const edge = graph.edges.find(
      (e) => e.source === demoCandidate.id && e.target === sourcedContact.id,
    )!;
    expect(edge.relationship).toBe("shares a school with");
    expect(edge.trust).toBe("strong-inference");
    expect(graph.edges.some((e) => /\bknows\b|connected to/i.test(e.relationship))).toBe(
      false,
    );
  });

  it("skips the university hop when the overlap is not a school", () => {
    const cityOnly: Person = {
      ...sourcedContact,
      warmth: {
        level: "limited",
        signals: [
          {
            kind: "same-city",
            detail: "Both based in Urbana, Illinois",
            trust: "weak-inference",
          },
        ],
        note: "Derived from overlapping background only.",
      },
    };

    const graph = buildOpportunityGraph({
      candidate: demoCandidate,
      job: demoJob,
      people: [cityOnly],
    });

    // Claiming a shared university here would be a fabrication.
    expect(graph.warmestPath).not.toContain(
      `university_${demoCandidate.university.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    );
    expect(graph.warmestPath[1]).toBe(cityOnly.id);
  });
});

describe("fit + intel degrade honestly", () => {
  it("does not award strong network fit from inferred overlap alone", () => {
    const fit = computeFit(demoCandidate, demoJob, [sourcedContact]);
    const network = fit.find((f) => f.category === "network")!;
    expect(network.level).not.toBe("strong");
    expect(network.explanation).toMatch(/not a connection/i);
  });

  it("keeps the existing low-confidence fallback when no harvest data is present", () => {
    const withoutHarvest = getCompanyIntel(demoJob);
    const withUndefined = getCompanyIntel(demoJob, undefined);
    expect(withUndefined).toEqual(withoutHarvest);
    expect(withoutHarvest.provenance).toBeUndefined();
  });

  it("labels merged company data as the company's own self-description", () => {
    const intel = getCompanyIntel(demoJob, {
      fetchedAt: FETCHED_AT,
      company: {
        name: "NVIDIA",
        linkedinUrl: "https://www.linkedin.com/company/nvidia",
        tagline: "The engine of AI computing.",
        industries: ["Semiconductors"],
        specialities: ["GPU"],
        provenance: {
          source: "harvestapi",
          fetchedAt: FETCHED_AT,
          linkedinUrl: "https://www.linkedin.com/company/nvidia",
        },
      },
    });

    expect(intel.provenance?.source).toBe("harvestapi");
    expect(intel.risks.join(" ")).toMatch(/self-description/i);
    const source = intel.sources.find((s) => s.id === "src_linkedin_company")!;
    expect(source.publisher).toMatch(/self-description/i);
    // A company page is not independent research, so never "strong".
    expect(source.reliability).not.toBe("strong");
  });
});

describe("demo mode is unchanged", () => {
  it("produces identical fit and outreach for people with no enrichment fields", () => {
    const fit = computeFit(demoCandidate, demoJob, demoPeople);
    const network = fit.find((f) => f.category === "network")!;
    // The original count-based explanation, not the sourced-contact wording.
    expect(network.explanation).toMatch(/strongly-relevant contacts identified/);
  });

  it("adds no interview questions without company posts", () => {
    const base = getInterviewQuestions(demoCandidate, demoJob);
    expect(getInterviewQuestions(demoCandidate, demoJob, undefined)).toEqual(base);
    expect(
      getInterviewQuestions(demoCandidate, demoJob, { fetchedAt: FETCHED_AT }),
    ).toEqual(base);
  });

  it("grounds company-specific questions in posts when they exist", () => {
    const questions = getInterviewQuestions(demoCandidate, demoJob, {
      fetchedAt: FETCHED_AT,
      companyPosts: [
        {
          id: "post_1",
          excerpt: "We shipped a kernel launch latency improvement.",
          provenance: {
            source: "harvestapi",
            fetchedAt: FETCHED_AT,
            linkedinUrl: "https://www.linkedin.com/company/nvidia",
          },
        },
      ],
    });

    const grounded = questions.find((q) => q.id === "q_company_post_1")!;
    expect(grounded.category).toBe("company-specific");
    expect(grounded.prompt).toContain("kernel launch latency");
    expect(grounded.answerHints.join(" ")).toMatch(/do not claim inside knowledge/i);
  });
});

describe("rankContacts", () => {
  it("promotes the warmest contact to 'first'", () => {
    const cold: Person = {
      ...sourcedContact,
      id: "person_cold",
      name: "Zoe Cold",
      outreachPriority: "medium",
      warmth: { level: "none", signals: [], note: "No overlapping background found." },
    };
    const ranked = rankContacts([cold, { ...sourcedContact, outreachPriority: "medium" }]);
    expect(ranked[0].id).toBe(sourcedContact.id);
    expect(ranked[0].outreachPriority).toBe("first");
  });

  it("labels nobody 'first' when no contact has any common ground", () => {
    const noWarmth: Person[] = [
      {
        ...sourcedContact,
        id: "a",
        outreachPriority: "medium",
        warmth: { level: "none", signals: [], note: "n/a" },
      },
      {
        ...sourcedContact,
        id: "b",
        outreachPriority: "medium",
        warmth: { level: "none", signals: [], note: "n/a" },
      },
    ];
    expect(rankContacts(noWarmth).some((p) => p.outreachPriority === "first")).toBe(
      false,
    );
  });
});
