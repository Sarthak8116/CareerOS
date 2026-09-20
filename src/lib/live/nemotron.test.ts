import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
  lightningDefaultResponse,
  parseRejectsPdfInput,
} from "@/lib/live/__fixtures__/nemotronResponses";

/**
 * Behavioral tests for the Nemotron provider (src/lib/live/nemotron.ts),
 * built entirely on FIXTURES derived from the FROZEN contract
 * (careeros/contract/p2.5-nemotron-provider), which was itself measured
 * against the live API. No live calls happen in this suite, `fetch` is
 * mocked throughout.
 *
 * Static guards (server-only, no console.*, key never reaches a
 * log/error/response) live in `keySafety.test.ts`. This file covers the
 * MECHANISM: request shape, the corrective retry, per-model key fallback,
 * and the Nemotron Parse image-only boundary.
 */

const ENV_KEYS = [
  "NVIDIA_API_KEY_PARSE",
  "NVIDIA_API_KEY_NANO",
  "NVIDIA_API_KEY_SUPER",
  "NVIDIA_API_KEY_LIGHTNING",
  "NVIDIA_API_KEY",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const Schema = z.object({ ok: z.boolean() });

describe("liveModeAvailable, the no-key path (the ONLY proven-working path)", () => {
  it("is false with no NVIDIA key set", async () => {
    const { liveModeAvailable } = await import("@/lib/live/nemotron");
    expect(liveModeAvailable()).toBe(false);
  });

  it("is true once a single shared NVIDIA_API_KEY is set", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const { liveModeAvailable } = await import("@/lib/live/nemotron");
    expect(liveModeAvailable()).toBe(true);
  });

  it("is true with only ONE of the four per-model keys set", async () => {
    process.env.NVIDIA_API_KEY_SUPER = "super-key-value";
    const { liveModeAvailable } = await import("@/lib/live/nemotron");
    expect(liveModeAvailable()).toBe(true);
  });
});

