# HANDOFF.md

> 强制规则见 `AGENTS.md`。本文件每阶段结束必须更新，缺失即判定未交付。
> 四节标题锁死为：已完成内容 / 架构决策说明 / 明确未做的范围 / 已知问题与坑。

## 1. 已完成内容

### 阶段 1：战场掉落改为服务器真实流水

用户要求「死亡后掉落相应的物品」。改造前的 `stage.js` 的 `dropLoot()` 是纯随机装饰：
用 `Math.random()` 决定掉几个、掉金币还是装备、什么颜色，与服务器实际结算完全无关。
本阶段把掉落改成服务器权威下发、前端只负责播放。

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 掉落流水 | `engine/combat.js` | `run` 新增 `dropSeq` + `drops`（环形保留最近 8 条）；击杀时记 `{t:'gold', gold, exp, foeUid, sprite}`；新增导出 `logDrop()` 与 `amendDrop()`；`snapshot()` 输出 `dropSeq` 与 `drops` | `node scripts/smoke.cjs` 第 14 组 16 项全绿，退出码 0 |
| 宝箱入流水 | `engine/game.js` | `dropChest()` 把宝箱写进战斗流水，带 `chestType`、`chestZh`、`gold`、`itemCount` 与箱内装备的 `{slot, rarity}` 预览（不外泄完整属性）；`handleCombatEvent` 在处理 kill 后用 `amendDrop` 把裸值金币改写成世界事件加成后的实发值 | 同上；「实发金币已回填 (4 -> 8)」一项验证 amendDrop 生效 |
| 掉落播放 | `public/js/stage.js` | 删除随机 `dropLoot()`；新增 `syncDrops()` / `dropGold()` / `dropChest()` / `spawnLoot()` / `collectLoot()` / `tickLoot()`；按 `seenDropId` 去重，`runId` 变化时重置游标；金币落在对应怪物的尸体坐标上 | `node scripts/ui-smoke.cjs` 第 6~8 组全绿，退出码 0 |
| 掉落样式 | `public/css/style.css` | 新增金币掉落（🪙 + 实际金币数）、宝箱掉落（📦 + 名称 + 箱内件数 + 稀有度配色预览图标）、被捡走的飞向小队动画 | 由 ui-smoke 第 7 组断言 DOM 结构；视觉效果仍需浏览器目视（见第 4 节 4.6） |
| 引擎用例 | `scripts/smoke.cjs` | 新增第 14 组 16 项：dropSeq 递增、流水有击杀掉落、每条带金币与 foeUid、id 无重复且严格递增、长度上限 8、宝箱入流水、预览只含槽位与稀有度、`amendDrop` 命中与未命中 | 退出码 0，末行「完成。」 |

**本阶段回归（全部通过）**

```
node --check engine/*.js engine/data/*.js server/*.js public/js/*.js scripts/*.js
  -> 全部通过，无 FAIL 行

node scripts/smoke.cjs
  -> 退出码 0，14 组全绿，新增第 14 组 16 项

node scripts/ui-smoke.cjs
  -> 退出码 0，10 组全绿，末行「✅ 前端逻辑全部通过」

node server/index.js 重启后 curl http://127.0.0.1:8787/
  -> HTTP 200

node scripts/e2e.cjs
  -> 退出码 0，末行「✅ 全部通过」，审计日志 42 条
```

**本阶段的数值影响验证（规范 4.1 / 4.3 / 4.4）**

先用修复后的可复现脚本取「改动前」基线：把 `engine/combat.js` 与 `engine/game.js` 临时还原到
基线版本运行 `node scripts/balance.cjs 6`，再换回改动版本运行同一条命令，两次输出 diff。

```
diff /tmp/before.txt /tmp/after.txt
  -> 无差异
  -> 结论：本阶段引擎改动对数值曲线零影响
```

指标逐项对比（seed=20260101，未改动前后完全相同）：

| 指标 | 改动前 | 改动后 | 方向 | 是否超预期 |
| --- | --- | --- | --- | --- |
| 6h 最高等级 | Lv.20 | Lv.20 | 不变 | 否 |
| 6h 通关数 | 19/30 | 19/30 | 不变 | 否 |
| 6h 总击杀 | 6058 | 6058 | 不变 | 否 |
| 6h 金币 | 73816 | 73816 | 不变 | 否 |
| 6h 队伍 DPS | 2298 | 2298 | 不变 | 否 |
| 6h 队伍 EHP | 11441 | 11441 | 不变 | 否 |

本阶段只增加「把已结算的掉落如实传给前端」，不新增也不调整任何掉落概率、倍率或成长曲线。

### 阶段 1b：修复平衡模拟脚本不可复现

`createNewSave` 未传 seed 时用 `Math.random()` 生成种子（`engine/save.js:61`），
而 `balance.cjs` 从不传 seed，导致每次运行的掉落与升级曲线都不同。
这让规范 4.1「改动前保存基线」与 4.3「改动后逐项对比」根本无法执行。

`balance.cjs` 新增第三个参数 `SEED`，默认固定 `20260101`；连跑两次输出逐字节一致。
详细曲线见该次 commit 的提交说明。

### 阶段 1c：修正前端测试桩的三处失真

