import type { OverlayPlacement, SiteId, StoredPetRecord } from "@openpet/shared/types";
import { storageKeys } from "@openpet/shared/constants";

type StorageArea = Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;

export class OpenPetStorage {
  private readonly area: StorageArea | undefined;

  constructor(area?: StorageArea) {
    this.area = area ?? globalThis.chrome?.storage?.local;
  }

  private requireArea(): StorageArea {
    if (!this.area) {
      throw new Error("chrome.storage.local is not available in this environment");
    }

    return this.area;
  }

  async getPets(): Promise<StoredPetRecord[]> {
    const result = await this.requireArea().get(storageKeys.pets);
    return Array.isArray(result[storageKeys.pets]) ? result[storageKeys.pets] : [];
  }

  async savePet(record: StoredPetRecord): Promise<void> {
    const pets = await this.getPets();
    const nextPets = [...pets.filter((pet) => pet.id !== record.id), record];
    await this.requireArea().set({ [storageKeys.pets]: nextPets });
  }

  async getSitePetBindings(): Promise<Partial<Record<SiteId, string>>> {
    const result = await this.requireArea().get(storageKeys.sitePetBindings);
    const bindings = result[storageKeys.sitePetBindings];
    return bindings && typeof bindings === "object" ? (bindings as Partial<Record<SiteId, string>>) : {};
  }

  async setSitePetBinding(siteId: SiteId, petId: string | null): Promise<void> {
    const bindings = await this.getSitePetBindings();
    const nextBindings = { ...bindings };
    if (petId) {
      nextBindings[siteId] = petId;
    } else {
      delete nextBindings[siteId];
    }
    await this.requireArea().set({
      [storageKeys.sitePetBindings]: nextBindings,
    });
  }

  async getSitePetVisibility(): Promise<Partial<Record<SiteId, boolean>>> {
    const result = await this.requireArea().get(storageKeys.sitePetVisibility);
    const visibility = result[storageKeys.sitePetVisibility];
    return visibility && typeof visibility === "object"
      ? (visibility as Partial<Record<SiteId, boolean>>)
      : {};
  }

  async setSitePetVisibility(siteId: SiteId, visible: boolean): Promise<void> {
    const visibility = await this.getSitePetVisibility();
    await this.requireArea().set({
      [storageKeys.sitePetVisibility]: {
        ...visibility,
        [siteId]: visible,
      },
    });
  }

  async clearSitePetBindings(): Promise<void> {
    await this.requireArea().remove(storageKeys.sitePetBindings);
  }

  async getOverlayPlacements(): Promise<Partial<Record<SiteId, OverlayPlacement>>> {
    const result = await this.requireArea().get(storageKeys.overlayPlacements);
    const placements = result[storageKeys.overlayPlacements];
    return placements && typeof placements === "object"
      ? (placements as Partial<Record<SiteId, OverlayPlacement>>)
      : {};
  }

  async getOverlayPlacement(siteId: SiteId): Promise<OverlayPlacement | null> {
    return (await this.getOverlayPlacements())[siteId] ?? null;
  }

  async setOverlayPlacement(siteId: SiteId, placement: OverlayPlacement): Promise<void> {
    const placements = await this.getOverlayPlacements();
    await this.requireArea().set({
      [storageKeys.overlayPlacements]: {
        ...placements,
        [siteId]: placement,
      },
    });
  }

  async getPetSizes(): Promise<Partial<Record<SiteId, number>>> {
    const result = await this.requireArea().get(storageKeys.petSizes);
    const sizes = result[storageKeys.petSizes];
    return sizes && typeof sizes === "object" ? (sizes as Partial<Record<SiteId, number>>) : {};
  }

  async getPetSize(siteId: SiteId): Promise<number | null> {
    return (await this.getPetSizes())[siteId] ?? null;
  }

  async setPetSize(siteId: SiteId, size: number): Promise<void> {
    const sizes = await this.getPetSizes();
    await this.requireArea().set({
      [storageKeys.petSizes]: {
        ...sizes,
        [siteId]: size,
      },
    });
  }

  async isOverlayVisible(): Promise<boolean> {
    const result = await this.requireArea().get(storageKeys.overlayVisible);
    return result[storageKeys.overlayVisible] !== false;
  }

  async setOverlayVisible(visible: boolean): Promise<void> {
    await this.requireArea().set({ [storageKeys.overlayVisible]: visible });
  }

  async clearPets(): Promise<void> {
    await this.requireArea().remove(storageKeys.pets);
    await this.clearSitePetBindings();
  }

  async deletePets(petIds: string[]): Promise<void> {
    if (!petIds.length) {
      return;
    }

    const pets = await this.getPets();
    await this.requireArea().set({
      [storageKeys.pets]: pets.filter((pet) => !petIds.includes(pet.id)),
    });

    const bindings = await this.getSitePetBindings();
    const nextBindings = Object.fromEntries(
      Object.entries(bindings).filter(([, petId]) => !petIds.includes(petId))
    ) as Partial<Record<SiteId, string>>;
    await this.requireArea().set({
      [storageKeys.sitePetBindings]: nextBindings,
    });
  }
}
