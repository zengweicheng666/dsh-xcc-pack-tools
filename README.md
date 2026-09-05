# dsh-xcc-pack-tools

XCC-Deluxe 项目级「打包 / Web 构建 / 发布」插件，为 DeepSeek Harness 提供：

## Agent 工具（4 个）

| 工具 | 说明 |
|---|---|
| `xcc_pack` | 启动 UE 打包（**插件内建 UAT BuildCookRun**，不含 Web UI 构建步骤），参数：skipCompile / cleanCook / closeEditor / buildConfig / ue5Dir（单次引擎覆盖）/ validationMode（balanced、strict、compatibility）/ cookErrorPolicy（surface、ignore），立即返回 jobId |
| `xcc_web_build` | 启动 Web 构建（`Web\copy-dist-dev.ps1` 或 `copy-dist-prod.ps1`），mode: dev \| prod，立即返回 jobId |
| `xcc_release` | 启动发布（复制 `Saved\Windows` → 按当前项目名和日期生成的 `Saved\<项目名>-{日期}(-N)\` 并压缩为同名 zip），number 可指定编号，立即返回 jobId |
| `xcc_job` | 轮询任务进度（jobId → 状态/日志/耗时/退出码） |

打包类工具是「启动即返回」的异步模式（UE 打包耗时 1 小时级），用 `xcc_job` 轮询结果。

## 侧边栏 UI（dsh-better-sidebar 的 `打包` 分页）

- **总览（一键打包）**：对 ①UE 打包 → ②Web 构建 → ③复制压缩（发布）→ ④上传 四阶段做一键顺序编排。每个阶段卡保留对应分页的**全部参数**（引擎目录/保存与恢复、BuildConfig、跳过 C++/清 Cook/关 Editor；dev/prod 与目标目录、版本预览；发布编号/压缩工具/仅复制/压缩预览名称；上传本地文件/网盘目录/授权状态）。运行目标在 ① UAT 产物目录后显示，并由服务端自动扫描实际 `.exe`；未勾选的阶段自动跳过；任一阶段失败即中止（已产出物保留，可「重跑本阶段」）。运行中**每个阶段卡本身就是进度条**：fill 填充随该阶段执行增长 + 流光动画，✔ 完成 / ▶ 运行中 / ○ 待执行 / ⧗ 跳过 / ✖ 失败(红) 五态，顶部细条=整体进度（已完成启用阶段/启用总数）。服务端 `overviewStart/overviewPoll`：编排 job 复用四个既有执行器（不重复实现），逐阶段聚合日志与进度，可整体取消（级联取消当前子任务）。百度 App 凭据与 OAuth 配置仍在「上传」设置区，总览仅引用授权状态。
- **UE 打包**：**引擎路径由插件自身解析**——从工程 `.uproject` 的 `EngineAssociation` 读取 UE 版本（如 `5.7`），按 注册表（`HKLM\SOFTWARE\EpicGames\Unreal Engine\<版本>`）→ Epic 启动器记录（`LauncherInstalled.dat`）→ 常见安装目录 顺序自动定位；自动识别失败时在分页内手动填写引擎根目录并「保存为引擎目录」（按工程根持久化到 `~/.dsh/dsh-xcc-pack-tools-settings.json` 的 `enginePaths`，可「恢复自动识别」清除）。打包流程 = 检查/关闭 Unreal Editor →（可选）C++ 编译 →（可选）清理 Cook 缓存 → Cook & 打包（UAT，参数与仓库 package.ps1 一致但**不再调用它、也不含内联 Web UI 构建**）。BuildConfig 选择（Development/Shipping/Debug）、SkipCompile / CleanCook / CloseEditor 勾选（CloseEditor 会强制关闭运行中的 Unreal Editor，需显式勾选）；实时流式日志 + 耗时 + 取消。
- **Web 构建**：开发版(dev) / 生产版(prod) 单选，TargetDir 可覆盖；**仓库 `HTML/dist` 默认必须用 dev 构建（AGENTS.md 规则），prod 仅生产发布用**。与 UE 打包相互独立（UE 打包不再内联任何 Web 构建）。
- **发布**：按当前工程名自动计算下一个发布名 `{项目名}-{yyyyMMdd}`（当天首个无编号）或 `{项目名}-{yyyyMMdd}-N`（之后 -1、-2…），编号可手动改并实时校验冲突；第三阶段实时显示压缩预览名称；一键「复制命名」或「复制并压缩」（robocopy 复制 + 压缩；压缩工具自动优先 7-Zip，未安装时回退 .NET ZipFile，界面显示当前所用工具）；现有发布列表 + 运行按钮。
- **上传（百度网盘）**：直连百度开放平台 PCS 分片上传，**不依赖 bdpan CLI**。在插件设置中填写 App Key / Secret Key / App ID / Redirect URI / 应用根目录（Secret 与 Token 仅以 Windows DPAPI 加密保存在 `~/.dsh/dsh-xcc-pack-tools/settings.json`，界面不回显），完成 OAuth 授权后：自动匹配最新发布 zip（可改本地文件），指定目标目录（相对应用根 `/apps/<应用目录>/`），按 4MB 分片直传；**每成功一片即持久化 uploadid + 完成清单（`~/.dsh/dsh-xcc-pack-tools/baidu-upload-state/`），取消/刷新/重启后再次上传相同文件与路径自动续传**；进度 = 已完成分片字节 / 文件大小（精确百分比、速度、剩余、ETA）。

所有操作经服务端 `/pack/api/*` 路由执行（同源 fence 鉴权，项目根从会话工作副本向上查找 `*.uproject` 解析），与 agent 工具共用同一套执行核心。任务互斥（同类型同时只允许一个）、可取消（taskkill /T）。

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

- Windows（`powershell.exe` 5.1 可用即可，脚本执行统一走 `-NoProfile -ExecutionPolicy Bypass -File`；UAT 经 PowerShell 调用 RunUAT.bat 并透传退出码）。
- UE 打包：引擎根目录解析完全在插件内完成（不再依赖 `package.ps1` / `XCC_UE_DIR` 外部配置）：先看本次运行 `ue5Dir` 覆盖 → 按工程保存的 `enginePaths[工程根]` → `.uproject` `EngineAssociation` 版本对应的 注册表 → Epic 启动器 `LauncherInstalled.dat` → 常见安装目录（`C:\Program Files\Epic Games`、`D:\EpicLib`、`E:\Program Files\Epic Games`、`D:\Program Files\Epic Games`、`C:\Epic Games` 下的 `UE_<版本>`）→ 遗留环境变量 `XCC_UE_DIR`。全部失败时在分页内手动指定并保存（校验须含 `Engine\Build\BatchFiles\RunUAT.bat`）。仓库的 `package.ps1` 保持原样，仅供人工/团队直接运行。
- UE 打包的 C++ 编译：未勾选“跳过 C++ 编译”时，**同时重建 Game 与 Editor 两个目标**（`XCC` 与 `XCCEditor`，Win64 + 当前 BuildConfig，参数形态与 UAT 一致含 `-remoteini`）——Editor 目标产出的 `UnrealEditor-XCC.dll` 是 Cook 序列化蓝图 CDO 的依赖，不同步重建会导致增量 Cook 产出与运行时 exe 不匹配（打包版加载蓝图报 `Bad export index` 崩溃）。**编译发生时会自动给 UAT 追加 `-clean`**（防旧序列化缓存）。UAT 完成后会扫描 `Saved\Windows` 的实际 `.exe`（含嵌套 UAT 目录，自动排除常见辅助程序），并将选中的运行目标提供给总览/运行按钮；默认 `validationMode=balanced` 仅给出风险诊断并继续 UAT；需要发布门禁时可选 `strict`，希望尽量贴近 UE 编辑器行为时可选 `compatibility`。诊断会列出原因、风险、受影响文件和建议操作。Cook 错误默认显示并按 UAT 退出码处理；仅在明确选择 `cookErrorPolicy=ignore`（或兼容模式默认策略）时传入 `-IgnoreCookErrors`，此模式可能生成不完整包。
- 发布压缩：7-Zip 可选（自动检测常见安装路径与 PATH 中的 `7z.exe`；未安装时回退 .NET ZipFile）。可用 `SEVEN_ZIP` 环境变量指定 7z.exe 路径。
- 百度网盘上传（直连模式）：需要自行在[百度网盘开放平台](https://pan.baidu.com/union)创建应用并登记 Redirect URI；应用根目录必须与平台分配的 `/apps/<应用目录>` 一致。OAuth 使用官方 `openapi.baidu.com` 授权码模式，Token 自动刷新（refresh_token 一次性使用，每次刷新后保存新值）。
- 输出解码：优先 UTF-8，失败回退 GBK（中文 Windows 控制台）。
