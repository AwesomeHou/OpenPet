import type {
  BatchImportPetsMessage,
  DeletePetsMessage,
  FocusTabMessage,
  OpenPetMessage,
  PopupSnapshotMessage,
  SceneUpdateMessage,
  SetAnimationSpeedMessage,
  SetSitePetBindingMessage,
  SetSitePetVisibilityMessage,
} from "@openpet/shared/messages";
import { messageTypes } from "@openpet/shared/messages";
import type {
  OverlayPlacement,
  OverlaySceneState,
  PetImportErrorCode,
  ScenePetState,
  SiteId,
  StoredPetRecord,
  TabPetState,
} from "@openpet/shared/types";
import { createTabState } from "@openpet/state/sessionState";
import { importPetFromZip } from "@openpet/pet-assets/importPet";
import { normalizePetImportError } from "@openpet/pet-assets/errors";
import { defaultAnimationSpeed, defaultPetSize, maxAnimationSpeed, minAnimationSpeed } from "@openpet/shared/constants";
import { ensureBuiltinPetsSeeded } from "./builtinPets";
import { OpenPetStorage } from "./storage";

type ChromeTabsApi = Pick<typeof chrome.tabs, "sendMessage" | "update" | "query">;

const storage = new OpenPetStorage();
const tabState = new Map<number, TabPetState>();
const publishDebounceMs = 150;
const defaultPlacements: Record<SiteId, OverlayPlacement> = {
  deepseek: { left: 16, top: 16, facing: "right" },
  gemini: { left: 160, top: 16, facing: "right" },
  chatgpt: { left: 304, top: 16, facing: "right" },
  doubao: { left: 448, top: 16, facing: "right" },
};

function buildScenePets(
  pets: StoredPetRecord[],
  bindings: Partial<Record<SiteId, string>>,
  visibility: Partial<Record<SiteId, boolean>>,
  stateMap: Map<number, TabPetState>,
  placements: Partial<Record<SiteId, OverlayPlacement>>,
  petSizes: Partial<Record<SiteId, number>>
): ScenePetState[] {
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));
  const siteOrder: SiteId[] = ["deepseek", "gemini", "chatgpt", "doubao"];

  return siteOrder
    .map((siteId) => {
      const session = [...stateMap.values()]
        .filter((entry) => entry.site === siteId)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      const petId = bindings[siteId];
      const pet = petId ? petsById.get(petId) : undefined;
      if (!session || !pet || visibility[siteId] === false) {
        return null;
      }

      return {
        petId,
        siteId,
        tabId: session.tabId,
        state: session.state,
        pet,
        placement: placements[siteId] ?? defaultPlacements[siteId],
        size: petSizes[siteId] ?? defaultPetSize,
      } satisfies ScenePetState;
    })
    .filter((pet): pet is ScenePetState => pet !== null);
}

async function buildScene(
  storageRepo: OpenPetStorage,
  stateMap: Map<number, TabPetState>
): Promise<{ scene: OverlaySceneState; animationSpeed: number }> {
  const [pets, bindings, visibility, visible, placements, petSizes, animationSpeed] = await Promise.all([
    storageRepo.getPets(),
    storageRepo.getSitePetBindings(),
    storageRepo.getSitePetVisibility(),
    storageRepo.isOverlayVisible(),
    storageRepo.getOverlayPlacements(),
    storageRepo.getPetSizes(),
    storageRepo.getAnimationSpeed(),
  ]);

  return {
    scene: {
      pets: buildScenePets(pets, bindings, visibility, stateMap, placements, petSizes),
      visible,
    },
    animationSpeed,
  };
}

