import type {
  OpenPetMessage,
  PopupSnapshotMessage,
  StateUpdateMessage,
} from "@openpet/shared/messages";
import { messageTypes } from "@openpet/shared/messages";
import type { StoredPetRecord, TabPetState } from "@openpet/shared/types";
import { createTabState } from "@openpet/state/sessionState";
import { importPetFromZip } from "@openpet/pet-assets/importPet";
import { OpenPetStorage } from "./storage";

type ChromeTabsApi = Pick<typeof chrome.tabs, "sendMessage" | "update" | "query">;

const storage = new OpenPetStorage();
const tabState = new Map<number, TabPetState>();
let lastKnownTabId: number | null = null;

async function getSelectedPet(storageRepo: OpenPetStorage): Promise<StoredPetRecord | null> {
  const [pets, selectedPetId] = await Promise.all([
    storageRepo.getPets(),
    storageRepo.getSelectedPetId(),
  ]);
  return pets.find((pet) => pet.id === selectedPetId) ?? pets[0] ?? null;
}

function resolveDisplayTabId(
  requestedTabId: number,
  stateMap: Map<number, TabPetState>,
  fallbackTabId: number | null
): number | null {
  if (stateMap.has(requestedTabId)) {
    return requestedTabId;
  }

  if (fallbackTabId !== null && stateMap.has(fallbackTabId)) {
    return fallbackTabId;
  }

  return [...stateMap.keys()][0] ?? null;
}

export async function publishState(
  tabId: number,
  options: {
    storageRepo?: OpenPetStorage;
    tabsApi?: ChromeTabsApi;
    tabStateMap?: Map<number, TabPetState>;
    fallbackTabId?: number | null;
  } = {}
): Promise<void> {
  const storageRepo = options.storageRepo ?? storage;
  const tabsApi = options.tabsApi ?? chrome.tabs;
  const stateMap = options.tabStateMap ?? tabState;
  const displayTabId = resolveDisplayTabId(
    tabId,
    stateMap,
    options.fallbackTabId ?? lastKnownTabId
  );
  const pet = await getSelectedPet(storageRepo);
  const visible = await storageRepo.isOverlayVisible();
  const state = displayTabId ? (stateMap.get(displayTabId)?.state ?? "waiting") : "waiting";
  const message: StateUpdateMessage = {
    type: messageTypes.stateUpdate,
    payload: { state, pet, visible },
  };
  await tabsApi.sendMessage(tabId, message).catch(() => undefined);
}

async function publishKnownTabs(
  storageRepo: OpenPetStorage,
  tabsApi: ChromeTabsApi,
  stateMap: Map<number, TabPetState>,
  fallbackTabId: number | null
): Promise<void> {
  const activeTabs = await tabsApi.query({ active: true, currentWindow: true }).catch(() => []);
  const targetTabIds = new Set<number>([
    ...stateMap.keys(),
    ...activeTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === "number"),
  ]);

  await Promise.all(
    [...targetTabIds].map((tabId) =>
      publishState(tabId, {
        storageRepo,
        tabsApi,
        tabStateMap: stateMap,
        fallbackTabId,
      })
    )
  );
}

