import {
  animationSpeedFineStep,
  animationSpeedSliderStep,
  defaultAnimationSpeed,
  managePetsPageSize,
  maxAnimationSpeed,
  minAnimationSpeed,
  storageKeys,
} from "@openpet/shared/constants";
import JSZip from "jszip";
import { messageTypes, type OpenPetMessage } from "@openpet/shared/messages";
import type { SiteId } from "@openpet/shared/types";

type PopupLocale = "zh" | "en";
type PopupSnapshot = {
  pets: Array<{
    id: string;
    displayName: string;
    boundSites: SiteId[];
    spritesheetPath?: string;
    spritesheetDataUrl?: string;
  }>;
  sitePetBindings: Partial<Record<SiteId, string>>;
  sitePetVisibility: Partial<Record<SiteId, boolean>>;
  overlayVisible: boolean;
  animationSpeed: number;
};

type PopupPage = "home" | "manage";

type PopupViewState = {
  locale: PopupLocale;
  feedbackMessage: string;
  dragActive: boolean;
  page: PopupPage;
  currentAnimationSpeed: number;
  managePageIndex: number;
  manageDeleteMode: boolean;
  manageToastMessage: string;
  manageContextMenu:
    | {
        petId: string;
        x: number;
        y: number;
      }
    | null;
  selectedPetIds: Set<string>;
};

const popupViewState: PopupViewState = {
  locale: "en",
  feedbackMessage: "",
  dragActive: false,
  page: "home",
  currentAnimationSpeed: defaultAnimationSpeed,
  managePageIndex: 0,
  manageDeleteMode: false,
  manageToastMessage: "",
  manageContextMenu: null,
  selectedPetIds: new Set(),
};

let manageToastTimer: number | null = null;

const supportedSites: SiteId[] = ["deepseek", "gemini", "chatgpt", "doubao"];

