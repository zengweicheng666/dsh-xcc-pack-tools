# dsh-xcc-pack-tools

XCC-Deluxe 项目级「打包 / Web 构建 / 发布」插件，为 DeepSeek Harness 提供：

## Agent 工具（4 个）

| 工具 | 说明 |
|---|---|
| `xcc_pack` | 启动 UE 打包（调用项目根 `package.ps1`），参数：skipCompile / skipWebBuild / cleanCook / closeEditor / buildConfig / ue5Dir，立即返回 jobId |
| `xcc_web_build` | 启动 Web 构建（`Web\copy-dist-dev.ps1` 或 `copy-dist-prod.ps1`），mode: dev \| prod，立即返回 jobId |
| `xcc_release` | 启动发布（复制 `Saved\Windows` → `Saved\XCC-Deluxe-{日期}(-N)\` 并压缩为同名 zip），number 可指定编号，立即返回 jobId |
| `xcc_job` | 轮询任务进度（jobId → 状态/日志/耗时/退出码） |

打包类工具是「启动即返回」的异步模式（UE 打包耗时 1 小时级），用 `xcc_job` 轮询结果。

## 侧边栏 UI（dsh-better-sidebar 的 `打包` 分页）

- **UE 打包**：BuildConfig 选择（Development/Shipping/Debug）、SkipCompile / SkipWebBuild / CleanCook / CloseEditor 勾选（CloseEditor 会强制关闭运行中的 Unreal Editor，需显式勾选）、UE5Dir 覆盖输入；实时流式日志 + 耗时 + 取消。
- **Web 构建**：开发版(dev) / 生产版(prod) 单选，TargetDir 可覆盖；**仓库 `HTML/dist` 默认必须用 dev 构建（AGENTS.md 规则），prod 仅生产发布用**。
- **发布**：自动计算下一个发布名 `XCC-Deluxe-{yyyyMMdd}`（当天首个无编号）或 `XCC-Deluxe-{yyyyMMdd}-N`（之后 -1、-2…），编号可手动改并实时校验冲突；一键「复制命名」或「复制并压缩」（robocopy 复制 + 压缩；压缩工具自动优先 7-Zip，未安装时回退 .NET ZipFile，界面显示当前所用工具）；现有发布列表 + 运行按钮。

所有操作经服务端 `/pack/api/*` 路由执行（同源 fence 鉴权，项目根从会话工作副本向上查找 `XCC.uproject` 解析），与 agent 工具共用同一套执行核心。任务互斥（同类型同时只允许一个）、可取消（taskkill /T）。

## 安装

```sh
# 在 profile 目录（如 C:\Users\zengw\.dsh\profiles\web）下执行
pnpm add file:./plugins/dsh-xcc-pack-tools
```

并确保 `package.json` 的 `dsh.profile.bundles` 中包含 `dsh-xcc-pack-tools`。重启 dsh web 后生效。

## 开发

- 改 `lib/client.js`：`Copy-Item` 覆盖 `node_modules\dsh-xcc-pack-tools\lib\client.js` 后刷新页面即生效（客户端 bundle 实时读盘，无需重启）。
- 改 `lib/index.js`：覆盖后需重启 dsh web。

## 前提

- Windows（`powershell.exe` 5.1 可用即可，脚本执行统一走 `-NoProfile -ExecutionPolicy Bypass -File`）。
- UE 打包：`package.ps1` 的 UE 5.7 解析候选（`-UE5Dir` → `$env:XCC_UE_DIR` → `E:\Program Files\Epic Games\UE_5.7` → `D:\EpicLib\UE_5.7`）。
- 发布压缩：7-Zip 可选（自动检测常见安装路径与 PATH 中的 `7z.exe`；未安装时回退 .NET ZipFile）。可用 `SEVEN_ZIP` 环境变量指定 7z.exe 路径。
- 输出解码：优先 UTF-8，失败回退 GBK（中文 Windows 控制台）。