`scripts/ui-smoke.cjs` 的 DOM 桩有三处与浏览器不符，会让测试测不出真问题：
`setTimeout` 同步执行（掉落物生成即被回收）、`classList` 不回写 `className`、
`chest-prev` 正则连带匹配 `chest-prevs`。另修正时间基准混用
（Node 全局 `performance.now()` 是进程启动至今，沙箱内返回 `Date.now()`，量纲不同）。
详见该次 commit 的提交说明。

### 阶段 1d：修复 `frame()` 首帧崩溃

`Stage.heroes` 与 `Stage.foes` 原先只在 `sync()` 里赋值，而 rAF 循环可能在第一次
`sync()` 之前就跑起来（`startWS` 与快照到达之间存在时间差），
`tickHeal()` 的 `this.heroes.filter` 会抛 `TypeError`。
浏览器表现为刚进战场就白屏。两个字段补空数组初值后修复。
该缺陷在本次开发中由 DOM 桩测试实际捕获，非推测。

### 阶段 0：规则落地与版本控制基线

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
  -> 启动日志含「TBH-like 服务器已启动」与「GM 面板: http://localhost:8787/gm.html」
  -> 令牌值查 data/server.json（该文件已 gitignore，不入库）

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

### 4.7 `node scripts/balance.cjs` 改前必须确认种子是固定的

- **复现条件**：在 `balance.cjs` 修复之前（commit `d4735cf` 之前）连跑两次 `node scripts/balance.cjs 6`。
- **影响范围**：规范 4.1/4.3/4.4 全部失效。基线不可复现意味着「改动前后曲线对比」无法执行，
  数值改动实际上处于无验证状态。表现为两次运行输出差异极大（0.5h 金币 6131 vs 9196），
  容易被误判为「我这次改动影响了平衡」。
- **规避手段**：必须传第三个参数或使用默认固定种子（`seed=20260101`）。
  做前后对比时只暂存被改的引擎文件，**不要用 `git stash`** ——
  stash 会把 `balance.cjs` 的种子修复一起撤掉，导致「改动前」跑的是随机种子，对比无效。
  正确做法：`git checkout -- engine/combat.js engine/game.js` 单独还原引擎文件。
- **已登记跟踪**：已修复，保留此条说明正确做法。

### 4.8 `engine/save.js` 的 `createNewSave` 默认种子是随机的

- **复现条件**：任何不传 `opts.seed` 的调用。
- **影响范围**：所有新建存档的玩家。`engine/save.js:61` 用 `Math.floor(Math.random() * 2 ** 31)`。
  对真实玩家这是正确行为（每人对局不同），但对任何需要可复现的脚本都是陷阱。
- **规避手段**：写测试或模拟脚本时必须显式传 `seed`。不要为了「方便」把 `createNewSave`
  的默认值改成固定值——那会让所有玩家的掉落序列完全一致。
- **已登记跟踪**：是，待在 `engine/save.js` 的这行加注释标明该约束（本次未改，避免与功能提交混提）。

### 4.9 `scripts/ui-smoke.cjs` 的 DOM 桩与浏览器有三处已知差异

- **复现条件**：依赖桩未实现的行为写断言。
- **影响范围**：前端测试的可信度。具体差异：`setTimeout` 改为异步队列（`flushTimers()` 手动驱动）；
  `classList.add` 不回写 `className` 字符串，判定样式要用 `classList.contains`；
  `getBoundingClientRect` 返回固定值，所以所有元素的坐标相同，测不了定位逻辑。
- **规避手段**：写断言前先确认桩是否实现了该行为。判定元素是否被回收用
  `dataset.collected`，不要用 `className.includes('collected')`。
- **已登记跟踪**：部分已修复，第三条（坐标）待处理，见第 3 节「无头浏览器截图回归」。

### 4.10 掉落流水只保留最近 8 条

- **复现条件**：单次 tick（1 秒）内击杀数超过 8，或客户端断线重连。
- **影响范围**：`run.drops` 会被 `splice` 截断到 8 条（`engine/combat.js` 的 `DROP_LOG_MAX`）。
  极端情况下前端会漏播最早的几条掉落动画，但**不影响任何实际收益**——
  金币与经验在 `handleCombatEvent` 里已直接入账，流水只是给前端看的。
- **规避手段**：无需处理，这是有意的设计。若要调大，改 `DROP_LOG_MAX` 并同步评估快照体积。
- **已登记跟踪**：否，属预期行为。

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
| 掉落物被小队「走过去捡」的位移动画 | 本阶段只做了原地弹跳 + 飞向小队左侧的捡取动画。真正让 `heroGroup` 的 `left` 移动到掉落点需要额外的目标点插值，会与波次推进的 `targetLead` 抢同一个位置值 | 掉落物数量与位置需求明确后再做 |
| 掉落流水落盘 | `run.drops` 只存在运行时，不写入存档。断线重连后当前 run 的历史掉落动画不会补播（收益已入账，不受影响） | 用户要求「回放上一场战斗的掉落」时 |
| 无头浏览器截图回归 | `agent-browser` 未安装且 `node` 不在 PATH 中，本阶段无法自动截图。视觉验证仍靠人工打开页面 | 装好 `agent-browser` 后把截图比对接进 `scripts/` |

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
