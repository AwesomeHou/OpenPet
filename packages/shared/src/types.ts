export const normalizedStates = [
  "idle",
  "thinking",
  "streaming",
  "waiting",
  "error",
  "done",
] as const;

export type NormalizedState = (typeof normalizedStates)[number];

export const petActionNames = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
] as const;

export type PetActionName = (typeof petActionNames)[number];

export interface RawPageSignals {
  site: "deepseek";
  composerReady: boolean;
  sendTriggered: boolean;
  responseGrowing: boolean;
  errorVisible: boolean;
  settled: boolean;
  tabActive: boolean;
  timestamp: number;
}

export interface PetMetadata {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
}

export interface StoredPetRecord {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  spritesheetDataUrl: string;
  importedAt: number;
}

export interface OverlayPlacement {
  left: number;
  top: number;
  facing: "left" | "right";
}

export interface TabPetState {
  tabId: number;
  url: string;
  site: "deepseek";
  state: NormalizedState;
  updatedAt: number;
}
