import type { RawPageSignals } from "@openpet/shared/types";

export function isGeminiUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "gemini.google.com";
  } catch {
    return false;
  }
}

export function findGeminiComposer(doc: Document): HTMLElement | null {
  return (
    doc.querySelector("[contenteditable='true']") ??
    doc.querySelector("textarea") ??
    doc.querySelector("input[type='text']")
  ) as HTMLElement | null;
}

export function findGeminiSendButton(doc: Document): HTMLButtonElement | null {
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

      return label.includes("send") || label.includes("submit") || label.includes("发送");
    }) ?? null
  );
}

export function isGeminiResponseInProgress(doc: Document): boolean {
  return Array.from(doc.querySelectorAll("button")).some((button) => {
    const label = [
      button.textContent ?? "",
      button.getAttribute("aria-label") ?? "",
      button.getAttribute("title") ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return (
      label.includes("stop") ||
      label.includes("停止") ||
      label.includes("cancel") ||
      label.includes("generating")
    );
  });
}

function findGeminiErrorText(doc: Document): boolean {
  const alertSelectors = [
    "[role='alert']",
    "[aria-live='assertive']",
    "[data-error]",
    ".error",
  ];
  return alertSelectors.some((selector) =>
    Array.from(doc.querySelectorAll(selector)).some((node) => {
      const text = node.textContent?.toLowerCase() ?? "";
      return text.includes("something went wrong") || text.includes("try again");
    })
  );
}

function findGeminiAuthSurface(doc: Document): boolean {
  const bodyText = doc.body.textContent?.toLowerCase() ?? "";
  return bodyText.includes("sign in") || bodyText.includes("登录");
}

export function detectGeminiPage(doc: Document): boolean {
  return (
    isGeminiUrl(doc.location.href) &&
    (Boolean(findGeminiComposer(doc)) ||
      Boolean(findGeminiSendButton(doc)) ||
      findGeminiAuthSurface(doc) ||
      doc.body.textContent?.toLowerCase().includes("gemini") === true)
  );
}

export function collectGeminiSignals(
  doc: Document,
  previous?: Partial<RawPageSignals>
): RawPageSignals {
  return {
    site: "gemini",
    composerReady: Boolean(findGeminiComposer(doc)),
    sendTriggered: previous?.sendTriggered ?? false,
    responseGrowing: Array.from(doc.querySelectorAll("[data-openpet-streaming='true']")).length > 0,
    errorVisible: findGeminiErrorText(doc),
    settled: Array.from(doc.querySelectorAll("[data-openpet-settled='true']")).length > 0,
    tabActive: doc.visibilityState === "visible",
    timestamp: Date.now(),
  };
}
