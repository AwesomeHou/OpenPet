import type { PetMetadata } from "@openpet/shared/types";
import { createPetImportError } from "./errors";

export function validatePetMetadata(value: unknown): PetMetadata {
  if (!value || typeof value !== "object") {
    throw createPetImportError("E_PET_JSON_NOT_OBJECT", "pet.json must contain an object");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw createPetImportError("E_PET_ID_INVALID", "pet.json is missing a valid id");
  }
  if (typeof candidate.displayName !== "string" || candidate.displayName.length === 0) {
    throw createPetImportError(
      "E_PET_DISPLAY_NAME_INVALID",
      "pet.json is missing a valid displayName"
    );
  }
  if (typeof candidate.spritesheetPath !== "string" || candidate.spritesheetPath.length === 0) {
    throw createPetImportError(
      "E_PET_SPRITESHEET_PATH_INVALID",
      "pet.json is missing a valid spritesheetPath"
    );
  }
  if (!/\.(png|webp)$/i.test(candidate.spritesheetPath)) {
    throw createPetImportError(
      "E_PET_SPRITESHEET_PATH_UNSUPPORTED",
      "pet.json spritesheetPath must end with .png or .webp"
    );
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    description: typeof candidate.description === "string" ? candidate.description : undefined,
    spritesheetPath: candidate.spritesheetPath,
  };
}
