import type {
  OverlaySceneState,
  RawPageSignals,
  SiteId,
  TabPetState,
} from "./types";

export const messageTypes = {
  pageSignals: "openpet/page-signals",
  stateUpdate: "openpet/state-update",
  sceneUpdate: "openpet/scene-update",
  focusTab: "openpet/focus-tab",
  importPet: "openpet/import-pet",
  batchImportPets: "openpet/batch-import-pets",
  setAnimationSpeed: "openpet/set-animation-speed",
  setSitePetBinding: "openpet/set-site-pet-binding",
  setSitePetVisibility: "openpet/set-site-pet-visibility",
  deletePets: "openpet/delete-pets",
  clearPets: "openpet/clear-pets",
  toggleOverlay: "openpet/toggle-overlay",
  popupSnapshot: "openpet/popup-snapshot",
  currentSceneState: "openpet/current-scene-state",
} as const;

export interface PageSignalsMessage {
  type: typeof messageTypes.pageSignals;
  tabId?: number;
  payload: RawPageSignals;
}

export interface StateUpdateMessage {
  type: typeof messageTypes.stateUpdate;
  payload: {
    scene: OverlaySceneState;
  };
}

export interface SceneUpdateMessage {
  type: typeof messageTypes.sceneUpdate;
  payload: {
    scene: OverlaySceneState;
    visible: boolean;
    animationSpeed: number;
  };
}

export interface FocusTabMessage {
  type: typeof messageTypes.focusTab;
  payload?: {
    tabId?: number;
  };
}

export interface ImportPetMessage {
  type: typeof messageTypes.importPet;
  payload: {
    bytes: number[];
    filename: string;
  };
}

export interface BatchImportPetsMessage {
  type: typeof messageTypes.batchImportPets;
  payload: {
    files: Array<{
      bytes: number[];
      filename: string;
    }>;
  };
}

export interface ToggleOverlayMessage {
  type: typeof messageTypes.toggleOverlay;
  payload: {
    visible: boolean;
  };
}

export interface SetAnimationSpeedMessage {
  type: typeof messageTypes.setAnimationSpeed;
  payload: {
    speed: number;
  };
}

export interface SetSitePetBindingMessage {
  type: typeof messageTypes.setSitePetBinding;
  payload: {
    siteId: SiteId;
    petId: string | null;
  };
}

export interface SetSitePetVisibilityMessage {
  type: typeof messageTypes.setSitePetVisibility;
  payload: {
    siteId: SiteId;
    visible: boolean;
  };
}

export interface DeletePetsMessage {
  type: typeof messageTypes.deletePets;
  payload: {
    petIds: string[];
  };
}

export interface ClearPetsMessage {
  type: typeof messageTypes.clearPets;
}

export interface PopupSnapshotMessage {
  type: typeof messageTypes.popupSnapshot;
  payload: {
    pets: Array<{ id: string; displayName: string; boundSites: SiteId[] }>;
    sitePetBindings: Partial<Record<SiteId, string>>;
    sitePetVisibility: Partial<Record<SiteId, boolean>>;
    overlayVisible: boolean;
    animationSpeed: number;
  };
}

export interface CurrentSceneStateMessage {
  type: typeof messageTypes.currentSceneState;
}

export type OpenPetMessage =
  | PageSignalsMessage
  | StateUpdateMessage
  | SceneUpdateMessage
  | FocusTabMessage
  | ImportPetMessage
  | BatchImportPetsMessage
  | SetAnimationSpeedMessage
  | SetSitePetBindingMessage
  | SetSitePetVisibilityMessage
  | DeletePetsMessage
  | ClearPetsMessage
  | ToggleOverlayMessage
  | PopupSnapshotMessage
  | CurrentSceneStateMessage;
