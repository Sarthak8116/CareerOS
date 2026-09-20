import { describe, it, expect, beforeEach } from "vitest";
import type { Evidence } from "@/lib/types";
import {
  addEvidence,
  fillProfileFields,
  getProfile,
  hasStoredProfile,
  mergeEvidence,
  resetProfile,
  saveProfile,
} from "@/lib/profileStore";
import { demoCandidate } from "@/lib/demo/candidate";

const ev = (over: Partial<Evidence> & Pick<Evidence, "id">): Evidence => ({
  claim: "Some claim",
  category: "skill",
  sourceType: "linkedin",
  strength: "limited",
  recency: "unknown",
  publicProof: true,
  trust: "user-provided",
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("getProfile", () => {
  it("falls back to the demo candidate when nothing is stored", () => {
    expect(hasStoredProfile()).toBe(false);
    expect(getProfile()).toEqual(demoCandidate);
  });

  it("returns the stored profile once one is saved, and it survives a reload", () => {
    saveProfile({ ...demoCandidate, name: "Imported Person" });
    expect(hasStoredProfile()).toBe(true);
    // A fresh read goes back through localStorage, this is the regression the
    // whole module exists to prevent.
    expect(getProfile().name).toBe("Imported Person");
  });

  it("discards a corrupt stored profile rather than rendering it", () => {
    window.localStorage.setItem("careeros:profile:v1", '{"name":"broken"}');
    expect(getProfile()).toEqual(demoCandidate);
    expect(hasStoredProfile()).toBe(false);
  });

  it("survives unparseable JSON", () => {
    window.localStorage.setItem("careeros:profile:v1", "not json{{");
    expect(getProfile()).toEqual(demoCandidate);
  });
});

describe("mergeEvidence", () => {
  it("adds records with new ids", () => {
    const merged = mergeEvidence([ev({ id: "a" })], [ev({ id: "b" })]);
    expect(merged.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("lets a higher-authority source replace a lower one", () => {
    const merged = mergeEvidence(
      [ev({ id: "a", sourceType: "linkedin", claim: "from linkedin" })],
      [ev({ id: "a", sourceType: "resume", claim: "from resume" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].claim).toBe("from resume");
  });

  it("NEVER lets an import overwrite what the user confirmed by hand", () => {
    const confirmed = ev({
      id: "a",
      sourceType: "user-confirmation",
      claim: "what the user actually said",
      strength: "strong",
    });
    const merged = mergeEvidence(
      [confirmed],
      [ev({ id: "a", sourceType: "linkedin", claim: "scraped guess" })],
    );
    expect(merged[0]).toEqual(confirmed);
  });

  it("does not upgrade a claim just because another source repeats it", () => {
    const merged = mergeEvidence(
      [ev({ id: "a", sourceType: "linkedin", strength: "limited", trust: "user-provided" })],
      [ev({ id: "a", sourceType: "linkedin", strength: "limited", trust: "user-provided" })],
    );
    expect(merged[0].strength).toBe("limited");
    expect(merged[0].trust).toBe("user-provided");
  });

  it("never merges field-by-field across sources", () => {
    // A winning record replaces wholesale, so a claim can never end up with
    // one source's text and another's strength label.
    const merged = mergeEvidence(
      [ev({ id: "a", sourceType: "linkedin", claim: "old", strength: "strong" })],
      [ev({ id: "a", sourceType: "resume", claim: "new", strength: "limited" })],
    );
    expect(merged[0].claim).toBe("new");
    expect(merged[0].strength).toBe("limited");
  });

  it("drops invalid incoming records instead of storing them", () => {
    const bad = { id: "bad", claim: "x" } as unknown as Evidence;
    const merged = mergeEvidence([ev({ id: "a" })], [bad]);
    expect(merged.map((e) => e.id)).toEqual(["a"]);
  });

  it("is deterministic across repeat imports", () => {
    const existing = [ev({ id: "a" })];
    const incoming = [ev({ id: "c" }), ev({ id: "b" })];
    expect(mergeEvidence(existing, incoming)).toEqual(
      mergeEvidence(existing, incoming),
    );
  });
});

describe("addEvidence", () => {
  it("persists imported evidence and reports honest counts", () => {
    const result = addEvidence([
      ev({ id: "ev_new_1", claim: "New thing" }),
      ev({ id: "ev_new_2", claim: "Another thing" }),
    ]);

    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    // Persisted, not just returned.
    expect(getProfile().evidence.some((e) => e.id === "ev_new_1")).toBe(true);
  });

  it("reports 0 added / 0 updated when re-importing identical data", () => {
    const records = [ev({ id: "ev_same", claim: "Same" })];
    addEvidence(records);
    const second = addEvidence(records);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(0);
  });

  it("keeps the demo candidate's existing evidence intact", () => {
    const before = demoCandidate.evidence.length;
    const result = addEvidence([ev({ id: "ev_brand_new" })]);
    expect(result.profile.evidence.length).toBe(before + 1);
    for (const original of demoCandidate.evidence) {
      expect(result.profile.evidence.some((e) => e.id === original.id)).toBe(true);
    }
  });
});

describe("fillProfileFields", () => {
  it("does not overwrite fields the user already has", () => {
    const profile = fillProfileFields({
      name: "Scraped Name",
      headline: "Scraped Headline",
    });
    // demoCandidate already has both, so neither may be replaced.
    expect(profile.name).toBe(demoCandidate.name);
    expect(profile.headline).toBe(demoCandidate.headline);
  });

  it("fills a genuinely empty field", () => {
    saveProfile({ ...demoCandidate, headline: "" });
    const profile = fillProfileFields({ headline: "From LinkedIn" });
    expect(profile.headline).toBe("From LinkedIn");
  });

  it("fills an empty linkedin link without touching the others", () => {
    saveProfile({
      ...demoCandidate,
      links: { ...demoCandidate.links, linkedin: undefined },
    });
    const profile = fillProfileFields({ linkedin: "https://linkedin.com/in/x" });
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/x");
    expect(profile.links.github).toBe(demoCandidate.links.github);
  });
});

describe("resetProfile", () => {
  it("wipes stored data and returns to the demo candidate", () => {
    saveProfile({ ...demoCandidate, name: "Temporary" });
    expect(hasStoredProfile()).toBe(true);

    expect(resetProfile()).toEqual(demoCandidate);
    expect(hasStoredProfile()).toBe(false);
    expect(getProfile()).toEqual(demoCandidate);
  });
});
