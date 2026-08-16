# 宿主叠层规则

官方 DeepSeek Harness 不是宿主 HTML 里的 iframe，而是贴在 44px 顶栏下面的 Electron `WebContentsView`。它是**原生层**，永远盖住宿主页面里顶栏以下的任何 DOM。

`z-index`、Portal、`position: fixed` 都解决不了。这不是 CSS bug。

```
┌─────────────────────────────────────┐
│ 宿主 HTML 顶栏（约 44px）            │  ← 只有这一条不会被盖住
├─────────────────────────────────────┤
│ WebContentsView：官方 DSH 页面       │  ← 原生层
│ （盖住下方全部宿主 DOM）             │
└─────────────────────────────────────┘
```

## 开发新功能时先问

这个 UI 会不会画出顶栏，盖到官方页区域？

| 会画出顶栏 | 做法 |
| --- | --- |
| Dialog / Sheet / 全页设置 / 检查宿主元素 | 先 `acquireOverlay()`，摘掉官方视图；关掉时 `releaseOverlay()` |
| 下拉菜单、右键菜单、tooltip 往下展开 | 用 Electron `Menu.popup()` 等**系统原生菜单**，不要用 HTML 下拉 |
| 只在 44px 顶栏内的按钮、tab、图标 | 可以直接做 HTML |

`acquireOverlay` / `releaseOverlay` 是引用计数。设置页已经占一层时，再开重命名弹窗要再 acquire 一次，关弹窗只 release 一次，不能把设置页也盖回去。

## 现成入口

- 摘视图：`api.acquireOverlay()` / `api.releaseOverlay()`，主进程 `overlayCount`
- 设置页：`openSettings()` / `closeSettingsOverlay()`，内部也走同一套计数
- 实例菜单：`api.popupInstanceMenu({ instanceId })` → 原生 `Menu.popup`（重命名 / 刷新 / 浏览器打开，左侧系统图标）
- 宿主 DevTools 检查元素：打开时同样挡住官方视图

## 明确不要

- 不要再加一层 HTML 去「盖住」官方页
- 不要把官方 DSH 改成 iframe 来换 z-index
- 不要在官方页上叠宿主 DOM
