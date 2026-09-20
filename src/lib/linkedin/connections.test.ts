import { describe, expect, it } from "vitest";
import {
  ConnectionsCsvError,
  parseConnectionsCsv,
} from "@/lib/linkedin/connections";

describe("parseConnectionsCsv", () => {
  it("parses LinkedIn's standard headers and quoted commas", () => {
    const rows = parseConnectionsCsv(
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n" +
        'Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace,,Analytical Engines,"Staff, Research",01/01/2024\n',
    );

    expect(rows).toEqual([
      {
        name: "Ada Lovelace",
        profileUrl: "https://www.linkedin.com/in/ada-lovelace",
        company: "Analytical Engines",
        position: "Staff, Research",
        connectedOn: "01/01/2024",
      },
    ]);
  });

  it("reads a REAL export, which opens with a Notes preamble before the header", () => {
    const rows = parseConnectionsCsv(
      "Notes:\n" +
        '"When exporting your connection data, you may notice that some of the email addresses are missing."\n' +
        "\n" +
        "First Name,Last Name,URL,Email Address,Company,Position,Connected On\n" +
        "Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace,,Analytical Engines,Engineer,01 Jan 2024\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ada Lovelace");
  });

  it("deduplicates rows and rejects unrelated files", () => {
    const csv =
      "First Name,Last Name,URL\n" +
      "Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace\n" +
      "Ada,Lovelace,https://www.linkedin.com/in/ada-lovelace\n";
    expect(parseConnectionsCsv(csv)).toHaveLength(1);
    expect(() => parseConnectionsCsv("foo,bar\n1,2\n")).toThrow(ConnectionsCsvError);
  });
});
