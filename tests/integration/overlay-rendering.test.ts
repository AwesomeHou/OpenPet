import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyOverlayUpdate,
  getOverlayRoot,
} from "../../apps/chrome-extension/src/overlay/renderOverlay";
import { messageTypes } from "@openpet/shared/messages";

function createSceneUpdate() {
  return {
    type: messageTypes.sceneUpdate,
    payload: {
      scene: {
        visible: true,
        pets: [
          {
            petId: "boba",
            siteId: "deepseek" as const,
            tabId: 7,
            state: "thinking" as const,
            pet: {
              id: "boba",
              displayName: "Boba",
              spritesheetPath: "spritesheet.webp",
              spritesheetDataUrl: "data:image/webp;base64,boba",
              importedAt: 1,
            },
            placement: { left: 16, top: 16, facing: "right" as const },
          },
          {
            petId: "doodlebob",
            siteId: "gemini" as const,
            tabId: 8,
            state: "streaming" as const,
            pet: {
              id: "doodlebob",
              displayName: "Doodle Bob",
              spritesheetPath: "spritesheet.webp",
              spritesheetDataUrl: "data:image/webp;base64,doodlebob",
              importedAt: 1,
            },
            placement: { left: 126, top: 16, facing: "right" as const },
          },
        ],
      },
      visible: true,
    },
  };
}

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
    document.documentElement.querySelectorAll("#openpet-overlay-root").forEach((node) => node.remove());
    const storageState = new Map<string, unknown>();
    const storageListeners: Array<
      (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
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

  test("renders a mirrored multi-pet scene", () => {
    applyOverlayUpdate(createSceneUpdate());

    const root = getOverlayRoot();
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll("button.openpet-button")).toHaveLength(2);
    expect(root?.textContent).toContain("thinking");
    expect(root?.textContent).toContain("streaming");
    expect(root?.querySelector<HTMLElement>('[data-pet-id="doodlebob"] .openpet-sprite')?.style.backgroundImage).toContain("data:image/webp");
  });

  test("dispatches focus messages with the clicked pet tab id", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    });

    applyOverlayUpdate(createSceneUpdate());

    (getOverlayRoot()?.querySelector('[data-pet-id="doodlebob"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: messageTypes.focusTab,
        payload: { tabId: 8 },
      });
    });
  });

  test("suppresses focus when the interaction was actually a drag", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
        onChanged: {
          addListener: vi.fn(),
        },
      },
    });

    applyOverlayUpdate(createSceneUpdate());

    const button = getOverlayRoot()?.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    button.onpointerdown?.(
      createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 }) as PointerEvent
    );
    button.onpointermove?.(
      createPointerEvent("pointermove", { pointerId: 7, clientX: 52, clientY: 66 }) as PointerEvent
    );
    button.onpointerup?.(
      createPointerEvent("pointerup", { pointerId: 7, clientX: 52, clientY: 66 }) as PointerEvent
    );
    button.click();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("supports dragging one pet without moving the other", async () => {
    applyOverlayUpdate(createSceneUpdate());

    const root = getOverlayRoot() as HTMLDivElement;
    const button = root.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    const otherButton = root.querySelector('[data-pet-id="doodlebob"]') as HTMLButtonElement;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      right: 236,
      bottom: 140,
      width: 220,
      height: 124,
      toJSON: () => undefined,
    } as DOMRect);

    button.onpointerdown?.(createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 }) as PointerEvent);
    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 52, clientY: 66 }) as PointerEvent);
    button.onpointerup?.(createPointerEvent("pointerup", { pointerId: 7, clientX: 52, clientY: 66 }) as PointerEvent);

    expect((button.parentElement as HTMLElement).style.left || button.style.left).toBe("44px");
    expect((button.parentElement as HTMLElement).style.top || button.style.top).toBe("54px");
    expect((otherButton.parentElement as HTMLElement).style.left || otherButton.style.left).not.toBe("44px");
  });

  test("keeps the dragged position locally before scene storage catches up", () => {
    applyOverlayUpdate(createSceneUpdate());

    const root = getOverlayRoot() as HTMLDivElement;
    const button = root.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      right: 236,
      bottom: 140,
      width: 220,
      height: 124,
      toJSON: () => undefined,
    } as DOMRect);

    button.onpointerdown?.(createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 }) as PointerEvent);
    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 60, clientY: 70 }) as PointerEvent);
    button.onpointerup?.(createPointerEvent("pointerup", { pointerId: 7, clientX: 60, clientY: 70 }) as PointerEvent);

    expect(button.style.left).toBe("52px");
    expect(button.style.top).toBe("58px");

    applyOverlayUpdate(createSceneUpdate());

    expect(button.style.left).toBe("52px");
    expect(button.style.top).toBe("58px");
  });

  test("uses hover running animation while the pointer is over a pet", () => {
    applyOverlayUpdate(createSceneUpdate());

    const button = getOverlayRoot()?.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    const sprite = button.querySelector(".openpet-sprite") as HTMLElement;

    expect(sprite.dataset.action).toBe("review");

    button.onpointerenter?.(new Event("pointerenter") as PointerEvent);

    expect(sprite.dataset.action).toBe("running");

    button.onpointerleave?.(new Event("pointerleave") as PointerEvent);

    expect(sprite.dataset.action).toBe("review");
  });

  test("uses directional running animation while dragging left and right", () => {
    applyOverlayUpdate(createSceneUpdate());

    const button = getOverlayRoot()?.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    const sprite = button.querySelector(".openpet-sprite") as HTMLElement;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      right: 236,
      bottom: 140,
      width: 220,
      height: 124,
      toJSON: () => undefined,
    } as DOMRect);

    button.onpointerdown?.(createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 }) as PointerEvent);
    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 58, clientY: 28 }) as PointerEvent);
    expect(sprite.dataset.action).toBe("running-right");

    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 4, clientY: 28 }) as PointerEvent);
    expect(sprite.dataset.action).toBe("running-left");

    button.onpointerup?.(createPointerEvent("pointerup", { pointerId: 7, clientX: 4, clientY: 28 }) as PointerEvent);
    expect(sprite.dataset.action).toBe("review");
  });

  test("switches drag direction immediately based on the latest movement delta", () => {
    applyOverlayUpdate(createSceneUpdate());

    const button = getOverlayRoot()?.querySelector('[data-pet-id="boba"]') as HTMLButtonElement;
    const sprite = button.querySelector(".openpet-sprite") as HTMLElement;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      right: 236,
      bottom: 140,
      width: 220,
      height: 124,
      toJSON: () => undefined,
    } as DOMRect);

    button.onpointerdown?.(createPointerEvent("pointerdown", { button: 0, pointerId: 7, clientX: 24, clientY: 28 }) as PointerEvent);
    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 58, clientY: 28 }) as PointerEvent);
    expect(sprite.dataset.action).toBe("running-right");

    button.onpointermove?.(createPointerEvent("pointermove", { pointerId: 7, clientX: 54, clientY: 28 }) as PointerEvent);
    expect(sprite.dataset.action).toBe("running-left");
  });

  test("keeps both pet animations running independently", () => {
    applyOverlayUpdate(createSceneUpdate());

    const deepseekSprite = getOverlayRoot()?.querySelector<HTMLElement>('[data-pet-id="boba"] .openpet-sprite');
    const geminiSprite = getOverlayRoot()?.querySelector<HTMLElement>('[data-pet-id="doodlebob"] .openpet-sprite');

    const initialDeepseekFrame = deepseekSprite?.dataset.frame;
    const initialGeminiAction = geminiSprite?.dataset.action;

    vi.advanceTimersByTime(320);

    expect(deepseekSprite?.dataset.frame).not.toBe(initialDeepseekFrame);
    expect(geminiSprite?.dataset.action).toBe(initialGeminiAction);
  });
});
