# HANDOFF.md

> 强制规则见 `AGENTS.md`。本文件每阶段结束必须更新，缺失即判定未交付。
> 四节标题锁死为：已完成内容 / 架构决策说明 / 明确未做的范围 / 已知问题与坑。

## 1. 已完成内容

### 阶段 16：Kenney 素材源图全部入库 + SSH 推送通道准备

| 产出文件路径 | 行为变化 | 验证方式 |
| --- | --- | --- |
| `assets-src/kenney/`（603 个文件：585 PNG + 18 文本） | 四包 Kenney 素材的剩余源图纳入版本控制。此前仅 16 个文件入库，游戏用到的怪物、宝箱、地表与装饰图块源图处于未跟踪状态，别人 clone 后无法用 `npm run assets` 重现产物，违背 `.gitignore` 里既定的素材入库约定 | `git status --porcelain`：未跟踪项清零 |
| `.gitignore` | 新增两条忽略规则：`*.url`（包内自带 Visit Kenney / Visit Patreon 快捷方式，Windows 专属且无内容价值）、`assets-src/kenney.zip`（下载残留，与解压后源图完全重复） | `git check-ignore -v`：两条均命中 |
| `~/.ssh/id_ed25519(.pub)` | 新生成 ed25519 密钥对，私钥不上网、不外传。用于替代走不通的 HTTPS 凭据通道 | `ssh -T git@github.com` 返回 `Permission denied (publickey)`，证明 22 端口可达、仅缺公钥登记 |

提交 `c6b97e8`。含素材入库，不含任何游戏数值与代码改动。
验证：`node scripts/smoke.cjs` 退出码 0 且输出与基线逐字节一致；`node scripts/ui-smoke.cjs` 前端逻辑全部通过。

### 阶段 15：全服实时排行榜

| 产出文件路径 | 行为变化 | 验证方式 |
| --- | --- | --- |
| `server/leaderboard.js`、`server/index.js` | 服务端每个战斗 tick 汇总全部已载入玩家，按最高通关进度排序并推送；只公开姓名、在线状态、进度、等级、DPS、EHP、击杀、金币与符文数 | `TEST_URL=ws://127.0.0.1:8895/ws node scripts/e2e.cjs`：退出码 0，排行榜 4 项断言和原玩家/GM 链路全部通过 |
| `public/js/leaderboard-ui.js`、`public/js/app.js`、`public/index.html`、`public/css/style.css` | 新增“排行”页；支持进度、等级、DPS、击杀、金币排序，自己高亮、在线绿点、更新时间及横向滚动 | `node scripts/ui-smoke.cjs`：退出码 0，名称转义、自身/在线状态、默认排序断言通过 |
| `scripts/ui-smoke.cjs`、`scripts/e2e.cjs` | 新增榜单渲染、实时推送、字段可排序和令牌不泄漏回归 | `node --check` 覆盖 6 个改动 JS：全部退出码 0；`node scripts/smoke.cjs`：退出码 0，14 组全绿 |

### 阶段 14：符文树交互界面（提交 C，`docs/rune-system-workbuddy-plan.md` 第 7 节）

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 符文渲染模块 | `public/js/rune-ui.js` | 新增专用渲染模块：坐标计算（900×680 画布、之字偏移防重叠）、SVG 依赖连线（49 条=全部依赖边）、节点四态（owned/affordable/reachable/locked）、详情面板、桌面树+小屏列表双视图；不定义任何价格、效果数值或依赖规则，购买走 `App.act('buyRune')` 服务器权威 | `node --check public/js/rune-ui.js` 退出码 0；实机 50 节点/49 连线渲染正确 |
| 增量更新 | `public/js/rune-ui.js` | 服务器每秒状态推送只更新类名/角标/按钮禁用态，不重建结构——滚动位置、键盘焦点、选中态不被打断（文档验收清单要求键盘可用） | 实机购买后 2.5s 内节点变 owned、详情变「已点亮」，DOM 结构未重建 |
| app.js 委托 | `public/js/app.js` | `tabRunes()` 只留容器；`renderTab()` 对符文页保持容器持久 + 委托 `RuneUI.render(...)`；删除旧 `layoutRunes()`（固定坐标+点击即购买） | `node --check public/js/app.js` 退出码 0 |
| 样式重写 | `public/css/style.css` | 四态配色（分支色实心/呼吸光/描边减饱和/灰度+锁标）、`:focus-visible`、触控目标 ≥44px、`prefers-reduced-motion` 关闭呼吸动画、`<720px` 切分支列表；锁定角标为 CSS 画的挂锁（无 Emoji） | `agent-browser` 实机验收（见下） |
| UI 冒烟断言 | `scripts/ui-smoke.cjs` | 新增第 14 组：连线数=依赖边数(49)、四态同树可见、锁定/金币不足节点购买按钮禁用、可买节点按钮可用、购买走 `App.act` 委托、增量更新无异常 | `node scripts/ui-smoke.cjs` 退出码 0，末行「✅ 前端逻辑全部通过」 |

**浏览器实机验收（agent-browser + Chrome 155，`http://localhost:8801/`）**：
50 节点/49 连线渲染正确；新档 0 owned + 49 locked + 1 reachable；点击节点仅选中并展示
详情（含具体失败原因「金币不足，还差 100」）；挂机至金币 108 后 war_1 变 affordable、
点亮按钮启用；点击点亮 → 服务器扣费 → 节点变 owned（橙色实心+金环）、六分支首节点变
reachable（彩色描边）、详情变「已点亮」；换 500×800 视口自动切分支列表（树隐藏、50 行、
分组折叠头、无横向溢出）；断线重连（令牌重登）后「已点亮 1/50」保持。截图存于
`.workbuddy/shot-runes-{desktop,detail,owned,mobile}.png`。

完整回归：`node scripts/smoke.cjs` 与 `node scripts/balance.cjs 6` 输出与基线**逐字节一致**；
`TEST_URL=ws://localhost:8801/ws node scripts/e2e.cjs` 退出码 0，末行「✅ 全部通过」。
本阶段不改任何数值、存档结构、服务器协议。

### 阶段 13：符文语义图标素材管线（提交 B，`docs/rune-system-workbuddy-plan.md` 第 7 节）

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 图标生成脚本 | `scripts/prep-rune-assets.cjs` | 程序化绘制 18 类语义图标（像素绘图原语：矩形/圆/线/偶奇规则多边形填充 + 自动 1px 描边），输出 `public/assets/runes/rune-<key>.png`；全套统一中性浅色盘（MAIN/DEEP/HI/INK 四色），不烘分支色（文档 5.3：同一图标跨分支复用） | `node --check scripts/prep-rune-assets.cjs` 退出码 0；`node scripts/prep-rune-assets.cjs` 退出码 0 生成 18 张 24×24 PNG；重复执行产物逐字节一致 |
| 图标产物 | `public/assets/runes/rune-*.png` | 18 张 24×24 透明底 PNG；34px 内主体、≥2px 安全边距、统一描边与左上高光 | 4 倍放大拼图人工目检：18 类轮廓在 32px 显示尺寸下可互相区分（攻击=竖剑、防御=盾、生命=十字、金币=双圈圆、宝箱=箱体、经验=书） |
| 源素材说明 | `assets-src/runes/README.md` | 说明本目录无二进制源图，源图形以代码定义在生成脚本中；修改图标须改脚本重跑，禁止手工覆盖产物 | 文件存在；与 AGENTS.md 2.2.6 目录约定一致 |
| 许可登记 | `assets/LICENSES.md` | 「项目自有素材」表新增符文语义图标条目：程序化绘制、无第三方来源、24×24 基准 | 人工核对表格含路径、来源、规格三要素 |
| UI 冒烟断言 | `scripts/ui-smoke.cjs` | 第 13 组追加断言：节点引用的全部图标键（实际 18 类）在 `public/assets/runes/` 都有对应产物 | `node scripts/ui-smoke.cjs` 退出码 0，末行“✅ 前端逻辑全部通过” |

本阶段只新增素材产物与生成脚本，不改任何游戏代码、数值或存档。
数值基线：`node scripts/smoke.cjs` 输出与阶段 12 基线**逐字节一致**。

### 阶段 12：符文展示元数据（提交 A，`docs/rune-system-workbuddy-plan.md` 第 7 节）

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 分支展示元数据 | `engine/data/runes.js` | `BRANCHES` 增加 `angle`/`icon`/`description` 纯展示字段；删除 `branchAngle()` 硬编码角度表，改为 `chain()` 直接读 `BRANCHES[branch].angle`；注释“8 个方向”修正为“7 个分支，不存在正西分支” | `node --check engine/data/runes.js` 退出码 0；`node scripts/smoke.cjs` 退出码 0；`node scripts/balance.cjs 6` 退出码 0 |
| 节点图标键 | `engine/data/runes.js` | 50 个节点按效果语义补 `icon` 字段（18 类复用键），`chain()` 把 `icon` 复制到生成节点；图标键是展示元数据，不参与效果计算 | `node scripts/ui-smoke.cjs` 第 13 组：50 节点 ID 无重复、每节点有图标键、图标键 ≤18 类 |
| 树视图展示字段 | `engine/rune.js` | `treeView()` 增加 `affordable` 与 `reason` 字段，复用 `canUnlock()` 判定，不复制第二套购买规则；不改变 `aggregate`/`canUnlock`/`unlock` 行为 | `node --check engine/rune.js` 退出码 0；第 13 组断言四种状态（owned/affordable/reachable/locked）均可构造 |
| UI 冒烟断言 | `scripts/ui-smoke.cjs` | 新增第 13 组：50 节点 ID 无重复、branch 与 icon 存在、requires 指向真实节点、6 条分支首节点依赖 war_1、四态可构造 | `node scripts/ui-smoke.cjs` 退出码 0，末行“✅ 前端逻辑全部通过” |

本阶段只补展示元数据，不改任何 rune ID、价格、效果、依赖或存档结构。
数值基线：`node scripts/balance.cjs 6` 输出与改动前**逐字节一致**（通关 17/30、最高 Lv.20、DPS 2336、EHP 7564）；
`node scripts/smoke.cjs` 输出与改动前**逐字节一致**。

