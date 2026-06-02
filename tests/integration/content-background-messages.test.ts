import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  bootstrapContentScript,
  handleContentMessage,
} from "../../apps/chrome-extension/src/content/main";
import { getOverlayRoot } from "../../apps/chrome-extension/src/overlay/renderOverlay";
import { messageTypes } from "@openpet/shared/messages";

function createSceneMessage(state: "idle" | "thinking" | "streaming" | "waiting" | "error" | "done") {
  return {
    type: messageTypes.sceneUpdate,
    payload: {
      scene: {
        visible: true,
        pets: [
          {
            petId: "doodlebob",
            siteId: "gemini",
            tabId: 8,
            state,
            pet: {
              id: "doodlebob",
              displayName: "Doodle Bob",
              spritesheetPath: "spritesheet.webp",
              spritesheetDataUrl: "data:image/webp;base64,abc",
              importedAt: 1,
            },
            placement: {
              left: 16,
              top: 16,
              facing: "right" as const,
            },
          },
        ],
      },
      visible: true,
      animationSpeed: 1,
    },
  };
}

describe("content and overlay flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("publishes Gemini page signals on bootstrap and reacts to scene updates", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
    const dom = new JSDOM(
      `<div contenteditable="true"></div><button aria-label="Send message">Send</button>`,
      {
        url: "https://gemini.google.com/app",
      }
    );
    Object.defineProperty(dom.window.document, "readyState", {
      value: "complete",
      configurable: true,
    });

    const observer = bootstrapContentScript(dom.window.document);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: messageTypes.pageSignals,
        payload: expect.objectContaining({ site: "gemini" }),
      })
    );

    handleContentMessage(createSceneMessage("done") as never);

    expect(getOverlayRoot()?.textContent).toContain("done");
    observer.disconnect();
  });

  test("renders mirrored scene updates on non-target pages without publishing page signals", async () => {
    const sendMessage = vi.fn(async () => createSceneMessage("waiting"));
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
    const dom = new JSDOM(`<main>Docs</main>`, {
      url: "https://example.com/",
    });
    Object.defineProperty(dom.window.document, "readyState", {
      value: "complete",
      configurable: true,
    });

    bootstrapContentScript(dom.window.document);
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.currentSceneState });
    });

    expect(getOverlayRoot()?.textContent).toContain("waiting");
  });
});
