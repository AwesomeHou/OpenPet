import {
  defaultAnimationSpeed,
  defaultPetSize,
  maxAnimationSpeed,
  maxPetSize,
  minAnimationSpeed,
  minPetSize,
  overlayRootId,
  storageKeys,
} from "@openpet/shared/constants";
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
  streaming: "running",
  waiting: "waiting",
  error: "failed",
  done: "waving",
};

type OverlayButton = HTMLButtonElement & {
  __openPetState?: ScenePetState;
  __openPetHovering?: boolean;
  __openPetDragAction?: PetActionName | null;
  __openPetResizing?: boolean;
  __openPetDragState?: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  };
};

type ResizeHandle = HTMLDivElement & {
  __openPetResizeState?: {
    pointerId: number;
    originSize: number;
    startX: number;
    startY: number;
  };
};

let latestMessage: SceneUpdateMessage | null = null;
let latestAnimationSpeed = defaultAnimationSpeed;
const animationTimerMap = new WeakMap<HTMLElement, number>();
const animationTokenMap = new WeakMap<HTMLElement, number>();
const optimisticPlacementMap = new Map<ScenePetState["petId"], OverlayPlacement>();
const optimisticSizeMap = new Map<ScenePetState["petId"], number>();

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
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}
#${overlayRootId} .openpet-sprite {
  width: ${defaultPetSize}px;
  height: ${(defaultPetSize * cellHeight) / cellWidth}px;
  display: block;
  margin: 0;
  image-rendering: auto;
  background-repeat: no-repeat;
  background-position: 0 0;
  background-size: ${defaultPetSize * atlasColumns}px ${(defaultPetSize * atlasRows * cellHeight) / cellWidth}px;
}
#${overlayRootId} .openpet-state {
  font-size: 12px;
  text-align: center;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(247, 241, 232, 0.88);
  line-height: 1.2;
}
#${overlayRootId} .openpet-resize-handle {
  position: absolute;
  right: -6px;
  bottom: 20px;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  border-radius: 999px;
  background: rgba(255, 253, 249, 0.96);
  border: 1px solid rgba(109, 78, 53, 0.28);
  box-shadow: 0 4px 10px rgba(84, 60, 41, 0.16);
  opacity: 0;
  pointer-events: none;
}
#${overlayRootId} .openpet-resize-handle::before {
  content: "";
  position: absolute;
  inset: 4px;
  border-right: 2px solid rgba(109, 78, 53, 0.7);
  border-bottom: 2px solid rgba(109, 78, 53, 0.7);
}
#${overlayRootId} button[data-handle-visible="true"] .openpet-resize-handle {
  opacity: 1;
  pointer-events: auto;
}
#${overlayRootId} .openpet-context-menu {
  position: absolute;
  min-width: 108px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 253, 249, 0.98);
  border: 1px solid rgba(109, 78, 53, 0.16);
  box-shadow: 0 12px 24px rgba(84, 60, 41, 0.18);
  pointer-events: auto;
}
#${overlayRootId} .openpet-context-menu button {
  all: unset;
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 12px;
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
    if (
      areaName !== "local" ||
      (!(storageKeys.overlayPlacements in changes) && !(storageKeys.petSizes in changes))
    ) {
      return;
    }
    if (latestMessage) {
      applyOverlayUpdate(latestMessage);
    }
  });
}

function setSpriteFrame(
  sprite: HTMLElement,
  action: PetActionName,
  frameIndex: number,
  petSize: number
): void {
  const animation = actionAnimations[action];
  const column = animation.frames[frameIndex] ?? 0;
  const scaledCellHeight = petSize * (cellHeight / cellWidth);
  sprite.dataset.action = action;
  sprite.dataset.frame = String(column);
  sprite.style.backgroundPosition = `${-column * petSize}px ${-animation.row * scaledCellHeight}px`;
}

function syncSpriteDimensions(sprite: HTMLElement, petSize: number): void {
  const petHeight = (petSize * cellHeight) / cellWidth;
  sprite.style.width = `${petSize}px`;
  sprite.style.height = `${petHeight}px`;
  sprite.style.backgroundSize = `${petSize * atlasColumns}px ${petHeight * atlasRows}px`;
}

