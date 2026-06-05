import JSZip from "jszip";
import type { StoredPetRecord } from "@openpet/shared/types";
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

export async function importPetFromZip(input: ArrayBuffer | Uint8Array): Promise<StoredPetRecord> {
  const zip = await JSZip.loadAsync(input);
  const petJsonEntry = zip.file(/(^|\/)pet\.json$/i)[0];
  if (!petJsonEntry) {
    throw new Error("Pet package is missing pet.json");
  }

  const metadata = validatePetMetadata(JSON.parse(await petJsonEntry.async("text")));
  const spriteEntry = zip.file(
    new RegExp(`(^|/)${metadata.spritesheetPath.replace(".", "\\.")}$`, "i")
  )[0];
  if (!spriteEntry) {
    throw new Error(`Pet package is missing ${metadata.spritesheetPath}`);
  }

  const spriteBytes = await spriteEntry.async("uint8array");
  return {
    ...metadata,
    spritesheetDataUrl: encodeDataUrl(spriteBytes, mimeTypeFromSpritesheetPath(metadata.spritesheetPath)),
    importedAt: Date.now(),
  };
}
