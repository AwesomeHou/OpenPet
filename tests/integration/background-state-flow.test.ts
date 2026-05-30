import { describe, expect, test, vi } from "vitest";
import { createMessageHandler } from "../../apps/chrome-extension/src/background/main";
import { messageTypes } from "@openpet/shared/messages";
import type { StoredPetRecord, TabPetState } from "@openpet/shared/types";

function createStorageStub(
  overrides: Partial<{
    pets: StoredPetRecord[];
    selectedPetId: string | null;
    overlayVisible: boolean;
  }> = {}
) {
  const state = {
    pets: overrides.pets ?? [],
    selectedPetId: overrides.selectedPetId ?? null,
    overlayVisible: overrides.overlayVisible ?? true,
  };

  return {
    getPets: vi.fn(async () => state.pets),
    savePet: vi.fn(async (pet: StoredPetRecord) => {
      state.pets = [...state.pets.filter((item) => item.id !== pet.id), pet];
      state.selectedPetId ||= pet.id;
    }),
    getSelectedPetId: vi.fn(async () => state.selectedPetId),
    setSelectedPetId: vi.fn(async (petId: string) => {
      state.selectedPetId = petId;
    }),
    clearSelectedPetId: vi.fn(async () => {
      state.selectedPetId = null;
    }),
    ensureSelectedPet: vi.fn(async (petId: string) => {
      state.selectedPetId ||= petId;
    }),
    isOverlayVisible: vi.fn(async () => state.overlayVisible),
    setOverlayVisible: vi.fn(async (visible: boolean) => {
      state.overlayVisible = visible;
    }),
    clearPets: vi.fn(async () => {
      state.pets = [];
      state.selectedPetId = null;
    }),
  };
}

describe("background message flow", () => {
  test("normalizes page signals and publishes the state update to the tab", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 7 }]),
    };
    const storageRepo = createStorageStub({
      pets: [
        {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      ],
      selectedPetId: "boba",
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

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          type: messageTypes.stateUpdate,
          payload: expect.objectContaining({
            state: "thinking",
            visible: true,
            pet: expect.objectContaining({ id: "boba" }),
          }),
        })
      );
    });
  });

  test("returns popup snapshot with current tab state", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [
        {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      ],
      selectedPetId: "boba",
      overlayVisible: false,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        8,
        {
          tabId: 8,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
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
          selectedPetId: null,
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
          currentTab: expect.objectContaining({ state: "done" }),
          selectedPetId: "boba",
          overlayVisible: false,
        })
      );
    });
  });

  test("falls back to the last known supported tab when popup is the active page", async () => {
    const tabsApi = {
      sendMessage: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 99 }]),
    };
    const storageRepo = createStorageStub();
    const stateMap = new Map<number, TabPetState>([
      [
        7,
        {
          tabId: 7,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
          state: "idle",
          updatedAt: 1,
        },
      ],
    ]);
    const handler = createMessageHandler({
      storageRepo: storageRepo as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
      getLastKnownTabId: () => 7,
    });
    const sendResponse = vi.fn();

    handler(
      {
        type: messageTypes.popupSnapshot,
        payload: {
          currentTab: null,
          pets: [],
          selectedPetId: null,
          overlayVisible: true,
        },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          currentTab: expect.objectContaining({ tabId: 7, state: "idle" }),
        })
      );
    });
  });

  test("updates all known tabs when selecting a pet, clearing pets, or toggling overlay", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const tabsApi = {
      sendMessage,
      update: vi.fn(async () => undefined),
      query: vi.fn(async () => [{ id: 8 }]),
    };
    const storageRepo = createStorageStub({
      pets: [
        {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      ],
      selectedPetId: "boba",
      overlayVisible: true,
    });
    const stateMap = new Map<number, TabPetState>([
      [
        8,
        {
          tabId: 8,
          url: "https://chat.deepseek.com/",
          site: "deepseek",
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

    const selectResponse = vi.fn();
    handler(
      {
        type: messageTypes.selectPet,
        payload: { petId: "boba" },
      },
      {} as chrome.runtime.MessageSender,
      selectResponse
    );

    await vi.waitFor(() => {
      expect(storageRepo.setSelectedPetId).toHaveBeenCalledWith("boba");
      expect(sendMessage).toHaveBeenCalledWith(
        8,
        expect.objectContaining({ type: messageTypes.stateUpdate })
      );
      expect(selectResponse).toHaveBeenCalledWith({ ok: true });
    });

    sendMessage.mockClear();
    const clearResponse = vi.fn();
    handler({ type: messageTypes.clearPets }, {} as chrome.runtime.MessageSender, clearResponse);

    await vi.waitFor(() => {
      expect(storageRepo.clearPets).toHaveBeenCalled();
      expect(sendMessage).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          type: messageTypes.stateUpdate,
          payload: expect.objectContaining({ pet: null }),
        })
      );
      expect(clearResponse).toHaveBeenCalledWith({ ok: true });
    });

    sendMessage.mockClear();
    const overlayResponse = vi.fn();
    handler(
      {
        type: messageTypes.toggleOverlay,
        payload: { visible: false },
      },
      {} as chrome.runtime.MessageSender,
      overlayResponse
    );

    await vi.waitFor(() => {
      expect(storageRepo.setOverlayVisible).toHaveBeenCalledWith(false);
      expect(sendMessage).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          type: messageTypes.stateUpdate,
          payload: expect.objectContaining({ visible: false }),
        })
      );
      expect(overlayResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  test("focuses the last known session tab when the overlay is clicked on another page", async () => {
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
    ]);
    const handler = createMessageHandler({
      storageRepo: createStorageStub() as never,
      tabsApi: tabsApi as never,
      tabStateMap: stateMap,
      getLastKnownTabId: () => 7,
    });

    handler(
      { type: messageTypes.focusTab },
      { tab: { id: 99, url: "https://example.com/" } } as chrome.runtime.MessageSender,
      vi.fn()
    );

    await vi.waitFor(() => {
      expect(tabsApi.update).toHaveBeenCalledWith(7, { active: true });
    });
  });
});
