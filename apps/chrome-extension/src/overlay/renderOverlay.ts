import { overlayRootId, storageKeys } from "@openpet/shared/constants";
import {
  messageTypes,
  type FocusTabMessage,
  type SceneUpdateMessage,
} from "@openpet/shared/messages";
import type { OverlayPlacement, PetActionName, ScenePetState } from "@openpet/shared/types";

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
  "running-right": { row: 1, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [90, 90, 90, 90, 90, 90, 90, 120], loop: true },
  "running-left": { row: 2, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [90, 90, 90, 90, 90, 90, 90, 120], loop: true },
  waving: { row: 3, frames: [0, 1, 2, 3], durations: [140, 140, 140, 280], loop: false, fallbackAction: "idle" },
  jumping: { row: 4, frames: [0, 1, 2, 3, 4], durations: [120, 120, 120, 120, 220], loop: false, fallbackAction: "idle" },
  failed: { row: 5, frames: [0, 1, 2, 3, 4, 5, 6, 7], durations: [140, 140, 140, 140, 140, 140, 140, 240], loop: true },
  waiting: { row: 6, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 260], loop: true },
  running: { row: 7, frames: [0, 1, 2, 3, 4, 5], durations: [120, 120, 120, 120, 120, 220], loop: true },
  review: { row: 8, frames: [0, 1, 2, 3, 4, 5], durations: [150, 150, 150, 150, 150, 280], loop: true },
};

const businessStateToAction: Record<ScenePetState["state"], PetActionName> = {
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
    originLeft: number;
    originTop: number;
    moved: boolean;
  };
};

let latestMessage: SceneUpdateMessage | null = null;
const animationTimerMap = new WeakMap<HTMLElement, number>();
const animationTokenMap = new WeakMap<HTMLElement, number>();

