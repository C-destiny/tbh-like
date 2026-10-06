# HANDOFF.md

> 强制规则见 `AGENTS.md`。本文件每阶段结束必须更新，缺失即判定未交付。
> 四节标题锁死为：已完成内容 / 架构决策说明 / 明确未做的范围 / 已知问题与坑。

## 1. 已完成内容

### 阶段 0：规则落地与版本控制基线（本阶段）

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 协作规则 | `AGENTS.md`、`.cursorrules` | 新增强制工作流：交接文档、编码规范、版本控制、维护期约束 | 文件存在，`wc -l` = 128 行，`.cursorrules` 与 `AGENTS.md` 字节一致（`cmp` 无输出，退出码 0） |
| 忽略规则 | `.gitignore` | 排除 `node_modules/`、`data/`、`.workbuddy/`；保留 `assets-src/` 与 `public/assets/` 以便抠图可复现 | `git status --short` 输出 48 个暂存项，无 `data/` 与 `node_modules/` 路径 |
| 交接文档 | `HANDOFF.md`（本文件） | 新增四节固定结构 | 文件存在，四节标题齐全 |
| 版本控制 | `.git/` | 仓库初始化，提交可独立回滚的基线 | `git log --oneline` 输出基线 commit；`git status --porcelain` 提交后为空 |

**回归验证（本阶段实际执行）**

```
node --check engine/*.js engine/data/*.js server/*.js public/js/*.js scripts/*.js
  -> check-exit=0（44 个文件全部通过）

node scripts/smoke.cjs
  -> 13 组全绿，退出码 0
  -> 末行输出「完成。」

node scripts/ui-smoke.cjs
  -> 8 组全绿，退出码 0
  -> 末行输出「✅ 前端逻辑全部通过」

node server/index.js（后台启动，端口 8787）
  -> curl http://127.0.0.1:8787/ 返回 HTTP 200
  -> 启动日志含「TBH-like 服务器已启动」「GM 令牌: <令牌值见 data/server.json，已 gitignore>」

node scripts/e2e.cjs
  -> 退出码 0，末行「✅ 全部通过」
  -> 玩家链路：场上有敌人 (3)、击杀数 2
  -> GM 链路：可调参数 67 项、热改/恢复默认、踢人、审计日志 33 条
```

### 阶段 -1（此前已完成，本次建库时纳入基线）

- 双角色数据层：`engine/data/classes.js` 改为 `niuma`（肾虚牛马）/ `roudan`（肉蛋葱击使者），`CLASS_ORDER` 两项。
- 素材管线：`scripts/prep-assets.cjs` 抠透明背景 + 切 4 帧走路图 + 统一画布底对齐，产物在 `public/assets/heroes/`（2 张立绘 + 8 张走路帧）。
- 横向卷轴战场：`public/js/stage.js` 实现小队向右推进、怪物从右端走入、互砍动画、死亡掉落。
- 装备可视化：`public/js/gear-ui.js` 提供 `gearIcon` / `gearChip` / `heroFigure`（含装备叠层），接入背包、魔方、阵容页。
- 存档迁移：`config.schemaVersion` = 2，`engine/save.js` 的 `MIGRATIONS[1]` 把 6 个旧职业映射到 2 个新职业并退回技能点，导出 `normalizeClassId` 兜底。

## 2. 架构决策说明

### 2.1 数据层与 UI/控制层的边界

- **数据层 = `engine/`**。持有全部游戏状态与计算：`hero`（属性）、`combat`（战斗解算）、`loot`（掉落）、`gear`（装备与词缀）、`rune`（符文）、`progress`（关卡推进）、`save`（序列化与迁移）、`tunables`（数值合并）。该层在纯 Node 进程内可直接 `require`，不启动服务器即可被 `scripts/smoke.cjs`、`scripts/balance.cjs` 完整驱动。
- **UI/控制层 = `public/`**。只做三件事：把 `view` 快照画成 DOM、把用户点击翻译成 `Net.act(name, args)` 指令、播放视觉插值。禁止在 `public/` 内定义任何平衡数值。
- **传输层 = `server/`**。只做鉴权、持久化、1 秒 tick 广播、GM 指令。既不定义数值也不渲染。

### 2.2 依赖方向

允许：`public/js/*` → `engine/*` → `engine/data/*`；`server/*` → `engine/*`；`scripts/*` → `engine/*`。
禁止：`engine/` → `server/`（会让引擎失去可测性）、`public/` → `server/`（绕过 WebSocket 直连状态）、`scripts/` ← 被 `engine/` 引用（会让运行时依赖一次性脚本）、`engine/data` → `engine/*.js`（数据表不得反向依赖逻辑）。

### 2.3 选择理由

- **选「服务器权威 + 全量快照」而非「客户端算数值」**：改动 `engine/combat.js` 的 snapshot 结构后必须重启服务器，这是刻意保留的强一致点。快照约 6 KB，2~3 人规模下每 tick 推全量比增量推送实现成本低一个量级，代价记录在第 3 节。
- **选「UI 层只做插值、不参与计算」**：`stage.js` 的伤害飘字用 `dps / atkSpeed` 估算，敌人用 `atk * 0.72` 补偿目标减伤，都是为了让画面热闹。它不改服务器状态，血量与击杀始终以快照为准。这样可以自由调动画手感而不触碰数值平衡。
- **选「可测的 stage 逻辑靠 DOM 桩而非浏览器」**：`scripts/ui-smoke.cjs` 用手写 DOM 桩加载 `stage.js`，覆盖换波清理、死亡掉落、40 帧主循环。代价是不校验真实 CSS 动画的视觉效果，记录在第 4 节。
- **选「把数值收敛到 `engine/data/config.js` + GM 覆盖表」**：新增字段由 `listTunables` 自动出现在 GM 面板，前端零改动。加职业/怪物/装备只动数据表。

