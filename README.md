# dsh-app

Thin Electron host for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This repo does **not** fork the official project. The desktop app only starts or connects to `dsh web` and keeps the official Web UI in a window.

已实现功能的完整说明见 [docs/features.md](docs/features.md)。

## Runtime order

1. Reuse `http://127.0.0.1:<port>` if it is already the official UI (default port `3080`, changeable in Settings)
2. `dsh` on `PATH`
3. Cached `@deepseek-ai/dsh` from `pnpm dlx` (`~/Library/Caches/pnpm/dlx`)
4. Cached `@deepseek-ai/dsh` from npx
5. Bundled `@deepseek-ai/dsh` (later)
6. Saved remote instance, if connection mode is remote

If no official Web UI is found, the app stays on a host shell with **检测** and **设置**. The shell lists package managers already on `PATH` (`pnpm` first, then `npx`, `yarn`, `bunx`) and only runs an install/start command after you confirm. When the printed loopback port becomes ready, the official page opens.

Closing the window hides the app to the menu-bar tray. Quit from the tray. A process started by this app is stopped as a process group on quit (including grandchildren from `pnpm dlx` / `npx`). A reused local instance is left running. A second launch focuses the existing window instead of starting another process.

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
