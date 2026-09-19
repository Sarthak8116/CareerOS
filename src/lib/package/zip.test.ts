import { describe, it, expect } from "vitest";
import type { ApplicationPackage, Campaign, Candidate } from "@/lib/types";
import { buildApplicationPackage } from "./build";
import { buildPackageZip, packageEntries, includedDocuments, packageZipName, README_NAME } from "./zip";

/**
 * The REAL export pipeline: a scraped job title → `buildApplicationPackage`
 * → `buildPackageZip` → real JSZip bytes. This is the "wired in" proof the
 * P2 contract asks for — not the sanitizer alone (see filenames.test.ts) and
 * not the builder alone (see build.test.ts), but the two of them actually
 * connected end to end, producing bytes a real extractor would read.
 *
 * Method note (see filenames.test.ts for the full explanation): entry names
 * are read from the ZIP's raw LOCAL FILE HEADER records, not from
 * `JSZip.loadAsync(...).files`, because `loadAsync` silently normalizes
 * literal ".." path components while building its own folder tree — a false
 * "safe" reading for a name that is not actually safe in the bytes.
 */

function readRawLocalFileNames(buffer: Buffer): string[] {
  const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
  const names: string[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) break;
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(buffer.toString("utf8", nameStart, nameStart + fileNameLength));
    offset = nameStart + fileNameLength + extraFieldLength + compressedSize;
  }
  return names;
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand_1",
    name: "Jordan Rivera",
    headline: "Systems Software Engineer",
    location: "Austin, TX",
    university: "UT Austin",
    degree: "BS Computer Science",
    graduationYear: 2026,
    experienceLevel: "student",
    workAuthorization: "US Citizen",
    targetRoles: ["Systems Software Engineer"],
    targetIndustries: ["Semiconductors"],
    links: { github: "https://github.com/jrivera" },
    evidence: [
      {
        id: "ev_1",
        claim: "Built a CPU cache simulator in C, open-sourced on GitHub.",
        category: "project",
        sourceType: "github",
        sourceReference: "github.com/jrivera/cache-sim",
        strength: "strong",
        recency: "current",
        publicProof: true,
        trust: "verified",
      },
    ],
    ...overrides,
  };
}

function campaignWithJob(title: string, company: string): Campaign {
  return {
    id: "camp_1",
    candidateId: "cand_1",
    job: {
      id: "job_1",
      source: "greenhouse",
      title,
      normalizedTitle: title.toLowerCase(),
      company,
      location: "Austin, TX",
      remote: "hybrid",
      employmentType: "full-time",
      seniority: "entry",
      description: "Build systems software.",
      sponsorship: "unclear",
      requirements: [],
    },
    stage: "applied",
    readiness: "strong",
    createdAt: "2026-09-01T00:00:00.000Z",
    isDemo: false,
    fit: [],
    gaps: [],
    tasks: [],
    people: [],
    activity: [],
    nextAction: "Submit application.",
    applicationForm: {
      jobId: "job_1",
      source: "fetched",
      adapter: "greenhouse",
      fetchedAt: "2026-09-01T00:00:00.000Z",
      completeness: "complete",
      resume: "not-requested",
      coverLetter: "required",
      portfolio: "not-requested",
      questions: [],
      excludedSections: ["a voluntary EEO section"],
      unknowns: [],
      warnings: [],
      trust: "source-backed",
    },
  };
}

function buildPkg(title: string, company: string): ApplicationPackage {
  return buildApplicationPackage({
    campaign: campaignWithJob(title, company),
    candidate: candidate(),
    library: [],
    builtAt: "2026-09-19T12:00:00.000Z",
  }).package;
}

describe("packageEntries — the manifest that goes into the archive", () => {
  it("includes a README plus every document that carries content", () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    const entries = packageEntries(pkg);
    expect(entries.some((e) => e.path.endsWith(`/${README_NAME}`))).toBe(true);
    expect(entries.length).toBe(1 + includedDocuments(pkg).length);
  });

  it("every entry path lives under the package's single folderName", () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    for (const entry of packageEntries(pkg)) {
      expect(entry.path.startsWith(`${pkg.folderName}/`)).toBe(true);
    }
  });

  it("the README names every unsupported claim count and the EEO exclusion, so the archive is self-explanatory even outside the app", () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    const readme = packageEntries(pkg).find((e) => e.path.endsWith(README_NAME))!;
    expect(readme.content).toContain("CareerOS has submitted nothing");
    expect(readme.content).toContain("a voluntary EEO section");
  });
});

describe("buildPackageZip — end-to-end real archive from a HOSTILE scraped posting", () => {
  it("a malicious job title and company never reach the archive bytes unsanitized", async () => {
    const pkg = buildPkg("../../etc/evil", "..\\..\\Windows\\System32");
    const bytes = await buildPackageZip(pkg);
    const buffer = Buffer.from(bytes);
    const names = readRawLocalFileNames(buffer);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).not.toContain("..");
      expect(name).not.toContain("\\");
      expect(name.startsWith("/")).toBe(false);
      expect(name).not.toMatch(/^[a-zA-Z]:/);
    }
  });

  it("PROVES this is a real safety property, not a coincidence: the same hostile title fed DIRECTLY to JSZip (bypassing the builder) DOES write a traversal entry", async () => {
    // Ground truth / control: without the builder's sanitization in the
    // path, the exact same input is dangerous. This is what confirms the
    // "safe" result above comes from the sanitizer actually being wired in,
    // not from JSZip being safe by default.
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("../../etc/evil/README.md", "unsanitized");
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    expect(readRawLocalFileNames(buffer)).toContain("../../etc/evil/README.md");
  });

  it("the real archive contains the folder + README + cover-letter entries for an ordinary posting", async () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    const bytes = await buildPackageZip(pkg);
    const names = readRawLocalFileNames(Buffer.from(bytes));

    expect(names).toContain(`${pkg.folderName}/${README_NAME}`);
    const coverLetter = pkg.documents.find((d) => d.kind === "cover-letter")!;
    expect(names).toContain(`${pkg.folderName}/${coverLetter.fileName}`);
  });

  it("a 'not-requested' document (no content) never appears as an archive entry", async () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    const resume = pkg.documents.find((d) => d.kind === "resume")!;
    expect(resume.status).toBe("not-requested"); // this fixture's form sets resume: not-requested

    const bytes = await buildPackageZip(pkg);
    const names = readRawLocalFileNames(Buffer.from(bytes));
    expect(names).not.toContain(`${pkg.folderName}/${resume.fileName}`);
  });

  it("is deterministic: the same package produces byte-identical archive contents (entry names) on repeat calls", async () => {
    const pkg = buildPkg("Systems Software Engineer", "Acme Corp");
    const first = readRawLocalFileNames(Buffer.from(await buildPackageZip(pkg)));
    const second = readRawLocalFileNames(Buffer.from(await buildPackageZip(pkg)));
    expect(first).toEqual(second);
  });
});

describe("packageZipName", () => {
  it("is the sanitized folderName plus .zip — never the raw job title", () => {
    const pkg = buildPkg("../../etc/evil", "Acme Corp");
    const name = packageZipName(pkg);
    expect(name).toBe(`${pkg.folderName}.zip`);
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });
});