const popupStyles = `
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    background: transparent;
    scrollbar-width: thin;
    scrollbar-color: rgba(141, 97, 63, 0.72) rgba(255, 248, 239, 0.92);
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 10px;
  }
  html::-webkit-scrollbar-track,
  body::-webkit-scrollbar-track {
    background: rgba(255, 248, 239, 0.92);
    border-radius: 999px;
  }
  html::-webkit-scrollbar-thumb,
  body::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(154, 107, 71, 0.92), rgba(130, 88, 56, 0.96));
    border-radius: 999px;
    border: 2px solid rgba(255, 248, 239, 0.92);
  }
  html::-webkit-scrollbar-thumb:hover,
  body::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(166, 117, 78, 0.98), rgba(137, 92, 59, 1));
  }
  .popup-shell {
    width: 352px;
    box-sizing: border-box;
    padding: 18px;
    position: relative;
    display: grid;
    gap: 14px;
    background: linear-gradient(180deg, #f8f1e7 0%, #f3eadf 100%);
    color: #2f241b;
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .popup-header,
  .toggle-row,
  .pet-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .popup-title {
    font-size: 18px;
    font-weight: 700;
  }
  .locale-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(82, 57, 36, 0.08);
  }
  .locale-toggle button,
  .secondary-button,
  .primary-button,
  .icon-button,
  .page-button,
  .future-button {
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  .locale-toggle button {
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    background: transparent;
    color: #6b5441;
  }
  .locale-toggle button[data-active="true"] {
    background: #ffffff;
    color: #2f241b;
  }
  .popup-card {
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.74);
    box-shadow: 0 12px 30px rgba(84, 60, 41, 0.08);
  }
  .popup-card {
    display: grid;
    gap: 12px;
    padding: 14px;
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    color: #6a4f39;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .field-grid,
  .future-grid,
  .pet-grid,
  .speed-controls {
    display: grid;
    gap: 10px;
  }
  .field-label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: #4f3a2b;
  }
  .field-label span,
  .toggle-row span {
    font-weight: 600;
  }
  .field-label select,
  .field-label input[type="number"],
  .secondary-button,
  .primary-button,
  .future-button,
  .page-button {
    width: 100%;
    box-sizing: border-box;
    font-size: 13px;
    border-radius: 12px;
    border: 1px solid rgba(109, 78, 53, 0.16);
    background: #fffdf9;
    color: #2f241b;
    padding: 10px 12px;
  }
  .toggle-row input,
  .pet-card-check {
    width: 18px;
    height: 18px;
    accent-color: #8d613f;
  }
  .upload-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .upload-dropzone {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    cursor: pointer;
    border-radius: 12px;
    border: 1.5px dashed rgba(141, 97, 63, 0.35);
    background: rgba(255, 253, 249, 0.92);
  }
  .upload-dropzone[data-drag-active="true"] {
    border-color: rgba(141, 97, 63, 0.72);
    background: #fff8ef;
  }
  .upload-primary {
    font-weight: 600;
  }
  .upload-secondary,
  .helper-text,
  .pet-card-site {
    font-size: 12px;
    color: #7d6551;
  }
  .inline-feedback {
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.45;
    color: #6a4f39;
    background: rgba(255, 248, 239, 0.92);
    border: 1px solid rgba(141, 97, 63, 0.16);
  }
  .speed-inline {
    display: grid;
    gap: 8px;
  }
  .speed-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .speed-value-group {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .speed-value {
    font-size: 12px;
    color: #6a4f39;
    font-variant-numeric: tabular-nums;
  }
  .speed-nudge-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .speed-nudge-button {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(109, 78, 53, 0.16);
    background: #fffdf9;
    color: #6a4f39;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }
  .speed-range {
    width: 100%;
    margin: 0;
    accent-color: #8d613f;
  }
  .pet-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .pet-card {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    background: rgba(255, 251, 246, 0.96);
    border: 1px solid rgba(141, 97, 63, 0.16);
    align-content: start;
    min-height: 0;
    overflow: hidden;
  }
  .pet-card-preview {
    display: grid;
    place-items: center;
    min-height: 88px;
    padding: 4px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(250, 243, 235, 0.98), rgba(245, 235, 224, 0.92));
    overflow: hidden;
  }
  .pet-card-preview-sprite {
    width: 60px;
    height: 65px;
    background-repeat: no-repeat;
    background-position: 0 0;
    background-size: 480px 585px;
    image-rendering: auto;
    filter: drop-shadow(0 6px 12px rgba(84, 60, 41, 0.12));
    flex-shrink: 0;
  }
  .pet-card-preview-empty {
    font-size: 11px;
    color: #8d7158;
  }
  .pet-card-name {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
  }
  .pet-card-sites {
    display: grid;
    gap: 4px;
  }
  .pet-card-sites-title {
    font-size: 11px;
    font-weight: 700;
    color: #6a4f39;
    letter-spacing: 0.03em;
  }
  .pet-card-site {
    line-height: 1.35;
    word-break: break-word;
  }
  .page-button:disabled,
  .secondary-button:disabled,
  .primary-button:disabled,
  .future-button:disabled,
  .field-label select:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
  .icon-button {
    border-radius: 999px;
    width: 32px;
    height: 32px;
    background: #fffdf9;
    color: #6a4f39;
  }
  .manage-header {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    align-items: center;
    gap: 12px;
  }
  .manage-back-button {
    justify-self: start;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
  }
  .manage-header-title {
    margin: 0;
    text-align: center;
    font-size: 18px;
    font-weight: 800;
    color: #6a4f39;
    letter-spacing: 0.01em;
  }
  .manage-pager {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .manage-page-indicator {
    min-width: 54px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #4f3a2b;
    font-variant-numeric: tabular-nums;
  }
  .manage-actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }
  .manage-header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }
  .manage-close-button {
    width: 40px;
    height: 40px;
    padding: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 18px;
    line-height: 1;
  }
  .manage-selection-count {
    font-size: 13px;
    color: #4f3a2b;
    font-variant-numeric: tabular-nums;
  }
  .manage-batch-actions {
    display: grid;
    grid-template-columns: 40px repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: center;
  }
  .manage-context-menu {
    position: absolute;
    z-index: 10;
    min-width: 116px;
    padding: 6px;
    border-radius: 14px;
    background: rgba(255, 253, 249, 0.98);
    border: 1px solid rgba(109, 78, 53, 0.14);
    box-shadow: 0 12px 24px rgba(84, 60, 41, 0.14);
  }
  .manage-context-menu button {
    width: 100%;
    border: 0;
    background: transparent;
    color: #4f3a2b;
    text-align: left;
    padding: 9px 10px;
    border-radius: 10px;
    font: inherit;
    cursor: pointer;
  }
  .manage-context-menu button:hover {
    background: rgba(141, 97, 63, 0.08);
  }
  .manage-toast {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 14px;
    z-index: 12;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(79, 58, 43, 0.96);
    color: #fff8ef;
    font-size: 12px;
    line-height: 1.45;
    box-shadow: 0 12px 30px rgba(47, 36, 27, 0.24);
    pointer-events: none;
  }
`;

