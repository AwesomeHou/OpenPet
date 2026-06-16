import type { RawPageSignals } from "@openpet/shared/types";

export function isChatGPTUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

export function findChatGPTComposer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector("#prompt-textarea") ??
    doc.querySelector("textarea[placeholder*='Message']") ??
    doc.querySelector("textarea") ??
    doc.querySelector("[contenteditable='true'][translate='no']") ??
    doc.querySelector("[contenteditable='true'][data-lexical-editor='true']")
  ) as HTMLElement | null;
}

export function findChatGPTSendButton(doc: Document): HTMLButtonElement | null {
  const explicitButton =
    (doc.querySelector("button[data-testid*='send']") as HTMLButtonElement | null) ??
    (doc.querySelector("button[aria-label*='Send']") as HTMLButtonElement | null);
  if (explicitButton) {
    return explicitButton;
  }

  const buttons = Array.from(doc.querySelectorAll("button"));
  return (
    buttons.find((button) => {
      const label = [
        button.textContent ?? "",
        button.getAttribute("aria-label") ?? "",
        button.getAttribute("title") ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return (
        label.includes("send message") ||
        label.includes("send prompt") ||
        label.includes("send") ||
        label.includes("发送")
      );
    }) ?? null
  );
}

export function isChatGPTResponseInProgress(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("button")).some((button) => {
    const label = [
      button.textContent ?? "",
      button.getAttribute("aria-label") ?? "",
      button.getAttribute("title") ?? "",
      button.getAttribute("data-testid") ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return label.includes("stop generating") || label.includes("stop") || label.includes("abort");
  });
}

function findChatGPTErrorText(doc: Document): boolean {
  const selectors = ["[role='alert']", "[aria-live='assertive']", ".text-red-500", ".text-danger"];
  return selectors.some((selector) =>
    Array.from(doc.querySelectorAll(selector)).some((node) => {
      const text = node.textContent?.toLowerCase() ?? "";
      return (
        text.includes("something went wrong") ||
        text.includes("an error occurred") ||
        text.includes("network error") ||
        text.includes("出了点问题")
      );
    })
  );
}

function findChatGPTAuthSurface(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return (
    bodyText.includes("log in") ||
    bodyText.includes("sign up") ||
    bodyText.includes("continue with google") ||
    bodyText.includes("welcome back") ||
    bodyText.includes("登录") ||
    bodyText.includes("注册")
  );
}

export function detectChatGPTPage(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return (
    isChatGPTUrl(doc.location.href) &&
    (Boolean(findChatGPTComposer(doc)) ||
      Boolean(findChatGPTSendButton(doc)) ||
      findChatGPTAuthSurface(doc) ||
      bodyText.includes("chatgpt") ||
      bodyText.includes("what’s on the agenda today?") ||
      bodyText.includes("what's on the agenda today?"))
  );
}

export function collectChatGPTSignals(
  doc: Document,
  previous?: Partial<RawPageSignals>
): RawPageSignals {
  return {
    site: "chatgpt",
    composerReady: Boolean(findChatGPTComposer(doc)),
    sendTriggered: previous?.sendTriggered ?? false,
    responseGrowing: Array.from(doc.querySelectorAll("[data-openpet-streaming='true']")).length > 0,
    errorVisible: findChatGPTErrorText(doc),
    settled: Array.from(doc.querySelectorAll("[data-openpet-settled='true']")).length > 0,
    tabActive: doc.visibilityState === "visible",
    timestamp: Date.now(),
  };
}
