import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountPopup, renderPopup } from "../../apps/chrome-extension/src/popup/main";
import { messageTypes } from "@openpet/shared/messages";
import { storageKeys } from "@openpet/shared/constants";

const defaultSnapshot = {
  pets: [
    { id: "boba", displayName: "Boba", boundSites: ["deepseek"] },
    { id: "doodlebob", displayName: "Doodle Bob", boundSites: ["gemini"] },
  ],
  sitePetBindings: { deepseek: "boba", gemini: "doodlebob" },
  sitePetVisibility: { deepseek: true, gemini: true },
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

    expect(root.textContent).not.toContain("当前状态");
    expect(root.textContent).toContain("清空宠物数据");
    expect(root.textContent).toContain("宠物商店");
    expect(root.textContent).toContain("管理宠物");
    expect(root.textContent).toContain("未来可搭配 companion app 使用");
  });

  test("allows switching locale and persists the selection across rerenders", async () => {
    const { chromeMock } = installChromeMock({ locale: "en-US" });
    const root = document.getElementById("app")!;

    await mountPopup(root);
    expect(root.textContent).toContain("Site bindings");

    const localeButton = root.querySelector<HTMLButtonElement>('[data-locale="zh"]')!;
    localeButton.click();

    await vi.waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
        [storageKeys.popupLocale]: "zh",
      });
      expect(root.textContent).toContain("站点绑定");
    });

    renderPopup(root, defaultSnapshot);
    expect(root.textContent).toContain("站点绑定");
  });

  test("requests snapshot on mount and toggles overlay visibility", async () => {
    const { sendMessage } = installChromeMock({
      locale: "en-US",
      sendMessage: vi.fn(async (message: { type: string }) => {
        if (message.type === messageTypes.popupSnapshot) {
          return {
            pets: [],
            sitePetBindings: {},
            sitePetVisibility: {},
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

  test("supports explicit unbound option and independent site visibility toggles", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          ...defaultSnapshot,
          sitePetVisibility: { deepseek: false, gemini: true },
        };
      }

      return { ok: true };
    });
    installChromeMock({ locale: "zh-CN", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);

    const deepseekSelect = root.querySelector("#binding-deepseek") as HTMLSelectElement;
    expect([...deepseekSelect.options].some((option) => option.value === "")).toBe(true);
    deepseekSelect.value = "";
    deepseekSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const deepseekVisibility = root.querySelector("#visibility-deepseek") as HTMLInputElement;
    expect(deepseekVisibility.checked).toBe(false);
    deepseekVisibility.checked = true;
    deepseekVisibility.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "deepseek", petId: null },
      });
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.setSitePetVisibility,
        payload: { siteId: "deepseek", visible: true },
      });
    });
  });

  test("navigates to manage pets and supports paginated cross-page batch selection", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          ...defaultSnapshot,
          pets: Array.from({ length: 10 }, (_, index) => ({
            id: `pet-${index + 1}`,
            displayName: `Pet ${index + 1}`,
            boundSites: index === 0 ? ["deepseek"] : [],
          })),
        };
      }

      return { ok: true };
    });
    installChromeMock({ locale: "en-US", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);
    root.querySelector<HTMLButtonElement>("#manage-pets")?.click();

    expect(root.textContent).toContain("Manage Pets");
    expect(root.querySelectorAll('[data-pet-card="true"]')).toHaveLength(9);

    (root.querySelector('[data-pet-select="pet-1"]') as HTMLInputElement).click();
    root.querySelector<HTMLButtonElement>("#manage-next-page")?.click();
    await vi.waitFor(() => {
      expect(root.querySelector("#manage-page-indicator")?.textContent).toContain("2 / 2");
    });
    (root.querySelector('[data-pet-select="pet-10"]') as HTMLInputElement).click();
    expect(root.querySelector("#manage-selection-count")?.textContent).toContain("2");

    root.querySelector<HTMLButtonElement>("#manage-delete-selected")?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.deletePets,
        payload: { petIds: ["pet-1", "pet-10"] },
      });
    });
  });

  test("supports batch import through drag and drop with aggregate feedback", async () => {
    const sendMessage = vi.fn(async (message: { type: string; payload?: { files?: Array<{ filename: string }> } }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return defaultSnapshot;
      }
      if (message.type === messageTypes.batchImportPets) {
        return {
          ok: true,
          importedPetIds: ["doodlebob"],
          overwrittenPetIds: ["boba"],
          failures: [{ filename: "broken.zip", error: "Invalid pet package" }],
        };
      }

      return { ok: true };
    });
    installChromeMock({ locale: "en-US", sendMessage });

    const root = document.getElementById("app")!;
    await mountPopup(root);

    const dropzone = root.querySelector("#pet-dropzone") as HTMLLabelElement;
    const files = [
      new File(["zip"], "doodlebob.zip", { type: "application/zip" }),
      new File(["zip"], "boba.zip", { type: "application/zip" }),
      new File(["zip"], "broken.zip", { type: "application/zip" }),
    ];
    const dragEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragEvent, "dataTransfer", {
      value: { files },
      configurable: true,
    });

    dropzone.dispatchEvent(dragEvent);

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.batchImportPets,
        payload: {
          files: expect.arrayContaining([
            expect.objectContaining({ filename: "doodlebob.zip" }),
            expect.objectContaining({ filename: "boba.zip" }),
            expect.objectContaining({ filename: "broken.zip" }),
          ]),
        },
      });
      expect(root.querySelector("#status")?.textContent).toContain("Imported 1");
      expect(root.querySelector("#status")?.textContent).toContain("Overwritten 1");
      expect(root.querySelector("#status")?.textContent).toContain("Failed 1");
    });
  });
});
