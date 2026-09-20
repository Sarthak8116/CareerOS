import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adapterFor } from "@/lib/intake/adapters";
import { amazonAdapter } from "@/lib/intake/adapters/amazon";

const URL_ = "https://amazon.jobs/en/jobs/10535282/hardware-development-engineer-intern-co-op-robotics-2027";
const html = readFileSync(path.join(__dirname, "../__fixtures__/amazon-posting.html"), "utf8");
const parse = (text: string) =>
  amazonAdapter.parse({ responses: [{ kind: "posting", status: 200, text }], url: URL_, fetchedAt: "2026-01-01T00:00:00.000Z" });

describe("amazon.jobs adapter (captured posting)", () => {
  it("claims posting URLs on both hosts, and nothing else", () => {
    expect(adapterFor(new URL(URL_)).key).toBe("amazon");
    expect(adapterFor(new URL("https://www.amazon.jobs/en/jobs/10535282")).key).toBe("amazon");
    expect(adapterFor(new URL("https://www.amazon.jobs/en/teams/amazon-robotics")).key).not.toBe("amazon");
    expect(adapterFor(new URL("https://amazon.jobs.evil.example/en/jobs/1")).key).not.toBe("amazon");
  });

  it("reads the title, locations and internship status", () => {
    const { job, fieldOrigins, assumptions } = parse(html);
    expect(job?.title).toBe("Hardware Development Engineer Intern/Co-Op, ROBOTICS - 2027");
    expect(job?.company).toBe("Amazon");
    expect(fieldOrigins.company).toBe("derived");
    expect(job?.location).toContain("North Reading");
    expect(job?.location).toContain("Westboro");
    expect(job?.employmentType).toBe("internship");
    expect(assumptions.join(" ")).toContain("Amazon.com Services LLC");
  });

  it("reads dash-prefixed lines as requirements, classified by their heading", () => {
    const reqs = parse(html).job?.requirements ?? [];
    const of = (kind: string) => reqs.filter((r) => r.kind === kind).map((r) => r.text);
    expect(of("minimum")).toHaveLength(5);
    expect(of("preferred")).toHaveLength(2);
    expect(of("responsibility")).toContain("Prototyping and testing concepts or features");
    // Double-encoded apostrophes are decoded, not shown as entities.
    expect(of("minimum").join(" ")).toContain("Bachelor's");
    expect(reqs.map((r) => r.text).join(" ")).not.toMatch(/&#?\w+;/);
  });

  it("never turns the EEO statement or pay range into a requirement", () => {
    const text = (parse(html).job?.requirements ?? []).map((r) => r.text).join(" ");
    expect(text).not.toMatch(/equal opportunity|USD|accommodat/i);
  });

  it("fails honestly on a page without the posting markup", () => {
    const out = parse("<html><body><h1>Amazon.jobs</h1></body></html>");
    expect(out.job).toBeUndefined();
    expect(out.partial?.company).toBe("Amazon");
  });
});
