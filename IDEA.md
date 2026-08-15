为 deepseek-harness 写一个 macOS 应用。

独立 Electron host：不 fork、不改官方 UI。先复用本机 3080；没有服务时停在空状态，等用户在设置里确认启动命令后再拉起 `dsh web --port 3080`，并支持连 NAS 远程实例。