function syncCurrentSpriteFrame(sprite: HTMLElement, petSize: number): void {
  const action = sprite.dataset.action as PetActionName | undefined;
  const frameColumn = Number.parseInt(sprite.dataset.frame ?? "", 10);
  if (!action || Number.isNaN(frameColumn)) {
    return;
  }

  const animation = actionAnimations[action];
  const frameIndex = animation.frames.indexOf(frameColumn);
  const resolvedFrameIndex = frameIndex >= 0 ? frameIndex : 0;
  setSpriteFrame(sprite, action, resolvedFrameIndex, petSize);
}

function shouldRepeatTransientAction(sprite: HTMLElement, action: PetActionName): boolean {
  if (action !== "jumping") {
    return false;
  }

  const button = sprite.closest("button") as OverlayButton | null;
  return button?.__openPetHovering === true;
}

function clearSpriteAnimation(sprite: HTMLElement): void {
  const existing = animationTimerMap.get(sprite);
  if (existing !== undefined) {
    window.clearTimeout(existing);
    animationTimerMap.delete(sprite);
  }
}

function resolveAnimationSpeed(speed: number | undefined): number {
  if (!Number.isFinite(speed)) {
    return defaultAnimationSpeed;
  }
  return Math.max(minAnimationSpeed, Math.min(maxAnimationSpeed, speed));
}

function startSpriteAnimation(
  sprite: HTMLElement,
  petState: ScenePetState,
  action: PetActionName,
  petSize: number
): void {
  if (!petState.pet.spritesheetDataUrl) {
    clearSpriteAnimation(sprite);
    sprite.style.backgroundImage = emptyBackground;
    sprite.removeAttribute("data-action");
    sprite.removeAttribute("data-frame");
    delete sprite.dataset.sourceUrl;
    return;
  }

  if (
    sprite.dataset.action === action &&
    sprite.dataset.sourceUrl === petState.pet.spritesheetDataUrl &&
    animationTimerMap.has(sprite)
  ) {
    return;
  }

  clearSpriteAnimation(sprite);
  sprite.style.backgroundImage = `url("${petState.pet.spritesheetDataUrl}")`;
  sprite.dataset.sourceUrl = petState.pet.spritesheetDataUrl;
  const token = (animationTokenMap.get(sprite) ?? 0) + 1;
  animationTokenMap.set(sprite, token);

  const tick = (frameIndex: number, currentAction: PetActionName) => {
    if (token !== animationTokenMap.get(sprite)) {
      return;
    }

    const currentAnimation = actionAnimations[currentAction];
    setSpriteFrame(sprite, currentAction, frameIndex, petSize);
    const isLastFrame = frameIndex >= currentAnimation.frames.length - 1;

    if (isLastFrame && !currentAnimation.loop) {
      const fallbackAction = shouldRepeatTransientAction(sprite, currentAction)
        ? currentAction
        : (currentAnimation.fallbackAction ?? "idle");
      const timer = window.setTimeout(
        () => tick(0, fallbackAction),
        Math.round((currentAnimation.durations[frameIndex] ?? 180) / resolveAnimationSpeed(latestAnimationSpeed))
      );
      animationTimerMap.set(sprite, timer);
      return;
    }

    const nextFrameIndex = (frameIndex + 1) % currentAnimation.frames.length;
    const timer = window.setTimeout(
      () => tick(nextFrameIndex, currentAction),
      Math.round(
        (currentAnimation.durations[frameIndex] ?? currentAnimation.durations[0]) /
          resolveAnimationSpeed(latestAnimationSpeed)
      )
    );
    animationTimerMap.set(sprite, timer);
  };

  tick(0, action);
}

function resolvePlacement(petState: ScenePetState): OverlayPlacement {
  const optimisticPlacement = optimisticPlacementMap.get(petState.petId);
  if (
    optimisticPlacement &&
    optimisticPlacement.left === petState.placement.left &&
    optimisticPlacement.top === petState.placement.top &&
    optimisticPlacement.facing === petState.placement.facing
  ) {
    optimisticPlacementMap.delete(petState.petId);
    return petState.placement;
  }

  return optimisticPlacement ?? petState.placement;
}

