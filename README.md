# dsh-app

Thin Electron host for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This repo does **not** fork the official project. The desktop app only starts or connects to `dsh web` and keeps the official Web UI under a host tab bar.

已实现功能的完整说明见 [docs/features.md](docs/features.md)。

## Runtime order

The **local** tab still discovers a runtime in this order:

1. Reuse `http://127.0.0.1:<port>` if it is already the official UI (default port `3080`)
2. `dsh` on `PATH`
3. Cached `@deepseek-ai/dsh` from `pnpm dlx` (`~/Library/Caches/pnpm/dlx`)
4. Cached `@deepseek-ai/dsh` from npx
5. Bundled `@deepseek-ai/dsh` (later)

Remote tabs only probe their saved `http(s)` URL. A down remote never falls back to spawning local `dsh`.

The host chrome is a Vite + React page styled with Tailwind CSS v4 and shadcn/ui. The tab bar currently has one local instance plus a Settings tab. Official UI is a `WebContentsView` below the 44px tab bar, so host HTML cannot cover it with `z-index`. Full-page host UI must hide that view; menus that drop below the tab bar must use a native Electron menu. See [docs/host-overlays.md](docs/host-overlays.md). Multi-instance tabs are deferred. `pnpm dev` starts Vite on `127.0.0.1:5173` then Electron.

In development, `Cmd+R` reloads the **host** page (not the official DSH view). `Shift+Cmd+R` still reconnects. `Cmd+Option+I` / `F12` toggles DevTools for the focused page (host chrome or the official view). Renderer CSS/React edits hot-reload through Vite; adding a new dependency or changing `src/main` needs a restart of `pnpm dev`.

Packaged launches from Finder often miss Homebrew / pnpm. The host prepends `/opt/homebrew/bin`, `/usr/local/bin`, and the user's pnpm homes, and also reads `export PATH=` lines from `~/.zprofile` / `~/.zshrc` without executing those files.

Install/start output is streamed on the host shell and appended to `web.log` under Electron `userData`. Host events go to `shell.log`. Remote mode never falls back to spawning a local process: if the saved URL is down, settings show **远程实例不可达**. After a successful connect, the menu and tray still expose **设置** / **重新检测**. Window size is remembered. If a connected page stops answering, the host returns to the shell.

Settings can enable **open at login** (packaged app only; writes a macOS login item and starts hidden to the tray). **Check for updates** compares `@deepseek-ai/dsh` against npm. If `DSH_APP_GITHUB_REPO` is set (`owner/repo`), the app version is compared to that repo's latest GitHub release tag. `dsh-app` itself is not published to npm.

## Package

Unsigned Apple Silicon DMG (no notarization):

```bash
pnpm dist:mac
```

Output: `release/dsh-app-0.1.0-arm64.dmg` plus `release/SHA256SUMS.txt`. macOS will warn that the app is unsigned; open it from Finder or right-click → Open. Code signing / notarization needs an Apple Developer ID and is not done here.

## Develop

Requires Node 22.15+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```
