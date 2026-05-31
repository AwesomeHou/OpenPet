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

export const siteIds = ["deepseek", "gemini"] as const;

export type SiteId = (typeof siteIds)[number];

export interface RawPageSignals {
  site: SiteId;
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

export interface ScenePetState {
  petId: string;
  siteId: SiteId;
  tabId: number;
  state: NormalizedState;
  pet: StoredPetRecord;
  placement: OverlayPlacement;
}

export interface OverlaySceneState {
  pets: ScenePetState[];
  visible: boolean;
}

export interface TabPetState {
  tabId: number;
  url: string;
  site: SiteId;
  state: NormalizedState;
  updatedAt: number;
}
