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
    expect(isDoubaoUrl("https://www.doubao.com/")).toBe(false);
    expect(isDoubaoUrl("https://www.doubao.com/legal/feature_intro")).toBe(false);
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

  test("matches Doubao's real composer placeholder and send button pattern", () => {
    const dom = new JSDOM(
      `<div>内容由豆包 AI 生成，请仔细甄别</div>
       <button>登录</button>
       <textarea class="semi-input-textarea semi-input-textarea-autosize" placeholder="发消息..."></textarea>
       <button class="size-36 !bg-g-send-msg-btn-bg" aria-label=""></button>`,
      {
        url: "https://www.doubao.com/chat/",
      }
    );

    const signals = collectDoubaoSignals(dom.window.document);
    expect(detectDoubaoPage(dom.window.document)).toBe(true);
    expect(signals.composerReady).toBe(true);
  });

  test("does not activate Doubao adapter on non-chat pages just because the brand text is present", () => {
    const dom = new JSDOM(`<div>豆包</div><button>登录</button><button>下载电脑版</button>`, {
      url: "https://www.doubao.com/",
    });

    expect(detectDoubaoPage(dom.window.document)).toBe(false);
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