### 阶段 11：符文系统 UI 1.0 的 WorkBuddy 实施规范

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 符文改造与图标部署文档 | `docs/rune-system-workbuddy-plan.md` | 明确当前50节点系统的问题、UI 1.0锁定范围、18类图标规范、四种节点状态、文件级任务、三阶段提交、测试与浏览器验收；没有修改任何游戏行为 | `Test-Path docs/rune-system-workbuddy-plan.md` 输出 `True`；人工核对文档引用的 `engine/data/runes.js`、`engine/rune.js`、`public/js/app.js`、`public/css/style.css`、`scripts/smoke.cjs` 与 `scripts/ui-smoke.cjs` 均实际存在 |

本阶段只交付实施文档，不修改符文节点、数值、存档、前端或素材。
完整回归：`node scripts/smoke.cjs` 退出码 0，符文购买与加成用例通过；
`node scripts/ui-smoke.cjs` 退出码 0，末行“✅ 前端逻辑全部通过”；端口 8787 的运行实例上执行
`TEST_URL=ws://localhost:8787/ws node scripts/e2e.cjs`，退出码 0，末行“✅ 全部通过”。
干净克隆验证：克隆到 `C:/Users/72736/Documents/Codex/tbh-like-clean-f43fcd6`，执行
`pnpm install --offline --no-frozen-lockfile --ignore-scripts` 成功安装40个包；随后直接执行
`node scripts/smoke.cjs` 与 `node scripts/ui-smoke.cjs` 均退出码 0，文档存在检查输出 `True`；
`PORT=8894 node server/index.js` 启动成功，访问 `http://127.0.0.1:8894/` 返回
`HTTP 200 bytes=3943`。本机无 `npm` 命令，因此使用 pnpm 与等价 Node 入口完成验证。

### 阶段 10：第一幕怪物、宝箱、掉落与战场场景视觉完整化

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 可复现世界素材管线 | `scripts/prep-world-assets.cjs`、`assets-src/kenney/tiny-dungeon/` | 从已选定的 16×16 CC0 图块生成 8 类第一幕怪物、4 档宝箱、金币和3张环境纹理；普通素材 ×4、Boss ×6，全部最近邻放大 | `node scripts/prep-world-assets.cjs` 退出码 0，日志列出16张产物及64×64/96×96尺寸 |
| 第一幕战场图像化 | `public/js/stage.js`、`public/css/style.css`、`public/assets/world/` | 第一幕怪物由 Emoji 换成 PNG；金币与宝箱掉落使用图片；第一幕增加砖墙远景和沙土地表，第二、三幕保持原主题 | 浏览器打开 `http://localhost:8892/` 并进入 Normal 1-4，实机可见角色、怪物、金币、砖墙和地表，无图片裁切 |
| 背包四档宝箱图标 | `public/js/app.js`、`public/assets/world/chest-*.png` | 普通、精良、首领、幕末宝箱均按类型读取独立图片，兼容旧 `normal` 键 | 浏览器打开背包页，普通与首领宝箱图标均显示；`node scripts/ui-smoke.cjs` 第12组通过 |
| 路径回归与许可记录 | `scripts/ui-smoke.cjs`、`assets/LICENSES.md`、`README.md` | 自动检查8个怪物映射和16个世界产物存在；记录 Kenney CC0 来源、用途与固定缩放规则 | `node scripts/ui-smoke.cjs` 退出码 0，末行“✅ 前端逻辑全部通过”；许可文件与包内 `License.txt` 均已读取 |

本阶段只替换浏览器视觉和离线生成产物，不修改怪物数值、掉率、关卡编排、存档结构或服务器协议。
完整回归：4 个改动 JS 文件的 `node --check` 均退出码 0；`node scripts/smoke.cjs`、
`node scripts/ui-smoke.cjs`、`node scripts/balance.cjs 6` 均退出码 0；端口 8892 的服务器上执行
`TEST_URL=ws://localhost:8892/ws node scripts/e2e.cjs`，退出码 0，末行“✅ 全部通过”。
6 小时固定种子结果仍为通关17/30、最高 Lv.20、击杀6534、DPS 2336、EHP 7564，数值未变化。
干净克隆验证：克隆到 `C:/Users/72736/Documents/Codex/tbh-like-clean-727b906` 后，
离线安装得到 `pngjs`/`ws`，直接运行 `node scripts/smoke.cjs` 与
`node scripts/ui-smoke.cjs` 均退出码 0；重新生成16张世界素材后 `git diff --exit-code --
public/assets/world` 退出码 0；`PORT=8893 node server/index.js` 启动成功，访问
`http://127.0.0.1:8893/` 返回 `HTTP 200 bytes=3943`。本机无 `npm` 命令，故使用可用的
`pnpm` 离线安装并直接执行与 `npm test`/`npm start` 等价的 Node 入口。

### 阶段 9：两名现有角色视觉重塑并接入游戏

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 牛马新版源素材 | `assets-src/heroes/candidates/niuma-concept-v2.png`、`niuma-walk-v2.png` | 保留眼镜、荧光马甲与疲惫打工人身份，移除真实品牌，增加工作板盾牌和扫码武器，形成前排坦克轮廓 | 内置图像生成以旧立绘和旧四帧表为身份/姿势参考；逐张检查透明背景、完整四肢、四帧装备一致性 |
| 肉蛋葱新版源素材 | `assets-src/heroes/candidates/roudan-concept-v2.png`、`roudan-walk-v3.png` | 从普通黑衣青年改为绿/米白/蛋黄配色的远程角色，增加巨型葱、葱炮、肉丸袋和鸡蛋瓶；v3 修复站立帧武器跨边界裁切 | 内置图像生成后逐帧检查；被否决的 `roudan-walk-v2.png` 未纳入仓库 |
| 透明源图与非整除画布支持 | `scripts/prep-assets.cjs` | 自动识别已有透明通道并跳过二次抠图；1774px 四帧表在右侧补到1776px后再切片，避免丢失末尾像素 | `node scripts/prep-assets.cjs` 退出码 0；日志显示两张四帧表均“画布补宽 1774->1776”，生成2张480px立绘和8张200px动画帧 |
| 正式浏览器产物 | `public/assets/heroes/*.png` | 游戏角色选择页、战场和阵容页全部显示新版角色；保持原文件名与前端协议不变，无需迁移存档 | 浏览器打开 `http://localhost:8892/`：牛马选择卡、96px战场帧和阵容立绘均可见；打开 `http://127.0.0.1:8892/` 新建肉蛋葱存档并开始挂机，巨型葱、葱炮和角色立绘均无裁切 |
| 素材文档同步 | `README.md`、`engine/data/classes.js` | 说明源图可为透明图或纯底图，输入由 `MANIFEST` 登记，并记录补宽、切帧和底对齐顺序 | `node --check engine/data/classes.js scripts/prep-assets.cjs` 退出码 0；文档中的目录和脚本均实际存在 |

本阶段只改变角色美术与离线素材处理，不调整角色属性、技能效果、存档结构或战斗结算。
完整回归：`node scripts/smoke.cjs`、`node scripts/ui-smoke.cjs`、
`node scripts/balance.cjs 6` 均退出码 0；端口 8892 的服务器上执行
`TEST_URL=ws://localhost:8892/ws node scripts/e2e.cjs`，退出码 0，末行“✅ 全部通过”。

### 阶段 8：素材管线像素复制逻辑小规模重构

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 统一 RGBA 像素复制 | `scripts/prep-assets.cjs` | 新增内部函数 `copyPixel()`，让切帧与统一画布复用同一套四通道复制逻辑；不改变输入、输出、尺寸或处理顺序 | `node --check scripts/prep-assets.cjs` 退出码 0；重构前后执行 `node scripts/prep-assets.cjs`，日志差异数 0，10 张产物哈希清单差异数 0 |

规范 4.7 的行为一致性验证：重构前后两次 `node scripts/smoke.cjs` 输出差异数 0，
SHA-256 均为 `67550FD109652FA0A1E1D7183536A7B353D3CD794F0A8F8840DD9DAB536D8E10`；
两次 `node scripts/balance.cjs 6` 输出差异数 0，SHA-256 均为
`4407ADD44DBF1E753E1671BF79C2EAADD242717995CC15D088D4D4F784EC422B`。
角色素材哈希清单 SHA-256 重构前后均为
`0DAA237EFFA7CE8C0F02FBD8DAD8AC3B6423764D365E8B35068172EEABCD1EFC`。
完整回归：`node scripts/ui-smoke.cjs` 退出码 0；端口 8892 的服务器上执行
`TEST_URL=ws://localhost:8892/ws node scripts/e2e.cjs`，退出码 0，末行“✅ 全部通过”。

### 阶段 7：补齐角色素材管线缺失的 PNG 依赖

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 声明 PNG 处理依赖 | `package.json`、`package-lock.json` | 将 `scripts/prep-assets.cjs` 已经使用但从未声明的 `pngjs@^7.0.0` 纳入正式依赖；干净安装后不再报 `Cannot find module 'pngjs'` | `node scripts/prep-assets.cjs` 退出码 0，生成2张立绘和8张行走帧；`node --check scripts/prep-assets.cjs` 退出码 0 |

完整回归：`node scripts/smoke.cjs` 退出码 0，末行“完成。”；
`node scripts/ui-smoke.cjs` 退出码 0，末行“✅ 前端逻辑全部通过”；
端口 8892 的服务器上执行 `TEST_URL=ws://localhost:8892/ws node scripts/e2e.cjs`，
退出码 0，末行“✅ 全部通过”。
本阶段只补依赖声明，不修改素材处理算法、游戏代码或数值。

