import { describe, expect, it } from "vitest";
import { gmailComposeUrl } from "@/lib/outreachSend";

describe("gmailComposeUrl", () => {
  it("fills subject and body and always targets Gmail's compose window", () => {
    const url = new URL(gmailComposeUrl({ subject: "Hi & hello", body: "Line 1\nLine 2" }));
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("su")).toBe("Hi & hello");
    expect(url.searchParams.get("body")).toBe("Line 1\nLine 2");
    expect(url.searchParams.has("to")).toBe(false);
  });

  it("drops anything that is not a single plain address — no header smuggling", () => {
    for (const to of ["a@b.com, evil@x.com", "a@b.com\nBcc: evil@x.com", "not-an-email", " "]) {
      expect(new URL(gmailComposeUrl({ to, subject: "s", body: "b" })).searchParams.has("to")).toBe(false);
    }
    expect(new URL(gmailComposeUrl({ to: " ada@example.com ", subject: "s", body: "b" })).searchParams.get("to")).toBe("ada@example.com");
  });
});
