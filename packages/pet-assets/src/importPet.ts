import JSZip from "jszip";
import type { StoredPetRecord } from "@openpet/shared/types";
import { createPetImportError, normalizePetImportError } from "./errors";
import { validatePetMetadata } from "./validatePet";

function mimeTypeFromSpritesheetPath(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  throw new Error(`Unsupported spritesheet format for ${path}`);
}

function encodeDataUrl(buffer: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunkSize = 32768;

  for (let index = 0; index < buffer.length; index += chunkSize) {
    const chunk = buffer.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

function createStoredPetRecord(
  metadata: ReturnType<typeof validatePetMetadata>,
  spriteBytes: Uint8Array
): StoredPetRecord {
  return {
    ...metadata,
    spritesheetDataUrl: encodeDataUrl(spriteBytes, mimeTypeFromSpritesheetPath(metadata.spritesheetPath)),
    importedAt: Date.now(),
  };
}

function findBytesByPath(
  files: Array<{ path: string; bytes: Uint8Array }>,
  targetPath: string
): Uint8Array | undefined {
  const normalizedTarget = targetPath.replaceAll("\\", "/").toLowerCase();
  return files.find((file) => file.path.replaceAll("\\", "/").toLowerCase() === normalizedTarget)?.bytes;
}

export async function importPetFromDirectory(
  files: Array<{ path: string; bytes: Uint8Array }>
): Promise<StoredPetRecord> {
  const petJsonBytes = findBytesByPath(files, "pet.json");
  if (!petJsonBytes) {
    throw createPetImportError("E_PET_JSON_MISSING", "Pet package is missing pet.json");
  }

  let parsedMetadata: unknown;
  try {
    parsedMetadata = JSON.parse(new TextDecoder().decode(petJsonBytes));
  } catch (error) {
    throw normalizePetImportError(error);
  }

  const metadata = validatePetMetadata(parsedMetadata);
  const spriteBytes = findBytesByPath(files, metadata.spritesheetPath);
  if (!spriteBytes) {
    throw createPetImportError(
      "E_SPRITESHEET_MISSING",
      `Pet package is missing ${metadata.spritesheetPath}`
    );
  }

  return createStoredPetRecord(metadata, spriteBytes);
}

export async function importPetFromZip(input: ArrayBuffer | Uint8Array): Promise<StoredPetRecord> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch (error) {
    throw normalizePetImportError(error);
  }

  try {
    const petJsonEntry = zip.file(/(^|\/)pet\.json$/i)[0];
    if (!petJsonEntry) {
      throw createPetImportError("E_PET_JSON_MISSING", "Pet package is missing pet.json");
    }

    let parsedMetadata: unknown;
    try {
      parsedMetadata = JSON.parse(await petJsonEntry.async("text"));
    } catch (error) {
      throw normalizePetImportError(error);
    }

    const metadata = validatePetMetadata(parsedMetadata);
    const spriteEntry = zip.file(
      new RegExp(`(^|/)${metadata.spritesheetPath.replace(".", "\\.")}$`, "i")
    )[0];
    if (!spriteEntry) {
      throw createPetImportError(
        "E_SPRITESHEET_MISSING",
        `Pet package is missing ${metadata.spritesheetPath}`
      );
    }

    const spriteBytes = await spriteEntry.async("uint8array");
    return createStoredPetRecord(metadata, spriteBytes);
  } catch (error) {
    throw normalizePetImportError(error);
  };
}
