import type { RawPageSignals } from "@openpet/shared/types";

export function isDeepSeekUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "chat.deepseek.com";
  } catch {
    return false;
  }
}

export function detectDeepSeekPage(doc: Document): boolean {
  return isDeepSeekUrl(doc.location.href) && (Boolean(findComposer(doc)) || findAuthSurface(doc));
}

export function findComposer(doc: Document): HTMLTextAreaElement | HTMLInputElement | null {
  return doc.querySelector("textarea, [contenteditable='true'], input[type='text']");
}

export function findSendButton(doc: Document): HTMLButtonElement | null {
  const buttons = Array.from(doc.querySelectorAll("button"));
  return (
    buttons.find((button) => {
      const label = [
        button.textContent || "",
        button.getAttribute("aria-label") || "",
        button.getAttribute("title") || "",
      ]
        .join(" ")
        .toLowerCase();
      return label.includes("send") || label.includes("发送");
    }) || null
  );
}

export function isDeepSeekResponseInProgress(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("button")).some((button) => {
    const label = [
      button.textContent || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
    ]
      .join(" ")
      .toLowerCase();
    return label.includes("stop") || label.includes("停止") || label.includes("中止");
  });
}

function findErrorText(doc: Document): boolean {
  const selectors = ["[role='alert']", "[aria-live='assertive']", "[data-error]", ".error"];
  return selectors.some((selector) =>
    Array.from(doc.querySelectorAll(selector)).some((node) => {
      const text = node.textContent?.toLowerCase() ?? "";
      return (
        text.includes("something went wrong") ||
        text.includes("request failed") ||
        text.includes("发送失败") ||
        text.includes("请求失败") ||
        text.includes("错误")
      );
    })
  );
}

function findAuthSurface(doc: Document): boolean {
  const bodyText = doc.body.textContent ?? "";
  return (
    bodyText.includes("登录") ||
    bodyText.includes("发送验证码") ||
    bodyText.toLowerCase().includes("password login") ||
    bodyText.includes("微信扫码登录")
  );
}

export function collectDeepSeekSignals(
  doc: Document,
  previous?: Partial<RawPageSignals>
): RawPageSignals {
  const composer = findComposer(doc);
  const sendButton = findSendButton(doc);
  const responseGrowing =
    Array.from(doc.querySelectorAll("[data-openpet-streaming='true']")).length > 0;
  const settled = Array.from(doc.querySelectorAll("[data-openpet-settled='true']")).length > 0;

  return {
    site: "deepseek",
    composerReady: Boolean(composer),
    sendTriggered:
      previous?.sendTriggered ??
      Boolean(sendButton && sendButton.getAttribute("data-openpet-sent") === "true"),
    responseGrowing,
    errorVisible: findErrorText(doc),
    settled,
    tabActive: doc.visibilityState === "visible",
    timestamp: Date.now(),
  };
}
