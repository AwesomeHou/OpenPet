import { overlayRootId } from "@openpet/shared/constants";
import { messageTypes, type OpenPetMessage } from "@openpet/shared/messages";
import { applyOverlayUpdate } from "../overlay/renderOverlay";
import {
  collectDeepSeekSignals,
  detectDeepSeekPage,
  findComposer,
  findSendButton,
  isDeepSeekUrl,
} from "@openpet/adapters/deepseek";

type RuntimeTracker = {
  sendTriggeredAt: number | null;
  lastRelevantMutationAt: number | null;
  networkActive: boolean;
  settleTimer: number | null;
  idleResetTimer: number | null;
};

const networkStartEvent = "openpet:network-start";
const networkEndEvent = "openpet:network-end";
const networkProbeAttribute = "data-openpet-network-probe";

function createRuntimeTracker(): RuntimeTracker {
  return {
    sendTriggeredAt: null,
    lastRelevantMutationAt: null,
    networkActive: false,
    settleTimer: null,
    idleResetTimer: null,
  };
}

function markSendTriggered(runtime: RuntimeTracker): void {
  runtime.sendTriggeredAt = Date.now();
  runtime.lastRelevantMutationAt = null;
}

function clearScheduledTransitions(runtime: RuntimeTracker, view: Window): void {
  if (runtime.settleTimer !== null) {
    view.clearTimeout(runtime.settleTimer);
    runtime.settleTimer = null;
  }

  if (runtime.idleResetTimer !== null) {
    view.clearTimeout(runtime.idleResetTimer);
    runtime.idleResetTimer = null;
  }
}

function injectNetworkProbe(doc: Document): void {
  if (doc.documentElement.hasAttribute(networkProbeAttribute)) {
    return;
  }

  doc.documentElement.setAttribute(networkProbeAttribute, "true");
  const script = doc.createElement("script");
  script.textContent = `
    (() => {
      const startEvent = ${JSON.stringify(networkStartEvent)};
      const endEvent = ${JSON.stringify(networkEndEvent)};
      let activeRequests = 0;
      const dispatch = (name) => window.dispatchEvent(new CustomEvent(name));
      const begin = () => {
        activeRequests += 1;
        if (activeRequests === 1) dispatch(startEvent);
      };
      const end = () => {
        activeRequests = Math.max(0, activeRequests - 1);
        if (activeRequests === 0) dispatch(endEvent);
      };

      const originalFetch = window.fetch;
      if (typeof originalFetch === "function") {
        window.fetch = async (...args) => {
          begin();
          try {
            return await originalFetch(...args);
          } finally {
            end();
          }
        };
      }

      const OriginalXHR = window.XMLHttpRequest;
      if (typeof OriginalXHR === "function") {
        const originalOpen = OriginalXHR.prototype.open;
        const originalSend = OriginalXHR.prototype.send;
        OriginalXHR.prototype.open = function(...args) {
          this.__openpetTracked = true;
          return originalOpen.apply(this, args);
        };
        OriginalXHR.prototype.send = function(...args) {
          if (this.__openpetTracked) {
            begin();
            this.addEventListener("loadend", () => end(), { once: true });
          }
          return originalSend.apply(this, args);
        };
      }
    })();
  `;
  (doc.head ?? doc.documentElement).appendChild(script);
  script.remove();
}

function isComposerTarget(doc: Document, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const composer = findComposer(doc);
  return Boolean(composer && (target === composer || composer.contains(target)));
}

function isSendTriggerTarget(doc: Document, target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const button = target.closest("button");
  return Boolean(button && button === findSendButton(doc));
}

export function publishSignals(
  doc: Document = document,
  runtime: RuntimeTracker = createRuntimeTracker()
): void {
  if (!detectDeepSeekPage(doc)) {
    return;
  }

  const baseSignals = collectDeepSeekSignals(doc);
  const now = Date.now();
  const lastRelevantMutationAt = runtime.lastRelevantMutationAt;
  const responseGrowing =
    runtime.sendTriggeredAt !== null &&
    (runtime.networkActive || lastRelevantMutationAt !== null) &&
    (lastRelevantMutationAt === null || now - lastRelevantMutationAt < 1500);
  const settled =
    runtime.sendTriggeredAt !== null &&
    !runtime.networkActive &&
    lastRelevantMutationAt !== null &&
    now - lastRelevantMutationAt >= 1500;
  const signals = {
    ...baseSignals,
    sendTriggered: runtime.sendTriggeredAt !== null,
    responseGrowing,
    settled,
  };
  console.debug("[openpet-content] publishSignals", JSON.stringify(signals));

  const message: OpenPetMessage = {
    type: messageTypes.pageSignals,
    payload: signals,
  };
  void chrome.runtime.sendMessage(message);
}

