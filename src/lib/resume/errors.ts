/**
 * Rasterisation failures, in their own module so the PDF pipeline and the
 * worker that runs it can both raise them without importing each other.
 */

export type ResumeRasterizeCode =
  | "empty-file"
  | "not-a-pdf"
  | "encrypted"
  | "corrupt"
  | "no-pages"
  | "blank-render"
  | "worker-unavailable"
  | "render-failed";

/** A rasterisation failure carrying a message that is safe to show the user. */
export class ResumeRasterizeError extends Error {
  readonly code: ResumeRasterizeCode;

  constructor(code: ResumeRasterizeCode, message: string) {
    super(message);
    this.name = "ResumeRasterizeError";
    this.code = code;
  }
}
