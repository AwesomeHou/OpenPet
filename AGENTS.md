# AGENT.md

This repository is maintained with Codex. Before making changes, always read the project docs and follow the conventions below.

## First things to read

Read these files before starting any non-trivial work:

- `/E:/OpenPet/README.md`
- `/E:/OpenPet/scratch/openpet-project-overview.md`
- `/E:/OpenPet/scratch/petdex-reference-plan.md`

If there is any conflict between notes, prefer the latest project overview in `scratch/` and ask the user when the direction is ambiguous.

## Project direction

- The project is OpenPet, an open-source, local-first pet status system for AI workflows.
- The first milestone is a Chrome extension.
- The product roadmap is:
  1. Pure browser extension
  2. Extension + companion app
  3. Companion app can also run independently to connect local agents
- Keep Petdex compatibility in mind for pet assets and gallery-related work.

## Working rules

- Keep temporary and experimental files in `/E:/OpenPet/scratch/` only.
- Prefer small, incremental changes that preserve the current direction.
- Do not introduce cloud-first dependencies for the first-stage work unless the user explicitly asks.
- Do not add unrelated features or expand scope without checking with the user.
- When changing architecture or behavior, update the docs in `scratch/` if the change affects how the project is understood.

## Development expectations

- Inspect the existing workspace before editing.
- Use the smallest reasonable change that solves the task.
- Prefer reusable, cross-platform structure when adding shared logic.
- Treat `dist/` as the runtime artifact that Chrome actually loads, not as a source-of-truth editing location.
- Run `npm run build` whenever a change affects extension runtime output, including:
  - files under `apps/chrome-extension/src/`
  - shared code under `packages/` that is consumed by the extension
  - extension manifest or bundled assets that ship through `dist/`
- Do not assume source edits are visible in Chrome after a reload unless `npm run build` has been run after those edits.
- If the task only touches repo docs, planning notes, or test-only files that do not ship into the extension runtime, `npm run build` is not required.
- Before handing off a UI or extension-behavior change as complete, make sure the latest source change has been rebuilt into `dist/`.
- If the task touches the extension architecture, keep the separation between:
  - page/content listening
  - state normalization
  - asset management
  - UI rendering
  - companion app integration

## Documentation expectations

- Keep project explanations in sync with implementation.
- If a decision changes the roadmap or product shape, update the overview document in `scratch/`.
- Draft and review planning or design work in `scratch/` first.
- Only move documentation into `docs/` after the user has reviewed and approved the `scratch/` version.

## Git and safety

- Do not overwrite user changes you did not make.
- Do not use destructive git commands unless the user explicitly asks.
- Preserve unrelated work in the repository.

## When uncertain

If a task affects the product direction, release shape, or architecture in a meaningful way, pause and confirm before making a risky change.
