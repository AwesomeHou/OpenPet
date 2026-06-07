import { describe, expect, test, vi } from "vitest";
import { createMessageHandler, ensureBuiltinPetsSeeded } from "../../apps/chrome-extension/src/background/main";
import { messageTypes } from "@openpet/shared/messages";
import type { SiteId, StoredPetRecord, TabPetState } from "@openpet/shared/types";
import JSZip from "jszip";
import type { BuiltinPetFile } from "../../apps/chrome-extension/src/background/builtinPets";

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
    sitePetBindings: Partial<Record<SiteId, string>>;
    sitePetVisibility: Partial<Record<SiteId, boolean>>;
    overlayVisible: boolean;
    petSizes: Partial<Record<SiteId, number>>;
    animationSpeed: number;
    builtinPetsSeedVersion: string | null;
  }> = {}
) {
  const state = {
    pets: overrides.pets ?? [],
    sitePetBindings: overrides.sitePetBindings ?? {},
    sitePetVisibility: overrides.sitePetVisibility ?? {},
    overlayVisible: overrides.overlayVisible ?? true,
    petSizes: overrides.petSizes ?? {},
    animationSpeed: overrides.animationSpeed ?? 1,
    builtinPetsSeedVersion: overrides.builtinPetsSeedVersion ?? null,
  };

  return {
    getPets: vi.fn(async () => state.pets),
    savePet: vi.fn(async (pet: StoredPetRecord) => {
      state.pets = [...state.pets.filter((item) => item.id !== pet.id), pet];
    }),
    getSitePetBindings: vi.fn(async () => state.sitePetBindings),
    setSitePetBinding: vi.fn(async (siteId: SiteId, petId: string | null) => {
      if (petId) {
        state.sitePetBindings = { ...state.sitePetBindings, [siteId]: petId };
      } else {
        state.sitePetBindings = Object.fromEntries(
          Object.entries(state.sitePetBindings).filter(([existingSiteId]) => existingSiteId !== siteId)
        ) as Partial<Record<SiteId, string>>;
      }
    }),
    getSitePetVisibility: vi.fn(async () => state.sitePetVisibility),
    setSitePetVisibility: vi.fn(async (siteId: SiteId, visible: boolean) => {
      state.sitePetVisibility = { ...state.sitePetVisibility, [siteId]: visible };
    }),
    clearSitePetBindings: vi.fn(async () => {
      state.sitePetBindings = {};
    }),
    getOverlayPlacements: vi.fn(async () => ({})),
    getOverlayPlacement: vi.fn(async () => null),
    setOverlayPlacement: vi.fn(async () => undefined),
    getPetSizes: vi.fn(async () => state.petSizes),
    getPetSize: vi.fn(async (siteId: SiteId) => state.petSizes[siteId] ?? null),
    setPetSize: vi.fn(async (siteId: SiteId, size: number) => {
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
    getBuiltinPetsSeedVersion: vi.fn(async () => state.builtinPetsSeedVersion),
    setBuiltinPetsSeedVersion: vi.fn(async (version: string) => {
      state.builtinPetsSeedVersion = version;
    }),
    deletePets: vi.fn(async (petIds: string[]) => {
      state.pets = state.pets.filter((pet) => !petIds.includes(pet.id));
      state.sitePetBindings = Object.fromEntries(
        Object.entries(state.sitePetBindings).filter(([, petId]) => !petIds.includes(petId))
      ) as Partial<Record<SiteId, string>>;
    }),
    clearPets: vi.fn(async () => {
      state.pets = [];
      state.sitePetBindings = {};
    }),
  };
}

async function createValidZipBytes(id: string, displayName: string): Promise<number[]> {
  const zip = new JSZip();
  zip.file(
    "pet.json",
    JSON.stringify({
      id,
      displayName,
      spritesheetPath: "spritesheet.webp",
    })
  );
  zip.file("spritesheet.webp", new Uint8Array([65, 66, 67]));

  return Array.from(await zip.generateAsync({ type: "uint8array" }));
}

function createBuiltinPetFiles(id: string, displayName: string): BuiltinPetFile[] {
  return [
    {
      path: "pet.json",
      bytes: new TextEncoder().encode(
        JSON.stringify({
          id,
          displayName,
          spritesheetPath: "spritesheet.webp",
        })
      ),
    },
    {
      path: "spritesheet.webp",
      bytes: new Uint8Array([65, 66, 67]),
    },
  ];
}

describe("builtin pet seeding", () => {
  test("seeds builtin pets and default bindings on first install only", async () => {
    const storageRepo = createStorageStub({
      pets: [],
      sitePetBindings: {},
      sitePetVisibility: {},
      builtinPetsSeedVersion: null,
    });
    const filesByPetId = {
      chatgpt: createBuiltinPetFiles("chatgpt", "ChatGPT"),
      deepseek: createBuiltinPetFiles("deepseek", "DeepSeek"),
      doubao: createBuiltinPetFiles("doubao", "Doubao"),
      gemini: createBuiltinPetFiles("gemini", "Gemini"),
    } satisfies Record<SiteId, BuiltinPetFile[]>;
    const loadFiles = vi.fn(async (petId: SiteId) => filesByPetId[petId]);

    await ensureBuiltinPetsSeeded(storageRepo as never, {
      loadFiles,
      reason: "install",
    });

    expect(storageRepo.savePet).toHaveBeenCalledTimes(4);
    expect(storageRepo.setSitePetBinding).toHaveBeenCalledTimes(4);
    expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("chatgpt", "chatgpt");
    expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("deepseek", "deepseek");
    expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("doubao", "doubao");
    expect(storageRepo.setSitePetBinding).toHaveBeenCalledWith("gemini", "gemini");
    expect(storageRepo.setBuiltinPetsSeedVersion).toHaveBeenCalledWith("v1");
    expect(loadFiles).toHaveBeenCalledTimes(4);
  });

  test("does not reseed or overwrite user bindings after initialization has already run", async () => {
    const storageRepo = createStorageStub({
      pets: [createPet("chatgpt", "ChatGPT"), createPet("deepseek", "DeepSeek")],
      sitePetBindings: {
        chatgpt: "my-custom-chatgpt",
        deepseek: "deepseek",
      },
      builtinPetsSeedVersion: "v1",
    });
    const loadFiles = vi.fn(async () => {
      throw new Error("should not load files when already seeded");
    });

    await ensureBuiltinPetsSeeded(storageRepo as never, {
      loadFiles,
      reason: "install",
    });

    expect(storageRepo.savePet).not.toHaveBeenCalled();
    expect(storageRepo.setSitePetBinding).not.toHaveBeenCalled();
    expect(storageRepo.setBuiltinPetsSeedVersion).not.toHaveBeenCalled();
    expect(loadFiles).not.toHaveBeenCalled();
  });

  test("does not seed builtin pets during extension update", async () => {
    const storageRepo = createStorageStub({
      builtinPetsSeedVersion: null,
    });
    const loadFiles = vi.fn(async () => {
      throw new Error("should not load files during update");
    });

    await ensureBuiltinPetsSeeded(storageRepo as never, {
      loadFiles,
      reason: "update",
    });

    expect(storageRepo.savePet).not.toHaveBeenCalled();
    expect(storageRepo.setSitePetBinding).not.toHaveBeenCalled();
    expect(storageRepo.setBuiltinPetsSeedVersion).not.toHaveBeenCalled();
    expect(loadFiles).not.toHaveBeenCalled();
  });
});

describe("background message flow", () => {
  test("coalesces rapid pageSignals into a single publish burst", async () => {
    vi.useFakeTimers();
    try {
      const sendMessage = vi.fn(async () => undefined);
      const tabsApi = {
        sendMessage,
        update: vi.fn(async () => undefined),
        query: vi.fn(async () => [{ id: 7 }, { id: 8 }]),
      };
      const storageRepo = createStorageStub({
        pets: [createPet("boba", "Boba")],
        sitePetBindings: { deepseek: "boba" },
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
            site: "deepseek",
            composerReady: true,
            sendTriggered: true,
            responseGrowing: true,
            errorVisible: false,
            settled: false,
            tabActive: true,
            timestamp: 2,
          },
        },
        { tab: { id: 7, url: "https://chat.deepseek.com/" } } as chrome.runtime.MessageSender,
        vi.fn()
      );

      expect(sendMessage).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      await vi.waitFor(() => {
        expect(sendMessage).toHaveBeenCalledTimes(2);
        expect(tabsApi.query).toHaveBeenCalledTimes(1);
      });
    } finally {
      vi.useRealTimers();
    }
  });

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
                  state: "streaming",
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

  test("importing pets does not auto-bind any unbound site", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [],
      sitePetBindings: {},
      overlayVisible: true,
    });
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: new Map<number, TabPetState>(),
    });

    const sendResponse = vi.fn();
    handler(
      {
        type: messageTypes.batchImportPets,
        payload: {
          files: [],
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        importedPetIds: [],
        overwrittenPetIds: [],
        failures: [],
      });
      expect(storageRepo.setSitePetBinding).not.toHaveBeenCalled();
    });
  });

  test("returns coded failures when a pet package cannot be read", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
    };
    const storageRepo = createStorageStub({
      pets: [],
      sitePetBindings: {},
      overlayVisible: true,
    });
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: new Map<number, TabPetState>(),
    });
    const sendResponse = vi.fn();

    handler(
      {
        type: messageTypes.batchImportPets,
        payload: {
          files: [{ filename: "broken.zip", bytes: [1, 2, 3, 4] }],
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        importedPetIds: [],
        overwrittenPetIds: [],
        failures: [
          expect.objectContaining({
            filename: "broken.zip",
            code: "E_PACKAGE_READ_FAILED",
          }),
        ],
      });
    });
  });

  test("does not count pets as imported when storage save fails", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
    };
    const storageRepo = createStorageStub({
      pets: [],
      sitePetBindings: {},
      overlayVisible: true,
    });
    storageRepo.savePet.mockRejectedValueOnce(new Error("Resource::kQuotaBytes quota exceeded"));
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: new Map<number, TabPetState>(),
    });
    const sendResponse = vi.fn();

    const zip = new JSZip();
    zip.file(
      "pet.json",
      JSON.stringify({
        id: "boba",
        displayName: "Boba",
        spritesheetPath: "spritesheet.webp",
      })
    );
    zip.file("spritesheet.webp", new Uint8Array([65]));
    const validZip = Array.from(await zip.generateAsync({ type: "uint8array" }));

    handler(
      {
        type: messageTypes.batchImportPets,
        payload: {
          files: [{ filename: "boba.zip", bytes: validZip }],
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        importedPetIds: [],
        overwrittenPetIds: [],
        failures: [
          expect.objectContaining({
            filename: "boba.zip",
            code: "E_STORAGE_QUOTA_EXCEEDED",
          }),
        ],
      });
    });
  });

  test("returns an explicit error response when batch import publishing fails", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [],
      sitePetBindings: {},
      overlayVisible: true,
    });
    storageRepo.getSitePetVisibility.mockRejectedValueOnce(new Error("publish failed"));
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: new Map<number, TabPetState>([
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
      ]),
    });
    const sendResponse = vi.fn();

    const zip = new JSZip();
    zip.file(
      "pet.json",
      JSON.stringify({
        id: "boba",
        displayName: "Boba",
        spritesheetPath: "spritesheet.webp",
      })
    );
    zip.file("spritesheet.webp", new Uint8Array([65]));
    const validZip = Array.from(await zip.generateAsync({ type: "uint8array" }));

    handler(
      {
        type: messageTypes.batchImportPets,
        payload: {
          files: [{ filename: "boba.zip", bytes: validZip }],
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "publish failed",
      });
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

  test("returns an explicit error response when deleting pets fails", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }]),
    };
    const storageRepo = createStorageStub({
      pets: [createPet("boba", "Boba")],
      sitePetBindings: {
        deepseek: "boba",
      },
      overlayVisible: true,
    });
    storageRepo.deletePets.mockRejectedValueOnce(new Error("delete failed"));
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: new Map<number, TabPetState>(),
    });
    const sendResponse = vi.fn();

    handler(
      {
        type: messageTypes.deletePets,
        payload: { petIds: ["boba"] },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "delete failed",
      });
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
