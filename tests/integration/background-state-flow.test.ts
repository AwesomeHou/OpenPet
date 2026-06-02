import { describe, expect, test, vi } from "vitest";
import { createMessageHandler } from "../../apps/chrome-extension/src/background/main";
import { messageTypes } from "@openpet/shared/messages";
import type { StoredPetRecord, TabPetState } from "@openpet/shared/types";

function createPet(id: string, displayName: string): StoredPetRecord {
  return {
    id,
    displayName,
    spritesheetPath: "spritesheet.webp",
    spritesheetDataUrl: `data:image/webp;base64,${id}`,
    importedAt: 1,
  };
}

function createStorageStub(
  overrides: Partial<{
    pets: StoredPetRecord[];
    sitePetBindings: Partial<Record<"deepseek" | "gemini", string>>;
    sitePetVisibility: Partial<Record<"deepseek" | "gemini", boolean>>;
    overlayVisible: boolean;
    petSizes: Partial<Record<"deepseek" | "gemini", number>>;
    animationSpeed: number;
  }> = {}
) {
  const state = {
    pets: overrides.pets ?? [],
    sitePetBindings: overrides.sitePetBindings ?? {},
    sitePetVisibility: overrides.sitePetVisibility ?? {},
    overlayVisible: overrides.overlayVisible ?? true,
    petSizes: overrides.petSizes ?? {},
    animationSpeed: overrides.animationSpeed ?? 1,
  };

  return {
    getPets: vi.fn(async () => state.pets),
    savePet: vi.fn(async (pet: StoredPetRecord) => {
      state.pets = [...state.pets.filter((item) => item.id !== pet.id), pet];
    }),
    getSitePetBindings: vi.fn(async () => state.sitePetBindings),
    setSitePetBinding: vi.fn(async (siteId: "deepseek" | "gemini", petId: string) => {
      state.sitePetBindings = { ...state.sitePetBindings, [siteId]: petId };
    }),
    getSitePetVisibility: vi.fn(async () => state.sitePetVisibility),
    setSitePetVisibility: vi.fn(async (siteId: "deepseek" | "gemini", visible: boolean) => {
      state.sitePetVisibility = { ...state.sitePetVisibility, [siteId]: visible };
    }),
    clearSitePetBindings: vi.fn(async () => {
      state.sitePetBindings = {};
    }),
    getOverlayPlacements: vi.fn(async () => ({})),
    getOverlayPlacement: vi.fn(async () => null),
    setOverlayPlacement: vi.fn(async () => undefined),
    getPetSizes: vi.fn(async () => state.petSizes),
    getPetSize: vi.fn(async (siteId: "deepseek" | "gemini") => state.petSizes[siteId] ?? null),
    setPetSize: vi.fn(async (siteId: "deepseek" | "gemini", size: number) => {
      state.petSizes = { ...state.petSizes, [siteId]: size };
    }),
    isOverlayVisible: vi.fn(async () => state.overlayVisible),
    setOverlayVisible: vi.fn(async (visible: boolean) => {
      state.overlayVisible = visible;
    }),
    getAnimationSpeed: vi.fn(async () => state.animationSpeed),
    setAnimationSpeed: vi.fn(async (speed: number) => {
      state.animationSpeed = speed;
    }),
    deletePets: vi.fn(async (petIds: string[]) => {
      state.pets = state.pets.filter((pet) => !petIds.includes(pet.id));
      state.sitePetBindings = Object.fromEntries(
        Object.entries(state.sitePetBindings).filter(([, petId]) => !petIds.includes(petId))
      ) as Partial<Record<"deepseek" | "gemini", string>>;
    }),
    clearPets: vi.fn(async () => {
      state.pets = [];
      state.sitePetBindings = {};
    }),
  };
}

