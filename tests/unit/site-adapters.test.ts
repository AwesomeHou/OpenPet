import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { getAdapterForUrl } from "@openpet/adapters";
import { collectChatGPTSignals, detectChatGPTPage, isChatGPTUrl } from "@openpet/adapters/chatgpt";
import { collectDoubaoSignals, detectDoubaoPage, isDoubaoUrl } from "@openpet/adapters/doubao";
import { collectGeminiSignals, detectGeminiPage, isGeminiUrl } from "@openpet/adapters/gemini";

describe("site adapters", () => {
  test("recognizes Gemini hostnames", () => {
    expect(isGeminiUrl("https://gemini.google.com/app")).toBe(true);
    expect(isGeminiUrl("https://example.com/")).toBe(false);
  });

  test("detects a Gemini page with a composer", () => {
    const dom = new JSDOM(`<div contenteditable="true"></div><button aria-label="Send message"></button>`, {
      url: "https://gemini.google.com/app",
    });
    expect(detectGeminiPage(dom.window.document)).toBe(true);
  });

  test("recognizes ChatGPT and Doubao hostnames", () => {
    expect(isChatGPTUrl("https://chatgpt.com/")).toBe(true);
    expect(isDoubaoUrl("https://www.doubao.com/chat/")).toBe(true);
    expect(isChatGPTUrl("https://example.com/")).toBe(false);
    expect(isDoubaoUrl("https://example.com/")).toBe(false);
  });

  test("detects ChatGPT and Doubao pages with a composer", () => {
    const chatgptDom = new JSDOM(`<textarea id="prompt-textarea"></textarea><button aria-label="Send prompt"></button>`, {
      url: "https://chatgpt.com/",
    });
    expect(detectChatGPTPage(chatgptDom.window.document)).toBe(true);

    const doubaoDom = new JSDOM(`<textarea placeholder="和豆包聊聊"></textarea><button>发送</button>`, {
      url: "https://www.doubao.com/chat/",
    });
    expect(detectDoubaoPage(doubaoDom.window.document)).toBe(true);
  });

  test("selects the matching adapter for DeepSeek, Gemini, ChatGPT, and Doubao urls", () => {
    expect(getAdapterForUrl("https://chat.deepseek.com/")?.siteId).toBe("deepseek");
    expect(getAdapterForUrl("https://gemini.google.com/app")?.siteId).toBe("gemini");
    expect(getAdapterForUrl("https://chatgpt.com/")?.siteId).toBe("chatgpt");
    expect(getAdapterForUrl("https://www.doubao.com/chat/")?.siteId).toBe("doubao");
    expect(getAdapterForUrl("https://example.com/")).toBeNull();
  });

  test("does not mark Gemini as error just because the page mentions the word error", () => {
    const dom = new JSDOM(
      `<div contenteditable="true"></div><div>Learn how to handle network error retries</div>`,
      {
        url: "https://gemini.google.com/app",
      }
    );

    expect(collectGeminiSignals(dom.window.document).errorVisible).toBe(false);
  });

  test("collects ChatGPT and Doubao auth and error surfaces conservatively", () => {
    const chatgptDom = new JSDOM(`<div>Log in to get answers based on saved chats.</div>`, {
      url: "https://chatgpt.com/",
    });
    expect(detectChatGPTPage(chatgptDom.window.document)).toBe(true);
    expect(collectChatGPTSignals(chatgptDom.window.document).composerReady).toBe(false);

    const doubaoDom = new JSDOM(`<div>受区域限制，请先登录再使用豆包。</div><div>该页面暂时不可用</div>`, {
      url: "https://www.doubao.com/chat/",
    });
    const signals = collectDoubaoSignals(doubaoDom.window.document);
    expect(detectDoubaoPage(doubaoDom.window.document)).toBe(true);
    expect(signals.errorVisible).toBe(true);
  });
});
