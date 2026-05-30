import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import JSZip from "jszip";
import { importPetFromZip } from "@openpet/pet-assets/importPet";

describe("importPetFromZip", () => {
  test("imports the bundled boba fixture", async () => {
    const bytes = await fs.readFile(path.resolve("scratch/boba.zip"));
    const pet = await importPetFromZip(bytes);

    expect(pet.id).toBe("boba");
    expect(pet.displayName).toBe("Boba");
    expect(pet.spritesheetDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
  });

  test("rejects archives without pet.json", async () => {
    await expect(importPetFromZip(new TextEncoder().encode("not-a-zip").buffer)).rejects.toThrow();
  });

  test("rejects archives with invalid pet metadata", async () => {
    const zip = new JSZip();
    zip.file(
      "pet.json",
      JSON.stringify({
        id: "broken",
        spritesheetPath: "spritesheet.webp",
      })
    );
    zip.file("spritesheet.webp", new Uint8Array([1, 2, 3]));

    await expect(importPetFromZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      /displayName/
    );
  });
});
