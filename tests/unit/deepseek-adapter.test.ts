import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  collectDeepSeekSignals,
  detectDeepSeekPage,
  isDeepSeekUrl,
} from "@openpet/adapters/deepseek";

describe("deepseek adapter", () => {
  test("recognizes the target hostname", () => {
    expect(isDeepSeekUrl("https://chat.deepseek.com/")).toBe(true);
    expect(isDeepSeekUrl("https://example.com/")).toBe(false);
  });

  test("detects a page with a composer", () => {
    const dom = new JSDOM(`<textarea></textarea>`, {
      url: "https://chat.deepseek.com/",
    });
    expect(detectDeepSeekPage(dom.window.document)).toBe(true);
  });

  test("detects the live sign-in surface as a supported DeepSeek page", () => {
    const dom = new JSDOM(`<button>发送验证码</button><button>登录</button>`, {
      url: "https://chat.deepseek.com/sign_in",
    });
    expect(detectDeepSeekPage(dom.window.document)).toBe(true);
  });

  test("collects streaming and settled markers", () => {
    document.body.innerHTML = `
      <textarea></textarea>
      <button>Send</button>
      <div data-openpet-streaming="true"></div>
      <div data-openpet-settled="true"></div>
    `;
    const signals = collectDeepSeekSignals(document, { sendTriggered: true });
    expect(signals.responseGrowing).toBe(true);
    expect(signals.settled).toBe(true);
    expect(signals.sendTriggered).toBe(true);
  });
});
