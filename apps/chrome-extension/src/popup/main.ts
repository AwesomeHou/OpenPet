import { managePetsPageSize, storageKeys } from "@openpet/shared/constants";
import { messageTypes, type OpenPetMessage } from "@openpet/shared/messages";
import type { SiteId } from "@openpet/shared/types";

type PopupLocale = "zh" | "en";
type PopupSnapshot = {
  pets: Array<{ id: string; displayName: string; boundSites: SiteId[] }>;
  sitePetBindings: Partial<Record<SiteId, string>>;
  sitePetVisibility: Partial<Record<SiteId, boolean>>;
  overlayVisible: boolean;
};

type PopupPage = "home" | "manage";

type PopupViewState = {
  locale: PopupLocale;
  feedbackMessage: string;
  dragActive: boolean;
  page: PopupPage;
  managePageIndex: number;
  selectedPetIds: Set<string>;
};

const popupViewState: PopupViewState = {
  locale: "en",
  feedbackMessage: "",
  dragActive: false,
  page: "home",
  managePageIndex: 0,
  selectedPetIds: new Set(),
};

const supportedSites: SiteId[] = ["deepseek", "gemini"];

const popupStyles = `
  :root {
    color-scheme: light;
  }
  html, body {
    margin: 0;
    background: transparent;
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
  .popup-header,
  .header-row,
  .footer-row,
  .toggle-row,
  .pet-card-meta,
  .pet-card-header {
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
  .feedback-banner,
  .popup-card {
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.74);
    box-shadow: 0 12px 30px rgba(84, 60, 41, 0.08);
  }
  .feedback-banner {
    min-height: 18px;
    padding: 12px 14px;
    font-size: 12px;
    color: #6a4f39;
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
  .pet-grid {
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
  }
  .pet-card-name {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
  }
  .pet-card-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    background: rgba(141, 97, 63, 0.12);
    color: #6a4f39;
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
`;

const localeCopy = {
  en: {
    title: "OpenPet",
    homeTitle: "Site bindings",
    dataTitle: "Pet data",
    managePetsTitle: "Manage Pets",
    overlayVisible: "Overlay visible",
    petStore: "Pet Store",
    companionNote: "For a persistent desktop experience, a companion app will be available later.",
    importZip: "Import pet zip",
    importDropHint: "Click or drop .zip files here",
    clearPetData: "Clear pet data",
    deepseekPet: "DeepSeek pet",
    geminiPet: "Gemini pet",
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
    back: "Back",
    unbound: "Unbound",
    selectedCount: "Selected {count}",
    deleteSelected: "Delete selected",
    previousPage: "Previous",
    nextPage: "Next",
    manageHint: "Pet-first view with paging and batch delete.",
    displayOn: "on",
    displayOff: "off",
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
    },
  },
  zh: {
    title: "OpenPet",
    homeTitle: "站点绑定",
    dataTitle: "宠物数据",
    managePetsTitle: "管理宠物",
    overlayVisible: "显示宠物浮层",
    petStore: "宠物商店",
    companionNote: "需要桌面常驻体验时，未来可搭配 companion app 使用。",
    importZip: "导入宠物 zip",
    importDropHint: "点击选择或将多个 .zip 文件拖到这里",
    clearPetData: "清空宠物数据",
    deepseekPet: "DeepSeek 宠物",
    geminiPet: "Gemini 宠物",
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
    back: "返回",
    unbound: "未绑定",
    selectedCount: "已选 {count}",
    deleteSelected: "删除已选",
    previousPage: "上一页",
    nextPage: "下一页",
    manageHint: "按宠物查看站点绑定，支持分页与批量删除。",
    displayOn: "开启",
    displayOff: "关闭",
    sites: {
      deepseek: "DeepSeek",
      gemini: "Gemini",
    },
  },
} as const;

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

