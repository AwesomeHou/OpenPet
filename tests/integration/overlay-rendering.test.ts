import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyOverlayUpdate,
  getOverlayRoot,
} from "../../apps/chrome-extension/src/overlay/renderOverlay";
import { messageTypes } from "@openpet/shared/messages";

function createPointerEvent(
  type: string,
  init: { button?: number; pointerId: number; clientX: number; clientY: number }
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, init);
  return event;
}

describe("overlay rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    document.documentElement
      .querySelectorAll("#openpet-overlay-root")
      .forEach((node) => node.remove());
    const storageState = new Map<string, unknown>();
    const storageListeners: Array<
      (
        changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
        areaName: string
      ) => void
    > = [];
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn(async () => undefined),
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storageState.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
            for (const [key, value] of Object.entries(items)) {
              changes[key] = { oldValue: storageState.get(key), newValue: value };
              storageState.set(key, value);
            }
            storageListeners.forEach((listener) => listener(changes, "local"));
          }),
        },
        onChanged: {
          addListener: vi.fn((listener) => {
            storageListeners.push(listener);
          }),
        },
      },
    };
    vi.stubGlobal("chrome", chromeMock);
    Object.defineProperty(globalThis, "chrome", {
      value: chromeMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "chrome", {
      value: chromeMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the pet and normalized state label", () => {
    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "streaming",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const root = getOverlayRoot();
    expect(root).not.toBeNull();
    expect(root?.querySelector(".openpet-state")?.textContent).toBe("streaming");
    const sprite = root?.querySelector<HTMLElement>(".openpet-sprite");
    expect(sprite?.style.backgroundImage).toContain("data:image/webp");
    expect(sprite?.dataset.action).toBe("running");
  });

  test("dispatches focus messages when clicked", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
    });

    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "idle",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    (getOverlayRoot()?.querySelector("button") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.focusTab });
    });
  });

  test("upgrades an old img-based overlay root to the atlas sprite structure", () => {
    document.documentElement.insertAdjacentHTML(
      "beforeend",
      `
        <div id="openpet-overlay-root">
          <style>#openpet-overlay-root img { width: 72px; height: 72px; }</style>
          <button class="openpet-button" type="button">
            <img alt="OpenPet" src="data:image/webp;base64,legacy" />
            <div class="openpet-state">idle</div>
          </button>
        </div>
      `
    );

    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "waiting",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const root = getOverlayRoot();
    expect(root?.querySelector("img")).toBeNull();
    expect(root?.querySelector(".openpet-sprite")).not.toBeNull();
    expect(root?.querySelector(".openpet-state")?.textContent).toBe("waiting");
  });

  test("keeps the existing overlay nodes across identical updates", () => {
    const message = {
      type: messageTypes.stateUpdate,
      payload: {
        state: "idle" as const,
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    };

    applyOverlayUpdate(message);

    const firstButton = getOverlayRoot()?.querySelector("button.openpet-button");
    const firstSprite = getOverlayRoot()?.querySelector(".openpet-sprite");
    const firstLabel = getOverlayRoot()?.querySelector(".openpet-state");

    applyOverlayUpdate(message);

    expect(getOverlayRoot()?.querySelector("button.openpet-button")).toBe(firstButton);
    expect(getOverlayRoot()?.querySelector(".openpet-sprite")).toBe(firstSprite);
    expect(getOverlayRoot()?.querySelector(".openpet-state")).toBe(firstLabel);
  });

  test("supports dragging without firing the focus action", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
    });

    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "idle",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const root = getOverlayRoot() as HTMLDivElement;
    const button = root.querySelector("button.openpet-button") as HTMLButtonElement;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      right: 112,
      bottom: 120,
      width: 96,
      height: 104,
      toJSON: () => undefined,
    } as DOMRect);

    button.dispatchEvent(
      createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 })
    );
    button.dispatchEvent(
      createPointerEvent("pointermove", { pointerId: 7, clientX: 52, clientY: 66 })
    );
    button.dispatchEvent(
      createPointerEvent("pointerup", { pointerId: 7, clientX: 52, clientY: 66 })
    );
    button.click();

    expect(root.style.left).toBe("44px");
    expect(root.style.top).toBe("54px");
    expect(button.querySelector<HTMLElement>(".openpet-sprite")?.dataset.action).toBe("idle");
    expect(sendMessage).not.toHaveBeenCalled();

    button.click();
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.focusTab });
    });
  });

  test("mirrors the sprite toward the drag direction", async () => {
    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "idle",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const root = getOverlayRoot() as HTMLDivElement;
    const button = root.querySelector("button.openpet-button") as HTMLButtonElement;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 160,
      left: 120,
      top: 160,
      right: 216,
      bottom: 264,
      width: 96,
      height: 104,
      toJSON: () => undefined,
    } as DOMRect);

    button.dispatchEvent(
      createPointerEvent("pointerdown", { button: 0, pointerId: 9, clientX: 180, clientY: 180 })
    );
    button.dispatchEvent(
      createPointerEvent("pointermove", { pointerId: 9, clientX: 130, clientY: 200 })
    );
    const sprite = root.querySelector<HTMLElement>(".openpet-sprite");
    expect(root.style.left).toBe("70px");
    expect(root.style.top).toBe("180px");
    expect(sprite?.dataset.action).toBe("running-left");
    button.dispatchEvent(
      createPointerEvent("pointerup", { pointerId: 9, clientX: 130, clientY: 200 })
    );
    expect(sprite?.dataset.action).toBe("idle");
  });

  test("switches drag direction immediately when the pointer reverses", () => {
    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "idle",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const root = getOverlayRoot() as HTMLDivElement;
    const button = root.querySelector("button.openpet-button") as HTMLButtonElement;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 160,
      left: 120,
      top: 160,
      right: 216,
      bottom: 264,
      width: 96,
      height: 104,
      toJSON: () => undefined,
    } as DOMRect);

    button.dispatchEvent(
      createPointerEvent("pointerdown", { button: 0, pointerId: 11, clientX: 180, clientY: 180 })
    );
    button.dispatchEvent(
      createPointerEvent("pointermove", { pointerId: 11, clientX: 150, clientY: 190 })
    );

    const sprite = root.querySelector<HTMLElement>(".openpet-sprite");
    expect(sprite?.dataset.action).toBe("running-left");

    button.dispatchEvent(
      createPointerEvent("pointermove", { pointerId: 11, clientX: 158, clientY: 194 })
    );
    expect(sprite?.dataset.action).toBe("running-right");
    button.dispatchEvent(
      createPointerEvent("pointerup", { pointerId: 11, clientX: 158, clientY: 194 })
    );
  });

  test("uses the running action while hovered and returns to the mapped business action after leave", () => {
    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "thinking",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const button = getOverlayRoot()?.querySelector("button.openpet-button") as HTMLButtonElement;
    const sprite = button.querySelector<HTMLElement>(".openpet-sprite");

    expect(sprite?.dataset.action).toBe("review");
    button.dispatchEvent(createPointerEvent("pointerenter", { pointerId: 3, clientX: 0, clientY: 0 }));
    expect(sprite?.dataset.action).toBe("running");
    button.dispatchEvent(createPointerEvent("pointerleave", { pointerId: 3, clientX: 0, clientY: 0 }));
    expect(sprite?.dataset.action).toBe("review");
  });

  test("plays waving for done and then falls back to idle", () => {
    applyOverlayUpdate({
      type: messageTypes.stateUpdate,
      payload: {
        state: "done",
        visible: true,
        pet: {
          id: "boba",
          displayName: "Boba",
          spritesheetPath: "spritesheet.webp",
          spritesheetDataUrl: "data:image/webp;base64,abc",
          importedAt: 1,
        },
      },
    });

    const sprite = getOverlayRoot()?.querySelector<HTMLElement>(".openpet-sprite");
    expect(sprite?.dataset.action).toBe("waving");

    vi.advanceTimersByTime(750);

    expect(sprite?.dataset.action).toBe("idle");
  });
});