describe("background message flow", () => {
  test("publishes a two-pet scene when DeepSeek and Gemini sessions are active", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }, { id: 8 }, { id: 99 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
        gemini: "doodlebob",
      },
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>();
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });

    handler(
      {
        type: messageTypes.pageSignals,
        payload: {
          site: "deepseek",
          composerReady: true,
          sendTriggered: true,
          responseGrowing: false,
          errorVisible: false,
          settled: false,
          tabActive: true,
          timestamp: 1,
        },
      },
      { tab: { id: 7, url: "https://chat.deepseek.com/" } } as chrome.runtime.MessageSender,
      vi.fn()
    );

    handler(
      {
        type: messageTypes.pageSignals,
        payload: {
          site: "gemini",
          composerReady: true,
          sendTriggered: true,
          responseGrowing: true,
          errorVisible: false,
          settled: false,
          tabActive: true,
          timestamp: 2,
        },
      },
      { tab: { id: 8, url: "https://gemini.google.com/app" } } as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          type: messageTypes.sceneUpdate,
          payload: expect.objectContaining({
            scene: expect.objectContaining({
              visible: true,
              pets: expect.arrayContaining([
                expect.objectContaining({
                  siteId: "deepseek",
                  tabId: 7,
                  state: "thinking",
                  petId: "boba",
                }),
                expect.objectContaining({
                  siteId: "gemini",
                  tabId: 8,
                  state: "streaming",
                  petId: "doodlebob",
                }),
              ]),
            }),
            animationSpeed: 1,
          }),
        })
      );
    });
  });

  test("returns popup snapshot with site bindings and pet-first summaries", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
        gemini: "doodlebob",
      },
      overlayVisible: false,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "done",
          updatedAt: 1,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });
    const sendResponse = vi.fn();

    const handled = handler(
      {
        type: messageTypes.popupSnapshot,
        payload: {
          currentTab: null,
          pets: [],
          sitePetBindings: {},
          overlayVisible: true,
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          pets: expect.arrayContaining([
            expect.objectContaining({ id: "boba", boundSites: ["deepseek"] }),
            expect.objectContaining({ id: "doodlebob", boundSites: ["gemini"] }),
          ]),
          sitePetBindings: {
            deepseek: "boba",
            gemini: "doodlebob",
          },
          sitePetVisibility: {},
          overlayVisible: false,
          animationSpeed: 1,
        })
      );
    });
  });

  test("stores global animation speed and republishes the scene", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: { gemini: "doodlebob" },
      overlayVisible: true,
      animationSpeed: 1,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "streaming",
          updatedAt: 1,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });

    const sendResponse = vi.fn();
    handler(
      {
        type: messageTypes.setAnimationSpeed,
        payload: { speed: 1.4 },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(storageRepo.setAnimationSpeed).toHaveBeenCalledWith(1.4);
      expect(sendMessage).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          payload: expect.objectContaining({
            animationSpeed: 1.4,
          }),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, speed: 1.4 });
    });
  });

  test("updates site bindings and republishes the full scene", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
      },
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "idle",
          updatedAt: 1,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });

    const sendResponse = vi.fn();
    handler(
      {
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "gemini", petId: "doodlebob" },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("gemini", "doodlebob");
      expect(sendMessage).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          type: messageTypes.sceneUpdate,
          payload: expect.objectContaining({
            scene: expect.objectContaining({
              pets: expect.arrayContaining([
                expect.objectContaining({
                  siteId: "gemini",
                  petId: "doodlebob",
                }),
              ]),
            }),
          }),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  test("supports unbinding a site and hiding a site pet from the scene", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }, { id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
        gemini: "doodlebob",
      },
      sitePetVisibility: {
        deepseek: true,
        gemini: true,
      },
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        7,
        {
          tabId: 7,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
          state: "thinking",
          updatedAt: 1,
        },
      ],
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "streaming",
          updatedAt: 2,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });

    handler(
      {
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "gemini", petId: null },
      },
      {} as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("gemini", null);
    });

    handler(
      {
        type: messageTypes.setSitePetVisibility,
        payload: { siteId: "deepseek", visible: false },
      },
      {} as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(storageRepo.setSitePetVisibility).toHaveBeenCalledWith("deepseek", false);
      expect(sendMessage).toHaveBeenLastCalledWith(
        8,
        expect.objectContaining({
          type: messageTypes.sceneUpdate,
          payload: expect.objectContaining({
            scene: expect.objectContaining({
              pets: [],
            }),
          }),
        })
      );
    });
  });

  test("returns popup snapshot with visibility state and bound sites for each pet", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
      },
      sitePetVisibility: {
        deepseek: false,
      },
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>();
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });
    const sendResponse = vi.fn();

    handler(
      {
        type: messageTypes.popupSnapshot,
        payload: {
          currentTab: null,
          pets: [],
          sitePetBindings: {},
          overlayVisible: true,
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          sitePetVisibility: {
            deepseek: false,
          },
          pets: expect.arrayContaining([
            expect.objectContaining({ id: "boba", boundSites: ["deepseek"] }),
            expect.objectContaining({ id: "doodlebob", boundSites: [] }),
          ]),
        })
      );
    });
  });

  test("deletes multiple pets and clears their site bindings", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }, { id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba"), createPet("doodlebob", "Doodle Bob")],
      sitePetBindings: {
        deepseek: "boba",
        gemini: "doodlebob",
      },
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        7,
        {
          tabId: 7,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
          state: "thinking",
          updatedAt: 1,
        },
      ],
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "streaming",
          updatedAt: 2,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
    });

    handler(
      {
        type: messageTypes.deletePets,
        payload: { petIds: ["boba", "doodlebob"] },
      },
      {} as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(storageRepo.deletePets).toHaveBeenCalledWith(["boba", "doodlebob"]);
      expect(sendMessage).toHaveBeenLastCalledWith(
        8,
        expect.objectContaining({
          payload: expect.objectContaining({
            scene: expect.objectContaining({
              pets: [],
            }),
          }),
        })
      );
    });
  });

  test("focuses the pet-specific tab from the mirrored scene", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 99 }]),
    };
    const stateMap = new Map<number, TabPetState>([
      [
        7,
        {
          tabId: 7,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
          state: "streaming",
          updatedAt: 1,
        },
      ],
      [
        8,
        {
          tabId: 8,
          url: "https://gemini.google.com/app",
          site: "gemini",
          state: "idle",
          updatedAt: 1,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: createStorageStub() as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
      getLastKnownTabId: () => 7,
    });

    handler(
      { type: messageTypes.focusTab, payload: { tabId: 8 } } as never,
      { tab: { id: 99, url: "https://example.com/" } } as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(tabsApi.update).toHaveBeenCalledWith(8, { active: true });
    });
  });
});
