import type { RawPageSignals } from "@openpet/shared/types";

export function isDoubaoUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "www.doubao.com" || hostname === "doubao.com";
  } catch {
    return false;
  }
}

export function findDoubaoComposer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector("textarea") ??
    doc.querySelector("[contenteditable='true']") ??
    doc.querySelector("input[type='text']") ??
    doc.querySelector("input[placeholder*='豆包']") ??
    doc.querySelector("textarea[placeholder*='豆包']")
  ) as HTMLElement | null;
}

export function findDoubaoSendButton(doc: Document): HTMLButtonElement | null {
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
        label.includes("发送") ||
        label.includes("send") ||
        label.includes("提交") ||
        label.includes("继续")
      );
    }) ?? null
  );
}

function findDoubaoErrorText(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return (
    bodyText.includes("该页面暂时不可用") ||
    bodyText.includes("技术错误") ||
    bodyText.includes("unexpected application error") ||
    bodyText.includes("暂时不可用")
  );
}

function findDoubaoAuthSurface(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return (
    bodyText.includes("受区域限制") ||
    bodyText.includes("请先登录再使用豆包") ||
    bodyText.includes("使用 dola登录") ||
    bodyText.includes("登录") ||
    bodyText.includes("手机号登录")
  );
}

export function detectDoubaoPage(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return (
    isDoubaoUrl(doc.location.href) &&
    (Boolean(findDoubaoComposer(doc)) ||
      Boolean(findDoubaoSendButton(doc)) ||
      findDoubaoAuthSurface(doc) ||
      bodyText.includes("豆包") ||
      bodyText.includes("doubao"))
  );
}

export function collectDoubaoSignals(
  doc: Document,
  previous?: Partial<RawPageSignals>
): RawPageSignals {
  return {
    site: "doubao",
    composerReady: Boolean(findDoubaoComposer(doc)),
    sendTriggered: previous?.sendTriggered ?? false,
    responseGrowing: Array.from(doc.querySelectorAll("[data-openpet-streaming='true']")).length > 0,
    errorVisible: findDoubaoErrorText(doc),
    settled: Array.from(doc.querySelectorAll("[data-openpet-settled='true']")).length > 0,
    tabActive: doc.visibilityState === "visible",
    timestamp: Date.now(),
  };
}
