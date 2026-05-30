import type { NormalizedState, RawPageSignals } from "@openpet/shared/types";

export function normalizeSignals(signals: RawPageSignals): NormalizedState {
  if (signals.errorVisible) {
    return "error";
  }

  if (!signals.composerReady) {
    return "waiting";
  }

  if (signals.responseGrowing) {
    return "streaming";
  }

  if (signals.sendTriggered && !signals.settled) {
    return "thinking";
  }

  if (signals.settled) {
    return "done";
  }

  return "idle";
}
