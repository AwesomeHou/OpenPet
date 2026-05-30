import type { PetMetadata } from "@openpet/shared/types";

export function validatePetMetadata(value: unknown): PetMetadata {
  if (!value || typeof value !== "object") {
    throw new Error("pet.json must contain an object");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new Error("pet.json is missing a valid id");
  }
  if (typeof candidate.displayName !== "string" || candidate.displayName.length === 0) {
    throw new Error("pet.json is missing a valid displayName");
  }
  if (typeof candidate.spritesheetPath !== "string" || candidate.spritesheetPath.length === 0) {
    throw new Error("pet.json is missing a valid spritesheetPath");
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    description: typeof candidate.description === "string" ? candidate.description : undefined,
    spritesheetPath: candidate.spritesheetPath,
  };
}
