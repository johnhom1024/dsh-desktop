# dsh-desktop 功能说明

版本 `0.1.0`。薄 Electron 宿主：不 fork、不改官方 DeepSeek Harness UI。桌面端只负责启动或连接 `dsh web`，把官方页面放进窗口。

官方项目：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## 1. 定位与安全边界

| 宿主负责 | 官方 Harness 负责 |
| --- | --- |
| 进程、端口、托盘、设置、首次空状态、loopback 导航 | Agent / 官方 Web UI |

- 独立仓库，不 fork 官方仓
- 渲染进程：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`
- 外链走系统浏览器（`openExternal`），不在壳里打开任意站点
- 只有用户在设置里点「启动」后才会执行安装 / 启动命令；之后会把所选包管理器写入配置

---

## 2. 智能连接（运行时解析）

本机 tab 启动时只做两件事：

1. 探测已保存的本机端口 `http://127.0.0.1:<localPort>`（默认 **3080**），确认是官方 DeepSeek Harness 页就直接复用
2. 若端口没起来，且设置里打开了 **自动启动 DeepSeek Harness**、并已保存过启动命令（`lastPackageManager`），才用这条命令拉起 `dsh web --port <localPort>`

自动启动默认关闭。没保存过启动命令时**不会**再去扫 PATH 上的 `dsh`、`pnpm dlx` 缓存、npx 缓存或内置包并自动 spawn。这就是以前打开引导页后「我没点确认也开始跑命令」的原因。

远程 tab 只用保存的远程 URL；不可达时**不会**改去拉本机进程。

退出时：本应用自己拉起的子进程会停掉（含 `pnpm dlx` / `npx` 再拉起的孙进程，按进程组 `SIGTERM` → `SIGKILL`）；复用的本机 3080 **不会**被杀。

---

## 3. 首次使用与设置里的启动

主窗口是 Arc 式垂直侧边栏布局：左侧 208px 宿主侧栏（顶部 44px 头部区内嵌 macOS 红绿灯，往下是实例 tab 垂直列表，底部是设置 tab 和主题切换），右侧整块是官方 Web 的 `WebContentsView`，从 y=0 顶到窗口右上角。凡是会画出侧栏的宿主 UI（设置页、重命名弹窗、宿主 DevTools 检查）必须先摘掉官方视图；tab 三点菜单用系统原生 `Menu.popup`，不要用 HTML 下拉。菜单项左侧用系统图标：「重命名」、「刷新」和「浏览器打开」。详见 [host-overlays.md](host-overlays.md)。多实例（远程 tab / 加号）先关掉，以后再加。侧栏整条都是窗口拖拽区（含 tab 下方空白），只有按钮本身不拖。

没检测到官方 Web 时，本机 tab 显示空状态：「当前没有启动服务，首次使用请先去设置里设置」。不会在这个容器里列出安装命令，也不会自动执行。

设置页提供启动选项：

- 列出 PATH 里已有的包管理器（**pnpm 优先**，然后 npx / yarn / bunx）
- 连接卡片按状态展示：未连接只显示状态、IP、端口和「连接」；已连接再显示地址、来源和「重启服务」「终止服务」（远程实例不显示「重启服务」）
- 启动区只改启动端口；命令预览里的 `--port` 跟着变
- 改过启动端口后会出现 **保存**，只写入端口，不启动服务
- 选一个后点 **启动** 才执行命令，并写入 `lastPackageManager` 和启动端口
- 确认后先留在设置页，实时显示启动日志；子进程打印 loopback URL 且端口就绪后再切到官方页
- 点 **连接** 会按输入的 IP / 端口探测，不会自动 spawn；本机地址会写回 `localPort`
- **切换连接** 只断开当前视图，不终止端口上的服务，方便改地址后再连
- **重新检测** 放在连接卡片，用来刷新当前连接状态；启动卡片只负责启动
- 只有打开「自动启动 DeepSeek Harness」后，应用启动时才会按已保存命令后台拉起；此时本机 tab 显示启动中等待动画

确认后实际执行的命令（端口来自设置，不再用 `--port 0`）：

| 检测到 | 命令 |
| --- | --- |
| pnpm | `pnpm --config.dangerouslyAllowAllBuilds=true dlx @deepseek-ai/dsh web --port 3080` |
| npx | `npx -y @deepseek-ai/dsh web --port 3080` |
| yarn | `yarn dlx @deepseek-ai/dsh web --port 3080` |
| bunx | `bunx @deepseek-ai/dsh web --port 3080` |

