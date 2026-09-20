import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/types";
import { applyKnownConnections } from "@/lib/linkedin/match";

const person = (over: Partial<Person>): Person => ({
  id: "p1",
  name: "Ada Lovelace",
  title: "Staff Engineer",
  company: "Analytical Engines",
  inferredRole: "Potential teammate",
  connection: "No known connection",
  relevance: "moderate",
  influence: "moderate",
  accessibility: "moderate",
  confidence: "medium",
  trust: "source-backed",
  outreachPriority: "medium",
  ...over,
});

describe("applyKnownConnections", () => {
  it("returns people untouched when there is no export", () => {
    const people = [person({})];
    expect(applyKnownConnections(people, undefined)).toBe(people);
    expect(applyKnownConnections(people, [])).toBe(people);
  });

  it("marks a profile-URL match as the user's own claim, across URL forms", () => {
    const [out] = applyKnownConnections(
      [person({ linkedinUrl: "https://linkedin.com/in/Ada-Lovelace/?trk=x" })],
      [{ name: "A. Lovelace", profileUrl: "https://www.linkedin.com/in/ada-lovelace" }],
    );
    expect(out.trust).toBe("user-provided");
    expect(out.outreachPriority).toBe("first");
    expect(out.connection).toMatch(/profile URL/);
  });

  it("a NAME-ONLY match never raises trust or priority — two people can share a name", () => {
    const before = person({ linkedinUrl: "https://www.linkedin.com/in/someone-else" });
    const [out] = applyKnownConnections(
      [before],
      [{ name: "ada  LOVELACE", profileUrl: "https://www.linkedin.com/in/ada-lovelace" }],
    );
    expect(out.trust).toBe(before.trust);
    expect(out.outreachPriority).toBe(before.outreachPriority);
    expect(out.connection).toMatch(/Possible/);
    expect(out.connection).toMatch(/Confirm/);
  });

  it("never labels anything verified — we verified nothing", () => {
    const out = applyKnownConnections(
      [person({ linkedinUrl: "https://www.linkedin.com/in/ada-lovelace" }), person({ id: "p2" })],
      [{ name: "Ada Lovelace", profileUrl: "https://www.linkedin.com/in/ada-lovelace" }],
    );
    for (const p of out) expect(p.trust).not.toBe("verified");
  });
});