function renderHomePage(snapshot: PopupSnapshot): string {
  const locale = popupViewState.locale;
  const copy = localeCopy[locale];
  const petOptions = createPetOptions(snapshot, locale);
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
            const visibilityId = `visibility-${siteId}`;
            const petLabel = siteId === "deepseek" ? copy.deepseekPet : copy.geminiPet;
            const selectedValue = snapshot.sitePetBindings[siteId] ?? "";
            return `
              <label class="field-label">
                <span>${petLabel}</span>
                <select id="${bindingId}" ${snapshot.pets.length ? "" : "disabled"}>
                  ${petOptions}
                </select>
              </label>
              <label class="toggle-row">
                <span>${localizeSite(locale, siteId)} ${copy.showPet}</span>
                <input id="${visibilityId}" type="checkbox" ${snapshot.sitePetVisibility[siteId] !== false ? "checked" : ""} />
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
        </div>
        <button id="manage-pets" class="secondary-button" type="button">${copy.managePetsTitle}</button>
        <button id="clear-cache" class="secondary-button" type="button" ${snapshot.pets.length ? "" : "disabled"}>${copy.clearPetData}</button>
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

  return `
    <section class="popup-card">
      <div class="header-row">
        <button id="manage-back" class="icon-button" type="button" aria-label="${copy.back}">←</button>
        <div class="card-title">${copy.managePetsTitle}</div>
        <div></div>
      </div>
      <div class="helper-text">${copy.manageHint}</div>
      <div class="pet-grid">
        ${pets
          .map((pet) => {
            const boundSites = pet.boundSites.length
              ? pet.boundSites.map((siteId) => localizeSite(locale, siteId)).join(" / ")
              : copy.unbound;
            return `
              <label class="pet-card" data-pet-card="true">
                <div class="pet-card-header">
                  <input class="pet-card-check" data-pet-select="${escapeHtml(pet.id)}" type="checkbox" ${
                    popupViewState.selectedPetIds.has(pet.id) ? "checked" : ""
                  } />
                  <span class="pet-card-badge">${pet.boundSites.length ? boundSites : copy.unbound}</span>
                </div>
                <div class="pet-card-name">${escapeHtml(pet.displayName)}</div>
                <div class="pet-card-site">${escapeHtml(boundSites)}</div>
              </label>
            `;
          })
          .join("")}
      </div>
      <div class="footer-row">
        <button id="manage-prev-page" class="page-button" type="button" ${
          popupViewState.managePageIndex === 0 ? "disabled" : ""
        }>${copy.previousPage}</button>
        <div id="manage-page-indicator">${popupViewState.managePageIndex + 1} / ${pageCount}</div>
        <button id="manage-next-page" class="page-button" type="button" ${
          popupViewState.managePageIndex >= pageCount - 1 ? "disabled" : ""
        }>${copy.nextPage}</button>
      </div>
      <div class="footer-row">
        <div id="manage-selection-count">${translate(locale, "selectedCount", {
          count: String(popupViewState.selectedPetIds.size),
        })}</div>
        <button id="manage-delete-selected" class="primary-button" type="button" ${
          popupViewState.selectedPetIds.size ? "" : "disabled"
        }>${copy.deleteSelected}</button>
      </div>
    </section>
  `;
}

function renderPopup(root: HTMLElement, snapshot: PopupSnapshot) {
  const { locale, feedbackMessage } = popupViewState;
  const copy = localeCopy[locale];
  const body = popupViewState.page === "manage" ? renderManagePage(snapshot) : renderHomePage(snapshot);

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
      <div id="status" class="feedback-banner">${escapeHtml(feedbackMessage)}</div>
      ${body}
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
      renderPopup(root, snapshot);
    });
    root.querySelector("#manage-prev-page")?.addEventListener("click", () => {
      popupViewState.managePageIndex = Math.max(0, popupViewState.managePageIndex - 1);
      renderPopup(root, snapshot);
    });
    root.querySelector("#manage-next-page")?.addEventListener("click", () => {
      popupViewState.managePageIndex += 1;
      clampManagePage(snapshot);
      renderPopup(root, snapshot);
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
      popupViewState.feedbackMessage = translate(locale, "deletedFeedback", {
        count: String(petIds.length),
      });
      const nextSnapshot = await requestSnapshot();
      clampManagePage(nextSnapshot);
      renderPopup(root, nextSnapshot);
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
        popupViewState.feedbackMessage = petId
          ? translate(locale, "boundFeedback", {
              site: localizeSite(locale, siteId),
              pet: getPetDisplayName(nextSnapshot, petId),
            })
          : translate(locale, "unboundFeedback", {
              site: localizeSite(locale, siteId),
            });
        renderPopup(root, nextSnapshot);
      });
    }

    const visibilityToggle = root.querySelector<HTMLInputElement>(`#visibility-${siteId}`);
    visibilityToggle?.addEventListener("change", async () => {
      await chrome.runtime.sendMessage({
        type: messageTypes.setSitePetVisibility,
        payload: { siteId, visible: visibilityToggle.checked },
      });
      popupViewState.feedbackMessage = translate(locale, "visibilityFeedback", {
        site: localizeSite(locale, siteId),
        state: visibilityToggle.checked ? copy.displayOn : copy.displayOff,
      });
      const nextSnapshot = await requestSnapshot();
      renderPopup(root, nextSnapshot);
    });
  });

  root.querySelector<HTMLInputElement>("#overlay-toggle")?.addEventListener("change", async (event) => {
    const target = event.currentTarget as HTMLInputElement;
    await chrome.runtime.sendMessage({
      type: messageTypes.toggleOverlay,
      payload: { visible: target.checked },
    });
  });

  root.querySelector("#manage-pets")?.addEventListener("click", () => {
    popupViewState.page = "manage";
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

  root.querySelector("#clear-cache")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: messageTypes.clearPets });
    popupViewState.feedbackMessage = copy.clearPetDataFeedback;
    const nextSnapshot = await requestSnapshot();
    renderPopup(root, nextSnapshot);
  });
}

async function mountPopup(root: HTMLElement): Promise<void> {
  popupViewState.locale = await resolveInitialLocale();
  popupViewState.page = "home";
  popupViewState.dragActive = false;
  popupViewState.managePageIndex = 0;
  popupViewState.selectedPetIds.clear();
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