新拉起和复用 / 探测都用设置里保存的 `localPort`，默认 3080。

pnpm 10+ 可能弹出「选择需要 build 的包」。桌面进程没有 TTY，答不了这个交互。所以 pnpm 这条命令会带 `dangerouslyAllowAllBuilds`，并设置 `CI=1`，避免卡住。如果日志里仍出现交互提示，宿主会立刻失败并留在设置页，而不是干等到超时。也可以改选 npx。

---

## 4. 窗口、托盘、单实例

- macOS 隐藏原生标题栏（`titleBarStyle: 'hiddenInset'`）：红绿灯按钮嵌进侧栏顶部 44px 头部区（`trafficLightPosition`，光学居中上提 3px），tab 列表从 44px 以下开始，不再有挤压问题
- 关主窗口：藏到菜单栏托盘，进程还在
- `Cmd+Q`、应用菜单「退出」、托盘「退出」都会真正退出（停掉本应用拉起的子进程）
- **单实例**：全机只跑一份。再点图标不会再开一个 Electron / 托盘 / `dsh web`，只把已有窗口拉到前台（最小化会先还原）
- 应用菜单（连上官方页之后也在）：
  - **设置…** `Cmd+,`
  - **刷新** `Cmd+R`：只刷新当前 DSH Web 页面，不重载宿主顶栏
  - **重新检测**（菜单 / 托盘）
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
| `localPort` | 1–65535，默认 3080。本机 tab 先探测这个端口 |
| `remoteUrl` | 仅 `http:` / `https:` |
| `openAtLogin` | 登录自启，默认关 |
| `autoStart` | 打开应用后是否自动拉起本机 `dsh web`，默认关 |
| `locale` | `system` / `zh-CN` / `en`。宿主界面语言，默认跟随系统。只影响顶栏、设置、托盘和应用菜单，不改官方 Web UI |
| `lastPackageManager` | 上次在设置里确认过的启动命令（pnpm / npm / yarn / bun） |
| `windowBounds` | 主窗口位置和大小 |

规则：

- 文件缺失或损坏时回到默认值
- 端口超范围、远程 URL 不是 http(s)：拒绝写入
- 设置页保存会与磁盘上已有字段合并，不会冲掉 `lastPackageManager` 和窗口位置
- 设置页会显示当前来源，以及远程失败等错误文案
- 设置页「终止服务」会停掉本机正在跑的 `dsh web`（含复用的 3080）；远程实例只断开连接，不会去杀远端进程
- 设置页「重启服务」= 先停掉本机 `dsh web`，再用已保存的启动命令拉起；全程留在设置页看启动日志，就绪后自动切回官方页。只在已连接且非远程实例时显示；没有保存过启动命令时会提示先检测

---

## 6. 登录自启

- 设置页开关「自动启动 DeepSeek Harness」默认关；打开后，应用启动时才会按已保存命令拉起本机服务
- 设置页开关「登录时自动启动」
- 仅 **打包后的 `.app` / DMG** 会调用 `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`
- `pnpm dev` **不会**写登录项，避免把仓库里的 Electron 开发进程注册进去
- 开机后藏到托盘（`openAsHidden`）
- 生效后可在 系统设置 → 登录项 里核对

---

## 7. 版本检测与更新（dsh 一键更新，壳只检查）

入口：设置页「检测更新」、托盘、应用菜单。

| 比较对象 | 数据来源 |
| --- | --- |
| `@deepseek-ai/dsh` | npm `latest`，与 PATH / pnpm dlx 缓存 / npx 缓存 / 已连接页面里读到的当前版本比（含 rc） |
| `dsh-desktop` 壳本身 | 仅当环境变量 `DSH_DESKTOP_GITHUB_REPO=owner/repo` 有值时，查该仓库 latest release tag |

设置页每行左边是项目名，右边是当前版本。区块右下角一个「检查更新」会同时查两项。发现新版本时，对应行右侧再出现「更新」按钮。dsh 行的「更新」会：停掉当前本机服务 → 用上次选择的包管理器以 `@deepseek-ai/dsh@latest` 重新拉起（绕过 dlx/npx 的版本缓存）→ 起来后自动复查版本；期间按钮显示加载动画，启动日志实时显示在设置页下方。`dsh-desktop` 壳本身的「更新」仍只复查版本（壳更新需要重新下载安装包，不做 `electron-updater` 自动下载）。`dsh-desktop` 没发到 npm，未设置上述变量时只显示当前应用版本，不会误报有新包。拉不到 latest 时 `updateAvailable` 为 false。

