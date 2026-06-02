export const storageKeys = {
  pets: "openpet.pets",
  sitePetBindings: "openpet.sitePetBindings",
  sitePetVisibility: "openpet.sitePetVisibility",
  overlayVisible: "openpet.overlayVisible",
  overlayPlacements: "openpet.overlayPlacements",
  petSizes: "openpet.petSizes",
  popupLocale: "openpet.popupLocale",
} as const;

export const overlayRootId = "openpet-overlay-root";
export const defaultPetSize = 96;
export const minPetSize = 72;
export const maxPetSize = 192;
export const managePetsPageSize = 9;
