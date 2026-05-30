import { overlayRootId, storageKeys } from "@openpet/shared/constants";
import {
  messageTypes,
  type FocusTabMessage,
  type StateUpdateMessage,
} from "@openpet/shared/messages";
import type { OverlayPlacement, PetActionName } from "@openpet/shared/types";

const cellWidth = 96;
const cellHeight = 104;
const atlasColumns = 8;
const atlasRows = 9;
const emptyBackground = "linear-gradient(180deg, rgba(92, 68, 43, 0.08), rgba(92, 68, 43, 0.18))";
const actionAnimations: Record<
  PetActionName,
  { row: number; frames: number[]; durations: number[]; loop: boolean; fallbackAction?: PetActionName }
> = {
  idle: { row: 0, frames: [0, 1, 2, 3, 4, 5], durations: [280, 110, 110, 140, 140, 320], loop: true },
  "running-right": {
    row: 1,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    durations: [90, 90, 90, 90, 90, 90, 90, 120],
    loop: true,
  },
  "running-left": {
    row: 2,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    durations: [90, 90, 90, 90, 90, 90, 90, 120],
    loop: true,
  },
  waving: {
    row: 3,
    frames: [0, 1, 2, 3],
    durations: [140, 140, 140, 280],
    loop: false,
    fallbackAction: "idle",
  },
  jumping: {
    row: 4,
    frames: [0, 1, 2, 3, 4],
    durations: [120, 120, 120, 120, 220],
    loop: false,
    fallbackAction: "idle",
  },
  failed: {
    row: 5,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    loop: true,
  },
  waiting: { row: 6, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 260], loop: true },
  running: { row: 7, frames: [0, 1, 2, 3, 4, 5], durations: [120, 120, 120, 120, 120, 220], loop: true },
  review: { row: 8, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 280], loop: true },
};
const businessStateToAction: Record<StateUpdateMessage["payload"]["state"], PetActionName> = {
  idle: "idle",
  thinking: "review",
  streaming: "running",
  waiting: "waiting",
  error: "failed",
  done: "waving",
};

type OverlayButton = HTMLButtonElement & {
  __openPetDragState?: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  };
};

type Facing = OverlayPlacement["facing"];

let animationToken = 0;
let animationTimer: number | null = null;
let animationKey = "";
let currentFacing: Facing = "right";
let latestMessage: StateUpdateMessage | null = null;
let hoverActive = false;
let dragAction: Extract<PetActionName, "running-left" | "running-right"> | null = null;

const placementDefaults = {
  right: "16px",
  bottom: "16px",
} as const;

const overlayStyles = `
#${overlayRootId} {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: max-content;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  z-index: 2147483647;
  font-family: Inter, "Segoe UI", sans-serif;
  color: #3b2b22;
  pointer-events: none;
}
#${overlayRootId}[data-hidden="true"] { display: none; }
#${overlayRootId} button {
  all: unset;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}
#${overlayRootId} .openpet-sprite {
  width: ${cellWidth}px;
  height: ${cellHeight}px;
  display: block;
  margin: 0;
  image-rendering: auto;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: ${cellWidth * atlasColumns}px ${cellHeight * atlasRows}px;
}
#${overlayRootId} .openpet-state {
  font-size: 12px;
  text-align: center;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(247, 241, 232, 0.88);
  line-height: 1.2;
}
`;

function ensureButton(root: HTMLDivElement): HTMLButtonElement {
  const existing = root.querySelector<HTMLButtonElement>("button.openpet-button");
  if (existing) {
    existing.type = "button";
    return existing;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "openpet-button";
  root.appendChild(button);
  return button;
}

function ensureStyle(root: HTMLDivElement): void {
  let style = root.querySelector("style");
  if (!style) {
    style = document.createElement("style");
    root.prepend(style);
  }

  style.textContent = overlayStyles;
}

function parsePlacement(input: unknown): OverlayPlacement | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<OverlayPlacement>;
  if (
    typeof candidate.left !== "number" ||
    typeof candidate.top !== "number" ||
    (candidate.facing !== "left" && candidate.facing !== "right")
  ) {
    return null;
  }

  return {
    left: candidate.left,
    top: candidate.top,
    facing: candidate.facing,
  };
}

function getStorageArea(): chrome.storage.StorageArea | null {
  return globalThis.chrome?.storage?.local ?? null;
}

function setFacing(root: HTMLElement, facing: Facing): void {
  currentFacing = facing;
  root.dataset.facing = facing;
}

