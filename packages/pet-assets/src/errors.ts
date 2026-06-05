import type { PetImportErrorCode } from "@openpet/shared/types";

export class PetImportError extends Error {
  code: PetImportErrorCode;

  constructor(code: PetImportErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PetImportError";
  }
}

export function isPetImportError(error: unknown): error is PetImportError {
  return error instanceof PetImportError;
}

export function createPetImportError(code: PetImportErrorCode, message: string): PetImportError {
  return new PetImportError(code, message);
}

export function normalizePetImportError(error: unknown): PetImportError {
  if (isPetImportError(error)) {
    return error;
  }

  if (error instanceof SyntaxError) {
    return createPetImportError("E_PET_JSON_INVALID", error.message);
  }

  if (error instanceof Error) {
    if (/quota/i.test(error.message)) {
      return createPetImportError("E_STORAGE_QUOTA_EXCEEDED", error.message);
    }
    return createPetImportError("E_PACKAGE_READ_FAILED", error.message);
  }

  return createPetImportError("E_PACKAGE_READ_FAILED", "Unknown import failure");
}
