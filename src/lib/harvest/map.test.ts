import { describe, it, expect } from "vitest";
import {
  HarvestCompany,
  HarvestPost,
  HarvestProfile,
  parseItems,
  topSkillsList,
} from "@/lib/harvest/schemas";
import {
  classifyContact,
  companyToFacts,
  postsToSourced,
  profileToEvidence,
  profileToPerson,
} from "@/lib/harvest/map";
import { Person as PersonSchema, Evidence as EvidenceSchema } from "@/lib/types";
import employees from "@/lib/harvest/__fixtures__/employees.json";
import company from "@/lib/harvest/__fixtures__/company.json";
import companyLive from "@/lib/harvest/__fixtures__/company-live.json";
import employeesLive from "@/lib/harvest/__fixtures__/employees-live.json";
import posts from "@/lib/harvest/__fixtures__/posts.json";

const FETCHED_AT = "2026-09-19T12:00:00.000Z";

const profiles = parseItems(HarvestProfile, employees).valid;
const byHandle = (handle: string) =>
  profiles.find((p) => p.publicIdentifier === handle)!;

describe("profileToPerson", () => {
  it("maps a full profile into a schema-valid Person with provenance", () => {
    const person = profileToPerson(byHandle("priya-raman-eng"), {
      companyName: "NVIDIA",
      fetchedAt: FETCHED_AT,
    })!;

    expect(PersonSchema.safeParse(person).success).toBe(true);
    expect(person.name).toBe("Priya Raman");
    expect(person.company).toBe("NVIDIA");
    expect(person.provenance).toEqual({
      source: "harvestapi",
      fetchedAt: FETCHED_AT,
      linkedinUrl: "https://www.linkedin.com/in/priya-raman-eng",
    });
  });

  it("never claims a confirmed relationship or a known reporting line", () => {
    const person = profileToPerson(byHandle("priya-raman-eng"), {
      companyName: "NVIDIA",
      fetchedAt: FETCHED_AT,
    })!;

    // The profile is sourced; the hiring relationship is not.
    expect(person.trust).toBe("source-backed");
    expect(person.connection).toMatch(/inference/i);
    expect(person.connection).toMatch(/no existing connection/i);
    expect(person.inferredRole).not.toMatch(/\bis the hiring manager\b/i);
  });

  it("drops a record with no usable name", () => {
    const person = profileToPerson(byHandle("no-name-profile"), {
      companyName: "NVIDIA",
      fetchedAt: FETCHED_AT,
    });
    expect(person).toBeUndefined();
  });

  it("sanitizes injected markup and instructions out of scraped text", () => {
    const person = profileToPerson(byHandle("injection-probe"), {
      companyName: "NVIDIA",
      fetchedAt: FETCHED_AT,
    })!;

    const allText = `${person.name} ${person.title} ${person.headline ?? ""}`;
    // Markup is stripped; any residual angle bracket is escaped, never raw.
    expect(allText).not.toMatch(/<script/i);
    expect(allText).not.toContain("<");
  });

  it("is deterministic, same input, identical output", () => {
    const opts = { companyName: "NVIDIA", fetchedAt: FETCHED_AT };
    const a = profileToPerson(byHandle("dan-whitfield"), opts);
    const b = profileToPerson(byHandle("dan-whitfield"), opts);
    expect(a).toEqual(b);
  });
});

describe("classifyContact", () => {
  it("routes titles to the right role", () => {
    expect(classifyContact("Technical Recruiter, University Programs")).toBe(
      "recruiter",
    );
    expect(classifyContact("Engineering Manager, GPU Systems")).toBe(
      "engineering-manager",
    );
    expect(classifyContact("Senior Software Engineer")).toBe("engineer");
    expect(classifyContact("Regional Sales Associate")).toBe("other");
  });
});

describe("profileToEvidence", () => {
  const evidence = profileToEvidence(byHandle("priya-raman-eng"));

  it("produces schema-valid, public-proof, linkedin-sourced evidence", () => {
    expect(evidence.length).toBeGreaterThan(0);
    for (const item of evidence) {
      expect(EvidenceSchema.safeParse(item).success).toBe(true);
      expect(item.sourceType).toBe("linkedin");
      expect(item.publicProof).toBe(true);
    }
  });

  it("does not inflate a self-listed skill into proven experience", () => {
    const skill = evidence.find((e) => e.category === "skill")!;
    expect(skill.strength).toBe("limited");
    expect(skill.trust).toBe("user-provided");
  });

  it("is deterministic and stably ordered across repeat imports", () => {
    expect(profileToEvidence(byHandle("priya-raman-eng"))).toEqual(evidence);
  });
});

