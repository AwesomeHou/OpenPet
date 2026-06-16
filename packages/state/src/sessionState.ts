import type { RawPageSignals, TabPetState } from "@openpet/shared/types";
import { normalizeSignals } from "./normalize";

export function createTabState(tabId: number, url: string, signals: RawPageSignals): TabPetState {
  return {
    tabId,
    url,
    site: signals.site,
    state: normalizeSignals(signals),
    updatedAt: signals.timestamp,
  };
}
