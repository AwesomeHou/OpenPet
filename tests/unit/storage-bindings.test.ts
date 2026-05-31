import { describe, expect, test } from "vitest";
import { OpenPetStorage } from "../../apps/chrome-extension/src/background/storage";

function createArea(seed: Record<string, unknown> = {}) {
  const state = new Map<string, unknown>(Object.entries(seed));

  return {
    get: async (key: string) => ({ [key]: state.get(key) }),
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        state.set(key, value);
      }
    },
    remove: async (key: string) => {
      state.delete(key);
    },
  };
}

describe("OpenPetStorage site bindings", () => {
  test("reads and writes site-to-pet bindings", async () => {
    const storage = new OpenPetStorage(createArea() as never);

    expect(await storage.getSitePetBindings()).toEqual({});

    await storage.setSitePetBinding("gemini", "doodlebob");
    await storage.setSitePetBinding("deepseek", "boba");

    expect(await storage.getSitePetBindings()).toEqual({
      gemini: "doodlebob",
      deepseek: "boba",
    });
  });

  test("reads and writes independent pet placements by site", async () => {
    const storage = new OpenPetStorage(createArea() as never);

    expect(await storage.getOverlayPlacement("deepseek")).toBeNull();

    await storage.setOverlayPlacement("deepseek", { left: 20, top: 30, facing: "right" });
    await storage.setOverlayPlacement("gemini", { left: 180, top: 60, facing: "left" });

    expect(await storage.getOverlayPlacement("deepseek")).toEqual({
      left: 20,
      top: 30,
      facing: "right",
    });
    expect(await storage.getOverlayPlacement("gemini")).toEqual({
      left: 180,
      top: 60,
      facing: "left",
    });
  });
});
