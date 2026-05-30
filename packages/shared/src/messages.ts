import type { NormalizedState, RawPageSignals, StoredPetRecord, TabPetState } from "./types";

export const messageTypes = {
  pageSignals: "openpet/page-signals",
  stateUpdate: "openpet/state-update",
  focusTab: "openpet/focus-tab",
  importPet: "openpet/import-pet",
  selectPet: "openpet/select-pet",
  clearPets: "openpet/clear-pets",
  toggleOverlay: "openpet/toggle-overlay",
  popupSnapshot: "openpet/popup-snapshot",
  currentDisplayState: "openpet/current-display-state",
} as const;

export interface PageSignalsMessage {
  type: typeof messageTypes.pageSignals;
  tabId?: number;
  payload: RawPageSignals;
}

export interface StateUpdateMessage {
  type: typeof messageTypes.stateUpdate;
  payload: {
    state: NormalizedState;
    pet: StoredPetRecord | null;
    visible: boolean;
  };
}

export interface FocusTabMessage {
  type: typeof messageTypes.focusTab;
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

export interface SelectPetMessage {
  type: typeof messageTypes.selectPet;
  payload: {
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
    pets: StoredPetRecord[];
    selectedPetId: string | null;
    overlayVisible: boolean;
  };
}

export interface CurrentDisplayStateMessage {
  type: typeof messageTypes.currentDisplayState;
}

export type OpenPetMessage =
  | PageSignalsMessage
  | StateUpdateMessage
  | FocusTabMessage
  | ImportPetMessage
  | SelectPetMessage
  | ClearPetsMessage
  | ToggleOverlayMessage
  | PopupSnapshotMessage
  | CurrentDisplayStateMessage;
