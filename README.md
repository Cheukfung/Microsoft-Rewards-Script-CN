# 🇨🇳 Microsoft Rewards Script（本地化版）🎯

**简介**
- 基于 [`TheNetsky/Microsoft-Rewards-Script`](https://github.com/TheNetsky/Microsoft-Rewards-Script) 的 v3 版本进行本地化改造，面向国内用户优化网络与使用体验。
- 核心功能保持一致：自动完成每日任务、推广、打卡、移动与桌面搜索、阅读得分等。
- 针对国内环境做了适配：中文日志输出、国内热搜词源、镜像加速与代理支持。
- 热搜词获取参考 [`chiihero/Microsoft-Rewards-Script`](https://github.com/chiihero/Microsoft-Rewards-Script) 的实现思路与经验。

**主要改动**
- 中文日志与提示，便于排障与理解流程。
- 国内热词源支持（优先国内源，失败回退其他来源）：
  - 今日头条热榜：`src/functions/QueryEngine.ts:150`
  - Bing Trending Topics 回退：`src/functions/QueryEngine.ts:260`
  - Google Trends 在非国内或国内源不可用时使用：`src/functions/QueryEngine.ts:13`
- 本地关键词文件可选：`src/functions/queries.json:1`，由 `SearchOnBing` 动态加载：`src/functions/activities/browser/SearchOnBing.ts:223`
- 查询生成链路与代理支持：`src/functions/QueryEngine.ts` 与 `src/util/Axios.ts:8`
- 账户加载逻辑支持开发模式：`src/util/Load.ts:11`（`-dev` 时优先 `accounts.dev.json`：`src/util/Load.ts:15`）

## 🚀 快速开始
- 环境要求：`Node.js >= 18`
- 安装依赖（建议使用国内镜像源加速）：
  - `npm config set registry https://registry.npmmirror.com`
  - `npm ci --ignore-scripts`
- 初始化配置与账户文件：
  - 复制示例文件并填写你的信息
    - `cp src/accounts.example.json src/accounts.json`（示例位置：`src/accounts.example.json:1`）
    - `cp src/config.example.json src/config.json`（示例位置：`src/config.example.json:1`）
  - 重要字段说明见下文“配置说明”
- 编译与运行：
  - 编译：`npm run build`
  - 运行：`npm start`
  - 开发模式（使用 `accounts.dev.json`，若存在）：`npm run dev`
  - 直接以 TS 运行主入口：`npm run ts-start`

**国内加速与浏览器安装提示**
- 若遇到浏览器未安装或缺失，执行：`npx patchright install chromium`
- 建议设置下载镜像源（终端一次性设置）：
  - macOS/Linux：`export PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/`
  - Windows PowerShell：`$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright/"`

## ⚙️ 配置说明
- 配置文件路径：`src/config.json`（示例：`src/config.example.json:1`）
- 关键项摘要：
  - `baseURL`：`https://rewards.bing.com`
  - `sessionPath`：登录会话目录（默认 `sessions`）
  - `headless`：是否无头运行浏览器（Docker 环境已强制无头）
  - `runOnZeroPoints`：当可赚积分为 0 时是否仍运行
  - `clusters`：并发账户集群数量
  - `errorDiagnostics`：错误诊断输出
  - `saveFingerprint.mobile|desktop`：是否复用设备指纹
  - `workers`：任务开关（每日集、推广、打卡、桌面/移动搜索、签到、阅读得分等）
  - `searchOnBingLocalQueries`：是否使用本地查询列表（`src/functions/queries.json`）
  - `searchSettings`：搜索延迟、滚动/点击随机化、并行搜索、阅读延迟等
  - `proxy.queryEngine`：查询引擎是否走代理（用于国内访问外部 API）
  - `webhook.discord|ntfy`：通知推送与过滤（可选）

**账户文件结构**
- 位置：`src/accounts.json`（示例：`src/accounts.example.json:1`）
- 字段：
  - `email`、`password`、`totp`（可选，若开启 2FA）
  - `geoLocale`：地区码，支持 `auto` 或两位地区代码（如 `CN`、`US`）
  - `proxy`：用于 API 请求的代理（`src/util/Axios.ts:8`）
    - `proxyAxios`（布尔）、`url`、`port`、`username`、`password`

## 🐳 Docker 部署
- 参考 `compose.yaml`，已在镜像中优化国内源与依赖安装。
- 挂载与环境变量（默认示例已配置）：
  - 挂载：
    - `./src/accounts.json:/usr/src/microsoft-rewards-script/dist/accounts.json:ro`
    - `./src/config.json:/usr/src/microsoft-rewards-script/dist/config.json:ro`
    - `./sessions:/usr/src/microsoft-rewards-script/dist/browser/sessions`（可选：持久化登录）
  - 环境变量：
    - `TZ=Asia/Shanghai`（时区）
    - `CRON_SCHEDULE='0 7 * * *'`（调度）
    - `RUN_ON_START='true'`（容器启动即运行一次）
    - `SKIP_RANDOM_SLEEP='false'`、`MIN_SLEEP_MINUTES`、`MAX_SLEEP_MINUTES`（随机延迟）
    - `STUCK_PROCESS_TIMEOUT_HOURS`（运行卡死自愈）
- 启动：`docker compose up -d`
- 入口脚本与调度说明：
  - 入口：`scripts/docker/entrypoint.sh:1`（处理时区、首次运行、cron 注册）
  - 每日任务：`scripts/docker/run_daily.sh:146`（随机延迟与锁保护）

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

## 🙏 致谢
- 原项目作者 `TheNetsky`（TypeScript + Cheerio + Playwright）：https://github.com/TheNetsky/Microsoft-Rewards-Script ❤️
- 中文本地化与国内适配参考 `chiihero`：https://github.com/chiihero/Microsoft-Rewards-Script 💡

## ⚠️ 免责声明
- 使用本项目需自行承担风险。自动化 Microsoft Rewards 可能导致账户限制或封禁。
- 本项目仅用于学习与研究目的，作者不对由此产生的任何后果负责。