function applyPlacement(root: HTMLDivElement, placement: OverlayPlacement | null): void {
  if (!placement) {
    root.style.left = "";
    root.style.top = "";
    root.style.right = placementDefaults.right;
    root.style.bottom = placementDefaults.bottom;
    setFacing(root, "right");
    return;
  }

  root.style.left = `${placement.left}px`;
  root.style.top = `${placement.top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
  setFacing(root, placement.facing);
}

async function persistPlacement(root: HTMLDivElement): Promise<void> {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return;
  }

  const left = Number.parseFloat(root.style.left);
  const top = Number.parseFloat(root.style.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return;
  }

  await storageArea.set({
    [storageKeys.overlayPlacement]: {
      left,
      top,
      facing: currentFacing,
    } satisfies OverlayPlacement,
  });
}

function bindPlacementSync(root: HTMLDivElement): void {
  if (root.dataset.placementBound === "true") {
    return;
  }

  root.dataset.placementBound = "true";
  const storageArea = getStorageArea();
  if (!storageArea) {
    return;
  }

  void storageArea.get(storageKeys.overlayPlacement).then((result) => {
    applyPlacement(root, parsePlacement(result[storageKeys.overlayPlacement]));
  });

  globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !(storageKeys.overlayPlacement in changes)) {
      return;
    }

    const liveRoot = getOverlayRoot();
    if (!(liveRoot instanceof HTMLDivElement)) {
      return;
    }

    applyPlacement(liveRoot, parsePlacement(changes[storageKeys.overlayPlacement]?.newValue));
  });
}

function bindOverlayInteractions(root: HTMLDivElement, button: OverlayButton): void {
  if (button.dataset.bound === "true") {
    return;
  }

  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    if (button.dataset.suppressClick === "true") {
      button.dataset.suppressClick = "false";
      return;
    }

    const message: FocusTabMessage = { type: messageTypes.focusTab };
    void chrome.runtime.sendMessage(message);
  });

  button.addEventListener("pointerenter", () => {
    hoverActive = true;
    rerenderLatestOverlayState();
  });

  button.addEventListener("pointerleave", () => {
    hoverActive = false;
    if (!button.__openPetDragState) {
      dragAction = null;
    }
    rerenderLatestOverlayState();
  });

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const rect = root.getBoundingClientRect();
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    button.__openPetDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    if (typeof button.setPointerCapture === "function") {
      button.setPointerCapture(event.pointerId);
    }
    hoverActive = false;
  });

  button.addEventListener("pointermove", (event) => {
    const dragState = button.__openPetDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const stepX = event.clientX - dragState.lastX;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    dragState.moved = true;
    root.style.left = `${Math.max(0, dragState.originLeft + deltaX)}px`;
    root.style.top = `${Math.max(0, dragState.originTop + deltaY)}px`;
    const movingLeft = Math.abs(stepX) >= 1 ? stepX < 0 : deltaX < 0;
    setFacing(root, movingLeft ? "left" : "right");
    dragAction = movingLeft ? "running-left" : "running-right";
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    rerenderLatestOverlayState();
  });

  const finishDrag = (event: PointerEvent) => {
    const dragState = button.__openPetDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (
      typeof button.hasPointerCapture === "function" &&
      button.hasPointerCapture(event.pointerId)
    ) {
      button.releasePointerCapture(event.pointerId);
    }

    if (dragState.moved) {
      button.dataset.suppressClick = "true";
      void persistPlacement(root);
    }

    delete button.__openPetDragState;
    dragAction = null;
    rerenderLatestOverlayState();
  };

  button.addEventListener("pointerup", finishDrag);
  button.addEventListener("pointercancel", finishDrag);
}

function ensureModernOverlayStructure(root: HTMLDivElement): HTMLDivElement {
  ensureStyle(root);
  bindPlacementSync(root);
  const button = ensureButton(root) as OverlayButton;

  let sprite = button.querySelector<HTMLDivElement>(".openpet-sprite");
  if (!sprite) {
    button.querySelectorAll("img").forEach((node) => node.remove());
    sprite = document.createElement("div");
    sprite.className = "openpet-sprite";
    sprite.setAttribute("aria-hidden", "true");
    button.prepend(sprite);
  }

  let state = button.querySelector<HTMLDivElement>(".openpet-state");
  if (!state) {
    state = document.createElement("div");
    state.className = "openpet-state";
    state.textContent = "waiting";
    button.append(state);
  }

  bindOverlayInteractions(root, button);

  root.querySelectorAll("img").forEach((node) => node.remove());
  return root;
}

function resolveAction(state: StateUpdateMessage["payload"]["state"]): PetActionName {
  if (dragAction) {
    return dragAction;
  }

  if (hoverActive) {
    return "running";
  }

  return businessStateToAction[state];
}

function rerenderLatestOverlayState(): void {
  if (!latestMessage) {
    return;
  }

  applyOverlayUpdate(latestMessage);
}

function ensureRoot(): HTMLDivElement {
  let root = document.getElementById(overlayRootId) as HTMLDivElement | null;
  if (root) {
    return ensureModernOverlayStructure(root);
  }

  root = document.createElement("div");
  root.id = overlayRootId;
  document.documentElement.appendChild(root);
  return ensureModernOverlayStructure(root);
}

function setSpriteFrame(
  sprite: HTMLElement,
  action: PetActionName,
  frameIndex: number
): void {
  const animation = actionAnimations[action];
  const column = animation.frames[frameIndex] ?? 0;
  sprite.dataset.action = action;
  sprite.dataset.frame = String(column);
  sprite.style.backgroundPosition = `${-column * cellWidth}px ${-animation.row * cellHeight}px`;
}

function clearAnimation(): void {
  animationToken += 1;
  if (animationTimer !== null) {
    window.clearTimeout(animationTimer);
    animationTimer = null;
  }
}

function startSpriteAnimation(sprite: HTMLElement, message: StateUpdateMessage): void {
  if (!message.payload.pet?.spritesheetDataUrl) {
    clearAnimation();
    animationKey = "";
    sprite.style.backgroundImage = emptyBackground;
    sprite.removeAttribute("data-action");
    sprite.removeAttribute("data-frame");
    return;
  }

  const action = resolveAction(message.payload.state);
  const nextAnimationKey = [
    message.payload.pet.id,
    message.payload.pet.importedAt,
    action,
    message.payload.pet.spritesheetDataUrl,
  ].join("|");
  if (animationKey === nextAnimationKey && sprite.dataset.action === action) {
    return;
  }

  clearAnimation();
  animationKey = nextAnimationKey;
  const token = animationToken;
  const animation = actionAnimations[action];
  sprite.style.backgroundImage = `url("${message.payload.pet.spritesheetDataUrl}")`;

  const tick = (frameIndex: number) => {
    if (token !== animationToken) {
      return;
    }

    setSpriteFrame(sprite, action, frameIndex);
    const isLastFrame = frameIndex >= animation.frames.length - 1;
    if (isLastFrame && !animation.loop) {
      const fallbackAction = animation.fallbackAction ?? "idle";
      const fallbackAnimation = actionAnimations[fallbackAction];
      setSpriteFrame(sprite, fallbackAction, 0);
      animationTimer = window.setTimeout(() => {
        if (token !== animationToken) {
          return;
        }

        const nextFrameIndex = (Number(sprite.dataset.frame ?? "0") + 1) % fallbackAnimation.frames.length;
        setSpriteFrame(sprite, fallbackAction, nextFrameIndex);
        tickFallback(nextFrameIndex, fallbackAction, fallbackAnimation, token);
      }, animation.durations[frameIndex] ?? animation.durations[0]);
      return;
    }

    const nextFrameIndex = (frameIndex + 1) % animation.frames.length;
    animationTimer = window.setTimeout(
      () => tick(nextFrameIndex),
      animation.durations[frameIndex] ?? animation.durations[0]
    );
  };

  const tickFallback = (
    frameIndex: number,
    fallbackAction: PetActionName,
    fallbackAnimation: (typeof actionAnimations)[PetActionName],
    tokenValue: number
  ) => {
    if (tokenValue !== animationToken) {
      return;
    }

    setSpriteFrame(sprite, fallbackAction, frameIndex);
    const nextFrameIndex = (frameIndex + 1) % fallbackAnimation.frames.length;
    animationTimer = window.setTimeout(
      () => tickFallback(nextFrameIndex, fallbackAction, fallbackAnimation, tokenValue),
      fallbackAnimation.durations[frameIndex] ?? fallbackAnimation.durations[0]
    );
  };

  tick(0);
}

export function applyOverlayUpdate(message: StateUpdateMessage): void {
  latestMessage = message;
  const root = ensureRoot();
  root.dataset.hidden = message.payload.visible ? "false" : "true";

  const sprite = root.querySelector<HTMLElement>(".openpet-sprite");
  const label = root.querySelector(".openpet-state");

  if (sprite) {
    startSpriteAnimation(sprite, message);
  }
  if (label) {
    label.textContent = message.payload.state;
  }
}

export function getOverlayRoot(): HTMLElement | null {
  return document.getElementById(overlayRootId);
}
