import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { getAdapterForUrl } from "@openpet/adapters";
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

  test("selects the matching adapter for DeepSeek and Gemini urls", () => {
    expect(getAdapterForUrl("https://chat.deepseek.com/")?.siteId).toBe("deepseek");
    expect(getAdapterForUrl("https://gemini.google.com/app")?.siteId).toBe("gemini");
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
});
