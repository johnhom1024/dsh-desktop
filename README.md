# dsh-app

Thin Electron host for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This repo does **not** fork the official project. The desktop app only starts or connects to `dsh web` and keeps the official Web UI in a window.

## Runtime order

1. Reuse `http://127.0.0.1:3080` if it is already the official UI
2. `dsh` on `PATH`
3. Cached `@deepseek-ai/dsh` from `pnpm dlx` (`~/Library/Caches/pnpm/dlx`)
4. Cached `@deepseek-ai/dsh` from npx
5. Bundled `@deepseek-ai/dsh` (later)
6. Saved remote instance, if connection mode is remote

Closing the window hides the app to the menu-bar tray. Quit from the tray. Only a process started by this app is stopped on quit; a reused `3080` instance is left running.

## Develop

Requires Node 22.15+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```
