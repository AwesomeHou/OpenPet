# OpenPet

[![docs中文](https://img.shields.io/badge/docs-中文-blue)](README.zh-CN.md)
[![docs英文](https://img.shields.io/badge/docs-English-blue)](README.md)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

OpenPet is an animated companions project for web AI tools.

It starts as a browser extension that shows animated companions on supported AI chat pages, manages per-site bindings, and lets you jump back to the right conversation tab with one click.

## Highlights

- Local-first, no cloud account required
- Import pet packages from local `.zip` files or folders
- Built-in official pets on first install
- Multiple pets with per-site bindings
- Supported sites: `deepseek`, `doubao`, `chatgpt`, `gemini`
- Assets and settings stay on-device

## Quick Start

1. Install dependencies.
2. Build the extension.
3. Load `dist/` as an unpacked extension in Chrome or Edge.

```bash
npm install
npm run build
```

## Notes

- Chrome and Edge load the generated files in `dist/`, not the source files.
- Re-run `npm run build` after changing runtime code, shared packages, manifest files, or shipped assets.
- The extension is designed to work without a backend.

## Supported sites

- DeepSeek: `https://chat.deepseek.com/`
- Doubao: `https://www.doubao.com/`
- ChatGPT: `https://chatgpt.com/`
- Gemini: `https://gemini.google.com/`

## Release facts

- Current package version: `0.1.0`
- Manifest version: `0.1.0`
- License: MIT

## Permissions

OpenPet currently requests:

- `storage`: local pets, bindings, settings, and cached state
- `unlimitedStorage`: reduce the chance of local quota failures when importing larger assets
- `tabs`: focus the correct chat tab when the pet is clicked
- host access on supported chat pages: detect page state and render the overlay

## Privacy

OpenPet is built to keep data local.

- It does not require a cloud account.
- It does not require sending chat content to OpenPet servers.
- Pet assets, bindings, and UI preferences are stored locally in the browser.

For more detail, see [`README.zh-CN.md`](README.zh-CN.md) and [`scratch/openpet-privacy-policy.md`](scratch/openpet-privacy-policy.md).

## Repository layout

- `apps/chrome-extension/` - extension source
- `packages/` - shared logic and pet asset tooling
- `dist/` - build output loaded by the browser
- `scratch/` - working docs, release drafts, and planning notes

## License

MIT
