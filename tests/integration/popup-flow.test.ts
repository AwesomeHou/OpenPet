import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountPopup, renderPopup } from "../../apps/chrome-extension/src/popup/main";
import { messageTypes } from "@openpet/shared/messages";
import { storageKeys } from "@openpet/shared/constants";

const defaultSnapshot = {
  currentTab: { state: "thinking", site: "gemini" },
  pets: [
    { id: "boba", displayName: "Boba" },
    { id: "doodlebob", displayName: "Doodle Bob" },
  ],
  sitePetBindings: { deepseek: "boba", gemini: "doodlebob" },
  overlayVisible: true,
} as const;

function installChromeMock(options?: {
  locale?: string;
  storedLocale?: string;
  sendMessage?: (message: { type: string; payload?: unknown }) => Promise<unknown>;
}) {
  const storageState = new Map<string, unknown>();
  if (options?.storedLocale) {
    storageState.set(storageKeys.popupLocale, options.storedLocale);
  }

  const sendMessage =
    options?.sendMessage ??
    vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return defaultSnapshot;
      }
      return { ok: true };
    });

  const chromeMock = {
    runtime: {
      sendMessage,
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storageState.get(key) })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => storageState.set(key, value));
        }),
      },
    },
    i18n: {
      getUILanguage: vi.fn(() => options?.locale ?? "en-US"),
    },
  };

  vi.stubGlobal("chrome", chromeMock);
  Object.defineProperty(window.navigator, "language", {
    value: options?.locale ?? "en-US",
    configurable: true,
  });

  return { chromeMock, sendMessage };
}

describe("popup flow", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
    vi.restoreAllMocks();
  });

  test("renders localized chinese labels when browser locale is zh", async () => {
    installChromeMock({ locale: "zh-CN" });
    const root = document.getElementById("app")!;

    await mountPopup(root);

    expect(root.textContent).toContain("当前状态");
    expect(root.textContent).toContain("思考中");
    expect(root.textContent).toContain("当前站点");
    expect(root.textContent).toContain("Gemini");
    expect(root.textContent).toContain("清空宠物数据");
    expect(root.textContent).toContain("宠物商店");
    expect(root.textContent).toContain("管理宠物");
    expect(root.textContent).toContain("未来可搭配 companion app 使用");
  });

  test("allows switching locale and persists the selection across rerenders", async () => {
    const { chromeMock } = installChromeMock({ locale: "en-US" });
    const root = document.getElementById("app")!;

    await mountPopup(root);
    expect(root.textContent).toContain("Current state");

    const localeButton = root.querySelector<HTMLButtonElement>('[data-locale="zh"]')!;
    localeButton.click();

    await vi.waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        [storageKeys.popupLocale]: "zh",
      });
      expect(root.textContent).toContain("当前状态");
    });

    renderPopup(root, defaultSnapshot);
    expect(root.textContent).toContain("当前状态");
  });

  test("requests snapshot on mount and toggles overlay visibility", async () => {
    const { sendMessage } = installChromeMock({
      locale: "en-US",
      sendMessage: vi.fn(async (message: { type: string }) => {
        if (message.type === messageTypes.popupSnapshot) {
          return {
            currentTab: { state: "idle", site: "deepseek" },
            pets: [],
            sitePetBindings: {},
            overlayVisible: true,
          };
        }

        return { ok: true };
      }),
    });

    const root = document.getElementById("app")!;
    await mountPopup(root);
    expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.popupSnapshot });

    const checkbox = root.querySelector("#overlay-toggle") as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.toggleOverlay,
        payload: { visible: false },
      });
    });
  });

  test("shows localized feedback after rebinding pets", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return defaultSnapshot;
      }

      return { ok: true };
    });
    installChromeMock({ locale: "zh-CN", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);

    const deepseekSelect = root.querySelector("#binding-deepseek") as HTMLSelectElement;
    deepseekSelect.value = "doodlebob";
    deepseekSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "deepseek", petId: "doodlebob" },
      });
      expect(root.querySelector("#status")?.textContent).toContain("已将 DeepSeek 绑定到 Doodle Bob");
    });
  });

  test("shows localized clear pet data copy and keeps future actions inert", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return defaultSnapshot;
      }

      return { ok: true };
    });
    installChromeMock({ locale: "en-US", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);

    expect(root.textContent).toContain("Clear pet data");

    const storeButton = root.querySelector("#pet-store") as HTMLButtonElement;
    const manageButton = root.querySelector("#manage-pets") as HTMLButtonElement;
    storeButton.click();
    manageButton.click();

    root.querySelector<HTMLButtonElement>("#clear-cache")?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.clearPets });
      expect(root.querySelector("#status")?.textContent).toContain("Cleared pet data");
    });

    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "openpet/pet-store" })
    );
  });

  test("supports drag and drop import through the upload field", async () => {
    const sendMessage = vi.fn(async (message: { type: string; payload?: { filename?: string } }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return defaultSnapshot;
      }
      if (message.type === messageTypes.importPet) {
        return { ok: true, petId: "doodlebob" };
      }

      return { ok: true };
    });
    installChromeMock({ locale: "en-US", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);

    const dropzone = root.querySelector("#pet-dropzone") as HTMLLabelElement;
    const file = new File(["zip"], "doodlebob.zip", { type: "application/zip" });
    const dragEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragEvent, "dataTransfer", {
      value: { files: [file] },
      configurable: true,
    });

    dropzone.dispatchEvent(dragEvent);

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.importPet,
        payload: expect.objectContaining({ filename: "doodlebob.zip" }),
      });
      expect(root.querySelector("#status")?.textContent).toContain("Imported Doodle Bob");
    });
  });
});