### 阶段 6：固定冒烟测试随机种子，恢复可复现回归基线

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 固定冒烟测试随机流 | `scripts/smoke.cjs` | 两个 `createNewSave` 测试存档统一显式传入 `SMOKE_SEED = 20260101`；真实玩家新档仍保持随机种子，不改变游戏行为 | `node --check scripts/smoke.cjs` 退出码 0；连续两次 `node scripts/smoke.cjs` 退出码均为 0，两个输出文件 SHA-256 均为 `67550FD109652FA0A1E1D7183536A7B353D3CD794F0A8F8840DD9DAB536D8E10`，`Compare-Object` 差异数为 0 |

本阶段只修复测试夹具，不修改引擎、存档结构、战斗数值或前端。此前第 4 节记录的
“`smoke.cjs` 不可复现”已解决，因此从已知问题中删除并移入本节。

完整回归：`node scripts/smoke.cjs` 退出码 0；`node scripts/ui-smoke.cjs` 退出码 0，
末行“✅ 前端逻辑全部通过”；端口 8892 启动 `node server/index.js` 后执行
`TEST_URL=ws://localhost:8892/ws node scripts/e2e.cjs`，退出码 0，末行“✅ 全部通过”。

### 阶段 5：宝箱分稀有度 + 背包内可视化与点击开箱

用户需求：背包里显示宝箱图标、可点击打开；宝箱分稀有等级，
且不同稀有度宝箱的装备爆率不同。

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 宝箱分档表 | `engine/loot.js` | 3 档扩为 4 档：`CHEST_TIERS` 含 common/fine/boss/actBoss，每档配 `rarityShift`、`rarityReluck`、`itemCount`、`goldMul`、`matChance`、`coinChance`、`icon`、`color`、`zh`。原 5 张散表（`CHEST_ZH` 等）合并为一张 | `node scripts/smoke.cjs` 第 10b 组 20 项全绿 |
| 波次箱分档 | `engine/loot.js` | 新增 `rollWaveChestTier()`，按 `WAVE_CHEST_WEIGHTS`（common 70% / fine 30%）分流。与 `rollWaveChest`（决定掉不掉）分离，两个概率互相独立 | 同上：「fine 档占比 30.2%（配置 30%）」 |
| 提档重掷 | `engine/gear.js` | `rollItem` 新增 `rerollChance` 参数：命中时按 `shift + REROLL_SHIFT_GAIN` 重掷一次，取稀有度更高者。`REROLL_SHIFT_GAIN = 1.0` 为具名常量 | 同上：「传说以上占比随稀有度递增」 |
| 快照补字段 | `engine/game.js` | `chests` 从只下发 `uid/type/zh` 扩为含 `icon`、`color`、`itemCount`、`gold`、`matCount`、`coinCount`、`items[{slot,rarity}]`。装备仍只给槽位与稀有度，不外泄完整属性 | 四档实测输出（见下） |
| 背包宝箱区 | `public/js/app.js` | 背包页新增独立「宝箱 N」卡片区，每个宝箱一张卡：按档位配色的图标、名称、件数、金币、素材/纪念币数、箱内装备预览图标，每个带「打开」按钮调 `act('openChest',{uid})`；保留「全部打开」 | 浏览器目视：`http://localhost:8787` 背包页 |
| 宝箱样式 | `public/css/style.css` | 新增 `.chest-list` / `.chest-card` / `.chest-ico` / `.chest-info` / `.chest-zh` / `.chest-prevs` / `.chest-prev` | 同上 |
| 存档迁移 v3 | `engine/save.js`、`engine/data/config.js` | `schemaVersion` 2→3；`MIGRATIONS[2]` 迁两处：旧箱 `type:'normal'`→`'common'` 并补 `zh`/`icon`/`color`（只改 type 不改 zh 会名字与内容对不上），`chestCd` 重建为四档零值。**箱内物品不重掷** —— 重掷等于凭空改玩家已得收益 | `node scripts/smoke.cjs` 第 10 组 9 项全绿 |
| 自动开箱修正 | `engine/game.js`、`engine/data/config.js`、`engine/data/runes.js` | 三处键名不一致会导致符文失效：符文写 `autoOpen:'normal'`、配置表键名 `normal`、冷却遍历硬编码数组。已统一为新档位名，并显式声明「common 档符文覆盖 fine 档」（波次箱 30% 是 fine，严格按档位匹配会漏） | 第 10 组 + 手工核对三处键名 |

**四档宝箱的实测梯度（每档开 4000 箱，stageIndex=5 / Normal）**

| 档位 | rarityShift | reroll | 件/箱 | 金币/箱 | 普通 | 稀有 | 传说+ | 不朽+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 普通宝箱 | 0 | 0 | 1.00 | 100 | 61.60% | 8.97% | 4.55% | 0.80% |
| 精良宝箱 | 0.55 | 0.18 | 1.50 | 160 | 54.46% | 11.42% | 6.90% | 1.55% |
| 首领宝箱 | 1.3 | 0.38 | 1.50 | 319 | 46.24% | 14.36% | 9.92% | 2.53% |
| 幕末宝箱 | 2.1 | 0.62 | 2.50 | 799 | 36.46% | 17.49% | **14.79%** | **3.69%** |

传说以上占比 4.55% → 14.79%（**3.2 倍**），不朽档 0.80% → 3.69%（**4.6 倍**），
件数与金币同步递增。梯度单调，无中间塌陷。

**为什么需要提档重掷（reroll），不能只靠 rarityShift**

只加 rarityShift 时实测梯度是 4.55% / 5.38% / 6.10% / 8.02%，
最高档仅为最低档 1.76 倍，且普通档仍有 61.6% 出普通装备 —— 玩家感知不到差异。

根因在 `gear.js` 的偏移公式：

```js
w = rarityWeights[r] * Math.pow(2.35, shift * (i / 9) - shift * 0.18)
```

`i=0`（Common）时指数只有 `-0.18*shift`，衰减幅度极小；
而 Common 的权重基数是 1000，在总权重里独占绝对大头，
所以单纯抬高 `shift` 对低档的抑制效率很低。

**没有改这个公式** —— 它是魔方合成、制作、普通掉落、世界事件的公共路径，
改它会波及全项目平衡，超出本次范围。改为在宝箱层额外做一次提档重掷，
把影响限制在宝箱这一条产出途径内。`common` 档 `rarityReluck=0`，
保持与改动前完全一致。

**数值影响验证（规范 4.1 / 4.3 / 4.4，seed=20260101）**

改动前已存基线（`/tmp/s5base/balance.txt`，md5 `3ac2b4082719300cc5c2084bfb8a63e8`）：

| 指标 | 改动前 | 改动后 | 方向 | 是否超预期 |
| --- | --- | --- | --- | --- |
| 6h 通关数 | 19/30 | 17/30 | 下降 | **见下方「单种子对比不可靠」** |
| 6h 总击杀 | 6058 | 6534 | 上升 | 否 |
| 6h 金币 | 73816 | 113330 | 上升 | 否（金币产出本就该提高） |
| 6h 最高等级 | Lv.20 | Lv.20 | 不变 | 否 |
| 6h 队伍 DPS | 2298 | 2336 | 上升 | 否 |
| 6h 队伍 EHP | 11441 | 7564 | 下降 | **见下方「单种子对比不可靠」** |

**单种子对比不可靠 —— 上述通关数与 EHP 的「下降」是噪声，不是真实退化**

`balance.cjs 6` 的单次运行波动极大。单看 seed=20260101 会得出
「装备变好但通关变少、EHP 掉了 34%」的结论，这与改动方向矛盾
（箱内装备更好、掉落金币更多，战力不应下降）。

为定位差异来源，逐文件还原（用 `git checkout -- <file>`，**不用 `git stash`**
—— stash 会把 `balance.cjs` 的种子修复一起撤掉，理由见第 2 节 4.7）：

```
仅 loot.js + game.js（宝箱分档）      -> 通关 18/30，DPS 2564，EHP 9987
再 + gear.js（提档重掷）              -> 通关 17/30，DPS 2336，EHP 7564
再 + save.js/config.js/runes.js        -> 无变化（纯迁移与键名）
```

确认差异来自宝箱分档与提档重掷本身，而非迁移代码。但单种子无法区分
「真实退化」与「随机流被扰动」。改用 5 个种子对照：

| 种子 | 基线版 | 改动版 | 方向 |
| --- | --- | --- | --- |
| 111 | 16 | 18 | 提升 |
| 222 | 13 | 19 | 提升 |
| 333 | 13 | 19 | 提升 |
| 444 | 16 | 14 | 下降 |
| 555 | 16 | 19 | 提升 |
| **均值** | **14.8** | **17.8** | **+3.0 关（+20%）** |

**结论与初判相反：改动实际是正向的。** 5 种子下改动版平均通关 17.8 关，
基线版 14.8 关，提升 20%。seed=20260101 恰好落在改动版的偏低位（17），
而基线版在该种子上偏高（19），单点对比把方向判反了。

**本阶段遗留的方法论问题（已登记，见第 4 节 4.16）**：
`balance.cjs` 虽可复现（固定种子），但**单条样本线的方差过大**，
不足以支撑规范 4.3「是否超出预期区间」的判断。规范 4.3 要求的
「逐项对比」在曲线类改动上应当用多种子均值，本次已按此执行。

**本阶段回归（全部通过）**

```
node --check 全部 31 个 JS 文件
  -> check-fail=0

node scripts/smoke.cjs
  -> 退出码 0，81 项 OK，0 FAIL，末行「完成。」
  -> 新增第 10b 组 20 项（宝箱分档 + 梯度实测 + 波次分流）
  -> 第 10 组新增 9 项（v3 迁移）

node scripts/ui-smoke.cjs
  -> 退出码 0，10 组全绿，末行「✅ 前端逻辑全部通过」

node server/index.js 重启（旧进程占 8787，先 taskkill 23688）
  -> HTTP 200

node scripts/e2e.cjs
  -> 退出码 0，末行「✅ 全部通过」，审计日志 21 条

四档宝箱开箱实测（引擎层直调 act_openChest）
  普通宝箱 -> 开箱成功 | 装备 1 件 | 金币 26
  精良宝箱 -> 开箱成功 | 装备 1 件 | 金币 47
  首领宝箱 -> 开箱成功 | 装备 2 件 | 金币 88
  幕末宝箱 -> 开箱成功 | 装备 3 件 | 金币 205
  开完后剩余宝箱 0，背包装备 7 件
  快照字段实测：{"uid":"ch_...","type":"actBoss","zh":"幕末宝箱","icon":"💠",
    "color":"#a855f7","itemCount":3,"gold":205,"matCount":1,"coinCount":0,
    "items":[{"slot":"amulet","rarity":"Rare"},{"slot":"amulet","rarity":"Immortal"},
             {"slot":"weapon","rarity":"Common"}]}
```

