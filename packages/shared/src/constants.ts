export const storageKeys = {
  pets: "openpet.pets",
  builtinPetsSeedVersion: "openpet.builtinPetsSeedVersion",
  sitePetBindings: "openpet.sitePetBindings",
  sitePetVisibility: "openpet.sitePetVisibility",
  overlayVisible: "openpet.overlayVisible",
  overlayPlacements: "openpet.overlayPlacements",
  petSizes: "openpet.petSizes",
  animationSpeed: "openpet.animationSpeed",
  popupLocale: "openpet.popupLocale",
} as const;

export const overlayRootId = "openpet-overlay-root";
export const defaultPetSize = 96;
export const minPetSize = 72;
export const maxPetSize = 192;
export const managePetsPageSize = 9;
export const defaultAnimationSpeed = 1;
export const minAnimationSpeed = 0.5;
export const maxAnimationSpeed = 2;
export const animationSpeedSliderStep = 0.01;
export const animationSpeedFineStep = 0.01;
