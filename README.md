# 🇨🇳 Microsoft Rewards Script（本地化版）🎯

**简介**
- 基于 [`TheNetsky/Microsoft-Rewards-Script`](https://github.com/TheNetsky/Microsoft-Rewards-Script) 的 v3 版本进行本地化改造，面向国内用户优化网络与使用体验。
- 自动完成每日集、更多推广、打卡、桌面/移动搜索、每日签到、阅读赚钱等任务。
- 针对国内环境适配：中文日志输出、国内热搜词源、镜像加速与代理支持。
- 设计和用法参考了 [`chiihero/Microsoft-Rewards-Script`](https://github.com/chiihero/Microsoft-Rewards-Script)，并结合本项目的配置结构与实现。

**主要改动**
- 中文日志与提示，便于排障与理解流程。
- 国内热词源支持与回退：
  - 今日头条热榜：`src/functions/QueryEngine.ts:150`
  - Bing Trending Topics 回退：`src/functions/QueryEngine.ts:260`
  - Google Trends 在国内源不可用时使用：`src/functions/QueryEngine.ts:13`
- 本地关键词文件可选：`src/functions/queries.json:1`，由 `SearchOnBing` 动态加载：`src/functions/activities/browser/SearchOnBing.ts:223`
- 查询生成链路与代理支持：`src/functions/QueryEngine.ts` 与 `src/util/Axios.ts:8`
- 账户加载逻辑支持开发模式：`src/util/Load.ts:11`（命令行 `-dev` 时优先 `accounts.dev.json`：`src/util/Load.ts:15`）

## 🚀 快速开始
- 环境要求：`Node.js >= 18`
- 安装依赖（建议使用国内镜像源加速）：
  - `npm config set registry https://registry.npmmirror.com`
  - `npm ci --ignore-scripts`
- 初始化配置与账户文件：
  - 复制示例文件并填写你的信息
    - `cp src/accounts.example.json src/accounts.json`（示例：`src/accounts.example.json:1`）
    - `cp src/config.example.json src/config.json`（示例：`src/config.example.json:1`）
- 编译与运行：
  - 编译：`npm run build`
  - 运行：`npm start`
  - 开发模式（若存在 `accounts.dev.json`）：`npm run dev`
  - 直接以 TS 运行主入口：`npm run ts-start`

**国内加速与浏览器安装提示**
- 若遇到浏览器未安装或缺失，执行：`npx patchright install chromium`
- 建议设置下载镜像源（终端一次性设置）：
  - macOS/Linux：`export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/`
  - Windows PowerShell：`$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright/"`

## ⚙️ 配置说明
- 配置文件路径：`src/config.json`（示例：`src/config.example.json:1`）
- 下表列出关键配置项与默认值，已按主题分组，便于对照与修改。

**Core / 核心**

| 键 | 描述 | 默认值 |
|---|---|---|
| `baseURL` | Microsoft Rewards 基础地址 | `https://rewards.bing.com` |
| `sessionPath` | 浏览器会话存储目录 | `sessions` |
| `clusters` | 并发账户集群数量 | `1` |
| `runOnZeroPoints` | 可赚积分为 0 时是否仍运行 | `false` |
| `errorDiagnostics` | 输出错误诊断文件以便排障 | `true` |
| `debugLogs` | 打印调试日志 | `false` |

**Browser / 浏览器**

| 键 | 描述 | 默认值 |
|---|---|---|
| `headless` | 无头模式运行浏览器 | `false` |
| `globalTimeout` | 全局操作超时时间 | `"30sec"` |

**Fingerprinting / 指纹**

| 键 | 描述 | 默认值 |
|---|---|---|
| `saveFingerprint.mobile` | 复用移动设备指纹 | `true` |
| `saveFingerprint.desktop` | 复用桌面设备指纹 | `true` |

**Workers (Tasks) / 任务开关**

| 键 | 描述 | 默认值 |
|---|---|---|
| `workers.doDailySet` | 完成每日集 | `true` |
| `workers.doMorePromotions` | 完成更多推广 | `true` |
| `workers.doPunchCards` | 完成打卡 | `true` |
| `workers.doAppPromotions` | 完成应用推广 | `true` |
| `workers.doDesktopSearch` | 执行桌面搜索 | `true` |
| `workers.doMobileSearch` | 执行移动搜索 | `true` |
| `workers.doDailyCheckIn` | 完成每日签到 | `true` |
| `workers.doReadToEarn` | 完成阅读赚钱 | `true` |

**Search / 搜索**

| 键 | 描述 | 默认值 |
|---|---|---|
| `searchOnBingLocalQueries` | 使用本地查询列表（`src/functions/queries.json`） | `false` |
| `searchSettings.scrollRandomResults` | 随机滚动搜索结果页 | `true` |
| `searchSettings.clickRandomResults` | 随机点击搜索结果链接 | `true` |
| `searchSettings.parallelSearching` | 桌面与移动并行搜索 | `true` |
| `searchSettings.searchResultVisitTime` | 访问结果页停留时长 | `"10sec"` |
| `searchSettings.searchDelay.min` | 搜索之间的最小延迟 | `"3min"` |
| `searchSettings.searchDelay.max` | 搜索之间的最大延迟 | `"8min"` |
| `searchSettings.readDelay.min` | 阅读之间的最小延迟 | `"3min"` |
| `searchSettings.readDelay.max` | 阅读之间的最大延迟 | `"5min"` |

**Proxy / 代理**

| 键 | 描述 | 默认值 |
|---|---|---|
| `proxy.queryEngine` | 查询引擎调用是否通过代理 | `true` |

**Logging & Webhook / 日志与通知**

| 键 | 描述 | 默认值 |
|---|---|---|
| `consoleLogFilter.enabled` | 控制台日志过滤开关 | `false` |
| `consoleLogFilter.mode` | 过滤模式：`whitelist` 或 `blacklist` | `"whitelist"` |
| `consoleLogFilter.levels` | 控制台输出等级 | `["error","warn"]` |
| `consoleLogFilter.keywords` | 关键词过滤 | `["starting account"]` |
| `consoleLogFilter.regexPatterns` | 正则匹配 | `[]` |
| `webhook.discord.enabled` | Discord Webhook 开关 | `false` |
| `webhook.discord.url` | Discord Webhook 地址 | `""` |
| `webhook.ntfy.enabled` | ntfy 推送开关 | `false` |
| `webhook.ntfy.url` | ntfy 服务器地址 | `""` |
| `webhook.ntfy.topic` | ntfy 主题 | `""` |
| `webhook.ntfy.token` | ntfy 访问令牌 | `""` |
| `webhook.ntfy.title` | 推送标题 | `"Microsoft-Rewards-Script"` |
| `webhook.ntfy.tags` | 推送标签 | `["bot","notify"]` |
| `webhook.ntfy.priority` | 推送优先级（1–5） | `3` |
| `webhook.webhookLogFilter.enabled` | Webhook 日志过滤开关 | `false` |
| `webhook.webhookLogFilter.mode` | 过滤模式 | `"whitelist"` |
| `webhook.webhookLogFilter.levels` | 推送等级 | `["error"]` |
| `webhook.webhookLogFilter.keywords` | 推送关键词 | `["starting account","select number","collected"]` |
| `webhook.webhookLogFilter.regexPatterns` | 推送正则 | `[]` |

**Accounts / 账户文件结构**
- 位置：`src/accounts.json`（示例：`src/accounts.example.json:1`）

| 键 | 描述 | 默认值/示例 |
|---|---|---|
| `email` | 账户邮箱 | `"email_1"` |
| `password` | 账户密码 | `"password_1"` |
| `totp` | 2FA TOTP 秘钥（可选） | `""` |
| `geoLocale` | 地区码（`auto` 或国家代码） | `"auto"` |
| `proxy.proxyAxios` | 是否对 API 请求启用代理 | `true` |
| `proxy.url` | 代理地址 | `""` |
| `proxy.port` | 代理端口 | `0` |
| `proxy.username` | 代理用户名 | `""` |
| `proxy.password` | 代理密码 | `""` |

## 🐳 Docker 部署
- 参考 `compose.yaml`，默认挂载与环境变量已配置。
- 挂载：
  - `./src/accounts.json:/usr/src/microsoft-rewards-script/dist/accounts.json:ro`
  - `./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json:ro`
  - `./sessions:/usr/src/microsoft-rewards-script/dist/browser/sessions`（可选：持久化登录）
- 环境变量：
  - `TZ=Asia/Shanghai`（时区）
  - `CRON_SCHEDULE='0 7 * * *'`（调度）
  - `RUN_ON_START='true'`（容器启动即运行一次）
  - `SKIP_RANDOM_SLEEP='false'`（可搭配 `MIN_SLEEP_MINUTES` / `MAX_SLEEP_MINUTES`）
  - `STUCK_PROCESS_TIMEOUT_HOURS`（卡死自愈，默认 8 小时，见 `compose.yaml:24`）
- 启动：`docker compose up -d`
- 入口脚本与调度：
  - 入口：`scripts/docker/entrypoint.sh:1`
  - 每日任务：`scripts/docker/run_daily.sh:146`

### ⚠️ Synology 群晖 提示
- Container Manager 不支持 `cpus` 资源限制，请在 `compose.yaml` 注释或移除 `cpus: 2`（见 `compose.yaml:29`）。
- 群晖 Container Manager 不支持 BuildKit 变量自动处理，首次构建运行请在终端执行：`DOCKER_BUILDKIT=1 sudo docker compose up -d`

## 🧪 工作原理速览
- 主入口：`src/index.ts:1`
  - 加载配置与账户：`src/util/Load.ts:11`
  - 任务编排与统计：`src/index.ts:241`
- 搜索关键词生成与来源：
  - Google Trends：`src/functions/QueryEngine.ts:13`
  - 国内热词（今日头条）与回退：`src/functions/QueryEngine.ts:106`、`src/functions/QueryEngine.ts:150`、`src/functions/QueryEngine.ts:260`
  - Bing 建议与相关词：`src/functions/QueryEngine.ts:190`、`src/functions/QueryEngine.ts:228`
- 活动执行（浏览器/应用/API）：`src/functions/Activities.ts:1` 与子模块
- “Search on Bing”活动关键词匹配与本地/远程源：`src/functions/activities/browser/SearchOnBing.ts:223`

## 🛠️ 常见问题
- 浏览器未安装或报错（Executable doesn't exist）：`npx patchright install chromium`
- Windows 非无头运行结束脚本后残留 Chrome 进程：执行 `npm run kill-chrome-win`
- 更新代码后报错：执行 `npm i` 与 `npx patchright install chromium`
- 自动登录失败：在首次运行时手动完成网页登录，登录信息保存在 `sessions` 目录（注意备份）
- 自动化运行建议：每日至少运行 2 次；若无可赚积分，可将 `runOnZeroPoints` 设为 `false` 以避免空跑

## 🙏 致谢
- 原项目作者 `TheNetsky`（TypeScript + Cheerio + Playwright）
- 中文本地化与国内适配经验来源 `chiihero`

## ⚠️ 免责声明
- 使用本项目需自行承担风险。自动化 Microsoft Rewards 可能导致账户限制或封禁。
- 本项目仅用于学习与研究目的，作者不对由此产生的任何后果负责。