### 阶段 4：修复战场人物形象不显示

用户实测反馈：开始挂机后** battlefield 上只有血条，没有人物形象**。

根因：字段名对不上。`public/js/stage.js` 的 `createHero()` 读 `h.sprite` 拼素材路径：

```js
`<img src="assets/heroes/${h.sprite}_walk_${i}.png" ...>`
```

但引擎下发的阵容对象（`view.heroes[]`）**根本没有 `sprite` 字段**，只有 `classId`。
实测引擎输出：

```
view.heroes[0] 字段: uid / classId / zh / level / xp / xpNext / skillPoints /
                   skills / row / inParty / equipment / stats
```

`sprite` 只存在于 `engine/data/classes.js` 的 CLASSES 表里（`sprite: 'niuma'`），
那属于静态配置表，不随快照下发。于是拼出的路径是
`assets/heroes/undefined_walk_0.png` —— 4 张图全部 404。

**为什么只剩血条**：血条是 `el.innerHTML` 里的 HTML 元素（`<div class="bar hp">`），
不依赖图片；`.walk img` 的 CSS 只是 `opacity: 0` 起、由 JS 逐帧切换。
图片全挂 + 血条不依赖图片 = 只剩一条血，其他什么都没有。
`image-rendering: pixelated` 之类样式不报错，404 静默失败，所以不显式看网络面板
根本发现不了。

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 素材名解析函数 | `public/js/stage.js` | 新增 `heroSprite(h)`，取值优先级 `heroSprite > sprite > classId > 'niuma'`。用 `classId` 是因为它是引擎真实下发的字段，且与素材文件名一一对应（`niuma` / `roudan`，两角色 4 帧全部实测存在）。保留 `sprite` 与 `heroSprite` 优先级是为了将来出现「同职业不同形象」时不必改渲染层 | `node scripts/ui-smoke.cjs` 第 11 组 12 项全绿，退出码 0 |
| 渲染层改用新函数 | `public/js/stage.js` | `createHero()` 由 `h.sprite` 改为 `const sp = heroSprite(h)`。并导出到 `StageUtils` 供测试直接断言 | 同上；浏览器端 `curl /js/stage.js \| grep -c heroSprite` = 6 |
| 补测试用例 | `scripts/ui-smoke.cjs` | 新增第 11 组 12 项，**夹具刻意不带 `sprite` 字段**（与真实引擎一致），并逐帧核对素材文件真实存在 | 回退修复后 3 项立即 FAIL（见下方「用例有效性验证」），恢复后 12 项全绿 |

**用例有效性验证（本次实际执行）**

新增用例的价值取决于它能否抓住原缺陷，故做了回退对照：

```
cp public/js/stage.js /tmp/stage-fixed.js
sed -i 's/const sp = heroSprite(h);/const sp = h.sprite;/' public/js/stage.js
  -> node scripts/ui-smoke.cjs 第 11 组：
       OK   只有 classId 时取 classId        （heroSprite 本身仍存在，故仍过）
       ...
       FAIL HTML 里不含 undefined 路径
       FAIL 肾虚牛马 4 帧路径正确
       FAIL 肉蛋葱击使者 4 帧路径正确
cp /tmp/stage-fixed.js public/js/stage.js     -> 恢复后 12 项全绿
```

前 6 项仍过是因为只回退了调用点、未删 `heroSprite` 函数本身，
说明检测点精确落在「拼路径」这一环，不是泛泛地报「代码改了」。

**为什么旧测试没抓住这个 bug（须记住）**

旧夹具 `scripts/ui-smoke.cjs` 第 132 / 135 行**自己伪造了 `sprite: 'niuma'` 字段**：

```js
{ uid: 'h1', zh: '肾虚牛马', classId: 'niuma', sprite: 'niuma', ... }
```

真实引擎不下发 `sprite`。夹具比真实数据「更完整」，于是拼路径这一步永远测不出错。
这是比缺用例更隐蔽的问题：**夹具与真实数据不一致时，用例是自欺的**。
新夹具已改为只用真实字段。

**本阶段回归（全部通过）**

```
node --check 全部 31 个 JS 文件
  -> check-fail=0

node scripts/ui-smoke.cjs
  -> 退出码 0，末行「✅ 前端逻辑全部通过」，新增第 11 组 12 项

node scripts/smoke.cjs
  -> 退出码 0，14 组全绿，末行「完成。」

node scripts/balance.cjs 6
  -> 退出码 0，与阶段 3 基线 diff -> 无差异，逐字节一致
  -> 6h 最高 Lv.20 / 通关 19/30 / 击杀 6058 / DPS 2298 / EHP 11441

浏览器端实测（服务器 8787 已在提供修复后的文件）
  -> curl /js/stage.js | grep -c heroSprite = 6
  -> curl /assets/heroes/niuma_walk_0.png = HTTP 200，27298 字节
  -> curl /assets/heroes/roudan_walk_0.png = HTTP 200，23290 字节
```

**数值影响**：本阶段只改前端素材路径拼接，不触碰任何数值、概率与成长曲线。
`balance.cjs 6` 与基线逐字节一致。

### 阶段 3：修复 better-sqlite3 降级失效，服务器在缺编译工具链的机器上可启动

用户换机器（全新 Windows，无 Visual Studio Build Tools）clone 本仓库继续开发。
按阶段 2 的经验做干净克隆验证，`npm install` 成功、`npm test` 全绿，
但 `npm start` **直接崩溃**：`Error: Could not locate the bindings file`。
README 承诺的「装不上会自动退回 JSON 文件存储，功能不变」是假的。

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 降级探测修正 | `server/db.js` | 新增 `detectSqlite()`：可用性判定必须包含 `new Database(':memory:')` 构造步骤。原实现只 `try` 了 `require()`，而原生模块的失败点在构造内部（`bindings` 找不到 `.node`），导致 `useSqlite` 被误判为 `true`，构造时抛异常，JSON 兜底分支从未被走过 | 缺工具链的机器上 `node -e "new (require('./server/db').Store())"` 输出 `useSqlite = false`；`npm start` 退出码 0，启动横幅打印「存储: JSON 文件（data/fallback.json）」 |
| 降级日志收敛 | `server/db.js` | `bindings` 的报错自带 13 行候选路径清单，直接打印会淹没启动横幅。改为只取首行作为原因，完整堆栈用 `DEBUG_SQLITE=1` 打开；并补一行 `npm rebuild better-sqlite3` 的修复指引 | 启动输出从 15 行降到 8 行，无 bindings 路径清单 |
| 存储模式提示 | `server/index.js` | 启动横幅新增「存储: SQLite / JSON 文件」一行。两种模式功能一致但存档文件位置不同，不提示的话用户在降级机器上找不到 `data/game.db` 会以为存档丢了 | `npm start` 横幅实测输出该行 |
| reset 脚本修复 | `scripts/reset.js` | 同一个 bug：降级模式下 `require('better-sqlite3')` + `new Database()` 直接抛异常，而降级模式恰恰是玩家唯一能用的模式。改为复用 `detectSqlite()`，sqlite 不可用时改清 `data/fallback.json` | 降级模式下执行 `node scripts/reset.js`：玩家数 `2 → 0`，退出码 0，`server.json` 保留（GM 令牌不被误删）。修复前该命令在此机器上崩溃 |
| 文档同步 | `README.md` | 「换机器注意事项」补 `fallback.json` 存档迁移说明（并写明两种模式存档不可互换）；新增「存储模式：SQLite 与 JSON 文件」章节，含 `npm rebuild better-sqlite3` 与 `DEBUG_SQLITE=1`；GM 调参段落去掉只提 `game.db` 的表述；修掉第 83 行一个乱码字符 | 文中每个命令与文件路径均已实测存在 |

**本阶段回归（全部通过）**

```
node --check 全部 31 个 JS 文件
  -> check-fail=0

node scripts/smoke.cjs
  -> 退出码 0，14 组全绿（53 项 OK）
  -> 注：smoke.cjs 自身不可复现，逐字节 diff 不可用作基线对比，
     详见第 4 节 4.10。用「两版各跑 5 次统计 OK 行数」对比：
       HEAD 版 52~53 项（2 次 52，3 次 53）
       改动版 5 次全为 53 项
     结论：通过项数一致，行为等价

node scripts/balance.cjs 6
  -> 退出码 0，与改动前基线 diff -> 无差异，逐字节一致
  -> 6h 最高 Lv.20 / 通关 19/30 / 击杀 6058 / DPS 2298 / EHP 11441

node scripts/ui-smoke.cjs
  -> 退出码 0，10 组全绿，末行「✅ 前端逻辑全部通过」

node server/index.js（后台启动，端口 8787）
  -> HTTP 200

node scripts/e2e.cjs
  -> 退出码 0，末行「✅ 全部通过」
  -> 本次 e2e 全程在 JSON 降级模式下跑通，证明降级路径功能完整：
     玩家列表 2 人、发放金币/装备、世界事件、公告、67 项可调参数、
     热改与恢复默认、踢人、审计日志 9 条
```

**本阶段的数值影响验证（规范 4.1 / 4.3 / 4.4）**

改动前已保存基线（`/tmp/tbhbase/balance.txt`，md5 `3ac2b4082719300cc5c2084bfb8a63e8`），
改动后重跑同一条命令并 diff。

