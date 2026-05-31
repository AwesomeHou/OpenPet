import { messageTypes, type ImportPetMessage, type OpenPetMessage } from "@openpet/shared/messages";

async function requestSnapshot() {
  return chrome.runtime.sendMessage({ type: messageTypes.popupSnapshot } as OpenPetMessage);
}

type PopupSnapshot = {
  currentTab: { state: string; site?: string } | null;
  pets: Array<{ id: string; displayName: string }>;
  sitePetBindings: Partial<Record<"deepseek" | "gemini", string>>;
  overlayVisible: boolean;
};

export function renderPopup(root: HTMLElement, snapshot: PopupSnapshot) {
  const petOptions = snapshot.pets.length
    ? snapshot.pets
        .map(
          (pet) => `
        <option value="${pet.id}">
          ${pet.displayName}
        </option>
      `
        )
        .join("")
    : `<option value="" selected>No imported pets</option>`;
  const currentSite = snapshot.currentTab?.site ?? "not detected";

  root.innerHTML = `
    <div style="padding: 14px; width: 320px; display: grid; gap: 12px;">
      <div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">OpenPet</div>
        <div style="font-size: 12px; margin-bottom: 6px;">State: ${snapshot.currentTab?.state ?? "not detected"}</div>
        <div style="font-size: 12px;">Current site: ${currentSite}</div>
      </div>
      <label style="display: grid; gap: 6px; font-size: 12px;">
        <input id="overlay-toggle" type="checkbox" ${snapshot.overlayVisible ? "checked" : ""}/>
        Overlay visible
      </label>
      <label style="display: grid; gap: 6px; font-size: 12px;">
        DeepSeek pet
        <select id="binding-deepseek" ${snapshot.pets.length ? "" : "disabled"} style="padding: 6px; font: inherit;">
          ${petOptions}
        </select>
      </label>
      <label style="display: grid; gap: 6px; font-size: 12px;">
        Gemini pet
        <select id="binding-gemini" ${snapshot.pets.length ? "" : "disabled"} style="padding: 6px; font: inherit;">
          ${petOptions}
        </select>
      </label>
      <div style="display: grid; gap: 8px;">
        <input id="pet-file" type="file" accept=".zip" />
        <button id="clear-cache" type="button" ${snapshot.pets.length ? "" : "disabled"} style="padding: 6px 10px; font: inherit;">
          Clear pet cache
        </button>
      </div>
      <div id="status" style="font-size: 12px; min-height: 18px; margin-top: 10px;"></div>
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

  root.querySelector<HTMLInputElement>("#pet-file")?.addEventListener("change", async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const message: ImportPetMessage = {
      type: messageTypes.importPet,
      payload: { bytes, filename: file.name },
    };
    const result = await chrome.runtime.sendMessage(message);
    const status = root.querySelector<HTMLElement>("#status");
    if (status) {
      status.textContent = result.ok ? `Imported ${result.petId}` : result.error;
    }

    if (result.ok) {
      const nextSnapshot = await requestSnapshot();
      renderPopup(root, nextSnapshot);
      const refreshedStatus = root.querySelector<HTMLElement>("#status");
      if (refreshedStatus) {
        refreshedStatus.textContent = `Imported ${result.petId}`;
      }
    }
  });

  const bindSelector = (selector: string, siteId: "deepseek" | "gemini") => {
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
      renderPopup(root, nextSnapshot);
      const status = root.querySelector<HTMLElement>("#status");
      if (status) {
        status.textContent = `Bound ${siteId} to ${target.value}`;
      }
    });
  };

  bindSelector("#binding-deepseek", "deepseek");
  bindSelector("#binding-gemini", "gemini");

  root.querySelector<HTMLButtonElement>("#clear-cache")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: messageTypes.clearPets });
    const nextSnapshot = await requestSnapshot();
    renderPopup(root, nextSnapshot);
    const status = root.querySelector<HTMLElement>("#status");
    if (status) {
      status.textContent = "Cleared pet cache";
    }
  });
}

export async function mountPopup(root: HTMLElement): Promise<void> {
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
