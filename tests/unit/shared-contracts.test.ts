import { describe, expect, test } from "vitest";
import { messageTypes } from "@openpet/shared/messages";
import { normalizedStates, petActionNames } from "@openpet/shared/types";

describe("shared contracts", () => {
  test("normalized states stay within the PRD state set", () => {
    expect(normalizedStates).toEqual(["idle", "thinking", "streaming", "waiting", "error", "done"]);
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
    expect(messageTypes.stateUpdate).toBe("openpet/state-update");
  });
});