| 指标 | 改动前 | 改动后 | 方向 | 是否超预期 |
| --- | --- | --- | --- | --- |
| 6h 最高等级 | Lv.20 | Lv.20 | 不变 | 否 |
| 6h 通关数 | 19/30 | 19/30 | 不变 | 否 |
| 6h 总击杀 | 6058 | 6058 | 不变 | 否 |
| 6h 金币 | 73816 | 73816 | 不变 | 否 |
| 6h 队伍 DPS | 2298 | 2298 | 不变 | 否 |
| 6h 队伍 EHP | 11441 | 11441 | 不变 | 否 |

`diff /tmp/tbhbase/balance.txt /tmp/after-balance.txt` -> 无差异。

本阶段只改持久化层的可用性判定与日志，未触碰任何数值、概率与成长曲线。

### 阶段 2：让「换一台电脑继续开发」真正可行

用户问「换一台电脑能不能直接从 GitHub 下载继续做」。为了回答这个问题，
实际做了一次干净克隆验证 —— **结果发现两个致命问题，本阶段修复。**

| 产出 | 路径 | 行为变化 | 验证方式 |
| --- | --- | --- | --- |
| 修复 `.gitignore` 误排除 | `.gitignore` | `data/` 改为 `/data/`。原来没有前导斜杠，匹配任意层级的 `data` 目录，把 `engine/data/`（全部游戏内容）一并排除，根本没进仓库 | `git check-ignore -v`：`data/game.db` 被排除、`engine/data/classes.js` 未被排除 |
| 补齐游戏数据入库 | `engine/data/*.js`（6 个文件） | 角色、怪物、装备、符文、宠物、成就与全部数值首次入库 | 干净克隆后 `git ls-files \| grep engine/data` = 6 |
| 修复坏脚本入口 | `package.json` | `test` 原指向不存在的 `engine/test.cjs`，`seed` 原指向不存在的 `scripts/seed.js`。改为 `smoke.cjs && ui-smoke.cjs`，删除 seed，补 `test:engine`/`test:ui`/`test:e2e`/`balance`/`assets` | 逐个验证 9 个脚本目标文件全部存在 |
| 修读过时说明 | `README.md` | 「6 职业」改为「2 个角色」；启动日志说明改为指向 `data/server.json`；新增「在另一台电脑上继续开发」章节；目录结构补全 `stage.js`/`gear-ui.js`/`assets-src` 等；新增 4.7 角色素材管线 | 文中引用的每个文件与命令均已核对存在 |
| 标注 AI 入口 | `README.md` | 开头提示接手的 Agent 先读 `AGENTS.md` 与 `HANDOFF.md` | 两个文件均在仓库根目录 |

**干净克隆验证（本阶段实际执行）**

```
git clone E:/tbh-like E:\tbh-fresh     # exit 0
  -> 修复前：49 个文件，engine/data/ 整个目录不存在
     node scripts/smoke.cjs -> Error: Cannot find module './data/classes'
  -> 修复后：55 个文件，engine/data/ 6 个文件齐全
     素材：public/assets/heroes 10 张、assets-src/heroes 4 张（与原机器一致）
     data/ 未克隆（正确）、node_modules 未克隆（正确）
```

原机器上完全看不出这个问题 —— 缺失的文件还在自己磁盘上。只有真正克隆到干净目录
才能暴露。这也是本阶段最重要的一条经验，已写入第 4 节 4.7。

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

### 阶段 15：排行榜边界与依赖

- 数据状态继续由 `engine/` 的玩家存档持有；`server/leaderboard.js` 只把现有状态投影成公开快照，
  `public/js/leaderboard-ui.js` 只排序与渲染，不持有或计算游戏收益。
- 依赖方向为 `server/index.js` → `server/leaderboard.js` → Player 公共接口，浏览器仅消费 WebSocket
  消息；禁止客户端读取其他玩家存档，也禁止排行榜模块反向修改引擎状态。
- 选择服务端权威榜单，是为了让在线/离线玩家看到同一结果并避免客户端伪造；否决“各客户端自行请求或
  计算”的方案，因为它会暴露完整存档且不同客户端结果可能不一致。当前人数少，采用每秒全量推送；
  大规模分页与增量推送列入后续容量阶段。

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


### 2.4 宝箱分档放在 loot 层，稀有度差异复用 gear 的 rarityShift

- **边界划分**：宝箱档位定义（名称/图标/配色/件数/金币倍率/稀有度偏移）
  全部在 `engine/loot.js` 的 `CHEST_TIERS`，属于数据层；
  `public/js/` 只读快照下发的 `icon`/`color`/`zh` 渲染卡片，不自己判断档位。
- **依赖方向**：沿用既有方向 `public/ → engine/ → engine/data/`。
  `engine/save.js` 反向引用了 `engine/loot.js` 的 `CHEST_TIER_ORDER`
  （迁移与 `fillDefaults` 需要知道全部档位），
  这构成 `engine/*.js` 之间的横向引用 —— 已在 `save.js` 顶部注释说明来由，
  未违反 2.3（`engine/data` 仍不反向依赖 `engine/*.js`）。
- **选择理由 —— 为什么稀有度差异靠「rarityShift + 提档重掷」两级实现**：
  `engine/gear.js` 已有 `rarityShift` 机制（权重按 `2.35^shift` 向高档偏移），
  完全够用，不该在 loot 里重复实现一遍权重表。
  但实测发现单靠 `rarityShift` 梯度太弱（最高档仅最低档 1.76 倍，
  普通档仍有 61.6% 出普通装备），原因见第 1 节阶段 5 的公式分析：
  Common 权重基数 1000 独占大头，而公式里低档的衰减指数只有 `-0.18*shift`。
  两个被否决的方案：
  - **否决：直接改 `gear.js` 的偏移公式**（如把 `-0.18` 改成 `-0.5`）。
    该公式是魔方合成、制作、普通掉落、世界事件的公共路径，改动会同时改变
    所有产出途径的平衡，超出本阶段目标，且难以归因。
  - **否决：在 loot 里另写一套稀有度权重表**。会与 `config.loot.rarityWeights`
    形成两个真相来源，日后调平衡要改两处，必然漂移。
  - **采用：保留公式不动，在宝箱层加 `rarityReluck` 提档重掷。**
    影响被限制在宝箱这一条产出途径内，`common` 档设为 0 以完全保持原行为。
- **数值调整理由与下游影响（规范 4.6）**：
  - `REROLL_SHIFT_GAIN = 1.0`（`engine/gear.js`）——
    下游影响：仅通过 `rollItem` 的 `rerollChance` 参数生效，
    未传该参数的调用方（魔方、制作、世界事件掉落）行为完全不变。
  - 四档 `rarityShift` 0 / 0.55 / 1.3 / 2.1 与 `rarityReluck` 0 / 0.18 / 0.38 / 0.62
    （`engine/loot.js`）—— 下游影响：装备总产出数与金币上升，
    6h 金币 73816 → 113330、击杀 6058 → 6534；
    通关数 5 种子均值 14.8 → 17.8（+20%）。
  - `WAVE_CHEST_WEIGHTS` common 0.70 / fine 0.30（`engine/loot.js`）——
    下游影响：波次箱产出结构变化，30% 变为精良档（2 件 + 1.6 倍金币 + 更高稀有度）。

### 2.5 测试随机性与真实玩家随机性分离

- **边界划分**：`scripts/smoke.cjs` 持有固定测试种子，只负责构造可复现夹具；
  `engine/save.js` 的 `createNewSave` 继续在调用方未传种子时为真实玩家生成随机种子。
- **依赖方向**：脚本通过公开的 `createNewSave(opts)` 向引擎传入测试参数，
  引擎不引用脚本，也不感知测试环境，沿用 `scripts/ → engine/` 单向依赖。
- **选择理由**：固定真实玩家默认种子会让所有玩家得到相同掉落序列，故否决；
  在测试脚本中显式传种子既不改变产品行为，又能让重构前后执行逐字节比较。

### 2.6 素材处理依赖必须由项目自身声明

- **边界划分**：`scripts/prep-assets.cjs` 负责离线生成浏览器资源，`pngjs` 只属于该脚本的
  Node 运行依赖；浏览器端和引擎层不直接引用该包。
- **依赖方向**：保持 `scripts/ → 第三方包`，禁止 `public/` 或 `engine/` 反向引用脚本。
- **选择理由**：采用显式生产依赖，确保干净克隆可直接执行 `npm run assets`；
  否决依赖某台机器全局安装或其他项目的 `node_modules`，因为换电脑后无法复现。

### 2.7 切帧与画布对齐共用像素复制原语

- **边界划分**：`copyPixel()` 只在素材处理脚本内部操作 PNG 缓冲区，不进入引擎或浏览器；
  游戏状态仍由 `engine/` 持有，`public/` 只消费生成后的 PNG。
- **依赖方向**：`sliceSheet()` 与 `normalizeFrames()` 单向调用同文件的 `copyPixel()`，
  没有新增跨层依赖，也没有让运行时代码引用 `scripts/`。
- **选择理由**：两个循环原先分别手写 RGBA 四通道复制，后续支持透明源图时容易只修一处；
  否决引入图像处理新库或同时重写缩放算法，因为那会改变生成文件，无法满足重构行为一致性要求。

### 2.8 角色源素材与浏览器产物继续分层

- **边界划分**：高分辨率候选与四帧源图由 `assets-src/heroes/candidates/` 持有；
  `scripts/prep-assets.cjs` 负责透明处理、切帧与降采样；`public/assets/heroes/` 只存浏览器直接消费的产物。
- **依赖方向**：保持 `assets-src/ → scripts/ → public/assets/` 的单向生成关系；
  浏览器不读取源素材，脚本也不被引擎或前端运行时代码引用。
- **选择理由**：保留高分辨率源图可重复调整产物，又不让浏览器加载兆字节级素材；
  否决直接手工覆盖单帧文件，因为无法稳定复现四帧尺寸与脚底基线。

### 2.9 第一幕世界素材保持源图、生成脚本与运行时产物三层分离

- **边界划分**：`assets-src/kenney/tiny-dungeon/` 持有原始 CC0 图块，
  `scripts/prep-world-assets.cjs` 持有选图映射和最近邻缩放规则，`public/assets/world/` 只持有浏览器产物；
  游戏状态继续由 `engine/` 持有，`public/` 只按已有 sprite/type 字段渲染。
