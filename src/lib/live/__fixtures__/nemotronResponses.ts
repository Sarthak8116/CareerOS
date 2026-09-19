/**
 * Fixture NVIDIA Nemotron API responses.
 *
 * Built from the FROZEN contract (careeros/contract/p2.5-nemotron-provider),
 * which was itself measured against the live
 * https://integrate.api.nvidia.com/v1/chat/completions endpoint — not read
 * from NVIDIA's docs (see careeros/lessons/p1-retrospective: "read the real
 * payload, never the summary of it" cost us four silent bugs in P1; these
 * fixtures exist so the same mistake can't happen here).
 *
 * The test suite runs entirely on these fixtures — no live calls — per the
 * tester brief. The endpoint is OpenAI-compatible chat completions, so
 * shapes follow that convention (`choices[0].message.content`).
 */

// ---------------------------------------------------------------------------
// Lightning (nvidia/nemotron-3.5-lightning-30b-a3b) — a REASONING model.
//
// MEASURED:
//   default                                  -> prose, NOT JSON        2.4s
//   + response_format json_object ONLY       -> valid JSON, still slow 11.9s
//   + chat_template_kwargs {thinking:false}   -> valid JSON, fast      0.7s
//   + BOTH                                    -> valid JSON, fast      0.6s
//
// The 17x latency gap is the hidden reasoning pass, not network variance.
// Both flags MUST be sent on every text call (Super/Nano too, for
// consistency, though Super returns clean JSON without them).
// ---------------------------------------------------------------------------

/** Default call, no suppression: NOT valid JSON — parseStructured must throw. */
export const lightningDefaultResponse = {
  choices: [
    {
      message: {
        content:
          "Here's a thinking process:\n\nLet me analyze this job posting step by step and work out the structured fields...",
      },
    },
  ],
};

/** response_format:json_object ALONE: valid JSON, but reasoning still ran (measured 11.9s). */
export const lightningJsonObjectOnlyResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({ __fixtureNote: "11.9s hidden-reasoning path" }),
      },
    },
  ],
};

/** chat_template_kwargs:{thinking:false}, or BOTH flags: valid JSON, fast (0.6-0.7s measured). */
export const lightningSuppressedResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({ __fixtureNote: "0.6s suppressed-reasoning path" }),
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Nemotron Parse (nvidia/nemotron-parse) — MEASURED CONSTRAINTS:
//   plain string content      -> 400 "The model does not support text input"
//   image_url data URL (PNG)  -> 200 OK
//   PDF base64 as image_url   -> 400 "Supported formats: JPEG, PNG, BMP, TIFF, WEBP or base64 data URLs"
//
// Parse cannot take a PDF. Anything that can hand Parse a PDF is a finding.
// ---------------------------------------------------------------------------

export const parseRejectsTextInput = {
  status: 400,
  body: { error: { message: "The model does not support text input" } },
};

export const parseRejectsPdfInput = {
  status: 400,
  body: {
    error: {
      message:
        "Supported formats: JPEG, PNG, BMP, TIFF, WEBP or base64 data URLs",
    },
  },
};

export const parseAcceptsImageInput = {
  choices: [
    {
      message: {
        content: JSON.stringify({ name: "Fixture Candidate", evidence: [] }),
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Auth failure, shared shape across all four models — used to assert the
// safe-error-message mapping never leaks the key or provider internals.
// ---------------------------------------------------------------------------

export const authFailureResponse = {
  status: 401,
  body: { error: { message: "Invalid API key" } },
};

export const rateLimitedResponse = {
  status: 429,
  body: { error: { message: "Rate limit exceeded" } },
};