const localeCopy = {
  en: {
    title: "OpenPet",
    homeTitle: "Site bindings",
    dataTitle: "Pet data",
    managePetsTitle: "Manage Pets",
    animationTitle: "Animation speed",
    overlayVisible: "Overlay visible",
    petStore: "Pet Store",
    companionNote: "For a persistent desktop experience, a companion app will be available later.",
    importZip: "Import pet zip",
    importDropHint: "Click or drop .zip files here",
    importPreviewUnavailable: "Preview unavailable",
    clearPetData: "Clear pet data",
    deepseekPet: "DeepSeek pet",
    geminiPet: "Gemini pet",
    chatgptPet: "ChatGPT pet",
    doubaoPet: "Doubao pet",
    showPet: "Show pet",
    noPet: "None",
    noImportedPets: "No imported pets",
    importedSummary: "Imported {imported} · Overwritten {overwritten} · Failed {failed}",
    importedFailure: "Import failed: {error}",
    boundFeedback: "Bound {site} to {pet}",
    unboundFeedback: "Cleared {site} binding",
    visibilityFeedback: "{site} display {state}",
    deletedFeedback: "Deleted {count} pets",
    clearPetDataFeedback: "Cleared pet data",
    exportedFeedback: "Exported {pet}",
    batchExportedFeedback: "Exported {count} pets",
    back: "Back",
    unbound: "Unbound",
    multiSelect: "Multi-select",
    exportPet: "Export",
    deletePet: "Delete",
    close: "Close",
    batchDelete: "Batch delete",
    batchExport: "Batch export",
    cancel: "Cancel",
    selectedCount: "Selected {count}",
    deleteSelected: "Delete selected",
    previousPage: "Previous",
    nextPage: "Next",
    displayOn: "on",
    displayOff: "off",
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
      chatgpt: "ChatGPT",
      doubao: "Doubao",
    },
  },
  zh: {
    title: "OpenPet",
    homeTitle: "站点绑定",
    dataTitle: "宠物数据",
    managePetsTitle: "管理宠物",
    animationTitle: "动画速度",
    overlayVisible: "显示宠物浮层",
    petStore: "宠物商店",
    companionNote: "需要桌面常驻体验时，未来可搭配 companion app 使用。",
    importZip: "导入宠物 zip",
    importDropHint: "点击选择或将多个 .zip 文件拖到这里",
    importPreviewUnavailable: "暂无预览",
    clearPetData: "清空宠物数据",
    deepseekPet: "DeepSeek 宠物",
    geminiPet: "Gemini 宠物",
    chatgptPet: "ChatGPT 宠物",
    doubaoPet: "豆包宠物",
    showPet: "显示宠物",
    noPet: "无",
    noImportedPets: "暂无已导入宠物",
    importedSummary: "成功导入 {imported} · 已覆盖 {overwritten} · 失败 {failed}",
    importedFailure: "导入失败：{error}",
    boundFeedback: "已将 {site} 绑定到 {pet}",
    unboundFeedback: "已清除 {site} 绑定",
    visibilityFeedback: "{site} 显示已{state}",
    deletedFeedback: "已删除 {count} 只宠物",
    clearPetDataFeedback: "已清空宠物数据",
    exportedFeedback: "已导出 {pet}",
    batchExportedFeedback: "已导出 {count} 只宠物",
    back: "返回",
    unbound: "未绑定",
    multiSelect: "多选",
    exportPet: "导出",
    deletePet: "删除",
    close: "关闭",
    batchDelete: "批量删除",
    batchExport: "批量导出",
    cancel: "取消",
    selectedCount: "已选 {count}",
    deleteSelected: "删除已选",
    previousPage: "上一页",
    nextPage: "下一页",
    displayOn: "开启",
    displayOff: "关闭",
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
      chatgpt: "ChatGPT",
      doubao: "豆包",
    },
  },
} as const;

function getSitePetLabel(locale: PopupLocale, siteId: SiteId): string {
  const copy = localeCopy[locale];
  switch (siteId) {
    case "deepseek":
      return copy.deepseekPet;
    case "gemini":
      return copy.geminiPet;
    case "chatgpt":
      return copy.chatgptPet;
    case "doubao":
      return copy.doubaoPet;
  }
}

function getStorageArea(): chrome.storage.StorageArea | null {
  return globalThis.chrome?.storage?.local ?? null;
}

function normalizeLocale(locale: string | undefined | null): PopupLocale {
  return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

async function resolveInitialLocale(): Promise<PopupLocale> {
  const storageArea = getStorageArea();
  const storedLocale = storageArea
    ? ((await storageArea.get(storageKeys.popupLocale))[storageKeys.popupLocale] as string | undefined)
    : undefined;
  if (storedLocale) {
    return normalizeLocale(storedLocale);
  }
  return normalizeLocale(
    globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? "en-US"
  );
}

async function persistLocale(locale: PopupLocale): Promise<void> {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return;
  }
  await storageArea.set({ [storageKeys.popupLocale]: locale });
}