- **依赖方向**：保持 `assets-src/ → scripts/ → public/assets/` 的离线生成方向；
  `public/js/` 不引用脚本和源素材，`engine/` 不引用任何浏览器图片。
- **选择理由**：这种边界让换图可重复生成，且不改变服务器协议和存档；否决把整套 Kenney 包复制进
  `public/`，因为会增加无用体积；否决把图片路径写入存档，因为纯视觉替换不应触发 schema 迁移。

### 2.10 符文 UI 与符文经济拆分实施

- **边界划分**：`engine/data/runes.js` 持有节点、依赖、效果和展示元数据；`engine/rune.js` 持有购买判定与加成聚合；
  规划中的 `public/js/rune-ui.js` 只负责坐标、连线、图标、状态和输入，服务器继续持有金币与已点亮状态。
- **依赖方向**：保持 `public/ → engine/ → engine/data/`；图标沿用
  `assets-src/ → scripts/ → public/assets/`，禁止前端定义价格、效果或自行写入购买结果。
- **选择理由**：先保留50个节点的 ID 与数值完成 UI，可零迁移验证可读性；否决在同一阶段增加第八分支、
  符文货币或洗点，因为它们会同时影响经济、存档和平衡，无法与视觉问题独立验收。

## 3. 明确未做的范围

| 排除的功能名 | 排除原因 | 计划纳入阶段或前置条件 |
| --- | --- | --- |
| 赛季榜、周榜与奖励结算 | 当前尚无赛季数据模型，提前奖励会影响未定稿的数值经济 | 无尽赛季系统的数据结构与奖励规则确定后纳入 |
| 排行榜分页与增量推送 | 当前玩家规模为几十人，每秒完整公开快照实现更可靠 | 在线或存档玩家超过 200 人、榜单消息出现明显带宽压力后纳入 |
| 玩家详情与装备查看 | 会扩大隐私字段与协议面，本阶段目标只是公开统计排行 | 用户明确可公开字段并完成账号权限设计后纳入 |

| 排除项 | 排除原因 | 纳入条件 |
| --- | --- | --- |
| 立即实现符文 UI | 用户本次要求先形成详细说明与可移交部署文档，未授权直接改动符文系统 | 用户确认由 Codex 实施，或 WorkBuddy 按 `docs/rune-system-workbuddy-plan.md` 完成三个阶段后交回验收 |
| 符文经济重做 | 新货币、洗点、第八分支、价格和效果调整都会改变数值与存档语义，不应与 UI 1.0 混提 | UI 1.0 实机验收后，先记录多种子平衡基线并单独设计 |
| 第二、三幕怪物与场景图片 | 本阶段只承诺第一幕完整化；同时替换三幕会扩大选图与浏览器验收范围，难以独立回滚 | 第一幕视觉通过用户验收后，分别作为第二幕与第三幕素材阶段 |
| 角色专属攻击特效 | 怪物、宝箱与场景是静态资源链路；攻击特效涉及动画时序，不与本阶段混提 | 第一幕静态视觉稳定后，独立实现盾击/扫描光与葱弹投射 |
| 牛马“工作压力”与肉蛋葱“三段食材连击” | 本阶段目标是验证新版角色视觉，机制会改变战斗数值与快照结构，必须独立记录平衡基线 | 角色视觉验收稳定后，作为独立战斗机制阶段实现 |
| 专属攻击特效和技能图标 | 需要先确定战斗中角色轮廓和武器尺寸，避免按旧素材制作后返工 | 两名角色新版战场帧通过目视验收后 |
| `cutBackground`、`resize` 与连通块算法重构 | 本次重构限制在一个脚本和像素复制重复代码内，继续扩大会超过“可逐字节证明等价”的安全范围 | 新版透明角色接入时按功能需求单独修改，并目视检查全部产物 |
| 拆分 JSON/SQLite 存储后端 | 与当前角色素材目标无关，且涉及服务器持久化，不应与素材脚本重构混提 | 进入中心服务器稳定性阶段并准备双后端等价测试后 |
| 更换图像处理库或重写算法 | 本阶段只恢复既有脚本的可安装性，混入算法变更会无法判断产物变化来自依赖还是实现 | 作为独立素材管线重构阶段，并验证生成文件哈希 |
| 修改真实玩家的新档随机种子 | 本阶段目标只修复测试可复现性；固定真实玩家种子会让全部玩家共享同一掉落序列 | 不纳入，真实玩家必须继续使用随机种子 |
| 宝箱开启动画 | 本阶段宝箱开箱是「点一下 → 数值入包 → toast 提示」，没有开箱的视觉过程。用户本次只要求「能点开」 | 用户要求开箱有仪式感（逐件飞出、上扬音效）时 |
| 宝箱批量分解 / 一键按档位开 | 目前只有「全部打开」与单个「打开」两种 | 玩家反馈箱太多点不过来时 |
| 宝箱存入仓库 | 宝箱当前只在 `state.chests`，背包满了也不能存 | 加「宝箱位」或允许超量暂存时 |
| `balance.cjs` 多种子批量模式 | 本阶段用 shell 循环跑 5 个种子得到均值，够用但不可复现命令 | 需要长期回归对比时，改为一条命令跑 N 个种子并输出均值与标准差（见第 4 节 4.16） |
| 改 `gear.js` 的 rarityShift 偏移公式 | 该公式是魔方/制作/普通掉落/世界事件的公共路径，改动会同时影响所有产出途径 | 有完整的多维回归基线（战斗、魔方、世界事件）后，作为独立阶段处理 |

**干净克隆验证（规范 3.5.1，阶段 3 实际执行）**

从本仓库 HEAD 克隆到临时目录 `fresh`，全程独立于原工作目录：

```
git clone <本仓库> fresh            -> exit 0
  -> 55 个文件
  -> engine/data/ 6 个文件齐全（阶段 2 修复未回退）
  -> 素材：public/assets/heroes 10 张、assets-src/heroes 4 张
  -> data/ 未入库（正确）、node_modules 未入库（正确）

npm install                         -> added 39 packages，exit 0
npm test                            -> exit 0，smoke 14 组 + ui-smoke 10 组全绿
npm start（PORT=8899）              -> exit 0，curl 返回 HTTP 200
node scripts/e2e.cjs                -> exit 0，末行「✅ 全部通过」
node scripts/reset.js               -> exit 0，players / kv 表剩余 0
```

**意外发现：干净目录里 `better-sqlite3` 编译成功了。**

`npm install` 在干净目录里带上了预编译二进制，服务器以 SQLite 模式启动
（`存储: SQLite（data/game.db）`），生成了 `game.db`。这与主工作目录的情况不同 ——
主目录那次安装跳过了原生构建，模块不可用。

也就是说这台机器**同时存在两种可用形态**：

| 目录 | better-sqlite3 | 存储模式 | 验证结果 |
| --- | --- | --- | --- |
| 主工作目录 | 不可用（无 `.node` 二进制） | JSON 文件 | e2e 全绿、reset 正常 |
| 干净克隆目录 | 可用 | SQLite | e2e 全绿、reset 正常 |

因此本阶段的修复在**两种模式下都实测通过**，不只是验证了降级路径。

这也带来一条需要记住的环境事实：`npm install` 是否会带上原生模块，
取决于安装时能否取到预编译二进制，**不能假定某台机器一定有或一定没有**。
所以两条路径都必须能跑通 —— 这正是本阶段把判定改为「真实构造探测」的原因：
不能用「require 成功」当作「模块可用」。

**测试脚本的端口依赖（本次实测踩到）**

`scripts/e2e.cjs` 的 `TEST_URL` 默认写死 `ws://localhost:8787/ws`（第 6 行），
`node server/index.js` 的默认端口也是 8787。两者一致时直接 `npm run test:e2e` 没问题。
但若用 `PORT=8899 node server/index.js` 启动，必须显式传 `TEST_URL`：

```
TEST_URL=ws://localhost:8899/ws node scripts/e2e.cjs
```

否则 e2e 会连到 8787 上**另一个实例**（本机当时正开着主目录的服务器），
表现为「玩家链路通过、GM 链路超时等待 welcome」——
因为玩家连接落到了错误实例，而 GM 令牌是按本目录 `data/server.json` 读的，
两个实例的令牌不一致，握手被拒。**这个报错信息极具误导性**，
一度让人误判为 SQLite 模式下 GM 链路有缺陷。

| 排除项 | 排除原因 | 纳入条件 |
| --- | --- | --- |
| 移动端精调布局 | 首版与用户确认「先做 PC 端」；CSS 已有 900px / 520px 断点可用，但侧栏 Tab 未改底部标签栏 | 用户确认要手机游玩体验后再做 |
| 存档加密与令牌校验 | 自托管 2~3 人熟人局，防作弊收益低于复杂度 | 开放公网或人数 > 5 时 |
| 多人战斗快照增量推送 | 现为每 tick 全量 ~6 KB，当前规模足够 | 人数 > 6 或带宽出现瓶颈时 |
| 武器/防具像素图 | 装备图标用 `gear-ui.js` 的 SVG 程序化生成（按槽位 + 稀有度配色） | 追求美术品质时替换为图片资源 |
| 音效与背景音乐 | 未列入用户需求，且素材无来源 | 用户提供音频素材 |
| 符文节点扩充到 197 | 现有 50 节点已覆盖 8 分支，长期成长深度不足但不影响可玩性 | 长期内容规划阶段 |
| CI 自动化 | 当前为单人本地项目，靠 `scripts/` 三个脚本手动回归 | 多人并行开发时接入 |
| 掉落物被小队「走过去捡」的位移动画 | 本阶段只做了原地弹跳 + 飞向小队左侧的捡取动画。真正让 `heroGroup` 的 `left` 移动到掉落点需要额外的目标点插值，会与波次推进的 `targetLead` 抢同一个位置值 | 掉落物数量与位置需求明确后再做 |
| 掉落流水落盘 | `run.drops` 只存在运行时，不写入存档。断线重连后当前 run 的历史掉落动画不会补播（收益已入账，不受影响） | 用户要求「回放上一场战斗的掉落」时 |
| 无头浏览器截图回归 | `agent-browser` 已安装（阶段 14 实机验收使用），但截图比对尚未脚本化进 `scripts/`；视觉验证目前是「实机操作 + 截图人工核对」，仍非自动回归 | 把固定操作序列（登录→符文页→截图）写成 `scripts/visual-check.cjs` 并对比基线图 |

