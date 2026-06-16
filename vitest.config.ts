import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@openpet/shared": path.resolve("packages/shared/src"),
      "@openpet/state": path.resolve("packages/state/src"),
      "@openpet/pet-assets": path.resolve("packages/pet-assets/src"),
      "@openpet/adapters": path.resolve("packages/adapters/src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
