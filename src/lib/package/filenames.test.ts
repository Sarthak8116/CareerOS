import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  assertSafeEntryPath,
  documentFileName,
  FOLDER_FALLBACK,
  FOLDER_MAX,
  packageFolderName,
  sanitizeSegment,
  SEGMENT_MAX,
} from "@/lib/package/filenames";

/**
 * ZIP SLIP REGRESSION.
 *
 * `folderName` and every `fileName` derive from a job title and company that
 * came off a scraped posting. JSZip writes entry names verbatim — handed
 * "../../etc/evil" it produces exactly that. These tests are the proof that
 * nothing untrusted can ever reach an archive entry with its separators,
 * traversal, or dots intact.
 */

const HOSTILE = [
  "../../etc/evil",
  "..\\..\\Windows\\System32\\evil",
  "/etc/passwd",
  "C:\\Users\\victim\\.ssh\\authorized_keys",
  "....//....//evil",
  "foo/../../../bar",
  "a\u0000b",
  "..",
  ".",
  "....",
  "\u202Egnp.exe",
  "%2e%2e%2fetc",
];

describe("sanitizeSegment — the untrusted-input whitelist", () => {
  it("never emits a path separator, a dot, or a traversal sequence", () => {
    for (const raw of HOSTILE) {
      const out = sanitizeSegment(raw, FOLDER_FALLBACK);
      expect(out, `input: ${JSON.stringify(raw)}`).not.toMatch(/[/\\.]/);
      expect(out).not.toContain("..");
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("keeps the readable part of a traversal payload rather than the payload", () => {
    expect(sanitizeSegment("../../etc/evil", FOLDER_FALLBACK)).toBe("etc-evil");
    expect(sanitizeSegment("..\\..\\Windows\\System32", FOLDER_FALLBACK)).toBe(
      "Windows-System32",
    );
  });

  it("falls back when sanitizing leaves nothing at all", () => {
    for (const raw of ["", "   ", "...", "///", "..", "\u0000", null, undefined]) {
      expect(sanitizeSegment(raw, FOLDER_FALLBACK)).toBe(FOLDER_FALLBACK);
    }
  });

  it("caps length and never ends on a separator", () => {
    const long = "A".repeat(500);
    const out = sanitizeSegment(long, FOLDER_FALLBACK);
    expect(out.length).toBe(SEGMENT_MAX);

    const spaced = `${"word ".repeat(50)}`;
    const capped = sanitizeSegment(spaced, FOLDER_FALLBACK);
    expect(capped.length).toBeLessThanOrEqual(SEGMENT_MAX);
    expect(capped.endsWith("-")).toBe(false);
  });

  it("does not emit a Windows reserved device name", () => {
    expect(sanitizeSegment("CON", FOLDER_FALLBACK)).toBe("CON-file");
    expect(sanitizeSegment("nul", FOLDER_FALLBACK)).toBe("nul-file");
    expect(sanitizeSegment("LPT1", FOLDER_FALLBACK)).toBe("LPT1-file");
  });

  it("is deterministic and preserves ordinary titles readably", () => {
    const job = { title: "Systems Software Engineering Intern", company: "NVIDIA" };
    expect(packageFolderName(job)).toBe(
      "NVIDIA-Systems-Software-Engineering-Intern",
    );
    expect(packageFolderName(job)).toBe(packageFolderName(job));
  });
});

describe("package names built from a hostile posting", () => {
  const job = { title: "../../etc/evil", company: "..\\..\\windows" };

  it("folderName is a single safe segment", () => {
    const folder = packageFolderName(job);
    expect(folder).not.toMatch(/[/\\.]/);
    expect(folder).not.toContain("..");
    expect(folder.length).toBeLessThanOrEqual(FOLDER_MAX);
  });

  it("fileName carries exactly one dot — the extension we appended", () => {
    const name = documentFileName("cover-letter", job);
    expect(name.split(".")).toHaveLength(2);
    expect(name.endsWith(".md")).toBe(true);
    expect(name).not.toMatch(/[/\\]/);
    expect(name.startsWith("cover-letter-")).toBe(true);
  });

  it("a posting that sanitizes to nothing still yields usable names", () => {
    const empty = { title: "...", company: "///" };
    expect(packageFolderName(empty)).toBe(FOLDER_FALLBACK);
    expect(documentFileName("resume", empty)).toBe("resume-application.md");
  });
});

describe("assertSafeEntryPath — the last line of defence", () => {
  it("accepts exactly folder/file", () => {
    expect(assertSafeEntryPath("NVIDIA-Intern/resume-NVIDIA.md")).toBe(
      "NVIDIA-Intern/resume-NVIDIA.md",
    );
  });

  it("throws on traversal, absolute paths, and extra nesting", () => {
    for (const bad of [
      "../evil.md",
      "folder/../../evil.md",
      "/folder/file.md",
      "folder/sub/file.md",
      "folder//file.md",
      "folder/",
      "file.md",
      "folder/..",
      "fo..lder/..file.md",
    ]) {
      expect(() => assertSafeEntryPath(bad), `path: ${bad}`).toThrow();
    }
  });
});

/**
 * REAL ZIP PROOF (added by tester — see message to coder-package).
 *
 * The tests above prove the sanitizer is correct IN ISOLATION. That is a
 * different claim from "nothing unsafe reaches a real archive's bytes", and
 * team-lead's brief specifically asked for the second one.
 *
 * IMPORTANT METHOD NOTE: the obvious way to check this — `JSZip.loadAsync(buf)`
 * then `Object.keys(reloaded.files)` — is NOT a valid proof. `loadAsync`
 * builds its own in-memory folder tree and, as a side effect of that (not a
 * documented security feature), silently resolves literal ".." path
 * components on the forward-slash-delimited form while doing so. A first
 * pass at this exact check used `reloaded.files` and got a false "safe"
 * reading for a MALICIOUS, UNSANITIZED name — verified directly against
 * jszip 3.10.2. The ground truth is the raw bytes JSZip actually wrote: the
 * ZIP's LOCAL FILE HEADER records (what a conforming third-party extractor —
 * Python `zipfile`, `unzip`, 7-Zip, `adm-zip`, ...— reads), read independent
 * of any higher-level zip library's own parsing.
 */

/** Read entry names straight from a zip's LOCAL FILE HEADER records (`PK\x03\x04`). */
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

describe("real JSZip archive — proves the vulnerability and the fix", () => {
  it("PROVES the vulnerability: an unsanitized name really is written verbatim into the archive bytes", async () => {
    const zip = new JSZip();
    zip.file("../../etc/evil", "malicious payload");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    expect(buffer.toString("latin1")).toContain("../../etc/evil");
    expect(readRawLocalFileNames(buffer)).toContain("../../etc/evil");
  });

  it("an absolute path name is written verbatim into the archive bytes", async () => {
    const zip = new JSZip();
    zip.file("/etc/passwd", "malicious payload");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    expect(readRawLocalFileNames(buffer)).toContain("/etc/passwd");
  });

  it("a backslash-based traversal name is written verbatim (JSZip only ever treats forward slash as a separator)", async () => {
    const zip = new JSZip();
    zip.file("..\\..\\evil.txt", "malicious payload");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    expect(readRawLocalFileNames(buffer)).toContain("..\\..\\evil.txt");
  });

  it("entry paths built from packageFolderName + documentFileName never produce a traversal or absolute-path entry in the real archive bytes", async () => {
    const maliciousTitles = [
      "../../etc/evil",
      "/etc/passwd",
      "..\\..\\..\\Windows\\System32\\config\\SAM",
      "....//....//....//etc/shadow",
      "\u0000../../evil",
    ];
    const maliciousCompanies = ["../../../root", "C:\\Users\\Public", "../"];

    const zip = new JSZip();
    const entryPaths: string[] = [];

    for (const title of maliciousTitles) {
      for (const company of maliciousCompanies) {
        const job = { title, company };
        const folder = packageFolderName(job);
        const fileName = documentFileName("resume", job);
        const entryPath = assertSafeEntryPath(`${folder}/${fileName}`);
        entryPaths.push(entryPath);
        zip.file(entryPath, "resume content");
      }
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const names = readRawLocalFileNames(buffer);

    expect(names.length).toBeGreaterThanOrEqual(entryPaths.length);
    for (const entryPath of entryPaths) {
      expect(names).toContain(entryPath);
    }
    for (const name of names) {
      expect(name).not.toContain("..");
      expect(name).not.toContain("\\");
      expect(name.startsWith("/")).toBe(false);
      expect(name).not.toMatch(/^[a-zA-Z]:/);
      expect(name).not.toContain("\u0000");
    }
    for (const name of names) {
      expect(name.split("/").every((segment) => segment !== "..")).toBe(true);
    }
  });

  it("a folder/file pair built from an empty-after-sanitizing job still yields a valid, non-empty archive entry", async () => {
    const job = { title: "../../../..", company: "////" };
    const folder = packageFolderName(job);
    const fileName = documentFileName("cover-letter", job);
    const entryPath = assertSafeEntryPath(`${folder}/${fileName}`);

    expect(folder.length).toBeGreaterThan(0);
    expect(fileName.length).toBeGreaterThan(0);

    const zip = new JSZip();
    zip.file(entryPath, "cover letter content");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    expect(readRawLocalFileNames(buffer)).toContain(entryPath);
    expect(entryPath).not.toContain("..");
  });
});
