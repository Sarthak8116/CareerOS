import { beforeEach, describe, expect, it } from "vitest";
import {
  getStyleMemory,
  recordResumeDecision,
  resetStyleMemory,
} from "@/lib/styleMemory";

describe("resume style memory", () => {
  beforeEach(() => resetStyleMemory());

  it("starts neutral and learns accepted presentation signals", () => {
    expect(getStyleMemory()).toEqual({
      proofLinks: "neutral",
      mergedBullets: "neutral",
    });

    recordResumeDecision({
      original: "Built a simulator",
      suggested:
        "Built a simulator (github.com/example/sim); debugged edge cases",
      previousStatus: "pending",
      nextStatus: "accepted",
    });

    expect(getStyleMemory()).toEqual({
      proofLinks: "more",
      mergedBullets: "more",
    });
  });

  it("handles toggling a decision without double-counting it", () => {
    const decision = {
      original: "Built a simulator",
      suggested: "Built a simulator (github.com/example/sim)",
    };
    recordResumeDecision({
      ...decision,
      previousStatus: "pending",
      nextStatus: "accepted",
    });
    recordResumeDecision({
      ...decision,
      previousStatus: "accepted",
      nextStatus: "pending",
    });

    expect(getStyleMemory()).toEqual({
      proofLinks: "neutral",
      mergedBullets: "neutral",
    });
  });
});