function translate(
  locale: PopupLocale,
  key: keyof (typeof localeCopy)["en"],
  replacements?: Record<string, string>
): string {
  const message = localeCopy[locale][key];
  if (typeof message !== "string") {
    return "";
  }
  return Object.entries(replacements ?? {}).reduce(
    (result, [name, value]) => result.replace(`{${name}}`, value),
    message
  );
}

function localizeSite(locale: PopupLocale, siteId: SiteId): string {
  return localeCopy[locale].sites[siteId];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPetDisplayName(snapshot: PopupSnapshot, petId: string): string {
  return snapshot.pets.find((pet) => pet.id === petId)?.displayName ?? petId;
}

function getPetSnapshot(snapshot: PopupSnapshot, petId: string): PopupSnapshot["pets"][number] | undefined {
  return snapshot.pets.find((pet) => pet.id === petId);
}

function clampAnimationSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultAnimationSpeed;
  }
  return Math.max(minAnimationSpeed, Math.min(maxAnimationSpeed, value));
}

function formatAnimationSpeed(value: number): string {
  return `${clampAnimationSpeed(value).toFixed(2)}x`;
}

async function requestSnapshot(): Promise<PopupSnapshot> {
  return chrome.runtime.sendMessage({ type: messageTypes.popupSnapshot } as OpenPetMessage);
}

async function batchImportFiles(root: HTMLElement, snapshot: PopupSnapshot, files: File[]): Promise<void> {
  if (!files.length) {
    return;
  }
  try {
    const payloadFiles = await Promise.all(
      files.map(async (file) => {
        const buffer =
          typeof file.arrayBuffer === "function"
            ? await file.arrayBuffer()
            : await new Response(file).arrayBuffer();
        return {
          filename: file.name,
          bytes: Array.from(new Uint8Array(buffer)),
        };
      })
    );
    const result = await chrome.runtime.sendMessage({
      type: messageTypes.batchImportPets,
      payload: { files: payloadFiles },
    });
    if (!result?.ok) {
      popupViewState.feedbackMessage = translate(popupViewState.locale, "importedFailure", {
        error: result?.error ?? "Unknown failure",
      });
      renderPopup(root, snapshot);
      return;
    }

    const nextSnapshot = await requestSnapshot();
    popupViewState.feedbackMessage = translate(popupViewState.locale, "importedSummary", {
      imported: String(result.importedPetIds?.length ?? 0),
      overwritten: String(result.overwrittenPetIds?.length ?? 0),
      failed: String(result.failures?.length ?? 0),
    });
    renderPopup(root, nextSnapshot);
  } catch {
    popupViewState.feedbackMessage = translate(popupViewState.locale, "importedFailure", {
      error: "Unexpected failure",
    });
    renderPopup(root, snapshot);
  }
}

function createPetOptions(snapshot: PopupSnapshot, locale: PopupLocale): string {
  const noneOption = `<option value="">${escapeHtml(localeCopy[locale].noPet)}</option>`;
  if (!snapshot.pets.length) {
    return `${noneOption}<option value="" selected>${escapeHtml(localeCopy[locale].noImportedPets)}</option>`;
  }

  return [
    noneOption,
    ...snapshot.pets.map(
      (pet) => `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.displayName)}</option>`
    ),
  ].join("");
}

function clampManagePage(snapshot: PopupSnapshot): void {
  const pageCount = Math.max(1, Math.ceil(snapshot.pets.length / managePetsPageSize));
  popupViewState.managePageIndex = Math.min(popupViewState.managePageIndex, pageCount - 1);
}

function renderImportFeedback(): string {
  if (!popupViewState.feedbackMessage) {
    return "";
  }
  return `<div class="inline-feedback" id="import-feedback">${escapeHtml(popupViewState.feedbackMessage)}</div>`;
}

function clearManageToast(): void {
  popupViewState.manageToastMessage = "";
  if (manageToastTimer !== null) {
    window.clearTimeout(manageToastTimer);
    manageToastTimer = null;
  }
}

function renderManageToast(): string {
  if (!popupViewState.manageToastMessage) {
    return "";
  }
  return `<div id="manage-toast" class="manage-toast" role="status" aria-live="polite">${escapeHtml(
    popupViewState.manageToastMessage
  )}</div>`;
}

function showManageToast(root: HTMLElement, snapshot: PopupSnapshot, message: string): void {
  clearManageToast();
  popupViewState.manageToastMessage = message;
  renderPopup(root, snapshot);
  manageToastTimer = window.setTimeout(() => {
    popupViewState.manageToastMessage = "";
    manageToastTimer = null;
    if (popupViewState.page === "manage") {
      renderPopup(root, snapshot);
    }
  }, 2200);
}