describe("parseStructured, request shape (Lightning reasoning-suppression contract)", () => {
  it("sends BOTH response_format:json_object AND chat_template_kwargs:{thinking:false} on every schema-constrained call, for every model role", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    for (const role of ["lightning", "super", "nano"] as const) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(lightningBothFlagsBody()));
      vi.stubGlobal("fetch", fetchMock);
      vi.resetModules();
      const { parseStructured } = await import("@/lib/live/nemotron");
      await parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "x",
        model: role,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.response_format, `role=${role}`).toEqual({
        type: "json_object",
      });
      expect(body.chat_template_kwargs, `role=${role}`).toEqual({
        thinking: false,
      });
    }
  });

  function lightningBothFlagsBody() {
    return { choices: [{ message: { content: '{"ok":true}' } }] };
  }

  it("throws instead of returning prose when the model answers unsuppressed (the measured default-Lightning failure mode)", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    // Fixture: this is what Lightning returns with NEITHER flag, the shape
    // this app must never actually send, but if it did, parseStructured must
    // not silently accept the prose as if it were the JSON answer.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(lightningDefaultResponse));
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await expect(
      parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "x",
        model: "lightning",
      }),
    ).rejects.toThrow(/schema-valid/);
    // One corrective retry is expected even on totally unparseable prose.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("parseStructured, ONE corrective retry (must not be quietly dropped)", () => {
  it("retries exactly once after a schema-validation miss, then succeeds", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"ok":"not-a-boolean"}' } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    const result = await parseStructured({
      system: "s",
      task: "t",
      schema: Schema,
      schemaName: "x",
      model: "super",
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The retry request must show the model its bad output plus the errors,
    // not just repeat the original prompt verbatim.
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    const roles = (secondBody.messages as { role: string }[]).map(
      (m) => m.role,
    );
    expect(roles).toContain("assistant");
    expect(roles.filter((r) => r === "user").length).toBeGreaterThanOrEqual(2);
  });

  it("throws (does not retry a third time) when the correction also fails validation", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"ok":"still-not-a-boolean"}' } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await expect(
      parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "widget",
        model: "super",
      }),
    ).rejects.toThrow(/schema-valid widget/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("per-model key with any-NVIDIA-key fallback (VERIFIED: one key reaches all models)", () => {
  it("uses the per-model key when present", async () => {
    process.env.NVIDIA_API_KEY_SUPER = "super-specific-key";
    process.env.NVIDIA_API_KEY = "shared-fallback-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await parseStructured({
      system: "s",
      task: "t",
      schema: Schema,
      schemaName: "x",
      model: "super",
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer super-specific-key");
  });

  it("falls back to any other NVIDIA key when the per-model key is absent", async () => {
    process.env.NVIDIA_API_KEY_LIGHTNING = "lightning-only-key";
    // No NVIDIA_API_KEY_SUPER set.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await parseStructured({
      system: "s",
      task: "t",
      schema: Schema,
      schemaName: "x",
      model: "super",
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer lightning-only-key");
  });

  it("throws before ever calling fetch when no key at all is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await expect(
      parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "x",
        model: "super",
      }),
    ).rejects.toThrow(/No NVIDIA API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("key material never survives an error round-trip (scrub)", () => {
  const CANARY = "canary-secret-9f3a7c21";

  it("scrubs the key out of a non-2xx response body the API echoes back", async () => {
    process.env.NVIDIA_API_KEY_SUPER = CANARY;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => `Invalid Authorization header: Bearer ${CANARY}`,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await expect(
      parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "x",
        model: "super",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(CANARY);
      return true;
    });
  });

  it("scrubs the key out of a network-failure message", async () => {
    process.env.NVIDIA_API_KEY_SUPER = CANARY;
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error(`fetch failed for key ${CANARY}`));
    vi.stubGlobal("fetch", fetchMock);
    const { parseStructured } = await import("@/lib/live/nemotron");
    await expect(
      parseStructured({
        system: "s",
        task: "t",
        schema: Schema,
        schemaName: "x",
        model: "super",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(CANARY);
      return true;
    });
  });
});

describe("Nemotron Parse, image-only boundary (MEASURED: rejects text AND PDF)", () => {
  it("isSupportedPageImage accepts a PNG/JPEG data URL", async () => {
    const { isSupportedPageImage } = await import("@/lib/live/nemotron");
    expect(
      isSupportedPageImage(
        "data:image/png;base64," + "A".repeat(40),
      ),
    ).toBe(true);
    expect(
      isSupportedPageImage(
        "data:image/jpeg;base64," + "A".repeat(40),
      ),
    ).toBe(true);
  });

  it("isSupportedPageImage rejects a PDF data URL, MEASURED: nemotron-parse 400s on PDF base64", async () => {
    const { isSupportedPageImage } = await import("@/lib/live/nemotron");
    // Fixture from the contract: this is the shape of input that produces
    // parseRejectsPdfInput (400) from the live API, it must never reach fetch.
    expect(
      isSupportedPageImage("data:application/pdf;base64," + "A".repeat(40)),
    ).toBe(false);
    expect(parseRejectsPdfInput.status).toBe(400);
  });

  it("isSupportedPageImage rejects plain text", async () => {
    const { isSupportedPageImage } = await import("@/lib/live/nemotron");
    expect(isSupportedPageImage("just some resume text")).toBe(false);
    expect(isSupportedPageImage(123)).toBe(false);
    expect(isSupportedPageImage(undefined)).toBe(false);
  });
});

describe("readDocumentPages, reasoning suppression during transcription (RESOLVED, was an open it.todo)", () => {
  // Previously flagged and left as it.todo: the frozen contract only measured
  // Lightning's reasoning-suppression requirement for JSON-mode calls, and an
  // earlier revision of chat() coupled chat_template_kwargs:{thinking:false}
  // to the `json` flag, so page transcription (json:false) never sent it,
  // risking hidden-reasoning prose landing in the transcript from whichever
  // reasoning-named model does the fallback read.
  //
  // The mechanism has since changed (nemotron.ts:156-158): `thinking:false`
  // is now sent for every role EXCEPT "parse", independent of `json`. Per the
  // instruction to rewrite against the real mechanism rather than patch
  // assertions, this is now a real, asserted behavioral test rather than a
  // todo, it fails again if that coupling regresses.
  it("sends chat_template_kwargs:{thinking:false} on the plain-text fallback transcription call, but never on the PARSE call", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const fetchMock = vi
      .fn()
      // 1st call: PARSE attempt on the one page, fails, forcing the fallback.
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "parse failed",
        json: async () => ({}),
      } as Response)
      // 2nd call: fallback-role attempt on the same page, succeeds.
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "transcribed text" } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { readDocumentPages } = await import("@/lib/live/nemotron");

    const result = await readDocumentPages({
      label: "resume",
      pages: ["data:image/png;base64," + "A".repeat(40)],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );

    // PARSE: no chat_template_kwargs (it's a document VLM, not a chat/reasoning
    // model, the contract never measured a "thinking" issue for it).
    expect(firstBody.chat_template_kwargs).toBeUndefined();
    // Fallback role: thinking suppression IS sent, even though this is a
    // plain-text (non-JSON) call.
    expect(secondBody.chat_template_kwargs).toEqual({ thinking: false });
    // Neither transcription call asks for JSON, the output is prose.
    expect(firstBody.response_format).toBeUndefined();
    expect(secondBody.response_format).toBeUndefined();
    expect(result.model).not.toBe("parse");
    expect(result.text).toContain("transcribed text");
  });
});