**命中规范 4.7 阈值但本阶段未做的重构（技术债登记）**

`git log --oneline` 在阶段 3 开工前为 5 条，已达 4.7 的「每累积 5 个版本做一次
限定范围重构」阈值。规范 4.8 要求先重构再开工，本次未执行，原因与偿还条件：

| 债务项 | 未重构原因 | 偿还条件 |
| --- | --- | --- |
| `server/db.js` 的 `Store` 类（190 行）每个方法都有 `if (this.useSqlite)` 分支，同一逻辑写两遍（`loadAllPlayers` / `savePlayer` / `getKV` / `setKV` / 公告 / 世界事件 / 审计 共 7 组）。可拆成 `SqliteBackend` 与 `JsonBackend` 两个后端类，`Store` 只做委派 | 阶段 3 的唯一目标是修复降级失效并验证服务器可启动。混入结构重写会让「降级路径是否等价」无法验证 —— 重构后测出行为差异时，无法区分是重构引入的还是修 bug 引入的 | 下次开工前，或积累 5 条 commit 后，独立做一个 `refactor:` 提交。重构须满足 4.7.2：`smoke.cjs` 与 `balance.cjs 6` 输出与重构前逐字节一致 |
| `scripts/smoke.cjs` 不可复现（见第 4 节 4.10） | 属测试可复现性修复，与本阶段存储修复不混提（规范 0.4 一次 commit 一个阶段目标） | 单独提交：给 `createNewSave` 传固定 `seed`，与当初修 `balance.cjs` 的做法一致 |

## 4. 已知问题与坑

### 4.26 排行榜当前按每秒全量推送

- **复现条件**：启动服务器并让大量玩家同时在线，观察每秒一次的 `leaderboard` WebSocket 消息。
- **影响范围**：`server/index.js` 的网络带宽与 `public/js/leaderboard-ui.js` 的整表重绘；当前几十人无明显影响，
  玩家数很大时消息大小与在线人数相乘。
- **规避或临时修复手段**：当前保持公开字段精简；达到 200 个存档前继续全量模式，超过阈值时改为服务端
  固定排序、分页与变更序号增量推送。
- **是否已登记跟踪**：是，已在第 3 节登记容量升级条件。
### 4.24 第二、三幕仍使用 Emoji 怪物

- **复现条件**：把关卡切到 2-1 或 3-1 并开始挂机。
- **影响范围**：`public/js/stage.js` 的第二、三幕敌人视觉；第一幕、战斗结算和存档不受影响。
- **规避或临时修复手段**：当前 `spriteOf()` 只把第一幕8个 sprite 键映射到 PNG，其余键明确回退
  到原 Emoji；完成第二、三幕素材前不要删除 `SPRITES` 回退表。
- **是否已登记跟踪**：是，列入第二、三幕视觉阶段。

### 4.23 新版武器已有静态轮廓，但攻击仍沿用通用位移动画

- **复现条件**：任意角色开始挂机并观察普攻；牛马只做向上突进，肉蛋葱只显示通用剑形投射符号。
- **影响范围**：`public/js/stage.js` 的战斗反馈。新版盾牌、扫码枪与葱炮能在角色帧中看见，
  但尚未参与攻击动作，角色机制辨识度仍主要来自静态外观。
- **规避或临时修复手段**：当前不影响结算与可玩性；先使用新版四帧行走图，
  下一阶段为两人分别增加盾击/扫码闪光与葱弹投射效果。
- **是否已登记跟踪**：是，列入角色战斗特色阶段。

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

### 4.20 `engine/save.js` 的 `createNewSave` 默认种子是随机的

- **复现条件**：任何不传 `opts.seed` 的调用。
- **影响范围**：所有新建存档的玩家。`engine/save.js:61` 用 `Math.floor(Math.random() * 2 ** 31)`。
  对真实玩家这是正确行为（每人对局不同），但对任何需要可复现的脚本都是陷阱。
- **规避手段**：写测试或模拟脚本时必须显式传 `seed`。不要为了「方便」把 `createNewSave`
  的默认值改成固定值——那会让所有玩家的掉落序列完全一致。
- **已登记跟踪**：是，待在 `engine/save.js` 的这行加注释标明该约束（本次未改，避免与功能提交混提）。

### 4.21 `scripts/ui-smoke.cjs` 的 DOM 桩与浏览器有三处已知差异

- **复现条件**：依赖桩未实现的行为写断言。
- **影响范围**：前端测试的可信度。具体差异：`setTimeout` 改为异步队列（`flushTimers()` 手动驱动）；
  `classList.add` 不回写 `className` 字符串，判定样式要用 `classList.contains`；
  `getBoundingClientRect` 返回固定值，所以所有元素的坐标相同，测不了定位逻辑。
- **规避手段**：写断言前先确认桩是否实现了该行为。判定元素是否被回收用
  `dataset.collected`，不要用 `className.includes('collected')`。
- **已登记跟踪**：部分已修复，第三条（坐标）待处理，见第 3 节「无头浏览器截图回归」。

### 4.22 掉落流水只保留最近 8 条

- **复现条件**：单次 tick（1 秒）内击杀数超过 8，或客户端断线重连。
- **影响范围**：`run.drops` 会被 `splice` 截断到 8 条（`engine/combat.js` 的 `DROP_LOG_MAX`）。
  极端情况下前端会漏播最早的几条掉落动画，但**不影响任何实际收益**——
  金币与经验在 `handleCombatEvent` 里已直接入账，流水只是给前端看的。
- **规避手段**：无需处理，这是有意的设计。若要调大，改 `DROP_LOG_MAX` 并同步评估快照体积。
- **已登记跟踪**：否，属预期行为。


### 4.11 原生模块的可用性判定不能只包住 `require()`

- **复现条件**：安装一个需要编译的原生依赖（`better-sqlite3` 等），
  但机器上没有对应工具链。npm 会**静默跳过构建并返回退出码 0**，
  `require('module')` 加载纯 JS 包装层成功返回构造函数，
  直到 `new Database()` 才抛「Could not locate the bindings file」。
- **影响范围**：任何「装不上就降级」的设计。判定写在 `try { require } catch` 里时，
  降级分支永远不会执行，`useSqlite` 之类的标志位被误判为真，
  进程在降级本该生效的地方崩溃。这是 `server/db.js` 与 `scripts/reset.js`
  在阶段 3 之前的实际状态——README 承诺的 JSON 兜底是假的。
- **规避手段**：可用性判定必须包含一次真实的构造调用
  （`new Database(':memory:')` 并 `close()`，不碰磁盘、无副作用），
  把 require 与构造一起包进 `try`。已收敛为 `server/db.js` 的 `detectSqlite()`，
  `scripts/reset.js` 复用同一函数，不要各自再写一遍判定。
- **检测方法**：这类缺陷在「原生模块已装好」的机器上完全不可见。
  换机器或换 Node 大版本后才暴露。验证方式只能是缺工具链环境下的冷启动，
  或主动构造失败（如临时改坏 `.node` 路径）来测兜底路径。
- **是否已登记跟踪**：已修复（阶段 3）。`npm start` 与 `npm run reset`
  在无 Build Tools 的 Windows 上均实测通过。

### 4.12 降级模式下 `reset` 之前完全不可用

- **复现条件**：在 `better-sqlite3` 不可用的机器上执行 `npm run reset`。
- **影响范围**：`scripts/reset.js`。修复前该命令在此类机器上直接抛异常退出，
  玩家无法清档 —— 而降级模式恰恰是这些机器唯一能用的模式，
  等于「唯一可用的存储模式下，清档功能不可用」。
- **规避手段**：已修，`reset.js` 现在按 `detectSqlite()` 的结果分流：
  sqlite 可用走 SQL，不可用改写 `data/fallback.json` 的对应字段。
  GM 令牌在 `server.json`，不在该文件内，因此普通 reset 不会误删令牌
  （已实测：清档后 `server.json` 仍存在）。
- **是否已登记跟踪**：已修复（阶段 3）。

### 4.13 e2e 连错实例时的报错极具误导性

- **复现条件**：本机 8787 端口已有服务器 A 在跑，另用 `PORT=8899` 启动服务器 B，
  然后在 B 的目录里直接执行 `node scripts/e2e.cjs`（不传 `TEST_URL`）。
- **影响范围**：`scripts/e2e.cjs` 的第 6 行，`TEST_URL` 默认写死 `ws://localhost:8787/ws`。
  玩家链路会连到实例 A 并正常通过，GM 链路因令牌不匹配被拒，
  最终报「超时等待 welcome」。看起来像 GM 功能坏了，实际是测错了实例。
  阶段 3 的干净克隆验证中真实踩到过一次，一度误判为 SQLite 模式下 GM 链路有缺陷。
- **规避手段**：非默认端口启动时必须显式传 `TEST_URL=ws://localhost:<端口>/ws`。
  判断连的是哪个实例：看服务器启动横幅里的端口，或先 `curl` 目标端口确认。
- **是否已登记跟踪**：是。待改为默认从 `process.env.PORT` 推导端口，
  消除「两个默认值必须手工保持一致」这个隐式约束。属独立阶段目标。

### 4.14 测试夹具比真实数据「更完整」会让用例自欺

- **复现条件**：在 `scripts/ui-smoke.cjs` 写夹具时，凭印象给对象补上引擎其实不发的字段。
- **影响范围**：前端测试的可信度。阶段 4 实测踩到：旧夹具给英雄对象写了
  `sprite: 'niuma'`，而真实引擎只下发 `classId`。`stage.js` 读 `h.sprite` 拼素材路径，
  这个缺陷在浏览器上表现为「战场只有血条、人物不显示」，
  但测试里拼出的路径始终是合法的 `niuma_walk_*.png`，**用例永远测不出错**。
  夹具比真实数据更完整时，测试是自欺的。
