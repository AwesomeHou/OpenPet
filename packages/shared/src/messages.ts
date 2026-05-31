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
  setSitePetBinding: "openpet/set-site-pet-binding",
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

export interface ToggleOverlayMessage {
  type: typeof messageTypes.toggleOverlay;
  payload: {
    visible: boolean;
  };
}

export interface SetSitePetBindingMessage {
  type: typeof messageTypes.setSitePetBinding;
  payload: {
    siteId: SiteId;
    petId: string;
  };
}

export interface ClearPetsMessage {
  type: typeof messageTypes.clearPets;
}

export interface PopupSnapshotMessage {
  type: typeof messageTypes.popupSnapshot;
  payload: {
    currentTab: TabPetState | null;
    pets: Array<{ id: string; displayName: string }>;
    sitePetBindings: Partial<Record<SiteId, string>>;
    overlayVisible: boolean;
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
  | SetSitePetBindingMessage
  | ClearPetsMessage
  | ToggleOverlayMessage
  | PopupSnapshotMessage
  | CurrentSceneStateMessage;
