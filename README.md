<p align="center">
  <img src="build/icon-source.svg" width="96" height="96" alt="dsh-desktop icon">
</p>

<h1 align="center">dsh-desktop</h1>

<p align="center">
  A thin macOS host for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>.<br>
  Start or connect to <code>dsh web</code>, then keep the official UI under a native tab bar.
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> ·
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#develop">Develop</a>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-111111">
  <img alt="electron" src="https://img.shields.io/badge/electron-37-47848f">
  <img alt="stack" src="https://img.shields.io/badge/ui-React%20%2B%20Tailwind%20%2B%20shadcn-111111">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-zh--CN%20%2F%20en-0ea5e9">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-22c55e">
</p>

This repo does **not** fork the official project. The desktop app only owns process lifecycle, connection, tray, and settings. Agent work and the official Web UI stay in DeepSeek Harness.

<p align="center">
  <img src="docs/screenshots/home.jpg" width="880" alt="Idle state: no local DeepSeek Harness service is running">
</p>

## Why this exists

DeepSeek Harness is a web app you usually start with `dsh web` or `pnpm dlx`. That works, but it is easy to lose the terminal, forget the port, or want a menubar app that just reconnects.

`dsh-desktop` is the missing shell:

- First launch stays idle. Nothing is installed until you confirm a start command.
- After that, the host can reuse `http://127.0.0.1:<port>` or start `dsh web` for you.
- Closing the window hides to the tray. `Cmd+Q`, **Quit** in the app menu, or **Quit** in the tray exits completely.

## Features

- **Thin host, official UI** — official pages run in a `WebContentsView` under a 44px tab bar
- **Confirm before install** — Settings lists `pnpm` / `npx` / `yarn` / `bunx`; **Start** is explicit
- **Smart reconnect** — reuse a live local port, or connect to a remote `http(s)` instance
- **Tray + single instance** — one process, reconnect from the menu bar
- **i18n** — Simplified Chinese and English; follows the system language unless you override it
- **Host chrome only** — the official DeepSeek Harness page keeps its own language

<p align="center">
  <img src="docs/screenshots/settings.jpg" width="880" alt="Settings: connection, start command, and language">
</p>

## Install

Requires **macOS on Apple Silicon**. The published DMG is unsigned.

```bash
pnpm install
pnpm dist:mac
```

Output:

- `release/dsh-desktop-0.1.0-arm64.dmg`
- `release/SHA256SUMS.txt`

macOS will warn that the app is unsigned. Open it from Finder, or right-click → **Open**.

If macOS says the app is **damaged** and cannot be opened, that is Gatekeeper quarantine on an unsigned download, not a broken binary. After moving it to `/Applications`, run:

```bash
sudo xattr -r -d com.apple.quarantine /Applications/dsh-desktop.app
```

Then open the app again.

Code signing and notarization need an Apple Developer ID. That is intentionally not done here.

## First run

1. Open the app. The local tab stays idle if `127.0.0.1:3080` is not already serving DeepSeek Harness.
2. Open **Settings**.
3. Pick a package manager that is already on this machine.
4. Click **Start**. The host writes that command to `settings.json` and streams logs in place.
5. When the official page is ready, it opens under the tab bar.

Optional:

- **Auto-start DeepSeek Harness** — next launch can spawn the saved command if the local port is down
- **Open at login** — packaged app only; starts hidden to the tray
- **Language** — System / 简体中文 / English. This only changes the host chrome.

## How connection works

The **local** tab only reuses `http://127.0.0.1:<port>` when that port is already the official UI (default `3080`). If it is down, the host starts `dsh web --port <port>` only after you have confirmed a package-manager command. It does not auto-spawn just because `pnpm` or an npx cache exists.

Remote tabs only probe their saved `http(s)` URL. A down remote never falls back to spawning a local process.

| Detected | Start command |
| --- | --- |
| pnpm | `pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --port 3080` |
| npx | `npx -y @deepseek-ai/dsh web --port 3080` |
| yarn | `yarn dlx @deepseek-ai/dsh web --port 3080` |
| bunx | `bunx @deepseek-ai/dsh web --port 3080` |

Packaged launches from Finder often miss Homebrew / pnpm. The host prepends `/opt/homebrew/bin`, `/usr/local/bin`, and the user's pnpm homes, and also reads `export PATH=` lines from shell profiles without executing those files.

## Develop

Requires Node 22.15+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

`pnpm dev` starts Vite on `127.0.0.1:5173`, then Electron. Renderer CSS/React edits hot-reload. Changes to `src/main` or new dependencies need a restart.

Host chrome is React + Tailwind CSS v4 + shadcn/ui. Official UI is a `WebContentsView`, so host HTML cannot cover it with `z-index`. Full-page host UI must hide that view; menus that drop below the tab bar use a native Electron menu. See [docs/host-overlays.md](docs/host-overlays.md).

`Cmd+,` opens Settings. `Cmd+R` reloads the official view, not the host chrome. `Cmd+Option+I` / `F12` toggles DevTools for the focused page.

More product detail: [docs/features.md](docs/features.md).

## Settings file

`settings.json` lives in Electron `userData` (on macOS, `~/Library/Application Support/dsh-desktop/`).

| Field | Meaning |
| --- | --- |
| `locale` | `system` / `zh-CN` / `en` |
| `autoStart` | Start the saved command when the app opens |
| `openAtLogin` | Login item, packaged app only |
| `lastPackageManager` | Last confirmed start command |
| `windowBounds` | Remembered window position |

Logs: `shell.log` for host events, `web.log` for start-command output.

## What this project is not

- Not a fork of [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- Not a translator for the official Web UI
- Not a signed / notarized Mac App Store build
- Not an auto-updater (`electron-updater` is intentionally unused)
- Not a Windows / Linux / Intel Mac package yet

## License

[MIT](LICENSE) © johnhom

DeepSeek Harness is a separate project with its own license.