- **规避手段**：写夹具时用引擎真实输出的字段集。可直接从引擎取一份样本核对：
  ```
  node -e "const {Player,createNewSave}=require('./engine/game');
    const p=new Player(createNewSave('t',{seed:20260101}));
    console.log(Object.keys(p.view().heroes[0]).join(', '))"
  ```
  已把 `sprite` 从夹具里去掉（阶段 4 第 11 组）。
  另：新增用例后必须做一次「回退修复看用例是否 FAIL」的对照，
  否则无法确定用例是真的有效还是只是恒过。方法见第 1 节阶段 4 的
  「用例有效性验证」。
- **是否已登记跟踪**：已修复（阶段 4）。但这是个会复发的写法问题，
  后续每加新夹具都应核对字段集。

### 4.15 图片 404 在战场上是静默失败

- **复现条件**：素材路径拼错（字段名写错、classId 改名、文件没入库），
  浏览器加载 `<img>` 失败。
- **影响范围**：所有用图片的角色/怪物显示。表现为「元素存在但空白」——
  `.walk` 容器高 96px，血条与名牌照常渲染，只有图不见。
  本项目中血条不依赖图片，所以「只剩血条」是这类缺陷的典型表征。
  控制台通常只有一条 404，不主动看网络面板发现不了；
  `ui-smoke.cjs` 也不校验真实图片加载（见 4.6 与 4.9）。
- **规避手段**：
  1. 素材路径一律经具名函数拼接，不在模板字符串里直接取字段（阶段 4 的 `heroSprite`）。
  2. 用例里逐帧核对文件真实存在（阶段 4 第 11 组已做）。
  3. 目视验证：改素材相关代码后打开页面确认人物可见
     （`http://localhost:8787`，需 `Ctrl+F5` 强刷避开缓存）。
- **是否已登记跟踪**：是。彻底解决需要无头浏览器截图回归（见第 3 节该项）。

### 4.16 单种子平衡对比会把方向判反

- **复现条件**：改动数值后只跑 `node scripts/balance.cjs 6`（默认 seed=20260101），
  拿单条样本线与基线逐项对比。
- **影响范围**：规范 4.3「变化方向」与 4.3「是否超出预期区间」的判断。
  `balance.cjs` 虽然可复现（固定种子），但**单条样本线的方差极大**。
  阶段 5 实测踩到：宝箱升级后单种子对比显示「通关 19→17、EHP 11441→7564（-34%）」，
  与改动方向矛盾（箱内装备更好、金币更多，战力不该下降）。
  改用 5 个种子对照后结论完全反转：
  | 种子 | 111 | 222 | 333 | 444 | 555 | 均值 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 基线版 | 16 | 13 | 13 | 16 | 16 | 14.8 |
  | 改动版 | 18 | 19 | 19 | 14 | 19 | **17.8** |
  即改动实际是 **+20% 的正向提升**，`20260101` 只是恰好落在改动版的偏低位、
  而基线版在该种子上偏高。单点对比把方向判反了。
- **规避手段**：曲线类改动必须用多种子均值，样本数 ≥ 5，且要同时跑基线版与改动版。
  只跑一个种子得出的「下降」结论，在方向与改动语义矛盾时，
  优先怀疑是噪声而不是直接下结论。
- **是否已登记跟踪**：是。根治需要给 `balance.cjs` 加多种子批量模式
  （输出一条命令跑 N 个种子并汇总均值与标准差），属独立阶段目标。

### 4.17 前端稀有度配色表曾与引擎键名错位

- **复现条件**：前端单独维护一份 `RARITY_COLOR` 常量表。
- **影响范围**：掉落预览与宝箱预览的配色。`public/js/stage.js` 原有的表只有 6 档，
  且用了 `Epic` / `Mythic` 两个键名 —— 这两个 id 在
  `engine/data/items.js` 的 `RARITIES` 里**根本不存在**（引擎实际是
  `Immortal` / `Arcana` / `Beyond` / `Celestial` / `Divine` / `Cosmic`）。
  于是 6 档以上的掉落预览全部退回默认灰色 —— 越稀有的装备反而看不出稀有。
  该缺陷自阶段 1 引入掉落预览起一直存在，无人目视到高稀有掉落所以未被发现。
- **规避手段**：配色表必须以 `engine/data/items.js` 的 `RARITY_COLOR` 为准，
  档数与键名都要对齐，不要凭印象写。现已改为完整 10 档，
  并从 `StageUtils.RARITY_COLOR` 导出给 `app.js` 复用（单一来源）。
- **是否已登记跟踪**：已修复（阶段 5）。新增依赖该表的页面时，
  一律从 `StageUtils.RARITY_COLOR` 取，不要再各自定义一份。

### 4.18 改档位键名时有三处必须同步

- **复现条件**：把某个枚举键改名（本项目 `normal` → `common`，阶段 5）。
- **影响范围**：符文效果、配置表、冷却遍历。改名时有三处引用同一批键名：
  1. `engine/data/runes.js` 的符文 `effects.autoOpen`
  2. `engine/data/config.js` 的 `loot.autoOpenBaseSeconds`
  3. `engine/game.js` 的冷却遍历数组（原为硬编码 `['normal','boss','actBoss']`）
  漏改任一处的表现是**静默失效** —— 例如符文仍写 `normal`，
  而 `auto` 集合里永远匹配不到任何宝箱，该符文变成纯粹的 150000 金消费，
  没有任何效果，也不会报任何错。
- **规避手段**：遍历处改为引用 `loot.CHEST_TIER_ORDER` 而不是硬编码数组，
  新增档位时自动纳入。配置表与符文的键名在注释里互相标注。
  另：`autoOpenChests` 里显式声明「common 档符文覆盖 fine 档」——
  波次箱 30% 是 fine，若严格按档位匹配，精良箱会漏自动开。
- **是否已登记跟踪**：已修复（阶段 5）。新增档位时三处都要看。

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
- **规避手段**：改 CSS 动画后必须打开游戏页面目视验证至少一个完整的「推进 → 互砍 → 掉落」循环。
  阶段 14 起 `agent-browser` 已可用（Chrome 155），可实机操作 + 截图核对；
  自动比对仍未脚本化（见第 3 节排除项）。
- **已登记跟踪**：是。

### 4.25 `agent-browser` 的 eval 上下文会在两次独立 shell 调用间回到 about:blank

- **复现条件**：用 Bash 分多次调用 `agent-browser eval ...`，前一次还指向游戏页面，
  下一次 `eval` 就落在 `about:blank`（`document.body.children.length` 为 0、localStorage 报
  Access denied）。怀疑与沙箱每次调用可能连到不同 daemon 实例有关。
- **影响范围**：所有浏览器自动化验收流程。element 查找类命令（fill/click）同样受累，
  报「Element not found」极具误导性——元素在页面上确实存在。
- **规避手段**：把整个浏览器工作流（open → 登录 → 切页 → eval → 截图）串在
  **同一条 shell 命令**里用 `&&` 连续执行，中间不换 Bash 调用；单条命令内上下文稳定。
  会话中断后用 `open + fill 令牌` 重登即可恢复存档（令牌在 `data/fallback.json`）。
- **已登记跟踪**：是，本条即登记。

### 4.7 `.gitignore` 的 `data/` 曾把 `engine/data/` 一起排除（已修复，务必记住）

- **复现条件**：`.gitignore` 里写 `data/`（无前导斜杠）+ 仓库里存在任意层级的 `data` 目录。
- **影响范围**：**全部游戏内容**。`engine/data/` 下是角色、怪物、装备、符文、宠物、成就与所有数值，
  被 `data/` 这条规则一并排除后根本没进仓库。在原机器上因为文件还在磁盘上所以完全无感，
  但换一台电脑 `git clone` 后立刻 `Error: Cannot find module './data/classes'`，
  游戏无法启动。这是「换机器继续开发」场景下最致命的一个坑。
- **规避手段**：只排除仓库根的运行数据，写成 `/data/`（带前导斜杠）。
  已用 `git check-ignore -v` 验证：`data/game.db` 被排除、`engine/data/classes.js` 未被排除。
- **检测方法**：改动 `.gitignore` 或调整目录结构后，必须做一次**干净克隆验证**——
  `git clone <repo> <新目录>`，在新目录里跑 `npm test`。只看原机器永远发现不了这类问题，
  因为缺失的文件还在本地磁盘上。
- **已登记跟踪**：已修复（commit 见 `fix: 修复 .gitignore 误排除 engine/data`）。

### 4.8 `package.json` 曾有两个指向不存在文件的脚本

- **复现条件**：执行 `npm test` 或 `npm run seed`。
- **影响范围**：新机器上手第一步就报错。`test` 指向 `engine/test.cjs`、
  `seed` 指向 `scripts/seed.js`，两个文件都不存在（实际脚本在 `scripts/*.cjs`）。
- **规避手段**：已把 `test` 改为 `node scripts/smoke.cjs && node scripts/ui-smoke.cjs`，
  并补上 `test:engine` / `test:ui` / `test:e2e` / `balance` / `assets`。
  删除不存在的 `seed`。已逐个验证 9 个脚本目标文件全部存在。
- **已登记跟踪**：已修复。

### 4.9 启动日志不打印 GM 令牌明文

- **复现条件**：把启动横幅的输出复制到任何地方（交接文档、commit 说明、issue、聊天记录）。
- **影响范围**：令牌会随日志进入 git 历史且永久留存，删文件也删不掉。
  本项目已因此泄漏过一次，修复方式是重写全部提交 + `git gc --prune=now`。
- **规避手段**：启动横幅只打印令牌所在文件路径。写文档引用验证结果时，
  引用「令牌见 data/server.json」，不要粘贴日志里的令牌行。
- **已登记跟踪**：是，见 AGENTS.md 与 `HANDOFF.md` 中的相关条款。