export function handleContentMessage(message: OpenPetMessage): void {
  if (message.type === messageTypes.stateUpdate) {
    console.debug(
      "[openpet-content] stateUpdate",
      JSON.stringify({
        state: message.payload.state,
        visible: message.payload.visible,
        pet: message.payload.pet
          ? {
              id: message.payload.pet.id,
              displayName: message.payload.pet.displayName,
            }
          : null,
      })
    );
    applyOverlayUpdate(message);
  }
}

async function requestCurrentDisplayState(): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: messageTypes.currentDisplayState,
  } as OpenPetMessage);

  if (response?.type === messageTypes.stateUpdate) {
    handleContentMessage(response);
  }
}

export function bootstrapContentScript(doc: Document = document): MutationObserver {
  const runtime = createRuntimeTracker();
  const view = doc.defaultView ?? window;
  chrome.runtime.onMessage.addListener((message: OpenPetMessage) => {
    handleContentMessage(message);
  });

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => publishSignals(doc, runtime), { once: true });
  } else {
    publishSignals(doc, runtime);
  }

  if (!isDeepSeekUrl(doc.location.href)) {
    void requestCurrentDisplayState();
    return new MutationObserver(() => undefined);
  }

  injectNetworkProbe(doc);

  let publishQueued = false;
  const queuePublish = () => {
    if (publishQueued) {
      return;
    }

    publishQueued = true;
    queueMicrotask(() => {
      publishQueued = false;
      publishSignals(doc, runtime);
    });
  };

  const scheduleStateTransitions = () => {
    clearScheduledTransitions(runtime, view);
    if (runtime.sendTriggeredAt === null) {
      return;
    }

    runtime.settleTimer = view.setTimeout(() => {
      queuePublish();
    }, 1600);

    runtime.idleResetTimer = view.setTimeout(() => {
      if (
        runtime.sendTriggeredAt === null ||
        runtime.networkActive ||
        runtime.lastRelevantMutationAt === null
      ) {
        return;
      }

      if (Date.now() - runtime.lastRelevantMutationAt < 1500) {
        return;
      }

      runtime.sendTriggeredAt = null;
      runtime.lastRelevantMutationAt = null;
      queuePublish();
    }, 2800);
  };

  doc.addEventListener(
    "click",
    (event) => {
      if (isSendTriggerTarget(doc, event.target)) {
        markSendTriggered(runtime);
        scheduleStateTransitions();
        queuePublish();
      }
    },
    true
  );

  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && isComposerTarget(doc, event.target)) {
        markSendTriggered(runtime);
        scheduleStateTransitions();
        queuePublish();
      }
    },
    true
  );

  doc.addEventListener(
    "input",
    (event) => {
      if (
        isComposerTarget(doc, event.target) &&
        runtime.sendTriggeredAt !== null &&
        runtime.lastRelevantMutationAt === null
      ) {
        runtime.sendTriggeredAt = null;
        clearScheduledTransitions(runtime, view);
        queuePublish();
      }
    },
    true
  );

  view.addEventListener(networkStartEvent, () => {
    runtime.networkActive = true;
    markSendTriggered(runtime);
    runtime.lastRelevantMutationAt = Date.now();
    scheduleStateTransitions();
    queuePublish();
  });

  view.addEventListener(networkEndEvent, () => {
    runtime.networkActive = false;
    runtime.lastRelevantMutationAt = Date.now();
    scheduleStateTransitions();
    queuePublish();
  });

  const observer = new MutationObserver((mutations) => {
    const hasRelevantMutation = mutations.some((mutation) => {
      const targetNode =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      return !targetNode?.closest?.(`#${overlayRootId}`);
    });

    if (!hasRelevantMutation) {
      return;
    }

    if (runtime.sendTriggeredAt !== null) {
      runtime.lastRelevantMutationAt = Date.now();
      scheduleStateTransitions();
    }

    queuePublish();
  });

  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: false,
  });

  return observer;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  bootstrapContentScript();
}