function renderStaticPreview(pet: PopupSnapshot["pets"][number], locale: PopupLocale): string {
  if (!pet.spritesheetDataUrl) {
    return `<div class="pet-card-preview-empty">${escapeHtml(localeCopy[locale].importPreviewUnavailable)}</div>`;
  }

  return `<div class="pet-card-preview-sprite" style="background-image: url('${escapeHtml(pet.spritesheetDataUrl)}');"></div>`;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const [, base64Payload = ""] = dataUrl.split(",", 2);
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function spritesheetExtensionFromPath(path: string | undefined): "png" | "webp" {
  return path?.toLowerCase().endsWith(".png") ? "png" : "webp";
}

async function exportPetPackage(snapshot: PopupSnapshot, petId: string): Promise<string | null> {
  const pet = getPetSnapshot(snapshot, petId);
  if (!pet?.spritesheetDataUrl) {
    return null;
  }

  const spritesheetExtension = spritesheetExtensionFromPath(pet.spritesheetPath);
  const spritesheetFilename = `spritesheet.${spritesheetExtension}`;

  const zip = new JSZip();
  zip.file(
    "pet.json",
    JSON.stringify(
      {
        id: pet.id,
        displayName: pet.displayName,
        spritesheetPath: spritesheetFilename,
      },
      null,
      2
    )
  );
  zip.file(spritesheetFilename, decodeDataUrl(pet.spritesheetDataUrl));
  const blob = await zip.generateAsync({ type: "blob" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `${pet.id}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  return pet.displayName;
}

async function exportSelectedPets(snapshot: PopupSnapshot, petIds: string[]): Promise<string[]> {
  const exported: string[] = [];
  for (const petId of petIds) {
    const name = await exportPetPackage(snapshot, petId);
    if (name) {
      exported.push(name);
    }
  }
  return exported;
}

function renderHomePage(snapshot: PopupSnapshot): string {
  const locale = popupViewState.locale;
  const copy = localeCopy[locale];
  const petOptions = createPetOptions(snapshot, locale);
  const animationSpeed = clampAnimationSpeed(popupViewState.currentAnimationSpeed);
  return `
    <section class="popup-card">
      <div class="card-title">${copy.homeTitle}</div>
      <div class="field-grid">
        <label class="toggle-row">
          <span>${copy.overlayVisible}</span>
          <input id="overlay-toggle" type="checkbox" ${snapshot.overlayVisible ? "checked" : ""} />
        </label>
        ${supportedSites
          .map((siteId) => {
            const bindingId = `binding-${siteId}`;
            const petLabel = getSitePetLabel(locale, siteId);
            const selectedValue = snapshot.sitePetBindings[siteId] ?? "";
            return `
              <label class="field-label">
                <span>${petLabel}</span>
                <select id="${bindingId}" ${snapshot.pets.length ? "" : "disabled"}>
                  ${petOptions}
                </select>
              </label>
              <script type="application/json" data-binding-value="${siteId}">${escapeHtml(selectedValue)}</script>
            `;
          })
          .join("")}
      </div>
    </section>

    <section class="popup-card">
      <div class="card-title">${copy.dataTitle}</div>
      <div class="field-grid">
        <div class="field-label">
          <span>${copy.importZip}</span>
          <input id="pet-file" class="upload-input" type="file" accept=".zip" multiple />
          <label id="pet-dropzone" class="upload-dropzone" data-drag-active="${popupViewState.dragActive}" for="pet-file">
            <span class="upload-primary">${copy.importZip}</span>
            <span class="upload-secondary">${copy.importDropHint}</span>
          </label>
          ${renderImportFeedback()}
        </div>
        <button id="manage-pets" class="secondary-button" type="button">${copy.managePetsTitle}</button>
      </div>
    </section>

    <section class="popup-card">
      <div class="card-title">${copy.animationTitle}</div>
      <div class="speed-controls">
        <div class="field-label speed-inline">
          <div class="speed-topline">
            <span>${copy.animationTitle}</span>
            <div class="speed-value-group">
              <span id="animation-speed-value" class="speed-value">${formatAnimationSpeed(animationSpeed)}</span>
              <div class="speed-nudge-group" aria-label="${copy.animationTitle}">
                <button id="animation-speed-decrease" class="speed-nudge-button" type="button" aria-label="Decrease speed">−</button>
                <button id="animation-speed-increase" class="speed-nudge-button" type="button" aria-label="Increase speed">+</button>
              </div>
            </div>
          </div>
          <input
            id="animation-speed-range"
            class="speed-range"
            type="range"
            min="${minAnimationSpeed}"
            max="${maxAnimationSpeed}"
            step="${animationSpeedSliderStep}"
            value="${animationSpeed}"
          />
        </div>
      </div>
    </section>

    <section class="popup-card">
      <div class="card-title">${copy.petStore}</div>
      <div class="future-grid">
        <button id="pet-store" class="future-button" type="button" disabled>${copy.petStore}</button>
        <div class="helper-text">${copy.companionNote}</div>
      </div>
    </section>
  `;
}

function renderManagePage(snapshot: PopupSnapshot): string {
  const locale = popupViewState.locale;
  const copy = localeCopy[locale];
  clampManagePage(snapshot);
  const pageCount = Math.max(1, Math.ceil(snapshot.pets.length / managePetsPageSize));
  const start = popupViewState.managePageIndex * managePetsPageSize;
  const pets = snapshot.pets.slice(start, start + managePetsPageSize);
  const showDeleteMode = popupViewState.manageDeleteMode;

  return `
    <section class="popup-card">
      <div class="manage-header">
        <button id="manage-back" class="icon-button manage-back-button" type="button" aria-label="${copy.back}">←</button>
        <h2 class="manage-header-title">${copy.managePetsTitle}</h2>
        <div class="manage-header-actions"></div>
      </div>
      <div class="pet-grid">
        ${pets
          .map((pet) => {
            const boundSites = pet.boundSites.length
              ? pet.boundSites.map((siteId) => localizeSite(locale, siteId)).join(" / ")
              : copy.unbound;
            return `
              <div class="pet-card" data-pet-card="true" data-manage-pet-id="${escapeHtml(pet.id)}">
                ${showDeleteMode ? `
                  <div class="toggle-row">
                    <span></span>
                    <input class="pet-card-check" data-pet-select="${escapeHtml(pet.id)}" type="checkbox" ${
                    popupViewState.selectedPetIds.has(pet.id) ? "checked" : ""
                  } />
                  </div>
                ` : ""}
                <div class="pet-card-preview">
                  ${renderStaticPreview(pet, locale)}
                </div>
                <div class="pet-card-name">${escapeHtml(pet.displayName)}</div>
                <div class="pet-card-sites">
                  <div class="pet-card-sites-title">${escapeHtml(boundSites)}</div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="manage-pager">
        <button id="manage-prev-page" class="page-button" type="button" ${
          popupViewState.managePageIndex === 0 ? "disabled" : ""
        }>${copy.previousPage}</button>
        <div id="manage-page-indicator" class="manage-page-indicator">${popupViewState.managePageIndex + 1} / ${pageCount}</div>
        <button id="manage-next-page" class="page-button" type="button" ${
          popupViewState.managePageIndex >= pageCount - 1 ? "disabled" : ""
        }>${copy.nextPage}</button>
      </div>
      ${
        showDeleteMode
          ? `
            <div class="manage-actions">
              <div id="manage-selection-count" class="manage-selection-count">${translate(locale, "selectedCount", {
                count: String(popupViewState.selectedPetIds.size),
              })}</div>
            </div>
            <div class="manage-batch-actions">
              <button id="manage-close-multi" class="secondary-button manage-close-button" type="button" aria-label="${copy.close}">×</button>
              <button id="manage-batch-export" class="secondary-button" type="button" ${
                popupViewState.selectedPetIds.size ? "" : "disabled"
              }>${copy.batchExport}</button>
              <button id="manage-delete-selected" class="primary-button" type="button" ${
                popupViewState.selectedPetIds.size ? "" : "disabled"
              }>${copy.batchDelete}</button>
            </div>
          `
          : ""
      }
      ${renderManageToast()}
    </section>
  `;
}

function renderPopup(root: HTMLElement, snapshot: PopupSnapshot) {
  popupViewState.currentAnimationSpeed = clampAnimationSpeed(snapshot.animationSpeed);
  const { locale } = popupViewState;
  const copy = localeCopy[locale];
  const body = popupViewState.page === "manage" ? renderManagePage(snapshot) : renderHomePage(snapshot);
  const contextMenu = popupViewState.page === "manage" && popupViewState.manageContextMenu
    ? `
      <div
        id="manage-context-menu"
        class="manage-context-menu"
        style="left:${popupViewState.manageContextMenu.x}px; top:${popupViewState.manageContextMenu.y}px;"
      >
        <button type="button" data-manage-menu="multi-select">${copy.multiSelect}</button>
        <button type="button" data-manage-menu="export">${copy.exportPet}</button>
        <button type="button" data-manage-menu="delete">${copy.deletePet}</button>
      </div>
    `
    : "";

  root.innerHTML = `
    <style>${popupStyles}</style>
    <div class="popup-shell">
      <div class="popup-header">
        <div class="popup-title">${copy.title}</div>
        <div class="locale-toggle" aria-label="Language switcher">
          <button id="locale-en" type="button" data-locale="en" data-active="${locale === "en"}">EN</button>
          <button id="locale-zh" type="button" data-locale="zh" data-active="${locale === "zh"}">中</button>
        </div>
      </div>
      ${body}
      ${contextMenu}
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-locale]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextLocale = normalizeLocale(button.dataset.locale) as PopupLocale;
      if (nextLocale === popupViewState.locale) {
        return;
      }
      popupViewState.locale = nextLocale;
      await persistLocale(nextLocale);
      renderPopup(root, snapshot);
    });
  });

  if (popupViewState.page === "manage") {
    root.querySelector("#manage-back")?.addEventListener("click", () => {
      popupViewState.page = "home";
      popupViewState.manageDeleteMode = false;
      popupViewState.manageContextMenu = null;
      popupViewState.selectedPetIds.clear();
      clearManageToast();
      renderPopup(root, snapshot);
    });
    root.querySelector("#manage-close-multi")?.addEventListener("click", () => {
      popupViewState.manageDeleteMode = false;
      popupViewState.selectedPetIds.clear();
      clearManageToast();
      renderPopup(root, snapshot);
    });
    root.querySelector("#manage-prev-page")?.addEventListener("click", () => {
      popupViewState.managePageIndex = Math.max(0, popupViewState.managePageIndex - 1);
      popupViewState.manageContextMenu = null;
      renderPopup(root, snapshot);
    });
    root.querySelector("#manage-next-page")?.addEventListener("click", () => {
      popupViewState.managePageIndex += 1;
      clampManagePage(snapshot);
      popupViewState.manageContextMenu = null;
      renderPopup(root, snapshot);
    });
    root.querySelectorAll<HTMLElement>("[data-manage-pet-id]").forEach((card) => {
      card.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const petId = card.dataset.managePetId;
        if (!petId) {
          return;
        }
        const shellRect = root.querySelector(".popup-shell")?.getBoundingClientRect();
        popupViewState.manageContextMenu = {
          petId,
          x: Math.max(12, event.clientX - (shellRect?.left ?? 0)),
          y: Math.max(12, event.clientY - (shellRect?.top ?? 0)),
        };
        renderPopup(root, snapshot);
      });
    });
    root.querySelector("#manage-context-menu")?.addEventListener("click", async (event) => {
      const target = event.target as HTMLElement | null;
      const action = target?.getAttribute("data-manage-menu");
      const menuPetId = popupViewState.manageContextMenu?.petId;
      if (!action || !menuPetId) {
        return;
      }

      if (action === "multi-select") {
        popupViewState.manageDeleteMode = true;
        popupViewState.selectedPetIds.add(menuPetId);
        popupViewState.manageContextMenu = null;
        renderPopup(root, snapshot);
        return;
      }

      if (action === "export") {
        const exportedName = await exportPetPackage(snapshot, menuPetId);
        popupViewState.manageContextMenu = null;
        if (exportedName) {
          showManageToast(root, snapshot, translate(locale, "exportedFeedback", { pet: exportedName }));
          return;
        }
        renderPopup(root, snapshot);
        return;
      }

      if (action === "delete") {
        await chrome.runtime.sendMessage({
          type: messageTypes.deletePets,
          payload: { petIds: [menuPetId] },
        });
        popupViewState.manageContextMenu = null;
        const nextSnapshot = await requestSnapshot();
        clampManagePage(nextSnapshot);
        showManageToast(root, nextSnapshot, translate(locale, "deletedFeedback", { count: "1" }));
      }
    });
    root.querySelector("#manage-batch-export")?.addEventListener("click", async () => {
      const petIds = [...popupViewState.selectedPetIds];
      if (!petIds.length) {
        return;
      }
      const exported = await exportSelectedPets(snapshot, petIds);
      if (exported.length) {
        showManageToast(
          root,
          snapshot,
          translate(locale, "batchExportedFeedback", { count: String(exported.length) })
        );
      }
    });
    root.querySelectorAll<HTMLInputElement>("[data-pet-select]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const petId = checkbox.dataset.petSelect!;
        if (checkbox.checked) {
          popupViewState.selectedPetIds.add(petId);
        } else {
          popupViewState.selectedPetIds.delete(petId);
        }
        renderPopup(root, snapshot);
      });
    });
    root.querySelector("#manage-delete-selected")?.addEventListener("click", async () => {
      const petIds = [...popupViewState.selectedPetIds];
      if (!petIds.length) {
        return;
      }
      await chrome.runtime.sendMessage({
        type: messageTypes.deletePets,
        payload: { petIds },
      });
      popupViewState.selectedPetIds.clear();
      popupViewState.manageDeleteMode = false;
      popupViewState.manageContextMenu = null;
      const nextSnapshot = await requestSnapshot();
      clampManagePage(nextSnapshot);
      showManageToast(root, nextSnapshot, translate(locale, "deletedFeedback", { count: String(petIds.length) }));
    });
    root.addEventListener("click", (event) => {
      if (!(event.target as HTMLElement | null)?.closest("#manage-context-menu")) {
        if (popupViewState.manageContextMenu) {
          popupViewState.manageContextMenu = null;
          renderPopup(root, snapshot);
        }
      }
    });
    return;
  }

  supportedSites.forEach((siteId) => {
    const select = root.querySelector<HTMLSelectElement>(`#binding-${siteId}`);
    if (select) {
      select.value = snapshot.sitePetBindings[siteId] ?? "";
      select.addEventListener("change", async () => {
        const petId = select.value || null;
        await chrome.runtime.sendMessage({
          type: messageTypes.setSitePetBinding,
          payload: { siteId, petId },
        });
        const nextSnapshot = await requestSnapshot();
        renderPopup(root, nextSnapshot);
      });
    }

  });

  root.querySelector<HTMLInputElement>("#overlay-toggle")?.addEventListener("change", async (event) => {
    const target = event.currentTarget as HTMLInputElement;
    await chrome.runtime.sendMessage({
      type: messageTypes.toggleOverlay,
      payload: { visible: target.checked },
    });
  });

  const rangeInput = root.querySelector<HTMLInputElement>("#animation-speed-range");
  const valueLabel = root.querySelector<HTMLElement>("#animation-speed-value");
  const syncAnimationInputs = (nextSpeed: number) => {
    const clamped = clampAnimationSpeed(nextSpeed);
    popupViewState.currentAnimationSpeed = clamped;
    if (rangeInput) {
      rangeInput.value = clamped.toFixed(2);
    }
    valueLabel?.replaceChildren(document.createTextNode(formatAnimationSpeed(clamped)));
    return clamped;
  };
  const commitAnimationSpeed = async (nextSpeed: number) => {
    const speed = syncAnimationInputs(nextSpeed);
    const result = await chrome.runtime.sendMessage({
      type: messageTypes.setAnimationSpeed,
      payload: { speed },
    });
    const nextSnapshot = await requestSnapshot();
    nextSnapshot.animationSpeed = clampAnimationSpeed(result?.speed ?? speed);
    popupViewState.currentAnimationSpeed = nextSnapshot.animationSpeed;
    renderPopup(root, nextSnapshot);
  };

  rangeInput?.addEventListener("input", () => {
    syncAnimationInputs(Number.parseFloat(rangeInput.value));
  });
  rangeInput?.addEventListener("change", async () => {
    await commitAnimationSpeed(Number.parseFloat(rangeInput.value));
  });
  root.querySelector<HTMLButtonElement>("#animation-speed-decrease")?.addEventListener("click", async () => {
    await commitAnimationSpeed(popupViewState.currentAnimationSpeed - animationSpeedFineStep);
  });
  root.querySelector<HTMLButtonElement>("#animation-speed-increase")?.addEventListener("click", async () => {
    await commitAnimationSpeed(popupViewState.currentAnimationSpeed + animationSpeedFineStep);
  });

  root.querySelector("#manage-pets")?.addEventListener("click", () => {
    popupViewState.page = "manage";
    popupViewState.manageContextMenu = null;
    clampManagePage(snapshot);
    renderPopup(root, snapshot);
  });

  root.querySelector<HTMLInputElement>("#pet-file")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    await batchImportFiles(root, snapshot, Array.from(input.files ?? []));
  });

  const dropzone = root.querySelector<HTMLElement>("#pet-dropzone");
  const setDragActive = (active: boolean) => {
    popupViewState.dragActive = active;
    dropzone?.setAttribute("data-drag-active", String(active));
  };
  dropzone?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    setDragActive(true);
  });
  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    setDragActive(true);
  });
  dropzone?.addEventListener("dragleave", (event) => {
    event.preventDefault();
    if (event.currentTarget === event.target) {
      setDragActive(false);
    }
  });
  dropzone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    setDragActive(false);
    await batchImportFiles(root, snapshot, Array.from(event.dataTransfer?.files ?? []));
  });

}

async function mountPopup(root: HTMLElement): Promise<void> {
  popupViewState.locale = await resolveInitialLocale();
  popupViewState.page = "home";
  popupViewState.dragActive = false;
  popupViewState.currentAnimationSpeed = defaultAnimationSpeed;
  popupViewState.managePageIndex = 0;
  popupViewState.manageDeleteMode = false;
  clearManageToast();
  popupViewState.manageContextMenu = null;
  popupViewState.selectedPetIds.clear();
  const snapshot = await requestSnapshot();
  popupViewState.currentAnimationSpeed = clampAnimationSpeed(snapshot.animationSpeed);
  renderPopup(root, snapshot);
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    return;
  }
  await mountPopup(root);
}

void main();

export { mountPopup, renderPopup };