describe("companyToFacts", () => {
  const facts = companyToFacts(
    parseItems(HarvestCompany, company).valid[0],
    FETCHED_AT,
  );

  it("keeps factual fields and attaches provenance", () => {
    expect(facts.name).toBe("NVIDIA");
    expect(facts.employeeCount).toBe(31000);
    expect(facts.foundedYear).toBe(1993);
    expect(facts.industries).toContain("Semiconductors");
    expect(facts.provenance.source).toBe("harvestapi");
    expect(facts.provenance.fetchedAt).toBe(FETCHED_AT);
  });

  it("picks the headquarters location, not just the first one", () => {
    expect(facts.headquarters).toBe("Santa Clara, US");
  });
});

/** REGRESSION, mapping the real captured payload (see schemas.test.ts). */
describe("companyToFacts on the real captured payload", () => {
  const live = companyToFacts(
    parseItems(HarvestCompany, companyLive).valid[0],
    FETCHED_AT,
  );

  it("flattens industry OBJECTS into readable names", () => {
    expect(live.industries).toEqual(["Computer Hardware Manufacturing"]);
  });

  it("never lets a raw null reach the app-facing record", () => {
    // NVIDIA's live tagline is "" and several location fields are null.
    expect(JSON.stringify(live)).not.toContain("null");
    expect(live.tagline).toBeUndefined();
  });

  it("keeps the real factual fields", () => {
    expect(live.name).toBe("NVIDIA");
    expect(live.foundedYear).toBe(1993);
    expect(live.headquarters).toBe("Santa Clara, US");
    expect(live.employeeCount).toBeGreaterThan(0);
    expect(live.specialities).toContain("GPU-accelerated computing");
  });
});

/**
 * REGRESSION, real `linkedin-company-employees` profiles (identities redacted,
 * structure untouched), captured 2026-09-19.
 *
 * Four docs-vs-reality bugs were found here, each of which broke the feature
 * silently. These assertions exist so none of them can come back.
 */
describe("real captured employee profiles", () => {
  const { valid, dropped } = parseItems(HarvestProfile, employeesLive);

  it("all three validate, nulls and array topSkills tolerated", () => {
    expect(dropped).toBe(0);
    expect(valid).toHaveLength(3);
  });

  it("topSkills arrives as an ARRAY, and normalises either way", () => {
    // The docs say comma-joined string; the live actor sends an array (often
    // empty). Both must parse, and the normaliser must flatten both.
    expect(Array.isArray(valid[0].topSkills)).toBe(true);
    expect(topSkillsList(valid[0].topSkills)).toEqual([]);
    expect(topSkillsList(["A", " B "])).toEqual(["A", "B"]);
    expect(topSkillsList("A, B, C")).toEqual(["A", "B", "C"]);
    expect(topSkillsList(null)).toEqual([]);
  });

  it("reads the real job title, NOT the marketing headline", () => {
    for (const profile of valid) {
      const person = profileToPerson(profile, {
        companyName: "NVIDIA",
        fetchedAt: FETCHED_AT,
      })!;
      expect(person).toBeDefined();
      // A current role carries `endDate: { text: "Present" }`: present but
      // yearless. Treating that as "ended" fell back to the headline.
      expect(person.title).not.toMatch(/passionate about|enabling the next wave/i);
      expect(person.title.length).toBeLessThan(120);
    }
  });

  it("keeps the experience and education warmth scoring depends on", () => {
    // This is the whole reason we pay for "Full" mode over "Short".
    expect(valid[0].experience?.length).toBeGreaterThan(0);
    expect(valid[0].education?.length).toBeGreaterThan(0);
  });

  it("every mapped contact carries provenance", () => {
    for (const profile of valid) {
      const person = profileToPerson(profile, {
        companyName: "NVIDIA",
        fetchedAt: FETCHED_AT,
      })!;
      expect(person.provenance?.source).toBe("harvestapi");
      expect(person.provenance?.linkedinUrl).toContain("linkedin.com/in/");
    }
  });
});

describe("postsToSourced", () => {
  const sourced = postsToSourced(parseItems(HarvestPost, posts).valid, {
    linkedinUrl: "https://www.linkedin.com/company/nvidia",
    fetchedAt: FETCHED_AT,
  });

  it("attaches provenance to every excerpt", () => {
    expect(sourced.length).toBeGreaterThan(0);
    for (const post of sourced) {
      expect(post.provenance.source).toBe("harvestapi");
      expect(post.provenance.fetchedAt).toBe(FETCHED_AT);
    }
  });

  it("strips markup from post bodies", () => {
    const injected = sourced.find((p) => /ignore previous/i.test(p.excerpt));
    expect(injected).toBeDefined();
    expect(injected!.excerpt).not.toContain("<b>");
  });
});