function resolveDisplayedAction(button: OverlayButton, petState: ScenePetState): PetActionName {
  if (button.__openPetDragAction) {
    return button.__openPetDragAction;
  }
  if (button.__openPetHovering) {
    return "jumping";
  }
  return businessStateToAction[petState.state];
}

function refreshPetPresentation(button: OverlayButton, petState: ScenePetState): void {
  button.__openPetState = petState;
  const placement = resolvePlacement(petState);
  const petSize = resolvePetSize(petState);
  button.style.left = `${placement.left}px`;
  button.style.top = `${placement.top}px`;
  petState.size = petSize;

  const sprite = button.querySelector<HTMLElement>(".openpet-sprite");
  const label = button.querySelector<HTMLElement>(".openpet-state");
  if (sprite) {
    syncSpriteDimensions(sprite, petSize);
    startSpriteAnimation(sprite, petState, resolveDisplayedAction(button, petState), petSize);
  }
  if (label) {
    label.textContent = petState.state;
  }
}

async function persistSize(siteId: ScenePetState["siteId"], size: number): Promise<void> {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return;
  }

  const result = await storageArea.get(storageKeys.petSizes);
  const sizes =
    result[storageKeys.petSizes] && typeof result[storageKeys.petSizes] === "object"
      ? (result[storageKeys.petSizes] as Record<string, number>)
      : {};

  await storageArea.set({
    [storageKeys.petSizes]: {
      ...sizes,
      [siteId]: size,
    },
  });
}

function clampSize(size: number): number {
  return Math.max(minPetSize, Math.min(maxPetSize, size));
}

function resolvePetSize(petState: ScenePetState): number {
  const optimisticSize = optimisticSizeMap.get(petState.petId);
  const nextSize = clampSize(
    typeof petState.size === "number" && Number.isFinite(petState.size) ? petState.size : defaultPetSize
  );
  if (optimisticSize !== undefined && optimisticSize === nextSize) {
    optimisticSizeMap.delete(petState.petId);
    return nextSize;
  }
  return optimisticSize ?? nextSize;
}

function hideContextMenu(root: HTMLElement): void {
  root.querySelector(".openpet-context-menu")?.remove();
}