export function createMessageHandler(
  deps: {
    storageRepo?: OpenPetStorage;
    tabsApi?: ChromeTabsApi;
    tabStateMap?: Map<number, TabPetState>;
    getLastKnownTabId?: () => number | null;
    setLastKnownTabId?: (tabId: number) => void;
  } = {}
) {
  const storageRepo = deps.storageRepo ?? storage;
  const tabsApi = deps.tabsApi ?? chrome.tabs;
  const stateMap = deps.tabStateMap ?? tabState;
  const getKnownTabId = deps.getLastKnownTabId ?? (() => lastKnownTabId);
  const setKnownTabId =
    deps.setLastKnownTabId ??
    ((tabId: number) => {
      lastKnownTabId = tabId;
    });

  return (
    message: OpenPetMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (message.type === messageTypes.pageSignals && sender.tab?.id && sender.tab.url) {
      console.debug(
        "[openpet-background] pageSignals",
        sender.tab.id,
        JSON.stringify(message.payload)
      );
      stateMap.set(sender.tab.id, createTabState(sender.tab.id, sender.tab.url, message.payload));
      setKnownTabId(sender.tab.id);
      void publishState(sender.tab.id, {
        storageRepo,
        tabsApi,
        tabStateMap: stateMap,
        fallbackTabId: getKnownTabId(),
      });
      return;
    }

    if (message.type === messageTypes.focusTab) {
      const targetTabId =
        sender.tab?.id && stateMap.has(sender.tab.id) ? sender.tab.id : getKnownTabId();
      console.debug("[openpet-background] focusTab", targetTabId);
      if (targetTabId) {
        void tabsApi.update(targetTabId, { active: true });
      }
      return;
    }

    if (message.type === messageTypes.importPet) {
      const bytes = Uint8Array.from(message.payload.bytes);
      void importPetFromZip(bytes)
        .then(async (pet) => {
          await storageRepo.savePet(pet);
          await publishKnownTabs(storageRepo, tabsApi, stateMap, getKnownTabId());
          sendResponse({ ok: true, petId: pet.id });
        })
        .catch((error: Error) => {
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === messageTypes.selectPet) {
      void storageRepo.setSelectedPetId(message.payload.petId).then(async () => {
        await publishKnownTabs(storageRepo, tabsApi, stateMap, getKnownTabId());
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.clearPets) {
      void storageRepo.clearPets().then(async () => {
        await publishKnownTabs(storageRepo, tabsApi, stateMap, getKnownTabId());
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.toggleOverlay) {
      void storageRepo.setOverlayVisible(message.payload.visible).then(() => {
        void publishKnownTabs(storageRepo, tabsApi, stateMap, getKnownTabId());
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.popupSnapshot) {
      void Promise.all([
        tabsApi.query({ active: true, currentWindow: true }),
        storageRepo.getPets(),
        storageRepo.getSelectedPetId(),
        storageRepo.isOverlayVisible(),
      ]).then(([tabs, pets, selectedPetId, overlayVisible]) => {
        const currentTabId = tabs[0]?.id && stateMap.has(tabs[0].id) ? tabs[0].id : getKnownTabId();
        const snapshot: PopupSnapshotMessage["payload"] = {
          currentTab: currentTabId ? (stateMap.get(currentTabId) ?? null) : null,
          pets,
          selectedPetId,
          overlayVisible,
        };
        console.debug(
          "[openpet-background] popupSnapshot",
          JSON.stringify({
            currentTab: snapshot.currentTab,
            pets: snapshot.pets.map((pet) => ({ id: pet.id, displayName: pet.displayName })),
            selectedPetId: snapshot.selectedPetId,
            overlayVisible: snapshot.overlayVisible,
          })
        );
        sendResponse(snapshot);
      });
      return true;
    }

    if (message.type === messageTypes.currentDisplayState && sender.tab?.id) {
      void Promise.all([
        storageRepo.getPets(),
        storageRepo.getSelectedPetId(),
        storageRepo.isOverlayVisible(),
      ]).then(([pets, selectedPetId, visible]) => {
        const pet = pets.find((item) => item.id === selectedPetId) ?? pets[0] ?? null;
        const displayTabId = resolveDisplayTabId(sender.tab?.id ?? 0, stateMap, getKnownTabId());
        sendResponse({
          type: messageTypes.stateUpdate,
          payload: {
            state: displayTabId ? (stateMap.get(displayTabId)?.state ?? "waiting") : "waiting",
            pet,
            visible,
          },
        } satisfies StateUpdateMessage);
      });
      return true;
    }
  };
}

export function registerBackgroundListeners(): void {
  chrome.runtime.onInstalled.addListener(() => {
    void storage.setOverlayVisible(true);
  });
  chrome.runtime.onMessage.addListener(createMessageHandler());
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void publishState(tabId, { fallbackTabId: lastKnownTabId });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      void publishState(tabId, { fallbackTabId: lastKnownTabId });
    }
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  registerBackgroundListeners();
}

export { OpenPetStorage };
