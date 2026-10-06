# TBH-like · 自托管挂机 RPG

受 [TBH: Task Bar Hero](https://store.steampowered.com/app/3678970/TBH/) 与
[shigake/tbh-copilot](https://github.com/shigake/tbh-copilot) 启发做的挂机 RPG。
**你的电脑就是服务器**，2~3 个玩家通过浏览器实时联机，你作为 GM 可以随时改数值、发事件、发装备。

```
英雄自动战斗 → 推关掉宝箱 → 开箱拿装备 → 魔方改造 → 符文树长期成长 → 离线收益
```

---

## 一、跑起来

```bash
npm install          # 只依赖 ws + better-sqlite3
npm start            # 默认 8787 端口
```

启动后会打印：

```
本机:   http://localhost:8787
局域网: http://192.168.1.x:8787   (手机同 WiFi 可访问)
GM 面板: http://localhost:8787/gm.html
GM 令牌: gm_xxxxxxxx
```

- 玩家打开 `http://localhost:8787` → 填名字、选职业 → 进游戏
- GM 打开 `http://localhost:8787/gm.html` → 填令牌 → 进控制台
- 存档令牌存在浏览器 localStorage，关掉再开自动恢复存档

常用命令：

| 命令 | 作用 |
|---|---|
| `npm start` | 启动服务器 |
| `npm run dev` | 改动自动重启 |
| `npm test` | 引擎冒烟测试（不开服务器） |
| `node scripts/e2e.cjs` | 端到端测试（需先启动服务器） |
| `node scripts/balance.cjs 6` | 模拟 6 小时挂机，看数值曲线 |
| `node scripts/reset.js` | 清空所有玩家存档 |
| `node scripts/reset.js --all` | 连 GM 令牌、调参、日志一起清空 |

环境变量：`PORT`（端口）、`HOST`（绑定地址）、`GM_TOKEN`（覆盖 GM 令牌）。

---

## 二、给 GM 的三件套

### 1. 实时调参
GM 面板底部「实时调参」列出 **67 个可热改数值**，改完回车立刻对所有在线玩家生效，
并且存进数据库（`data/game.db` 的 kv 表），重启后依然保留。点 `↺` 恢复单项默认。

覆盖不到的：怪物血量曲线、精英倍率、Boss 倍率、波数 —— 这些也在面板里（"难度曲线"分组）。

### 2. 发事件与公告
6 种预置世界事件：双倍掉率 / 双倍金币 / 双倍经验 / 怪物攻城 / Boss 突袭 / 狂欢时刻。
可自定义持续时长。同类事件不叠加，新启动会顶掉旧的。

公告会立刻弹在所有玩家屏幕上。

### 3. 发放与回收
- 发：金币 / 经验 / 等级 / 技能点 / 任意稀有度装备 / 素材 / 纪念币 / 宝箱 / 宠物 / 符文 / 职业解锁
- 收：扣金币、清空背包、等级归 1、改名、踢下线、重置存档
- 查：玩家列表（在线状态、等级、金币、关卡）、单个玩家完整存档、操作审计日志

所有 GM 操作都写进审计表，随时可查。

---

## 三、玩法速览

| 系统 | 说明 |
|---|---|
| **阵容** | 6 职业（骑士/游侠/牧师/术士/杀手/猎人），前中后排站位影响承伤与输出。初始 2 槽，符文树可开到 4 槽 |
| **战斗** | 服务器每 1 秒推进一次，5~7 波怪物 + Boss 波。英雄会自动攻击、吸血、治疗、复活 |
| **关卡** | 3 幕 × 10 关 × 4 难度（普通/困难/专家/地狱），共 120 个关卡。通关自动推进，可回头刷已通关卡 |
| **掉落** | 10 档稀有度：普通 → 宇宙。波次掉普通箱，关底掉首领箱，幕末掉幕末箱 |
| **魔方** | 合成（9 件同档换 1 件高档）、炼金（换金币）、制作、装饰/雕刻/铭文三档插槽、移除、供奉 |
| **符文树** | 50 个节点，8 个方向：成长（阵容槽）、财富、便利（自动开箱）、宝箱、战斗、经验 |
| **宠物** | 8 只，在指定关卡累计击杀解锁，被动永久生效（不部署也生效） |
| **成就** | 30 个，达成自动发金币奖励 |
| **离线** | 8 小时封顶，给金币和经验，不掉宝箱（与 TBH 一致） |

---

## 四、修改与升级路径（重点）

这套代码的组织原则：**内容和数据分离，逻辑和配置分离**。
99% 的改动不需要碰引擎代码。

### 4.1 加内容 —— 只改 `engine/data/`

| 想加什么 | 改哪个文件 | 怎么改 |
|---|---|---|
| 新职业 | `data/classes.js` | 往 `CLASSES` 加一项，`CLASS_ORDER` 加 id。技能用 `effect` 描述，引擎自动识别 |
| 新怪物 | `data/monsters.js` | 往 `MONSTERS` 加，再放进对应 `ACT_POOLS` |
| 新装备槽位/词缀 | `data/items.js` | `SLOTS` 加槽位，`AFFIXES` 加词缀，`MATERIALS` 加素材 |
| 新符文 | `data/runes.js` | 用 `chain(分支, 前缀, [{name, cost, effects}])` 加一串，自动串好依赖 |
| 新宠物 | `data/progress.js` | `PETS` 加一项：`{atStage, kills, effects}` |
| 新成就 | `data/progress.js` | `ACHIEVEMENTS` 加一项，条件用 `{type, ...}` 描述 |
| 新难度 | `data/config.js` | `difficulty` 加一项，前端下拉自动出现 |
| 新世界事件 | `data/config.js` | `events` 加一项，GM 面板自动出现按钮 |

**加一种新的成就条件**：在 `engine/progress.js` 的 `condMet()` 里加一个 `case`。

**加一种新的技能效果**：在 `data/classes.js` 的 `EFFECT_KEYS` 加键名，
再在 `engine/hero.js` 的 `addEffect()` 里确认它能被累加（默认已支持，通常是自动的）。

### 4.2 调数值 —— 两条路

- **运行时**（推荐）：GM 面板「实时调参」，改完立即生效，不用重启
- **改源码**：`engine/data/config.js`，这是所有数值的默认值来源，适合确定下来之后固化

GM 的覆盖值优先级高于源码。`config.js` 里加一个新字段，GM 面板会自动出现对应输入框（无需改前端）。

### 4.3 改存档结构 —— 版本迁移

存档有 `schemaVersion`。要加字段时：

1. `data/config.js` 里 `schemaVersion += 1`
2. `engine/save.js` 的 `MIGRATIONS` 里加迁移函数：

```js
const MIGRATIONS = {
  // 从 v1 升到 v2：给存档加 cube 字段
  1: (s) => { s.cube = s.cube || { level: 1, xp: 0 }; return s; },
  2: (s) => { s.pets = s.pets || {}; return s; },
};
```

老存档读进来会自动依次升级，**不会被丢弃**。另外 `fillDefaults()` 会补齐所有缺失字段，
所以只加字段不写迁移函数也不会崩（迁移函数用于需要"转换"而非"补默认值"的场景）。

### 4.4 改战斗逻辑

`engine/combat.js` 的 `step()` 是唯一的战斗推进入口，纯函数、可单测。
想加机制（比如 DOT、护盾、嘲讽、阵型克制）都在这里改。

### 4.5 手机端

后端和 WebSocket 已经完全支持多端，CSS 也写了 900px / 520px 两档响应式断点。
后续要做的只是布局微调：

- `public/css/style.css` 末尾的 `@media` 段
- 战斗区改成上下堆叠（已做），侧栏 Tab 改成底部标签栏会更顺手

局域网访问：手机连同一个 WiFi，浏览器打开启动时打印的局域网地址即可。
要外网访问，用 frp / ngrok / 云服务器端口转发，代码不用改。

### 4.6 目录结构

```
server/
  index.js       HTTP + WebSocket + tick 循环 + 广播
  db.js          SQLite 持久化（玩家存档/调参/公告/事件/审计）
  gm.js          GM 指令集
engine/          纯逻辑，不依赖服务器，可单独跑测试
  data/          所有游戏内容（职业/怪物/关卡/装备/符文/宠物/成就/数值）
  combat.js      战斗推进
  hero.js        属性计算
  gear.js        装备生成 + 魔方六种操作
  loot.js        掉落与宝箱
  rune.js        符文树
  progress.js    宠物/成就/离线收益
  save.js        存档结构与版本迁移
  tunables.js    数值热改层（config + DB 覆盖）
  game.js        顶层门面：tick / 指令 / 视图快照
public/          前端（原生 JS，无构建步骤）
scripts/         测试与维护脚本
data/            运行时数据库（game.db）与 GM 令牌
```

---

## 五、设计取舍

- **服务器权威**：战斗在服务器算，客户端只渲染。多端看到的状态永远一致，也没法改本地内存作弊
- **固定步长 tick**：`combat.tickMs = 1000`，断线重连/服务器卡顿会补算（上限 600 步），不同帧率下结果一致
- **无构建步骤**：没有 webpack/vite，改完 HTML/JS 刷新即可。依赖只有 2 个包
- **SQLite 但可降级**：`better-sqlite3` 装不上时自动退回 JSON 文件存储，功能不变
- **状态推送**：每 tick 给在线玩家推一次完整快照（约 6 KB），2~3 人毫无压力。
  人多的话改成"只推变化的部分"，入口在 `server/index.js` 的 `pushStates()`

---

## 六、已知边界

- 存档默认不加密，玩家可以直接改 `data/game.db`。2~3 个熟人玩无所谓，要防作弊再加令牌校验和操作审计
- 没有账号系统，靠浏览器 localStorage 里的令牌识别玩家；换设备需要在登录框填令牌
- 纪念币/供奉的掉落概率是设计值，没有像 TBH 那样对接真实市场

---

## 许可

代码 MIT。这是一个受 TBH 启发的原创实现，不含 TBH 的任何素材、数据或代码。
