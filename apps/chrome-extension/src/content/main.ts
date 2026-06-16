import { overlayRootId } from "@openpet/shared/constants";
import { messageTypes, type OpenPetMessage } from "@openpet/shared/messages";
import { applyOverlayUpdate } from "../overlay/renderOverlay";
import { getAdapterForUrl, type SiteAdapter } from "@openpet/adapters";

type RuntimeTracker = {
  sendTriggeredAt: number | null;
  lastRelevantMutationAt: number | null;
  settleTimer: number | null;
  idleResetTimer: number | null;
  cycleSettled: boolean;
  cooldownUntil: number;
};

function createRuntimeTracker(): RuntimeTracker {
  return {
    sendTriggeredAt: null,
    lastRelevantMutationAt: null,
    settleTimer: null,
    idleResetTimer: null,
    cycleSettled: false,
    cooldownUntil: 0,
  };
}

function openSendCycle(runtime: RuntimeTracker): void {
  if (runtime.sendTriggeredAt !== null) {
    return;
  }

  runtime.sendTriggeredAt = Date.now();
  runtime.lastRelevantMutationAt = null;
  runtime.cycleSettled = false;
  runtime.cooldownUntil = 0;
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

function isElementTarget(doc: Document, target: EventTarget | null): target is Element {
  const ElementCtor = doc.defaultView?.Element ?? Element;
  return target instanceof ElementCtor;
}

function isComposerTarget(adapter: SiteAdapter, doc: Document, target: EventTarget | null): boolean {
  if (!isElementTarget(doc, target)) {
    return false;
  }

  const composer = adapter.findComposer(doc);
  return Boolean(composer && (target === composer || composer.contains(target)));
}

function isSendTriggerTarget(adapter: SiteAdapter, doc: Document, target: EventTarget | null): boolean {
  if (!isElementTarget(doc, target)) {
    return false;
  }

  const button = target.closest("button");
  return Boolean(button && button === adapter.findSendButton(doc));
}

export function publishSignals(
  doc: Document = document,
  adapter: SiteAdapter,
  runtime: RuntimeTracker = createRuntimeTracker()
): void {
  const baseSignals = adapter.collectSignals(doc, { sendTriggered: runtime.sendTriggeredAt !== null });
  const now = Date.now();
  const lastRelevantMutationAt = runtime.lastRelevantMutationAt;
  const responseInProgress = runtime.sendTriggeredAt !== null && (adapter.isResponseInProgress?.(doc) ?? false);
  const responseGrowing =
    runtime.sendTriggeredAt !== null &&
    lastRelevantMutationAt !== null &&
    (lastRelevantMutationAt === null || now - lastRelevantMutationAt < 1500);
  const settled =
    runtime.sendTriggeredAt !== null &&
    !responseInProgress &&
    lastRelevantMutationAt !== null &&
    now - lastRelevantMutationAt >= 1500;
  const signals = {
    ...baseSignals,
    sendTriggered: runtime.sendTriggeredAt !== null,
    responseGrowing,
    settled,
  };
  if (signals.settled) {
    runtime.cycleSettled = true;
  }
  console.debug("[openpet-content] publishSignals", JSON.stringify(signals));

  const message: OpenPetMessage = {
    type: messageTypes.pageSignals,
    payload: signals,
  };
  void chrome.runtime.sendMessage(message);
}

export function handleContentMessage(message: OpenPetMessage): void {
  if (message.type === messageTypes.sceneUpdate) {
    console.debug(
      "[openpet-content] sceneUpdate",
      JSON.stringify({
        visible: message.payload.visible,
        pets: message.payload.scene.pets.map((pet) => ({
          id: pet.pet.id,
          siteId: pet.siteId,
          state: pet.state,
        })),
      })
    );
    applyOverlayUpdate(message);
  }
}

async function requestCurrentDisplayState(): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: messageTypes.currentSceneState,
  } as OpenPetMessage);

  if (response?.type === messageTypes.sceneUpdate) {
    handleContentMessage(response);
  }
}

export function bootstrapContentScript(doc: Document = document): MutationObserver {
  const runtime = createRuntimeTracker();
  const view = doc.defaultView ?? window;
  const adapter = getAdapterForUrl(doc.location.href);
  const observationRoot = adapter?.getObservationRoot?.(doc) ?? doc.documentElement;
  const responseRoot = adapter?.getResponseRoot?.(doc) ?? observationRoot;
  chrome.runtime.onMessage.addListener((message: OpenPetMessage) => {
    handleContentMessage(message);
  });

  if (adapter && doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", () => publishSignals(doc, adapter, runtime), { once: true });
  } else if (adapter) {
    publishSignals(doc, adapter, runtime);
  } else {
    void requestCurrentDisplayState();
    return new MutationObserver(() => undefined);
  }

  let publishQueued = false;
  const queuePublish = () => {
    if (publishQueued) {
      return;
    }

    publishQueued = true;
    queueMicrotask(() => {
      publishQueued = false;
      publishSignals(doc, adapter, runtime);
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
        (adapter.isResponseInProgress?.(doc) ?? false) ||
        runtime.lastRelevantMutationAt === null
      ) {
        return;
      }

      if (Date.now() - runtime.lastRelevantMutationAt < 1500) {
        return;
      }

      runtime.sendTriggeredAt = null;
      runtime.lastRelevantMutationAt = null;
      runtime.cycleSettled = false;
      runtime.cooldownUntil = Date.now() + 1500;
      queuePublish();
    }, 2800);
  };

  doc.addEventListener(
    "click",
    (event) => {
      if (isSendTriggerTarget(adapter, doc, event.target)) {
        openSendCycle(runtime);
        scheduleStateTransitions();
        queuePublish();
      }
    },
    true
  );

  doc.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && isComposerTarget(adapter, doc, event.target)) {
        openSendCycle(runtime);
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
        adapter &&
        isComposerTarget(adapter, doc, event.target) &&
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

  const observer = new MutationObserver((mutations) => {
    const hasRelevantMutation = mutations.some((mutation) => {
      const targetNode =
        isElementTarget(doc, mutation.target) ? mutation.target : mutation.target.parentElement;
      return !targetNode?.closest?.(`#${overlayRootId}`);
    });

    if (!hasRelevantMutation) {
      return;
    }

    const hasResponseMutation = mutations.some((mutation) => {
      const targetNode =
        isElementTarget(doc, mutation.target) ? mutation.target : mutation.target.parentElement;
      if (!targetNode || targetNode.closest?.(`#${overlayRootId}`)) {
        return false;
      }
      if (responseRoot instanceof Document) {
        return true;
      }
      return targetNode === responseRoot || responseRoot.contains(targetNode);
    });

    if (
      runtime.sendTriggeredAt === null &&
      (adapter.isResponseInProgress?.(doc) ?? false)
    ) {
      openSendCycle(runtime);
      scheduleStateTransitions();
    }

    if (runtime.sendTriggeredAt !== null && !runtime.cycleSettled && hasResponseMutation) {
      runtime.lastRelevantMutationAt = Date.now();
      scheduleStateTransitions();
    }

    queuePublish();
  });

  observer.observe(observationRoot, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "aria-label", "title", "disabled", "data-testid"],
    characterData: false,
  });

  return observer;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  bootstrapContentScript();
}
