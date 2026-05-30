import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  bootstrapContentScript,
  handleContentMessage,
} from "../../apps/chrome-extension/src/content/main";
import { getOverlayRoot } from "../../apps/chrome-extension/src/overlay/renderOverlay";
import { messageTypes } from "@openpet/shared/messages";

describe("content and overlay flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("publishes page signals on bootstrap and reacts to state updates", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
    const dom = new JSDOM(`<textarea></textarea><button>Send</button>`, {
      url: "https://chat.deepseek.com/",
    });
    Object.defineProperty(dom.window.document, "readyState", {
      value: "complete",
      configurable: true,
    });

    const observer = bootstrapContentScript(dom.window.document);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: messageTypes.pageSignals })
    );

    handleContentMessage({
      type: messageTypes.stateUpdate,
      payload: {
        state: "done",
        visible: true,
        pet: null,
      },
    });

    expect(getOverlayRoot()?.textContent).toContain("done");
    observer.disconnect();
  });

  test("renders broadcast state updates on non-target pages without publishing site signals", async () => {
    const sendMessage = vi.fn(async () => undefined);
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
      expect(sendMessage).toHaveBeenCalledWith({ type: messageTypes.currentDisplayState });
    });

    handleContentMessage({
      type: messageTypes.stateUpdate,
      payload: {
        state: "waiting",
        visible: true,
        pet: null,
      },
    });

    expect(getOverlayRoot()?.textContent).toContain("waiting");
  });

  test("promotes DeepSeek state when network activity starts and settles", async () => {
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
    const dom = new JSDOM(`<textarea></textarea><button>Send</button>`, {
      url: "https://chat.deepseek.com/",
    });
    Object.defineProperty(dom.window.document, "readyState", {
      value: "complete",
      configurable: true,
    });

    bootstrapContentScript(dom.window.document);
    dom.window.dispatchEvent(new dom.window.CustomEvent("openpet:network-start"));

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: messageTypes.pageSignals,
          payload: expect.objectContaining({
            sendTriggered: true,
            responseGrowing: true,
          }),
        })
      );
    });

    dom.window.dispatchEvent(new dom.window.CustomEvent("openpet:network-end"));
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: messageTypes.pageSignals,
          payload: expect.objectContaining({
            sendTriggered: true,
          }),
        })
      );
    });

    vi.advanceTimersByTime(1700);
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: messageTypes.pageSignals,
          payload: expect.objectContaining({
            settled: true,
          }),
        })
      );
    });

    vi.advanceTimersByTime(1300);
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: messageTypes.pageSignals,
          payload: expect.objectContaining({
            sendTriggered: false,
            responseGrowing: false,
            settled: false,
          }),
        })
      );
    });
  });
});
