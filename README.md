# dsh-app

Thin Electron host for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

This repo does **not** fork the official project. The desktop app only starts or connects to `dsh web` and keeps the official Web UI in a window.

## Runtime order

1. Reuse `http://127.0.0.1:3080` if it is already the official UI
2. `dsh` on `PATH`
3. Cached `@deepseek-ai/dsh` from npx
4. Bundled `@deepseek-ai/dsh` (later)
5. Saved remote instance (for example NAS)

## Develop

Requires Node 22.15+ and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```
