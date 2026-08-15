# dsh-app 功能说明

版本 `0.1.0`。薄 Electron 宿主：不 fork、不改官方 DeepSeek Harness UI。桌面端只负责启动或连接 `dsh web`，把官方页面放进窗口。

官方项目：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## 1. 定位与安全边界

| 宿主负责 | 官方 Harness 负责 |
| --- | --- |
| 进程、端口、托盘、设置、首次外壳、loopback 导航 | Agent / 官方 Web UI |

- 独立仓库，不 fork 官方仓
- 渲染进程：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`
- 外链走系统浏览器（`openExternal`），不在壳里打开任意站点
- 只有用户点「确认并启动」后才会执行安装 / 启动命令

---

## 2. 智能连接（运行时解析）

设置里三种模式：

| 模式 | 行为 |
| --- | --- |
| **智能**（默认） | 按下面顺序找一个可用来源 |
| **仅本机** | 只走本机探测 / PATH / 缓存 / 内置；绝不返回远程 |
| **远程实例** | 只用保存的 `remoteUrl`；不可达时**不会**改去拉本机进程 |

智能模式顺序：

1. 探测已保存的本机端口 `http://127.0.0.1:<localPort>`（默认 **3080**），确认是官方 DeepSeek Harness 页
2. `PATH` 上的 `dsh`
3. `pnpm dlx` 缓存：`~/Library/Caches/pnpm/dlx`
4. npx 缓存
5. 安装包内置的 `@deepseek-ai/dsh`（尚未打进包）
6. 仅当模式为远程时，使用已保存的远程 URL

退出时：本应用自己拉起的子进程会停掉（含 `pnpm dlx` / `npx` 再拉起的孙进程，按进程组 `SIGTERM` → `SIGKILL`）；复用的本机 3080 **不会**被杀。

---

## 3. 首次外壳

主窗口永远保留 44px 宿主顶栏。当前先做单实例：左边「设置」tab，右边本机实例 tab。官方 Web 用 `WebContentsView` 贴在顶栏下面。凡是会画出顶栏的宿主 UI（设置页、重命名弹窗、宿主 DevTools 检查）必须先摘掉官方视图；tab 三点菜单用系统原生 `Menu.popup`，不要用 HTML 下拉。详见 [host-overlays.md](host-overlays.md)。多实例（远程 tab / 加号）先关掉，以后再加。

没检测到官方 Web 时，主窗口停在宿主外壳（不是白屏、也不是静默失败）。

外壳提供：

- **检测**：重新走智能连接
- **设置**：打开连接设置窗
- 列出 PATH 里已有的包管理器（**pnpm 优先**，然后 npx / yarn / bunx）
- 选一个后点 **确认并启动** 才执行命令
- 子进程打印 loopback URL 且端口就绪后，切到官方页

确认后实际执行的命令：

| 检测到 | 命令 |
| --- | --- |
| pnpm | `pnpm dlx @deepseek-ai/dsh web --port 0` |
| npx | `npx -y @deepseek-ai/dsh web --port 0` |
| yarn | `yarn dlx @deepseek-ai/dsh web --port 0` |
| bunx | `bunx @deepseek-ai/dsh web --port 0` |

`--port 0` 只用于**新拉起**的服务器（由操作系统分配端口）。复用 / 探测用的是设置里保存的 `localPort`，不是 0。

---

## 4. 窗口、托盘、单实例

- 关主窗口：藏到菜单栏托盘，进程还在
- 从托盘退出才真正退出
- **单实例**：全机只跑一份。再点图标不会再开一个 Electron / 托盘 / `dsh web`，只把已有窗口拉到前台（最小化会先还原）
- 应用菜单（连上官方页之后也在）：
  - **设置…** `Cmd+,`
  - **重新检测** `Cmd+R`（开发模式下 `Cmd+R` 重载宿主页，`Shift+Cmd+R` 才是重新检测）
  - **开发者工具** `Cmd+Option+I` / `Cmd+Option+J` / `F12`（Windows/Linux 为 `Ctrl+Shift+I` / `Ctrl+Shift+J`）
  - **检测更新…**
- 官方 `WebContentsView` 获得焦点时，快捷键仍由主进程拦截，不会变成只刷新内部网页。开发者工具打开的是**当前焦点页**：点在官方 UI 上就查官方页，点在顶栏就查宿主。检查宿主元素时会暂时摘掉官方视图，否则原生层会盖住高亮。
- 托盘菜单：显示窗口、重新检测、连接设置、检测更新、退出
- 托盘状态：未连接显示 `dsh`；已连接显示 `dsh ✓`，tooltip 写来源和端口（例如 `已连接 · 本机 3080` / `已连接 · 远程 192.168.31.229:3080`）

---

## 5. 连接设置

设置文件：`settings.json`，位于 Electron `userData`。

| 字段 | 含义 |
| --- | --- |
| `connectionMode` | `smart` / `local-only` / `remote` |
| `localPort` | 1–65535，默认 3080。智能模式先探测这个端口 |
| `remoteUrl` | 仅 `http:` / `https:` |
| `openAtLogin` | 登录自启，默认关 |
| `lastPackageManager` | 上次在外壳选中的包管理器 |
| `windowBounds` | 主窗口位置和大小 |

规则：

- 文件缺失或损坏时回到默认值
- 端口超范围、远程 URL 不是 http(s)：拒绝写入
- 设置页保存会与磁盘上已有字段合并，不会冲掉 `lastPackageManager` 和窗口位置
- 设置页会显示当前来源，以及远程失败等错误文案

