import { storageKeys } from "@openpet/shared/constants";
import { messageTypes, type ImportPetMessage, type OpenPetMessage } from "@openpet/shared/messages";

type PopupLocale = "zh" | "en";
type SiteId = "deepseek" | "gemini";
type PopupSnapshot = {
  currentTab: { state: string; site?: string } | null;
  pets: Array<{ id: string; displayName: string }>;
  sitePetBindings: Partial<Record<SiteId, string>>;
  overlayVisible: boolean;
};

type PopupViewState = {
  locale: PopupLocale;
  feedbackMessage: string;
  dragActive: boolean;
};

const popupStyles = `
  :root {
    color-scheme: light;
    scrollbar-color: rgba(141, 97, 63, 0.72) rgba(109, 78, 53, 0.08);
    scrollbar-width: thin;
  }
  html, body {
    margin: 0;
    background: transparent;
  }
  body::-webkit-scrollbar {
    width: 10px;
  }
  body::-webkit-scrollbar-track {
    background: rgba(109, 78, 53, 0.08);
    border-radius: 999px;
  }
  body::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(157, 111, 73, 0.9), rgba(122, 84, 55, 0.92));
    border-radius: 999px;
    border: 2px solid rgba(255, 248, 239, 0.92);
  }
  body::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, rgba(170, 120, 79, 0.96), rgba(132, 91, 60, 0.98));
  }
  .popup-shell {
    width: 352px;
    box-sizing: border-box;
    padding: 18px;
    display: grid;
    gap: 14px;
    background: linear-gradient(180deg, #f8f1e7 0%, #f3eadf 100%);
    color: #2f241b;
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .popup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .popup-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .locale-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(82, 57, 36, 0.08);
  }
  .locale-toggle button {
    border: 0;
    border-radius: 999px;
    padding: 6px 10px;
    font: inherit;
    font-size: 12px;
    background: transparent;
    color: #6b5441;
    cursor: pointer;
  }
  .locale-toggle button[data-active="true"] {
    background: #ffffff;
    color: #2f241b;
    box-shadow: 0 1px 3px rgba(47, 36, 27, 0.12);
  }
  .popup-card {
    display: grid;
    gap: 12px;
    box-sizing: border-box;
    padding: 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 12px 30px rgba(84, 60, 41, 0.08);
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    color: #6a4f39;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .status-grid {
    display: grid;
    gap: 10px;
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .status-row strong {
    color: #6a4f39;
    font-weight: 600;
  }
  .status-value {
    text-align: right;
    font-weight: 600;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .toggle-row input {
    width: 18px;
    height: 18px;
    accent-color: #8d613f;
  }
  .field-grid {
    display: grid;
    gap: 10px;
  }
  .field-label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    color: #4f3a2b;
  }
  .field-label span {
    font-weight: 600;
  }
  .field-label select,
  .action-button,
  .future-button {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 13px;
    border-radius: 12px;
    border: 1px solid rgba(109, 78, 53, 0.16);
    background: #fffdf9;
    color: #2f241b;
  }
  .field-label select,
  .upload-dropzone {
    padding: 10px 12px;
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
    cursor: pointer;
    border-style: dashed;
    border-width: 1.5px;
    border-color: rgba(141, 97, 63, 0.35);
    background: rgba(255, 253, 249, 0.92);
    transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
  }
  .upload-dropzone[data-drag-active="true"] {
    border-color: rgba(141, 97, 63, 0.72);
    background: #fff8ef;
    box-shadow: inset 0 0 0 1px rgba(141, 97, 63, 0.18);
  }
  .upload-primary {
    font-weight: 600;
  }
  .upload-secondary {
    font-size: 12px;
    color: #7d6551;
  }
  .action-button,
  .future-button {
    padding: 10px 12px;
  }
  .action-button {
    cursor: pointer;
    background: #fffaf4;
  }
  .action-button:disabled,
  .future-button:disabled,
  .field-label select:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
  .future-grid {
    display: grid;
    gap: 10px;
  }
  .future-note {
    font-size: 12px;
    line-height: 1.45;
    color: #6a4f39;
  }
  .feedback {
    min-height: 18px;
    padding: 0 4px;
    font-size: 12px;
    color: #6a4f39;
  }
`;

