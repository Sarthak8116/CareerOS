import "server-only";

import type { IntakeResponse, IntakeResult } from "@/lib/intake/types";
import { IntakeError, PASTE_JOB_MESSAGE, intakeSafeMessage } from "@/lib/intake/types";
import { adapterFor } from "@/lib/intake/adapters";
import { asJson, resolveFinalUrl, safeFetch } from "@/lib/intake/fetch";
import { isShortlink, toUrl } from "@/lib/intake/urls";
import { liveModeAvailable } from "@/lib/live/nemotron";
import {
  MODEL_ADAPTER_KEY,
  MODEL_ADAPTER_LABEL,
  readPostingWithModel,
} from "@/lib/intake/modelFallback";

/**
 * Intake orchestration: the only module that decides WHAT to fetch for a given
 * job link and in what order. Everything it returns is already validated,
 * sanitized and mapped into app shapes, callers never see a raw board record.
 *
 * It NEVER throws upward. Every failure comes back as `ok: false` with a coarse
 * reason and a fallback the UI can offer, because a job link that cannot be
 * read is an ordinary outcome of this feature, not an exception.
 *
 * Partial success is `ok: true` with `form.completeness: "none"`. That is the
 * NORMAL path for Lever, Ashby and Workday, we got the job but not the
 * application questions, and it must never be reported as an error.
 */

/** Map an HTTP status onto the coarse reason the UI explains. */
function errorForStatus(status: number): IntakeError | undefined {
  if (status >= 200 && status < 300) return undefined;
  if (status === 404 || status === 410) {
    return new IntakeError("not-found", "That posting could not be found.");
  }
  if (status === 401 || status === 403) {
    return new IntakeError("blocked", "That posting is not publicly readable.");
  }
  if (status === 429) {
    return new IntakeError("rate-limited", "That job board is rate limiting us.");
  }
  return new IntakeError("upstream", "That job board returned an error.");
}

/** A board that answers 200 with an empty body told us nothing usable. */
function isEmptyBody(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Read a job posting from a URL.
 *
 * @param rawUrl  the link the user pasted
 * @param now     injected clock, so callers and tests control `fetchedAt`
 */
export async function intakeFromUrl(
  rawUrl: string,
  now: () => string = () => new Date().toISOString(),
): Promise<IntakeResult> {
  const fetchedAt = now();

  try {
    const trimmed = rawUrl.trim();
    if (!toUrl(trimmed)) {
      return {
        ok: false,
        reason: "unsafe-url",
        message: intakeSafeMessage(new IntakeError("unsafe-url", "")),
        fallback: "paste-job",
      };
    }

    // Shortlinks carry no ids of their own, so resolve before choosing an
    // adapter. The redirect is followed through the same SSRF guard.
    let target = trimmed;
    if (isShortlink(trimmed)) {
      target = await resolveFinalUrl(trimmed);
    }

    const url = toUrl(target);
    if (!url) {
      return {
        ok: false,
        reason: "unsafe-url",
        message: intakeSafeMessage(new IntakeError("unsafe-url", "")),
        fallback: "paste-job",
      };
    }

    const adapter = adapterFor(url);
    const requests = adapter.plan(url);

    if (requests.length === 0) {
      // The host matched an ATS but the path did not yield the ids we need,
      // a board listing page rather than a posting, usually.
      return {
        ok: false,
        reason: "unsupported-source",
        message: intakeSafeMessage(
          new IntakeError("unsupported-source", ""),
        ),
        fallback: "paste-job",
        partial: { url: url.toString() },
      };
    }

    const responses: IntakeResponse[] = [];
    for (const request of requests) {
      const res = await safeFetch(request.url);

      const statusError = errorForStatus(res.status);
      if (statusError) {
        return {
          ok: false,
          reason: statusError.kind,
          message: intakeSafeMessage(statusError),
          fallback: "paste-job",
          partial: { url: url.toString() },
        };
      }
      if (isEmptyBody(res.text)) {
        return {
          ok: false,
          reason: "unreadable",
          message: PASTE_JOB_MESSAGE,
          fallback: "paste-job",
          partial: { url: url.toString() },
        };
      }

      responses.push({
        kind: request.kind,
        status: res.status,
        contentType: res.contentType,
        // Content-type is checked before parsing: a wrong Ashby slug answers
        // with the plain text "Not Found", which an unconditional JSON parse
        // would turn into a crash instead of a clean failure.
        json: asJson(res),
        text: res.text,
      });
    }

    const output = adapter.parse({
      responses,
      url: url.toString(),
      fetchedAt,
    });

    if (!output.job) {
      // The site readers found no posting. With NVIDIA keys configured, let
      // Nemotron read the page text before giving up. Any failure in there,
      // no keys, a model error, a page that is not a posting, falls through
      // to the same honest "paste it instead" the user got before.
      const page = responses.find((r) => r.kind === "posting" && r.text)?.text;
      if (page && liveModeAvailable()) {
        try {
          const viaModel = await readPostingWithModel({
            html: page,
            url: url.toString(),
            fetchedAt,
          });
          if (viaModel?.job) {
            return {
              ok: true,
              job: viaModel.job,
              form: viaModel.form,
              descriptionFull: viaModel.descriptionFull,
              fieldOrigins: viaModel.fieldOrigins,
              adapter: MODEL_ADAPTER_KEY,
              adapterLabel: MODEL_ADAPTER_LABEL,
              fetchedAt,
              assumptions: viaModel.assumptions,
              warnings: viaModel.warnings,
            };
          }
          if (viaModel?.partial) output.partial ??= viaModel.partial;
        } catch {
          // Deliberately silent: the fallback below already tells the truth.
        }
      }
      return {
        ok: false,
        reason: "unreadable",
        message: PASTE_JOB_MESSAGE,
        fallback: "paste-job",
        ...(output.partial ? { partial: output.partial } : {}),
      };
    }

    return {
      ok: true,
      job: output.job,
      form: output.form,
      descriptionFull: output.descriptionFull,
      fieldOrigins: output.fieldOrigins,
      adapter: adapter.key,
      adapterLabel: adapter.label,
      fetchedAt,
      assumptions: output.assumptions,
      warnings: output.warnings,
    };
  } catch (err) {
    // Every failure degrades to an honest, actionable result.
    const reason = err instanceof IntakeError ? err.kind : "unreadable";
    return {
      ok: false,
      reason,
      message: intakeSafeMessage(err),
      fallback: "paste-job",
    };
  }
}
