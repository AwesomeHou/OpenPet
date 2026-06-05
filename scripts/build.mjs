import path from "node:path";
import fs from "node:fs/promises";
import { build } from "esbuild";

const root = process.cwd();
const distDir = path.join(root, "dist");
const assetsDir = path.join(distDir, "assets");

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(assetsDir, { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: "chrome114",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "@openpet/shared": path.join(root, "packages/shared/src"),
    "@openpet/state": path.join(root, "packages/state/src"),
    "@openpet/pet-assets": path.join(root, "packages/pet-assets/src"),
    "@openpet/adapters": path.join(root, "packages/adapters/src"),
  },
};

await build({
  ...shared,
  entryPoints: {
    background: path.join(root, "apps/chrome-extension/src/background/main.ts"),
  },
  outdir: assetsDir,
  format: "esm",
});

await build({
  ...shared,
  entryPoints: {
    content: path.join(root, "apps/chrome-extension/src/content/main.ts"),
    popup: path.join(root, "apps/chrome-extension/src/popup/main.ts"),
  },
  outdir: assetsDir,
  format: "iife",
});

await fs.copyFile(
  path.join(root, "apps/chrome-extension/manifest.json"),
  path.join(distDir, "manifest.json")
);
await fs.copyFile(
  path.join(root, "apps/chrome-extension/popup.html"),
  path.join(distDir, "popup.html")
);
await fs.cp(
  path.join(root, "apps/chrome-extension/assets"),
  path.join(distDir, "assets"),
  { recursive: true }
);
await fs.cp(
  path.join(root, "assets/icons/ui"),
  path.join(distDir, "assets/icons/ui"),
  { recursive: true }
);
await fs.cp(
  path.join(root, "assets/brand"),
  path.join(distDir, "assets/brand"),
  { recursive: true }
);
