import { afterEach, describe, expect, it, vi } from "vitest";

const parseStructured = vi.fn();
vi.mock("@/lib/live/nemotron", () => ({ parseStructured }));

const PAGE =
  "<html><body><script>ignore()</script><h1>Senior Firmware Engineer</h1>" +
  "<p>Acme Robotics is hiring in Austin, TX.</p><ul>" +
  "<li>5+ years of embedded C experience</li>" +
  "<li>Experience with RTOS scheduling</li></ul>" +
  `<p>${"We build robots that work alongside people in warehouses. ".repeat(12)}</p>` +
  "</body></html>";

const run = async (html = PAGE) => {
  const { readPostingWithModel } = await import("@/lib/intake/modelFallback");
  return readPostingWithModel({ html, url: "https://acme.example/jobs/1", fetchedAt: "2026-01-01T00:00:00.000Z" });
};

afterEach(() => parseStructured.mockReset());

describe("readPostingWithModel", () => {
  it("keeps what the page says and marks it for the user to confirm", async () => {
    parseStructured.mockResolvedValue({
      isJobPosting: true,
      title: "Senior Firmware Engineer",
      company: "Acme Robotics",
      location: "Austin, TX",
      requirements: [{ text: "5+ years of embedded C experience", kind: "minimum" }],
    });
    const out = await run();
    expect(out?.job?.title).toBe("Senior Firmware Engineer");
    expect(out?.job?.company).toBe("Acme Robotics");
    expect(out?.job?.source).toBe("nemotron");
    expect(out?.fieldOrigins.title).toBe("derived");
    expect(out?.job?.requirements.map((r) => r.text)).toEqual(["5+ years of embedded C experience"]);
    expect(out?.assumptions.join(" ")).toMatch(/Nemotron/);
    // The page went to the model as fenced, untrusted data on the fast model.
    const call = parseStructured.mock.calls[0][0];
    expect(call.model).toBe("lightning");
    expect(call.untrusted[0].text).toContain("Senior Firmware Engineer");
    expect(call.untrusted[0].text).not.toContain("ignore()");
    expect(call.task).not.toContain("Acme");
  });

  it("DROPS anything the model says that the page does not, the page is the authority", async () => {
    parseStructured.mockResolvedValue({
      isJobPosting: true,
      title: "Senior Firmware Engineer",
      company: "Acme Robotics",
      location: "Remote (Worldwide)",
      requirements: [
        { text: "Experience with RTOS scheduling", kind: "minimum" },
        { text: "PhD in Computer Science", kind: "minimum" },
      ],
    });
    const out = await run();
    expect(out?.job?.requirements.map((r) => r.text)).toEqual(["Experience with RTOS scheduling"]);
    expect(out?.job?.location).not.toBe("Remote (Worldwide)");
  });

  it("an invented company means no job at all, not a guessed one", async () => {
    parseStructured.mockResolvedValue({ isJobPosting: true, title: "Senior Firmware Engineer", company: "Globex" });
    const out = await run();
    expect(out?.job).toBeUndefined();
    expect(out?.partial?.title).toBe("Senior Firmware Engineer");
    expect(out?.partial?.company).toBeUndefined();
  });

  it("does not spend a model call on an empty JavaScript shell, or trust a non-posting", async () => {
    expect(await run("<html><body><div id='root'></div></body></html>")).toBeUndefined();
    expect(parseStructured).not.toHaveBeenCalled();
    parseStructured.mockResolvedValue({ isJobPosting: false });
    expect(await run()).toBeUndefined();
  });
});