---

## 6. 登录自启

- 设置页开关「登录时自动启动」
- 仅 **打包后的 `.app` / DMG** 会调用 `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`
- `pnpm dev` **不会**写登录项，避免把仓库里的 Electron 开发进程注册进去
- 开机后藏到托盘（`openAsHidden`）
- 生效后可在 系统设置 → 登录项 里核对

---

## 7. 版本检测（只检查，不下载安装）

入口：设置页「检测更新」、托盘、应用菜单。

| 比较对象 | 数据来源 |
| --- | --- |
| `@deepseek-ai/dsh` | npm `latest`，与本机缓存 / 内置版本比（含 rc） |
| `dsh-app` 壳本身 | 仅当环境变量 `DSH_APP_GITHUB_REPO=owner/repo` 有值时，查该仓库 latest release tag |

`dsh-app` 没发到 npm，未设置上述变量时只显示当前应用版本，不会误报有新包。拉不到 latest 时 `updateAvailable` 为 false。不做 `electron-updater` 自动下载。

---

## 8. 打包后补 PATH

从 Finder 打开 `.app` 时，GUI 进程通常看不到 Homebrew / pnpm。启动最早会调用 `repairProcessPath()`（在单实例锁之前），写入 `process.env.PATH`。

会前置这些目录（已在 PATH 里的不挪位置）：

- `/opt/homebrew/bin`
- `/usr/local/bin`
- `~/Library/pnpm`
- `~/.local/share/pnpm`

另外只读解析 `~/.zprofile`、`~/.zshrc`、`~/.bash_profile`、`~/.profile` 里的 `export PATH=` / `PATH=`，展开 `$HOME`。**不会执行**这些文件。

之后的 `which` 和「检测包管理器」都走补过的 PATH。

---

## 9. 安装过程日志

- 外壳页实时显示 `pnpm dlx` 等命令的 stdout / stderr
- 同一份输出追加到 `userData/web.log`
- 宿主事件（连接失败、掉线）写到 `userData/shell.log`
- 日志带 ISO 时间戳

`userData` 在 macOS 上一般是：

`~/Library/Application Support/dsh-app/`

---

## 10. 远程失败与掉线回退

- 远程模式 URL 不通：提示 **远程实例不可达**，来源保持 `remote`，**不**去 spawn 本机 `dsh`
- 已连上官方页后，每 **8 秒**再探测一次；不通则回到外壳，文案为「DeepSeek Harness 已停止响应，已回到外壳。」，避免白屏

---

## 11. 窗口记忆与上次包管理器

- 拖动 / 缩放主窗口后 300ms 写入 `windowBounds`（节流，避免狂写磁盘）
- 下次启动按上次位置打开；宽高最小 800×600
- 外壳默认勾选上次用过的包管理器；没有记录则勾列表第一项（通常是 pnpm）

---

## 12. 打包（macOS arm64 DMG）

```bash
pnpm dist:mac
```

流程：`build:main`（`tsc` + 拷 renderer HTML）→ 生成 `build/icon.png` → `electron-builder --mac dmg --arm64` → 写 `release/SHA256SUMS.txt`。

产物：

- `release/dsh-app-0.1.0-arm64.dmg`（未签名、未公证，约 100MB）
- `release/SHA256SUMS.txt`

说明：

- `appId`: `cn.johnhong.dsh-app`
- 图标由 `scripts/write-icon.mjs` 生成蓝色圆形 PNG（256×256）
- 打开未签名应用：访达里右键 → 打开
- **签名 + 公证需要 Apple Developer ID，当前不做**

---

## 13. 开发命令

需要 Node 22.15+ 和 pnpm 8.11。

```bash
pnpm install
pnpm typecheck    # tsc --noEmit
pnpm test         # tsx --test src/main/*.test.ts && vitest run
pnpm dev          # Vite 5173 + Electron（不要依赖全局 electron）
```

外壳页是 Vite + React（`src/renderer/HostApp.tsx`），用 Testing Library + Vitest 测。截图流程只给人看，不算测试套件。

Electron 二进制不走 npm registry，项目 `.npmrc` 已设 `electron_mirror=https://npmmirror.com/mirrors/electron/`。

---

## 14. 明确没做

这些不是漏实现，是刻意不做或缺前置条件：

- Apple Developer ID 签名 / 公证
- `electron-updater` 自动下载安装
- 安装包内置整份 `@deepseek-ai/dsh`
- Intel Mac / Windows / Linux 安装包
- 扫局域网 NAS
- 改官方 UI、主题、插件市场

---

## 15. 关键源码

| 模块 | 文件 |
| --- | --- |
| 启动编排 / IPC / 看门狗 | `src/main/index.ts` |
| 运行时解析 | `src/main/runtime.ts` |
| 设置读写 | `src/main/settings.ts` |
| 探测官方页 | `src/main/probe.ts` |
| 拉起 `dsh web` | `src/main/harness-process.ts` |
| 包管理器检测 | `src/main/package-managers.ts` |
| 打包后 PATH | `src/main/path-repair.ts` |
| 单实例 | `src/main/single-instance.ts` |
| 版本比较 | `src/main/updates.ts` |
| 托盘文案 / 窗口几何 / 日志 | `src/main/host-state.ts` |
| 窗口 / 宿主页 | `src/main/window.ts`、`src/renderer/HostApp.tsx`、`src/renderer/index.html` |