## 3. 明确未做的范围

| 排除项 | 排除原因 | 纳入条件 |
| --- | --- | --- |
| 移动端精调布局 | 首版与用户确认「先做 PC 端」；CSS 已有 900px / 520px 断点可用，但侧栏 Tab 未改底部标签栏 | 用户确认要手机游玩体验后再做 |
| 存档加密与令牌校验 | 自托管 2~3 人熟人局，防作弊收益低于复杂度 | 开放公网或人数 > 5 时 |
| 多人战斗快照增量推送 | 现为每 tick 全量 ~6 KB，当前规模足够 | 人数 > 6 或带宽出现瓶颈时 |
| 怪物立绘素材 | 用户只提供了两个英雄素材，怪物暂用 Emoji（`stage.js` 的 `SPRITES` 表） | 用户提供怪物图或授权素材后替换 `SPRITES` 为图片 |
| 武器/防具像素图 | 装备图标用 `gear-ui.js` 的 SVG 程序化生成（按槽位 + 稀有度配色） | 追求美术品质时替换为图片资源 |
| 音效与背景音乐 | 未列入用户需求，且素材无来源 | 用户提供音频素材 |
| 符文节点扩充到 197 | 现有 50 节点已覆盖 8 分支，长期成长深度不足但不影响可玩性 | 长期内容规划阶段 |
| CI 自动化 | 当前为单人本地项目，靠 `scripts/` 三个脚本手动回归 | 多人并行开发时接入 |

## 4. 已知问题与坑

### 4.1 改 `engine/combat.js` 的 snapshot 结构后前端会静默失效

- **复现条件**：向 snapshot 的英雄或敌人对象增删字段，然后只刷新浏览器不重启服务器。
- **影响范围**：`public/js/stage.js` 的全部攻击节奏与血条显示；表现为人物不挥砍或血条不动。
- **规避手段**：`stage.js` 中读 snapshot 的每处都用可选链兜底（`e.atk || 1`），不会崩但会退化。改完 snapshot 一律重启 `node server/index.js`。
- **已登记跟踪**：是，待补一条「重启服务器」的显式提示。

### 4.2 服务器被旧进程占用导致新代码不生效

- **复现条件**：改了服务端代码后直接 `node server/index.js`，端口 8787 已有一个旧进程。
- **影响范围**：整个服务端；表现为 `Error: listen EADDRINUSE`、前端连到旧逻辑上，改动「看起来没生效」。
- **规避手段**：本阶段已实际踩到。`PowerShell` 执行 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 找到 PID，再 `Stop-Process -Id <pid> -Force`，然后重启。
- **已登记跟踪**：是，计划在 `scripts/` 加一个 `restart.cjs` 免去手工查 PID。

### 4.3 `scripts/prep-assets.cjs` 的抠图阈值极窄

- **复现条件**：对非本次素材的图跑抠图。
- **影响范围**：`public/assets/heroes/` 全部产物。`BG_TOL = 20` 与角色暗部（9,22,54）到背景（0,0,32）的距离约 32，阈值调到 46 会把深色头发当背景抠掉；`BG_TOL_EDGE = 42` 负责外沿宽容。改任一阈值必须重新目视检查 10 张图。
- **规避手段**：不要为了「更干净」上调 `BG_TOL`。需要新素材时先只改 `scripts/prep-assets.cjs` 并单跑一次比对产物。
- **已登记跟踪**：是，待给 `prep-assets.cjs` 补一个「产物平均不透明度」自动断言。

### 4.4 走路帧宽窄不一致会导致播放抖动

- **复现条件**：跳过 `sliceSheet` 里的「逐帧 `keepLargestBlob` + `trim` + 统一到 maxW×maxH 底对齐」三步。
- **影响范围**：行走动画，表现为人物每帧左右跳。
- **规避手段**：三步必须一起执行。`keepLargestBlob` 必须逐帧调用，一次性对整张图调用会把其它帧当残片删掉。
- **已登记跟踪**：是，待补自动断言。

### 4.5 旧存档可能残留已废弃的职业 ID

- **复现条件**：在 `schemaVersion` = 1 时代存过档，之后升级到 2。
- **影响范围**：`engine/save.js` 读档；表现为英雄职业显示为 `Knight` 等旧 ID、`S.gd.classes[hero.classId]` 为 undefined。
- **规避手段**：已有双保险——`MIGRATIONS[1]` 做一次性映射，`normalizeClassId` 在每次读档时兜底。仍遇到时执行 `node scripts/reset.js` 清档。
- **已登记跟踪**：是，已修复，保留此条作为迁移行为的说明。

### 4.6 `ui-smoke.cjs` 不校验真实 CSS 动画

- **复现条件**：改了 `public/css/style.css` 的 keyframes 后只跑 `ui-smoke.cjs`。
- **影响范围**：所有视觉表现。脚本用 DOM 桩，`animationend` 不真实触发，动画错位测不出来。
- **规避手段**：改 CSS 动画后必须打开 `http://localhost:8787` 目视验证至少一个完整的「推进 → 互砍 → 掉落」循环。
- **已登记跟踪**：是，待接入无头浏览器（`agent-browser` 技能）做截图回归。