const localeCopy = {
  en: {
    languageName: "English",
    title: "OpenPet",
    currentStatus: "Current state",
    currentSite: "Current site",
    notDetected: "Not detected",
    overlayVisible: "Overlay visible",
    bindingsTitle: "Site bindings",
    dataTitle: "Pet data",
    deepseekPet: "DeepSeek pet",
    geminiPet: "Gemini pet",
    noImportedPets: "No imported pets",
    importZip: "Import pet zip",
    importDropHint: "Click or drop a .zip file here",
    clearPetData: "Clear pet data",
    futureTitle: "Coming next",
    petStore: "Pet Store",
    managePets: "Manage Pets",
    comingSoon: "Coming soon",
    companionNote: "For a persistent desktop experience, a companion app will be available later.",
    importedFeedback: "Imported {pet}",
    importFailedFeedback: "Import failed: {error}",
    boundFeedback: "Bound {site} to {pet}",
    clearPetDataFeedback: "Cleared pet data",
    operationFailed: "Action failed. Please try again.",
    states: {
      idle: "Idle",
      thinking: "Thinking",
      streaming: "Responding",
      waiting: "Waiting",
      error: "Error",
      done: "Done",
    },
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
    },
  },
  zh: {
    languageName: "中文",
    title: "OpenPet",
    currentStatus: "当前状态",
    currentSite: "当前站点",
    notDetected: "未检测到",
    overlayVisible: "显示宠物浮层",
    bindingsTitle: "站点绑定",
    dataTitle: "宠物数据",
    deepseekPet: "DeepSeek 宠物",
    geminiPet: "Gemini 宠物",
    noImportedPets: "暂无已导入宠物",
    importZip: "导入宠物 zip",
    importDropHint: "点击选择或将 .zip 文件拖到这里",
    clearPetData: "清空宠物数据",
    futureTitle: "后续能力",
    petStore: "宠物商店",
    managePets: "管理宠物",
    comingSoon: "即将支持",
    companionNote: "需要桌面常驻体验时，未来可搭配 companion app 使用。",
    importedFeedback: "已导入 {pet}",
    importFailedFeedback: "导入失败：{error}",
    boundFeedback: "已将 {site} 绑定到 {pet}",
    clearPetDataFeedback: "已清空宠物数据",
    operationFailed: "操作失败，请重试。",
    states: {
      idle: "空闲中",
      thinking: "思考中",
      streaming: "输出中",
      waiting: "等待中",
      error: "出错了",
      done: "已完成",
    },
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
    },
  },
} as const;

const popupViewState: PopupViewState = {
  locale: "en",
  feedbackMessage: "",
  dragActive: false,
};

async function requestSnapshot() {
  return chrome.runtime.sendMessage({ type: messageTypes.popupSnapshot } as OpenPetMessage);
}

