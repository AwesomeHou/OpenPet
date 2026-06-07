import type { RawPageSignals } from "@openpet/shared/types";

export function isDoubaoUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const isDoubaoHost = hostname === "www.doubao.com" || hostname === "doubao.com";
    return isDoubaoHost && (pathname === "/chat" || pathname === "/chat/" || pathname.startsWith("/chat/"));
  } catch {
    return false;
  }
}

export function findDoubaoComposer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector("textarea[placeholder='发消息...']") ??
    doc.querySelector("textarea") ??
    doc.querySelector("[contenteditable='true']") ??
    doc.querySelector("input[type='text']") ??
    doc.querySelector("input[placeholder*='豆包']") ??
    doc.querySelector("textarea[placeholder*='豆包']")
  ) as HTMLElement | null;
}

export function findDoubaoSendButton(doc: Document): HTMLButtonElement | null {
  const explicitButton =
    (doc.querySelector("button[class*='send-msg-btn']") as HTMLButtonElement | null) ??
    (doc.querySelector("button[data-testid*='send']") as HTMLButtonElement | null);
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
        label.includes("发送") ||
        label.includes("send") ||
        label.includes("提交") ||
        label.includes("continue")
      );
    }) ?? null
  );
}

export function isDoubaoResponseInProgress(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("button")).some((button) => {
    const label = [
      button.textContent ?? "",
      button.getAttribute("aria-label") ?? "",
      button.getAttribute("title") ?? "",
      button.getAttribute("class") ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return (
      label.includes("stop") ||
      label.includes("停止生成") ||
      label.includes("停止回复") ||
      label.includes("结束生成") ||
      label.includes("生成中") ||
      label.includes("正在生成") ||
      label.includes("停止") ||
      label.includes("中止") ||
      label.includes("generating") ||
      label.includes("loading") ||
      label.includes("processing")
    );
  });
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
    bodyText.includes("下载电脑版") ||
    bodyText.includes("内容由豆包 ai 生成") ||
    bodyText.includes("手机号登录")
  );
}

export function detectDoubaoPage(doc: Document): boolean {
  return (
    isDoubaoUrl(doc.location.href) &&
    (Boolean(findDoubaoComposer(doc)) ||
      Boolean(findDoubaoSendButton(doc)) ||
      findDoubaoAuthSurface(doc))
  );
}

export function collectDoubaoSignals(
  doc: Document,
  previous?: Partial<RawPageSignals>
): RawPageSignals {
  const responseGrowing = Array.from(doc.querySelectorAll("[data-openpet-streaming='true']")).length > 0;
  return {
    site: "doubao",
    composerReady: Boolean(findDoubaoComposer(doc)),
    sendTriggered: previous?.sendTriggered ?? false,
    responseGrowing,
    errorVisible: findDoubaoErrorText(doc),
    settled:
      Array.from(doc.querySelectorAll("[data-openpet-settled='true']")).length > 0 &&
      !responseGrowing &&
      !isDoubaoResponseInProgress(doc),
    tabActive: doc.visibilityState === "visible",
    timestamp: Date.now(),
  };
}