describe("RESUME_SHAPER vs. PAGE_READER_FALLBACK, deliberate deviation from the frozen contract, ruled and explained", () => {
  // RESOLVED: flagged as an unexplained contradiction (RESUME_SHAPER="super"
  // vs. comments/contract both still saying "nano"); team-lead ruled it a
  // deliberate correctness call (the evidence graph is honesty-critical, so
  // shaping gets the stronger model) and nemotron.ts:48 now explains why.
  // Pinning both constants, not just asserting they exist, because coder-
  // nemotron reported a real transient bug in this exact area: RESUME_SHAPER
  // and the page-reading fallback used to be ONE constant when both were
  // "nano". Flipping the shaper to "super" without splitting them would have
  // silently repointed page-image reading at a text-only model, every page
  // would fail and get reported as "we could not read your résumé", a lie
  // about the cause. PAGE_READER_FALLBACK now exists specifically to keep
  // these independent; test that they stay that way.
  it("RESUME_SHAPER is 'super' (structured shaping) and PAGE_READER_FALLBACK is 'nano' (must stay multimodal)", async () => {
    const { RESUME_SHAPER, PAGE_READER_FALLBACK } = await import(
      "@/lib/live/nemotron"
    );
    expect(RESUME_SHAPER).toBe("super");
    expect(PAGE_READER_FALLBACK).toBe("nano");
    // The bug class this guards: these must never collapse back to one value.
    expect(PAGE_READER_FALLBACK).not.toBe(RESUME_SHAPER);
  });

  it("readDocumentPages' fallback pass actually calls the nano model, not whatever RESUME_SHAPER is", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const fetchMock = vi
      .fn()
      // PARSE attempt on the one page, fails, forcing the fallback.
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "parse failed",
        json: async () => ({}),
      } as Response)
      // Fallback attempt, succeeds.
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "transcribed" } }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { readDocumentPages, NEMOTRON_MODELS } = await import(
      "@/lib/live/nemotron"
    );

    const result = await readDocumentPages({
      label: "resume",
      pages: ["data:image/png;base64," + "A".repeat(40)],
    });

    expect(result.model).toBe("nano");
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondBody.model).toBe(NEMOTRON_MODELS.nano);
    expect(secondBody.model).not.toBe(NEMOTRON_MODELS.super);
  });
});

describe("readDocumentPages, re-guards page format before any bytes leave for the API", () => {
  // isSupportedPageImage is live code inside readDocumentPages, not just the
  // exported predicate (which the earlier "image-only boundary" describe
  // block above tests directly). The route already validates PNG + magic
  // bytes before calling in, so a page failing THIS check is our own bug,
  // and per coder-nemotron, it deliberately throws rather than marking the
  // page "unreadable", because telling the user their résumé was unreadable
  // when the actual fault is ours would be dishonest.
  it("throws (does not silently mark the page unreadable) and never calls fetch when a page isn't a supported image", async () => {
    process.env.NVIDIA_API_KEY = "shared-key-value";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { readDocumentPages } = await import("@/lib/live/nemotron");

    await expect(
      readDocumentPages({
        label: "resume",
        pages: ["data:application/pdf;base64," + "A".repeat(40)],
      }),
    ).rejects.toThrow(/not a supported image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
