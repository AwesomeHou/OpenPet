import { beforeEach, describe, expect, test, vi } from "vitest";
import { mountPopup, renderPopup } from "../../apps/chrome-extension/src/popup/main";
import { messageTypes } from "@openpet/shared/messages";

describe("popup flow", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  test("renders current state and selected pet from snapshot", () => {
    const root = document.getElementById("app")!;
    renderPopup(root, {
      currentTab: { state: "thinking" },
      pets: [{ id: "boba", displayName: "Boba" }],
      selectedPetId: "boba",
      overlayVisible: true,
    });

    expect(root.textContent).toContain("State: thinking");
    expect(root.textContent).toContain("Selected pet: Boba");
  });

  test("requests snapshot on mount and toggles overlay visibility", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          currentTab: { state: "idle" },
          pets: [],
          selectedPetId: null,
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

  test("allows selecting a pet and clearing the local pet cache", async () => {
    const sendMessage = vi.fn(async (message: { type: string; payload?: { petId?: string } }) => {
      if (message.type === messageTypes.popupSnapshot) {
        return {
          currentTab: { state: "idle" },
          pets: [{ id: "boba", displayName: "Boba" }],
          selectedPetId: "boba",
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
      currentTab: { state: "idle" },
      pets: [
        { id: "boba", displayName: "Boba" },
        { id: "mochi", displayName: "Mochi" },
      ],
      selectedPetId: "boba",
      overlayVisible: true,
    });

    const select = root.querySelector("#pet-select") as HTMLSelectElement;
    select.value = "mochi";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.selectPet,
        payload: { petId: "mochi" },
      });
    });

    const clearButton = root.querySelector("#clear-cache") as HTMLButtonElement;
    clearButton.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.clearPets });
    });
  });
});