async function importPetFile(root: HTMLElement, snapshot: PopupSnapshot, file: File): Promise<void> {
  try {
    const buffer =
      typeof file.arrayBuffer === "function"
        ? await file.arrayBuffer()
        : await new Response(file).arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer));
    const message: ImportPetMessage = {
      type: messageTypes.importPet,
      payload: { bytes, filename: file.name },
    };
    const result = await chrome.runtime.sendMessage(message);
    if (!result.ok) {
      popupViewState.feedbackMessage = translate(popupViewState.locale, "importFailedFeedback", {
        error: result.error ?? localeCopy[popupViewState.locale].operationFailed,
      });
      renderPopup(root, snapshot);
      return;
    }

    const nextSnapshot = await requestSnapshot();
    popupViewState.feedbackMessage = translate(popupViewState.locale, "importedFeedback", {
      pet: getPetDisplayName(nextSnapshot, result.petId),
    });
    renderPopup(root, nextSnapshot);
  } catch {
    popupViewState.feedbackMessage = localeCopy[popupViewState.locale].operationFailed;
    renderPopup(root, snapshot);
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

  const uiLanguage =
    globalThis.chrome?.i18n?.getUILanguage?.() ??
    globalThis.navigator?.language ??
    "en-US";
  return normalizeLocale(uiLanguage);
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

function localizeState(locale: PopupLocale, state?: string): string {
  if (!state) {
    return localeCopy[locale].notDetected;
  }
  return localeCopy[locale].states[state as keyof (typeof localeCopy)["en"]["states"]] ?? state;
}

function localizeSite(locale: PopupLocale, site?: string): string {
  if (!site) {
    return localeCopy[locale].notDetected;
  }
  return localeCopy[locale].sites[site as keyof (typeof localeCopy)["en"]["sites"]] ?? site;
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

function createPetOptions(snapshot: PopupSnapshot, locale: PopupLocale): string {
  if (!snapshot.pets.length) {
    return `<option value="" selected>${escapeHtml(localeCopy[locale].noImportedPets)}</option>`;
  }

  return snapshot.pets
    .map(
      (pet) => `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.displayName)}</option>`
    )
    .join("");
}

function renderPopup(root: HTMLElement, snapshot: PopupSnapshot) {
  const { locale, feedbackMessage } = popupViewState;
  const copy = localeCopy[locale];
  const petOptions = createPetOptions(snapshot, locale);

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

      <section class="popup-card">
        <div class="card-title">${copy.currentStatus}</div>
        <div class="status-grid">
          <div class="status-row">
            <strong>${copy.currentStatus}</strong>
            <span class="status-value">${localizeState(locale, snapshot.currentTab?.state)}</span>
          </div>
          <div class="status-row">
            <strong>${copy.currentSite}</strong>
            <span class="status-value">${localizeSite(locale, snapshot.currentTab?.site)}</span>
          </div>
          <label class="toggle-row">
            <span>${copy.overlayVisible}</span>
            <input id="overlay-toggle" type="checkbox" ${snapshot.overlayVisible ? "checked" : ""}/>
          </label>
        </div>
      </section>

      <section class="popup-card">
        <div class="card-title">${copy.bindingsTitle}</div>
        <div class="field-grid">
          <label class="field-label">
            <span>${copy.deepseekPet}</span>
            <select id="binding-deepseek" ${snapshot.pets.length ? "" : "disabled"}>${petOptions}</select>
          </label>
          <label class="field-label">
            <span>${copy.geminiPet}</span>
            <select id="binding-gemini" ${snapshot.pets.length ? "" : "disabled"}>${petOptions}</select>
          </label>
        </div>
      </section>

      <section class="popup-card">
        <div class="card-title">${copy.dataTitle}</div>
        <div class="field-grid">
          <div class="field-label">
            <span>${copy.importZip}</span>
            <input id="pet-file" class="upload-input" type="file" accept=".zip" />
            <label id="pet-dropzone" class="upload-dropzone" data-drag-active="${popupViewState.dragActive}" for="pet-file">
              <span class="upload-primary">${copy.importZip}</span>
              <span class="upload-secondary">${copy.importDropHint}</span>
            </label>
          </div>
          <button id="clear-cache" class="action-button" type="button" ${snapshot.pets.length ? "" : "disabled"}>${copy.clearPetData}</button>
        </div>
      </section>

      <section class="popup-card">
        <div class="card-title">${copy.futureTitle}</div>
        <div class="future-grid">
          <button id="pet-store" class="future-button" type="button" disabled>${copy.petStore} · ${copy.comingSoon}</button>
          <button id="manage-pets" class="future-button" type="button" disabled>${copy.managePets} · ${copy.comingSoon}</button>
          <div class="future-note">${copy.companionNote}</div>
        </div>
      </section>

      <div id="status" class="feedback">${escapeHtml(feedbackMessage)}</div>
    </div>
  `;

  root
    .querySelector<HTMLInputElement>("#overlay-toggle")
    ?.addEventListener("change", async (event) => {
      const target = event.currentTarget as HTMLInputElement;
      await chrome.runtime.sendMessage({
        type: messageTypes.toggleOverlay,
        payload: { visible: target.checked },
      });
    });

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

  root.querySelector<HTMLInputElement>("#pet-file")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    await importPetFile(root, snapshot, file);
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
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    await importPetFile(root, snapshot, file);
  });

  const bindSelector = (selector: string, siteId: SiteId) => {
    const select = root.querySelector<HTMLSelectElement>(selector);
    if (!select) {
      return;
    }

    select.value = snapshot.sitePetBindings[siteId] ?? "";
    select.addEventListener("change", async (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      if (!target.value) {
        return;
      }

      await chrome.runtime.sendMessage({
        type: messageTypes.setSitePetBinding,
        payload: { siteId, petId: target.value },
      });
      const nextSnapshot = await requestSnapshot();
      popupViewState.feedbackMessage = translate(popupViewState.locale, "boundFeedback", {
        site: localizeSite(popupViewState.locale, siteId),
        pet: getPetDisplayName(nextSnapshot, target.value),
      });
      renderPopup(root, nextSnapshot);
    });
  };

  bindSelector("#binding-deepseek", "deepseek");
  bindSelector("#binding-gemini", "gemini");

  root.querySelector<HTMLButtonElement>("#clear-cache")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: messageTypes.clearPets });
    const nextSnapshot = await requestSnapshot();
    popupViewState.feedbackMessage = localeCopy[popupViewState.locale].clearPetDataFeedback;
    renderPopup(root, nextSnapshot);
  });
}

async function mountPopup(root: HTMLElement): Promise<void> {
  popupViewState.locale = await resolveInitialLocale();
  const snapshot = await requestSnapshot();
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
