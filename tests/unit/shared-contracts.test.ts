import { describe, expect, test } from "vitest";
import { messageTypes } from "@openpet/shared/messages";
import { normalizedStates, petActionNames, siteIds } from "@openpet/shared/types";

describe("shared contracts", () => {
  test("normalized states stay within the PRD state set", () => {
    expect(normalizedStates).toEqual(["idle", "streaming", "waiting", "error", "done"]);
  });

  test("official pet action names stay aligned with the atlas contract", () => {
    expect(petActionNames).toEqual([
      "idle",
      "running-right",
      "running-left",
      "waving",
      "jumping",
      "failed",
      "waiting",
      "running",
      "review",
    ]);
  });

  test("message types remain stable", () => {
    expect(messageTypes.importPet).toBe("openpet/import-pet");
    expect(messageTypes.batchImportPets).toBe("openpet/batch-import-pets");
    expect(messageTypes.stateUpdate).toBe("openpet/state-update");
  });

  test("site identifiers remain aligned with the supported multi-pet rollout", () => {
    expect(siteIds).toEqual(["deepseek", "gemini", "chatgpt", "doubao"]);
  });

  test("scene update messages remain stable", () => {
    expect(messageTypes.sceneUpdate).toBe("openpet/scene-update");
    expect(messageTypes.currentSceneState).toBe("openpet/current-scene-state");
    expect(messageTypes.setAnimationSpeed).toBe("openpet/set-animation-speed");
    expect(messageTypes.setSitePetBinding).toBe("openpet/set-site-pet-binding");
    expect(messageTypes.setSitePetVisibility).toBe("openpet/set-site-pet-visibility");
    expect(messageTypes.deletePets).toBe("openpet/delete-pets");
  });
});
