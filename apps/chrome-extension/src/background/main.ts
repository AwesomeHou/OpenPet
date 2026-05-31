import type {
  FocusTabMessage,
  OpenPetMessage,
  PopupSnapshotMessage,
  SceneUpdateMessage,
} from "@openpet/shared/messages";
import { messageTypes } from "@openpet/shared/messages";
import type {
  OverlayPlacement,
  OverlaySceneState,
  ScenePetState,
  SiteId,
  StoredPetRecord,
  TabPetState,
} from "@openpet/shared/types";
import { createTabState } from "@openpet/state/sessionState";
import { importPetFromZip } from "@openpet/pet-assets/importPet";
import { OpenPetStorage } from "./storage";

type ChromeTabsApi = Pick<typeof chrome.tabs, "sendMessage" | "update" | "query">;

const storage = new OpenPetStorage();
const tabState = new Map<number, TabPetState>();
const defaultPlacements: Record<SiteId, OverlayPlacement> = {
  deepseek: { left: 16, top: 16, facing: "right" },
  gemini: { left: 160, top: 16, facing: "right" },
};

function buildScenePets(
  pets: StoredPetRecord[],
  bindings: Partial<Record<SiteId, string>>,
  stateMap: Map<number, TabPetState>,
  placements: Partial<Record<SiteId, OverlayPlacement>>
): ScenePetState[] {
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const siteOrder: SiteId[] = ["deepseek", "gemini"];

  return siteOrder
    .map((siteId) => {
      const session = [...stateMap.values()]
        .filter((entry) => entry.site === siteId)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      const petId = bindings[siteId];
      const pet = petId ? petsById.get(petId) : undefined;
      if (!session || !pet) {
        return null;
      }

      return {
        petId,
        siteId,
        tabId: session.tabId,
        state: session.state,
        pet,
        placement: placements[siteId] ?? defaultPlacements[siteId],
      } satisfies ScenePetState;
    })
    .filter((pet): pet is ScenePetState => pet !== null);
}

async function buildScene(
  storageRepo: OpenPetStorage,
  stateMap: Map<number, TabPetState>
): Promise<OverlaySceneState> {
  const [pets, bindings, visible, placements] = await Promise.all([
    storageRepo.getPets(),
    storageRepo.getSitePetBindings(),
    storageRepo.isOverlayVisible(),
    storageRepo.getOverlayPlacements(),
  ]);

  return {
    pets: buildScenePets(pets, bindings, stateMap, placements),
    visible,
  };
}

export async function publishScene(
  tabId: number,
  options: {
    storageRepo?: OpenPetStorage;
    tabsApi?: ChromeTabsApi;
    tabStateMap?: Map<number, TabPetState>;
  } = {}
): Promise<void> {
  const storageRepo = options.storageRepo ?? storage;
  const tabsApi = options.tabsApi ?? chrome.tabs;
  const stateMap = options.tabStateMap ?? tabState;
  const scene = await buildScene(storageRepo, stateMap);
  const message: SceneUpdateMessage = {
    type: messageTypes.sceneUpdate,
    payload: {
      scene,
      visible: scene.visible,
    },
  };
  await tabsApi.sendMessage(tabId, message).catch(() => undefined);
}

async function publishKnownTabs(
  storageRepo: OpenPetStorage,
  tabsApi: ChromeTabsApi,
  stateMap: Map<number, TabPetState>
): Promise<void> {
  const knownTabs = await tabsApi.query({}).catch(() => []);
  const targetTabIds = new Set<number>([
    ...stateMap.keys(),
    ...knownTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === "number"),
  ]);

  await Promise.all(
    [...targetTabIds].map((tabId) => publishScene(tabId, { storageRepo, tabsApi, tabStateMap: stateMap }))
  );
}

export function createMessageHandler(
  deps: {
    storageRepo?: OpenPetStorage;
    tabsApi?: ChromeTabsApi;
    tabStateMap?: Map<number, TabPetState>;
  } = {}
) {
  const storageRepo = deps.storageRepo ?? storage;
  const tabsApi = deps.tabsApi ?? chrome.tabs;
  const stateMap = deps.tabStateMap ?? tabState;

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
      void publishKnownTabs(storageRepo, tabsApi, stateMap);
      return;
    }

    if (message.type === messageTypes.focusTab) {
      const focusMessage = message as FocusTabMessage;
      const targetTabId = focusMessage.payload?.tabId ?? sender.tab?.id;
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
          const bindings = await storageRepo.getSitePetBindings();
          if (!bindings.gemini && pet.id === "doodlebob") {
            await storageRepo.setSitePetBinding("gemini", pet.id);
          }
          if (!bindings.deepseek) {
            await storageRepo.setSitePetBinding("deepseek", pet.id);
          }
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true, petId: pet.id });
        })
        .catch((error: Error) => {
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === messageTypes.setSitePetBinding) {
      void storageRepo.setSitePetBinding(message.payload.siteId, message.payload.petId).then(async () => {
        await publishKnownTabs(storageRepo, tabsApi, stateMap);
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.clearPets) {
      void storageRepo.clearPets().then(async () => {
        await publishKnownTabs(storageRepo, tabsApi, stateMap);
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.toggleOverlay) {
      void storageRepo.setOverlayVisible(message.payload.visible).then(() => {
        void publishKnownTabs(storageRepo, tabsApi, stateMap);
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === messageTypes.popupSnapshot) {
      void Promise.all([
        tabsApi.query({ active: true, currentWindow: true }),
        storageRepo.getPets(),
        storageRepo.getSitePetBindings(),
        storageRepo.isOverlayVisible(),
      ]).then(([tabs, pets, sitePetBindings, overlayVisible]) => {
        const currentTabId = tabs[0]?.id && stateMap.has(tabs[0].id) ? tabs[0].id : null;
        const snapshot: PopupSnapshotMessage["payload"] = {
          currentTab: currentTabId ? (stateMap.get(currentTabId) ?? null) : null,
          pets: pets.map((pet) => ({ id: pet.id, displayName: pet.displayName })),
          sitePetBindings,
          overlayVisible,
        };
        console.debug(
          "[openpet-background] popupSnapshot",
          JSON.stringify({
            currentTab: snapshot.currentTab,
            pets: snapshot.pets,
            sitePetBindings: snapshot.sitePetBindings,
            overlayVisible: snapshot.overlayVisible,
          })
        );
        sendResponse(snapshot);
      });
      return true;
    }

    if (message.type === messageTypes.currentSceneState && sender.tab?.id) {
      void buildScene(storageRepo, stateMap).then((scene) => {
        sendResponse({
          type: messageTypes.sceneUpdate,
          payload: {
            scene,
            visible: scene.visible,
          },
        } satisfies SceneUpdateMessage);
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
    void publishScene(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      void publishScene(tabId);
    }
  });
  chrome.tabs.onRemoved?.addListener((tabId) => {
    tabState.delete(tabId);
    void publishKnownTabs(storage, chrome.tabs, tabState);
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  registerBackgroundListeners();
}

export { OpenPetStorage };
