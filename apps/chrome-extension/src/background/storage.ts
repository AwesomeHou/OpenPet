import type { StoredPetRecord } from "@openpet/shared/types";
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
    await this.ensureSelectedPet(record.id);
  }

  async getSelectedPetId(): Promise<string | null> {
    const result = await this.requireArea().get(storageKeys.selectedPetId);
    return typeof result[storageKeys.selectedPetId] === "string"
      ? result[storageKeys.selectedPetId]
      : null;
  }

  async setSelectedPetId(petId: string): Promise<void> {
    await this.requireArea().set({ [storageKeys.selectedPetId]: petId });
  }

  async clearSelectedPetId(): Promise<void> {
    await this.requireArea().remove(storageKeys.selectedPetId);
  }

  async ensureSelectedPet(petId: string): Promise<void> {
    const existing = await this.getSelectedPetId();
    if (!existing) {
      await this.setSelectedPetId(petId);
    }
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
    await this.clearSelectedPetId();
  }
}
