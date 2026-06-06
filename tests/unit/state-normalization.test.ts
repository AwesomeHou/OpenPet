import { describe, expect, test } from "vitest";
import { normalizeSignals } from "@openpet/state/normalize";
import type { RawPageSignals } from "@openpet/shared/types";

function baseSignals(overrides: Partial<RawPageSignals> = {}): RawPageSignals {
  return {
    site: "deepseek",
    composerReady: true,
    sendTriggered: false,
    responseGrowing: false,
    errorVisible: false,
    settled: false,
    tabActive: true,
    timestamp: 1,
    ...overrides,
  };
}

describe("normalizeSignals", () => {
  test("returns waiting when the page is not ready", () => {
    expect(normalizeSignals(baseSignals({ composerReady: false }))).toBe("waiting");
  });

  test("returns streaming once a send cycle is active", () => {
    expect(normalizeSignals(baseSignals({ sendTriggered: true }))).toBe("streaming");
  });

  test("returns streaming when the response is growing", () => {
    expect(normalizeSignals(baseSignals({ sendTriggered: true, responseGrowing: true }))).toBe(
      "streaming"
    );
  });

  test("returns done when the response has settled", () => {
    expect(normalizeSignals(baseSignals({ sendTriggered: true, settled: true }))).toBe("done");
  });

  test("returns error when an error is visible", () => {
    expect(normalizeSignals(baseSignals({ errorVisible: true }))).toBe("error");
  });
});