function showContextMenu(button: OverlayButton, event: MouseEvent, petState: ScenePetState): void {
  const root = ensureRoot();
  hideContextMenu(root);
  const menu = document.createElement("div");
  menu.className = "openpet-context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.innerHTML = `<button type="button" data-menu-action="close-pet">关闭宠物</button>`;
  root.append(menu);
  menu.querySelector<HTMLButtonElement>("[data-menu-action='close-pet']")?.addEventListener("click", () => {
    void chrome.runtime.sendMessage({
      type: messageTypes.setSitePetVisibility,
      payload: { siteId: petState.siteId, visible: false },
    });
    hideContextMenu(root);
  });
  window.setTimeout(() => {
    const dismiss = () => {
      hideContextMenu(root);
      document.removeEventListener("pointerdown", dismiss, true);
    };
    document.addEventListener("pointerdown", dismiss, true);
  }, 0);
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
    if (button.__openPetResizing) {
      return;
    }
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
      lastX: event.clientX,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    button.style.cursor = "grabbing";
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
    const moveDeltaX = event.clientX - dragState.lastX;
    const nextPlacement: OverlayPlacement = {
      left: Math.max(0, dragState.originLeft + deltaX),
      top: Math.max(0, dragState.originTop + deltaY),
      facing: petState.placement.facing,
    };
    optimisticPlacementMap.set(petState.petId, nextPlacement);
    if (moveDeltaX !== 0) {
      button.__openPetDragAction = moveDeltaX > 0 ? "running-right" : "running-left";
    }
    dragState.lastX = event.clientX;
    button.style.left = `${nextPlacement.left}px`;
    button.style.top = `${nextPlacement.top}px`;
    refreshPetPresentation(button, petState);
  };

  const finishDrag = (event: PointerEvent) => {
    const dragState = button.__openPetDragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    delete button.__openPetDragState;
    if (dragState.moved) {
      button.dataset.suppressClick = "true";
      button.__openPetDragAction = null;
      button.style.cursor = "default";
      refreshPetPresentation(button, petState);
      const placement = optimisticPlacementMap.get(petState.petId) ?? petState.placement;
      void persistPlacement(petState.siteId, {
        left: placement.left,
        top: placement.top,
        facing: placement.facing,
      });
      return;
    }

    button.__openPetDragAction = null;
    button.style.cursor = "default";
    refreshPetPresentation(button, petState);
  };

  button.onpointerup = finishDrag;
  button.onpointercancel = finishDrag;
  button.onpointerenter = () => {
    button.__openPetHovering = true;
    button.dataset.handleVisible = "true";
    const resizeHandle = button.querySelector<HTMLElement>(".openpet-resize-handle");
    if (resizeHandle) {
      resizeHandle.dataset.visible = "true";
    }
    refreshPetPresentation(button, petState);
  };
  button.onpointerleave = () => {
    button.__openPetHovering = false;
    button.__openPetDragAction = null;
    if (!button.__openPetResizing) {
      button.dataset.handleVisible = "false";
      const resizeHandle = button.querySelector<HTMLElement>(".openpet-resize-handle");
      if (resizeHandle) {
        resizeHandle.dataset.visible = "false";
      }
    }
    refreshPetPresentation(button, petState);
  };
  button.oncontextmenu = (event) => {
    event.preventDefault();
    showContextMenu(button, event, petState);
  };

  const handle = button.querySelector<ResizeHandle>(".openpet-resize-handle");
  if (!handle) {
    return;
  }

  handle.dataset.visible = button.dataset.handleVisible === "true" ? "true" : "false";
  handle.onpointerdown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    button.__openPetResizing = true;
    button.dataset.handleVisible = "true";
    handle.dataset.visible = "true";
    handle.__openPetResizeState = {
      pointerId: event.pointerId,
      originSize: resolvePetSize(petState),
      startX: event.clientX,
      startY: event.clientY,
    };
    handle.setPointerCapture?.(event.pointerId);
  };
  handle.onpointermove = (event) => {
    const resizeState = handle.__openPetResizeState;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }
    const delta = Math.max(event.clientX - resizeState.startX, event.clientY - resizeState.startY);
    const nextSize = clampSize(resizeState.originSize + delta);
    petState.size = nextSize;
    const sprite = button.querySelector<HTMLElement>(".openpet-sprite");
    if (sprite) {
      syncSpriteDimensions(sprite, nextSize);
      syncCurrentSpriteFrame(sprite, nextSize);
    }
  };
  const finishResize = (event: PointerEvent) => {
    const resizeState = handle.__openPetResizeState;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }
    delete handle.__openPetResizeState;
    button.__openPetResizing = false;
    petState.size = clampSize(
      Number.parseFloat(button.querySelector<HTMLElement>(".openpet-sprite")?.style.width ?? "") ||
        resolvePetSize(petState)
    );
    optimisticSizeMap.set(petState.petId, petState.size);
    handle.dataset.visible = button.dataset.handleVisible === "true" ? "true" : "false";
    void persistSize(petState.siteId, petState.size);
  };
  handle.onpointerup = finishResize;
  handle.onpointercancel = finishResize;
}

function renderPet(scene: HTMLElement, petState: ScenePetState): void {
  if (optimisticSizeMap.has(petState.petId)) {
    petState.size = optimisticSizeMap.get(petState.petId)!;
  }
  let button = scene.querySelector<HTMLButtonElement>(
    `button[data-pet-id="${petState.petId}"]`
  ) as OverlayButton | null;
  if (!button) {
    button = document.createElement("button") as OverlayButton;
    button.type = "button";
    button.className = "openpet-button";
    button.dataset.petId = petState.petId;
    button.dataset.handleVisible = "false";
    button.innerHTML =
      `<div class="openpet-sprite" aria-hidden="true"></div>` +
      `<div class="openpet-state"></div>` +
      `<div class="openpet-resize-handle" data-resize-handle="true" data-visible="false"></div>`;
    scene.append(button);
  }

  button.dataset.siteId = petState.siteId;
  bindPetInteractions(button, petState);
  refreshPetPresentation(button, petState);
}

export function applyOverlayUpdate(message: SceneUpdateMessage): void {
  latestMessage = message;
  latestAnimationSpeed = resolveAnimationSpeed(message.payload.animationSpeed);
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
