import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountPopup, renderPopup } from "../../apps/chrome-extension/src/popup/main";
import { messageTypes } from "@openpet/shared/messages";

describe("popup flow", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  test("renders current state and site bindings from snapshot", () => {
    const root = document.getElementById("app")!;
    renderPopup(root, {
      currentTab: { state: "thinking", site: "gemini" },
      pets: [{ id: "boba", displayName: "Boba" }, { id: "doodlebob", displayName: "Doodle Bob" }],
      sitePetBindings: { deepseek: "boba", gemini: "doodlebob" },
      overlayVisible: true,
    });

    expect(root.textContent).toContain("State: thinking");
    expect(root.textContent).toContain("Current site: gemini");
    expect(root.textContent).toContain("DeepSeek pet");
    expect(root.textContent).toContain("Gemini pet");
  });

  test("requests snapshot on mount and toggles overlay visibility", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          currentTab: { state: "idle", site: "deepseek" },
          pets: [],
          sitePetBindings: {},
          overlayVisible: true,
        };
      }

      return { ok: true };
    });
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
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

  test("allows rebinding DeepSeek and Gemini pets", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          currentTab: { state: "idle", site: "deepseek" },
          pets: [
            { id: "boba", displayName: "Boba" },
            { id: "doodlebob", displayName: "Doodle Bob" },
          ],
          sitePetBindings: { deepseek: "boba", gemini: "doodlebob" },
          overlayVisible: true,
        };
      }

      return { ok: true };
    });
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
    });

    const root = document.getElementById("app")!;
    renderPopup(root, {
      currentTab: { state: "idle", site: "deepseek" },
      pets: [
        { id: "boba", displayName: "Boba" },
        { id: "doodlebob", displayName: "Doodle Bob" },
      ],
      sitePetBindings: { deepseek: "boba", gemini: "doodlebob" },
      overlayVisible: true,
    });

    const deepseekSelect = root.querySelector("#binding-deepseek") as HTMLSelectElement;
    deepseekSelect.value = "doodlebob";
    deepseekSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const geminiSelect = root.querySelector("#binding-gemini") as HTMLSelectElement;
    geminiSelect.value = "boba";
    geminiSelect.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "deepseek", petId: "doodlebob" },
      });
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.setSitePetBinding,
        payload: { siteId: "gemini", petId: "boba" },
      });
    });
  });
});
