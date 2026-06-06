import { importPetFromZip } from "@openpet/pet-assets/importPet";
import type { SiteId } from "@openpet/shared/types";
import type { OpenPetStorage } from "./storage";

export const builtinPetsSeedVersion = "v1";

export const builtinPetSiteIds = ["chatgpt", "deepseek", "doubao", "gemini"] as const satisfies readonly SiteId[];

export async function loadBuiltinPetArchive(siteId: SiteId): Promise<Uint8Array> {
  const response = await fetch(chrome.runtime.getURL(`assets/builtin-pets/${siteId}.zip`));
  if (!response.ok) {
    throw new Error(`Failed to load builtin pet archive for ${siteId}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function ensureBuiltinPetsSeeded(
  storageRepo: OpenPetStorage,
  options: {
    reason?: chrome.runtime.OnInstalledReason;
    loadArchive?: (siteId: SiteId) => Promise<Uint8Array | number[]>;
  } = {}
): Promise<void> {
  if (options.reason && options.reason !== "install") {
    return;
  }

  const currentVersion = await storageRepo.getBuiltinPetsSeedVersion();
  if (currentVersion === builtinPetsSeedVersion) {
    return;
  }

  const loadArchive = options.loadArchive ?? loadBuiltinPetArchive;
  const currentBindings = await storageRepo.getSitePetBindings();

  for (const siteId of builtinPetSiteIds) {
    const bytes = await loadArchive(siteId);
    const pet = await importPetFromZip(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
    await storageRepo.savePet(pet);
    if (!currentBindings[siteId]) {
      await storageRepo.setSitePetBinding(siteId, pet.id);
    }
  }

  await storageRepo.setBuiltinPetsSeedVersion(builtinPetsSeedVersion);
}