function createPopupPets(
  pets: StoredPetRecord[],
  sitePetBindings: Partial<Record<SiteId, string>>
): PopupSnapshotMessage["payload"]["pets"] {
  return pets.map((pet) => ({
    id: pet.id,
    displayName: pet.displayName,
    spritesheetDataUrl: pet.spritesheetDataUrl,
    boundSites: (Object.entries(sitePetBindings) as Array<[SiteId, string]>)
      .filter(([, petId]) => petId === pet.id)
      .map(([siteId]) => siteId),
  }));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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
  const { scene, animationSpeed } = await buildScene(storageRepo, stateMap);
  const message: SceneUpdateMessage = {
    type: messageTypes.sceneUpdate,
    payload: {
      scene,
      visible: scene.visible,
      animationSpeed,
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
  let publishTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePublishKnownTabs = () => {
    if (publishTimer !== null) {
      clearTimeout(publishTimer);
    }

    publishTimer = setTimeout(() => {
      publishTimer = null;
      void publishKnownTabs(storageRepo, tabsApi, stateMap);
    }, publishDebounceMs);
  };

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
      schedulePublishKnownTabs();
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
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true, petId: pet.id });
        })
        .catch((error: Error) => {
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === messageTypes.batchImportPets) {
      const batchMessage = message as BatchImportPetsMessage;
      void (async () => {
        try {
          const existingPetIds = new Set((await storageRepo.getPets()).map((pet) => pet.id));
          const importedPetIds: string[] = [];
          const overwrittenPetIds: string[] = [];
          const failures: Array<{ filename: string; code: PetImportErrorCode; error: string }> = [];

          for (const file of batchMessage.payload.files) {
            try {
              const pet = await importPetFromZip(Uint8Array.from(file.bytes));
              await storageRepo.savePet(pet);
              if (existingPetIds.has(pet.id)) {
                overwrittenPetIds.push(pet.id);
              } else {
                importedPetIds.push(pet.id);
                existingPetIds.add(pet.id);
              }
            } catch (error) {
              const normalizedError = normalizePetImportError(error);
              failures.push({
                filename: file.filename,
                code: normalizedError.code,
                error: normalizedError.message,
              });
            }
          }

          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({
            ok: true,
            importedPetIds,
            overwrittenPetIds,
            failures,
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error: getErrorMessage(error, "Batch import failed"),
          });
        }
      })();
      return true;
    }

    if (message.type === messageTypes.setSitePetBinding) {
      const bindingMessage = message as SetSitePetBindingMessage;
      void storageRepo
        .setSitePetBinding(bindingMessage.payload.siteId, bindingMessage.payload.petId)
        .then(async () => {
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to update site binding") });
        });
      return true;
    }

    if (message.type === messageTypes.setAnimationSpeed) {
      const animationMessage = message as SetAnimationSpeedMessage;
      const nextSpeed = Math.max(
        minAnimationSpeed,
        Math.min(maxAnimationSpeed, animationMessage.payload.speed || defaultAnimationSpeed)
      );
      void storageRepo
        .setAnimationSpeed(nextSpeed)
        .then(async () => {
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true, speed: nextSpeed });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to update animation speed") });
        });
      return true;
    }

    if (message.type === messageTypes.setSitePetVisibility) {
      const visibilityMessage = message as SetSitePetVisibilityMessage;
      void storageRepo
        .setSitePetVisibility(visibilityMessage.payload.siteId, visibilityMessage.payload.visible)
        .then(async () => {
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to update site visibility") });
        });
      return true;
    }

    if (message.type === messageTypes.deletePets) {
      const deleteMessage = message as DeletePetsMessage;
      void storageRepo
        .deletePets(deleteMessage.payload.petIds)
        .then(async () => {
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to delete pets") });
        });
      return true;
    }

    if (message.type === messageTypes.clearPets) {
      void storageRepo
        .clearPets()
        .then(async () => {
          await publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to clear pets") });
        });
      return true;
    }

    if (message.type === messageTypes.toggleOverlay) {
      void storageRepo
        .setOverlayVisible(message.payload.visible)
        .then(() => {
          void publishKnownTabs(storageRepo, tabsApi, stateMap);
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: getErrorMessage(error, "Failed to update overlay visibility") });
        });
      return true;
    }

    if (message.type === messageTypes.popupSnapshot) {
      void Promise.all([
        storageRepo.getPets(),
        storageRepo.getSitePetBindings(),
        storageRepo.getSitePetVisibility(),
        storageRepo.isOverlayVisible(),
        storageRepo.getAnimationSpeed(),
      ])
        .then(([pets, sitePetBindings, sitePetVisibility, overlayVisible, animationSpeed]) => {
          const snapshot: PopupSnapshotMessage["payload"] = {
            pets: createPopupPets(pets, sitePetBindings),
            sitePetBindings,
            sitePetVisibility,
            overlayVisible,
            animationSpeed,
          };
          console.debug(
            "[openpet-background] popupSnapshot",
            JSON.stringify({
              pets: snapshot.pets,
              sitePetBindings: snapshot.sitePetBindings,
              sitePetVisibility: snapshot.sitePetVisibility,
              overlayVisible: snapshot.overlayVisible,
              animationSpeed: snapshot.animationSpeed,
            })
          );
          sendResponse(snapshot);
        })
        .catch(() => {
          sendResponse({
            pets: [],
            sitePetBindings: {},
            sitePetVisibility: {},
            overlayVisible: true,
            animationSpeed: defaultAnimationSpeed,
          } satisfies PopupSnapshotMessage["payload"]);
        });
      return true;
    }

    if (message.type === messageTypes.currentSceneState && sender.tab?.id) {
      void buildScene(storageRepo, stateMap).then(({ scene, animationSpeed }) => {
        sendResponse({
          type: messageTypes.sceneUpdate,
          payload: {
            scene,
            visible: scene.visible,
            animationSpeed,
          },
        } satisfies SceneUpdateMessage);
      });
      return true;
    }
  };
}

export function registerBackgroundListeners(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void (async () => {
      await storage.setOverlayVisible(true);
      await ensureBuiltinPetsSeeded(storage, { reason: details.reason });
    })();
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
export { ensureBuiltinPetsSeeded };
