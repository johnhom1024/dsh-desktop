# dsh-app

Thin Electron host for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This repo does **not** fork the official project. The desktop app only starts or connects to `dsh web` and keeps the official Web UI in a window.

## Runtime order

1. Reuse `http://127.0.0.1:<port>` if it is already the official UI (default port `3080`, changeable in Settings)
2. `dsh` on `PATH`
3. Cached `@deepseek-ai/dsh` from `pnpm dlx` (`~/Library/Caches/pnpm/dlx`)
4. Cached `@deepseek-ai/dsh` from npx
5. Bundled `@deepseek-ai/dsh` (later)
6. Saved remote instance, if connection mode is remote

If no official Web UI is found, the app stays on a host shell with **检测** and **设置**. The shell lists package managers already on `PATH` (`pnpm` first, then `npx`, `yarn`, `bunx`) and only runs an install/start command after you confirm. When the printed loopback port becomes ready, the official page opens.

Closing the window hides the app to the menu-bar tray. Quit from the tray. Only a process started by this app is stopped on quit; a reused local instance is left running.

## Package

Unsigned Apple Silicon DMG (no notarization):

```bash
pnpm dist:mac
```

Output: `release/dsh-app-0.1.0-arm64.dmg`. macOS will warn that the app is unsigned; open it from Finder or right-click → Open.

## Develop

Requires Node 22.15+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```