当 `DSH_DESKTOP_GITHUB_REPO` 已配置且能匹配当前架构的 DMG（`dsh-desktop-*-{arm64|x64}.dmg`）时，壳更新会同时携带 `downloadUrl`（直链）和 `releaseUrl`（HTML 页）。检测到新版本时顶栏弹一条 toast，标题「dsh-desktop 有新版本」，含「打开 Release 页面」和「复制下载链接」两个动作；点动作或复制后这条 toast 自动消失；同一个 tag 在一次会话内只提示一次。设置页 dsh-desktop 行也会多一个「打开 Release 页面」按钮。`shellOpenExternal` 只接受 `http:` / `https:` 协议，避免被注入 `file:` 等任意协议。

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

- 设置页在手动启动时实时显示 `pnpm dlx` 等命令的 stdout / stderr，完成前不跳走
- 同一份输出追加到 `userData/web.log`
- 宿主事件（连接失败、掉线）写到 `userData/shell.log`
- 日志带 ISO 时间戳

`userData` 在 macOS 上一般是：

`~/Library/Application Support/dsh-desktop/`

---

## 10. 远程失败与掉线回退

- 远程模式 URL 不通：提示 **远程实例不可达**，来源保持 `remote`，**不**去 spawn 本机 `dsh`
- 已连上官方页后，每 **8 秒**再探测一次；不通则回到本机空状态，文案为「DeepSeek Harness 已停止响应。」，避免白屏

---

## 11. 窗口记忆与上次包管理器

- 拖动 / 缩放主窗口后 300ms 写入 `windowBounds`（节流，避免狂写磁盘）
- 下次启动按上次位置打开；宽高最小 800×600
- 设置页默认勾选上次用过的包管理器；没有记录则勾列表第一项（通常是 pnpm）
- 重命名 tab 只改 `instances[].name` 并立刻写入 `settings.json`，下次打开还是这个名字；不会因此重新探测或重启 `dsh web`

---

## 12. 打包（macOS DMG）

```bash
pnpm dist:mac        # Apple Silicon arm64
pnpm dist:mac:intel  # Intel x64
```

流程：`build:main`（`tsc` + 拷 renderer HTML）→ 生成 `build/icon.png` → `electron-builder --mac dmg --arm64` 或 `--x64` → 写对应架构的 `SHA256SUMS-*.txt`。本地默认脚本仍只打 arm64，避免日常开发多打一份 Intel 包。

GitHub 上推 `v*` tag 会跑 `.github/workflows/release.yml` 的两个 job：一个 `pnpm dist:mac`，一个 `pnpm dist:mac:intel`，各自把对应 DMG 和校验和挂到该 tag 的 Release。不签名、不公证。`package.json` 的 `version` 应和 tag 一致（`v0.1.0` → `0.1.0`）。

beta 预发布走手动 tag（owiki 同款模式，不再用 `beta/*` 分支推送触发）：

- `./scripts/tag.sh` 查看现有 tag 和下一步建议；`./scripts/tag.sh beta` 在 HEAD 打 `vX.Y.Z-beta.N`（已有 beta.10 则提议 beta.11），`./scripts/tag.sh release` 打正式版 tag
- 脚本只本地打 tag，不 push；确认后手动 `git push gh <tag> && git push origin <tag>`
- tag 含 `-` 即 pre-release：GitHub 标 pre-release，且 `bump-main` job 跳过（不回写 main 的 `package.json`）；正式版 tag 才回写

产物：

- `release/dsh-desktop-0.1.0-arm64.dmg`（未签名、未公证，约 100MB）
- `release/dsh-desktop-0.1.0-x64.dmg`
- `release/SHA256SUMS-arm64.txt` / `release/SHA256SUMS-x64.txt`

说明：

- `appId`: `cn.johnhom.dsh-desktop`
- 图标来自本机官方页 `http://127.0.0.1:3080/favicon.svg` 的黑色鲸鱼，源文件在 `build/icon-source.svg`，打包时栅格化为 `build/icon.png`
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

宿主页是 Vite + React（`src/renderer/HostApp.tsx`），用 Testing Library + Vitest 测。截图流程只给人看，不算测试套件。

Electron 二进制不走 npm registry，项目 `.npmrc` 已设 `electron_mirror=https://npmmirror.com/mirrors/electron/`。

---

## 14. 明确没做

这些不是漏实现，是刻意不做或缺前置条件：

- Apple Developer ID 签名 / 公证
- `electron-updater` 自动下载安装
- 安装包内置整份 `@deepseek-ai/dsh`
- Windows / Linux 安装包
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
