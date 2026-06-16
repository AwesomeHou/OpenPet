import { importPetFromDirectory } from "@openpet/pet-assets/importPet";
import type { SiteId } from "@openpet/shared/types";
import type { OpenPetStorage } from "./storage";

export const builtinPetsSeedVersion = "v1";

export const builtinPetSiteIds = ["chatgpt", "deepseek", "doubao", "gemini"] as const satisfies readonly SiteId[];

export type BuiltinPetFile = {
  path: string;
  bytes: Uint8Array;
};

async function fetchBuiltinPetFile(siteId: SiteId, relativePath: string): Promise<BuiltinPetFile> {
  const response = await fetch(chrome.runtime.getURL(`assets/builtin-pets/${siteId}/${relativePath}`));
  if (!response.ok) {
    throw new Error(`Failed to load builtin pet file ${relativePath} for ${siteId}`);
  }

  return {
    path: relativePath,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

export async function loadBuiltinPetFiles(siteId: SiteId): Promise<BuiltinPetFile[]> {
  return Promise.all([
    fetchBuiltinPetFile(siteId, "pet.json"),
    fetchBuiltinPetFile(siteId, "spritesheet.webp"),
  ]);
}

export async function ensureBuiltinPetsSeeded(
  storageRepo: OpenPetStorage,
  options: {
    reason?: chrome.runtime.OnInstalledReason;
    loadFiles?: (siteId: SiteId) => Promise<BuiltinPetFile[]>;
  } = {}
): Promise<void> {
  if (options.reason && options.reason !== "install") {
    return;
  }

  const currentVersion = await storageRepo.getBuiltinPetsSeedVersion();
  if (currentVersion === builtinPetsSeedVersion) {
    return;
  }

  const loadFiles = options.loadFiles ?? loadBuiltinPetFiles;
  const currentBindings = await storageRepo.getSitePetBindings();

  for (const siteId of builtinPetSiteIds) {
    const pet = await importPetFromDirectory(await loadFiles(siteId));
    await storageRepo.savePet(pet);
    if (!currentBindings[siteId]) {
      await storageRepo.setSitePetBinding(siteId, pet.id);
    }
  }

  await storageRepo.setBuiltinPetsSeedVersion(builtinPetsSeedVersion);
}
