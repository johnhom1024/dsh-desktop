# dsh-desktop

薄 Electron 宿主，不 fork 官方 DeepSeek Harness。宿主是 Arc 式垂直侧边栏（React + Tailwind + shadcn）：左侧 208px 放 tab 和设置；官方 UI 是侧栏右侧的 `WebContentsView`，从 y=0 顶到窗口右上角。

完整功能见 `docs/features.md`。叠层细则见 `docs/host-overlays.md`。

## 改宿主 UI 必读

官方页不是 iframe。宿主 HTML 的 `z-index`、Portal、`position: fixed` 都压不过 `WebContentsView`。只有左侧 208px 侧栏这条不会被盖住。

新控件先问：会不会画出侧栏？

| 情况 | 做法 |
| --- | --- |
| Dialog / Sheet / 设置页 / 检查宿主元素 | `acquireOverlay()`，关时 `releaseOverlay()`（引用计数） |
| 往侧栏右侧展开的菜单、tooltip | Electron `Menu.popup()`，不要用 HTML / Radix Dropdown |
| 只在侧栏内的按钮、tab、图标 | 可以继续用 HTML |

侧栏整条都是窗口拖拽区（含红绿灯头部与 tab 下方空白），不要给 `#tabs` 整体加 no-drag。

不要把官方页改成 iframe，也不要改官方 DSH UI。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

改 `src/main` 或加依赖后重启 `pnpm dev`。渲染层 CSS/React 走 Vite HMR。