const overlayStyles = `
#${overlayRootId} {
  position: fixed;
  inset: 0;
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
#${overlayRootId} .openpet-scene {
  position: relative;
  width: 100%;
  height: 100%;
}
#${overlayRootId} button {
  all: unset;
  position: absolute;
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

function getStorageArea(): chrome.storage.StorageArea | null {
  return globalThis.chrome?.storage?.local ?? null;
}

function ensureRoot(): HTMLDivElement {
  let root = document.getElementById(overlayRootId) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = overlayRootId;
    document.documentElement.appendChild(root);
  }

  let style = root.querySelector("style");
  if (!style) {
    style = document.createElement("style");
    root.prepend(style);
  }
  style.textContent = overlayStyles;

  if (!root.querySelector(".openpet-scene")) {
    const scene = document.createElement("div");
    scene.className = "openpet-scene";
    root.append(scene);
  }

  bindPlacementSync(root);
  return root;
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

  globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !(storageKeys.overlayPlacements in changes)) {
      return;
    }
    if (latestMessage) {
      applyOverlayUpdate(latestMessage);
    }
  });
}

function setSpriteFrame(sprite: HTMLElement, action: PetActionName, frameIndex: number): void {
  const animation = actionAnimations[action];
  const column = animation.frames[frameIndex] ?? 0;
  sprite.dataset.action = action;
  sprite.dataset.frame = String(column);
  sprite.style.backgroundPosition = `${-column * cellWidth}px ${-animation.row * cellHeight}px`;
}

function clearSpriteAnimation(sprite: HTMLElement): void {
  const existing = animationTimerMap.get(sprite);
  if (existing !== undefined) {
    window.clearTimeout(existing);
    animationTimerMap.delete(sprite);
  }
}

function startSpriteAnimation(sprite: HTMLElement, petState: ScenePetState): void {
  const action = businessStateToAction[petState.state];
  if (!petState.pet.spritesheetDataUrl) {
    clearSpriteAnimation(sprite);
    sprite.style.backgroundImage = emptyBackground;
    sprite.removeAttribute("data-action");
    sprite.removeAttribute("data-frame");
    return;
  }

  clearSpriteAnimation(sprite);
  sprite.style.backgroundImage = `url("${petState.pet.spritesheetDataUrl}")`;
  const token = (animationTokenMap.get(sprite) ?? 0) + 1;
  animationTokenMap.set(sprite, token);

  const tick = (frameIndex: number, currentAction: PetActionName) => {
    if (token !== animationTokenMap.get(sprite)) {
      return;
    }

    const currentAnimation = actionAnimations[currentAction];
    setSpriteFrame(sprite, currentAction, frameIndex);
    const isLastFrame = frameIndex >= currentAnimation.frames.length - 1;

    if (isLastFrame && !currentAnimation.loop) {
      const fallbackAction = currentAnimation.fallbackAction ?? "idle";
      const timer = window.setTimeout(
        () => tick(0, fallbackAction),
        currentAnimation.durations[frameIndex] ?? 180
      );
      animationTimerMap.set(sprite, timer);
      return;
    }

    const nextFrameIndex = (frameIndex + 1) % currentAnimation.frames.length;
    const timer = window.setTimeout(
      () => tick(nextFrameIndex, currentAction),
      currentAnimation.durations[frameIndex] ?? currentAnimation.durations[0]
    );
    animationTimerMap.set(sprite, timer);
  };

  tick(0, action);
}

async function persistPlacement(siteId: ScenePetState["siteId"], placement: OverlayPlacement): Promise<void> {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return;
  }

  const result = await storageArea.get(storageKeys.overlayPlacements);
  const placements =
    result[storageKeys.overlayPlacements] && typeof result[storageKeys.overlayPlacements] === "object"
      ? (result[storageKeys.overlayPlacements] as Record<string, OverlayPlacement>)
      : {};

  await storageArea.set({
    [storageKeys.overlayPlacements]: {
      ...placements,
      [siteId]: placement,
    },
  });
}

function bindPetInteractions(button: OverlayButton, petState: ScenePetState): void {
  button.onclick = () => {
    if (button.dataset.suppressClick === "true") {
      button.dataset.suppressClick = "false";
      return;
    }

    const message: FocusTabMessage = {
      type: messageTypes.focusTab,
      payload: { tabId: petState.tabId },
    };
    void chrome.runtime.sendMessage(message);
  };

  button.onpointerdown = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const rect = button.getBoundingClientRect();
    button.style.left = `${rect.left}px`;
    button.style.top = `${rect.top}px`;
    button.__openPetDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    button.setPointerCapture?.(event.pointerId);
  };

  button.onpointermove = (event) => {
    const dragState = button.__openPetDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 6) {
      return;
    }

    dragState.moved = true;
    button.style.left = `${Math.max(0, dragState.originLeft + deltaX)}px`;
    button.style.top = `${Math.max(0, dragState.originTop + deltaY)}px`;
  };

  const finishDrag = (event: PointerEvent) => {
    const dragState = button.__openPetDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    delete button.__openPetDragState;
    if (dragState.moved) {
      button.dataset.suppressClick = "true";
      void persistPlacement(petState.siteId, {
        left: Number.parseFloat(button.style.left) || petState.placement.left,
        top: Number.parseFloat(button.style.top) || petState.placement.top,
        facing: petState.placement.facing,
      });
    }
  };

  button.onpointerup = finishDrag;
  button.onpointercancel = finishDrag;
}

function renderPet(scene: HTMLElement, petState: ScenePetState): void {
  let button = scene.querySelector<HTMLButtonElement>(
    `button[data-pet-id="${petState.petId}"]`
  ) as OverlayButton | null;
  if (!button) {
    button = document.createElement("button") as OverlayButton;
    button.type = "button";
    button.className = "openpet-button";
    button.dataset.petId = petState.petId;
    button.innerHTML = `<div class="openpet-sprite" aria-hidden="true"></div><div class="openpet-state"></div>`;
    scene.append(button);
  }

  button.dataset.siteId = petState.siteId;
  button.style.left = `${petState.placement.left}px`;
  button.style.top = `${petState.placement.top}px`;

  const sprite = button.querySelector<HTMLElement>(".openpet-sprite");
  const label = button.querySelector<HTMLElement>(".openpet-state");
  if (sprite) {
    startSpriteAnimation(sprite, petState);
  }
  if (label) {
    label.textContent = petState.state;
  }
  bindPetInteractions(button, petState);
}

export function applyOverlayUpdate(message: SceneUpdateMessage): void {
  latestMessage = message;
  const root = ensureRoot();
  root.dataset.hidden = message.payload.scene.visible ? "false" : "true";
  const scene = root.querySelector(".openpet-scene") as HTMLElement;
  const activeIds = new Set(message.payload.scene.pets.map((pet) => pet.petId));

  scene.querySelectorAll<HTMLButtonElement>("button.openpet-button").forEach((button) => {
    if (!activeIds.has(button.dataset.petId ?? "")) {
      button.remove();
    }
  });

  message.payload.scene.pets.forEach((petState) => renderPet(scene, petState));
}

export function getOverlayRoot(): HTMLElement | null {
  return document.getElementById(overlayRootId);
}
