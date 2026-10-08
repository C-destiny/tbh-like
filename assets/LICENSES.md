# 素材来源与许可证记录

本文件逐条登记项目使用的第三方素材包及其许可证。
**发布、替换素材、排查版权时，先翻本文件。**

记录建立时间：2026-10-08
核实方式：下载后逐个读取包内 `License.txt` / `license.txt` 原文，非仅凭网页标注。

---

## 一、Kenney 素材包（4 个）

**统一来源**：https://kenney.nl
**统一许可证**：CC0 1.0 Universal（公共领域奉献）
**CC0 全文**：https://creativecommons.org/publicdomain/zero/1.0/

CC0 的含义：可自由用于个人与商业项目，**无需署名**，可修改。
署名非强制（但 Kenney 靠捐赠与赞助维持，署名为善意）。

### 重要限制：Kenney Logo 保留给官方项目专用

来源：Kenney 官方 Support 页面 https://www.kenney.nl/support

> 原文（英文）："Do not use our logo, as it is reserved for official projects by our studio."

中文释义：**不得使用 Kenney 的 Logo**，该标识保留给 Kenney 工作室的官方项目使用。

要点说明：
- CC0 授权覆盖的是**素材本身**（图像、音频等），**不覆盖品牌标识**
- 这条限制**不出现在各包的 License.txt 里** —— 只在官网 Support 页面
  因此不能只看包内许可证文件就认为「没有任何限制」
- 本次下载的 4 个包内**均不含Logo 文件**（已用 `find -iname "*logo*"` 核实），
  所以实际使用时不会误用；但若日后从其他渠道获取 Kenney 素材，需再次注意

---

### 1. Pixel UI Pack

| 项 | 内容 |
| --- | --- |
| 来源页面 | https://kenney.nl/assets/pixel-ui-pack |
| 下载地址 | https://kenney.nl/media/pages/assets/pixel-ui-pack/821e760f21-1677661508/kenney_pixel-ui-pack.zip |
| 许可证 | CC0 1.0（包内 `License.txt` 已核实） |
| 作者 | Kenney Vleugels，Lynn Evers 协助 |
| 发布年份 | 2015 |
| 官网标注规模 | 750 个图块 |
| 实际构成 | 36 个 PNG（含 2 张精灵图 + 9-Slice 九宫格面板 + Preview） |
| 本项目用途 | **UI 主力** —— 面板、按钮、游戏界面 |
| 落地路径 | `assets-src/kenney/pixel-ui-pack/` |
| 备注 | 9-Slice 目录提供多套主题面板（Ancient/Adventure 等），可直接用于九宫格拉伸 |

### 2. Game Icons

| 项 | 内容 |
| --- | --- |
| 来源页面 | https://kenney.nl/assets/game-icons |
| 下载地址 | https://kenney.nl/media/pages/assets/game-icons/1ebf9c14af-1677661579/kenney_game-icons.zip |
| 许可证 | CC0 1.0（包内 `license.txt` 已核实，注意文件名小写） |
| 作者 | Kenney Vleugels |
| 发布年份 | 2014 |
| 官网标注规模 | 105 个图标 |
| 实际构成 | 425 个 PNG（`PNG/Black`、`PNG/White` 两套配色）+ Vector 目录（SVG/AI 矢量版） |
| 本项目用途 | **通用操作与功能图标** |
| 落地路径 | `assets-src/kenney/game-icons/` |
| 备注 | 黑白两套配色，适配深浅背景；Vector 目录是可缩放矢量版，任意尺寸不失真 |

### 3. Tiny Dungeon

| 项 | 内容 |
| --- | --- |
| 来源页面 | https://kenney.nl/assets/tiny-dungeon |
| 下载地址 | https://kenney.nl/media/pages/assets/tiny-dungeon/f8422efb44-1674742415/kenney_tiny-dungeon.zip |
| 许可证 | CC0 1.0（包内 `License.txt` 已核实） |
| 作者 | Kenney |
| 创建日期 | 2022-05-07 |
| 官网标注 | Tile size 16 × 16，130 个图块，系列 Tiny |
| 实际构成 | 136 个 PNG（`Tiles/` 单图+ `Tilemap/` 整图 + Tiled 工程） |
| 本项目用途 | 第一幕杂兵、Boss、宝箱、金币与战场地表；不用于玩家角色 |
| 落地路径 | `assets-src/kenney/tiny-dungeon/` |
| 备注 | 官方标注 16×16，是本项目像素网格的基准；含 Tiled 工程文件便于二次编辑 |

### 4. Roguelike Characters

| 项 | 内容 |
| --- | --- |
| 来源页面 | https://kenney.nl/assets/roguelike-characters |
| 下载地址 | https://kenney.nl/media/pages/assets/roguelike-characters/53ffff4133-1729196490/kenney_roguelike-characters.zip |
| 许可证 | CC0 1.0（包内 `License.txt` 已核实，版本 2.0） |
| 作者 | Kenney |
| 创建日期 | 2015-05-20 |
| 实际构成 | 4 个 PNG（2 张精灵图 + Preview + Sample） |
| 本项目用途 | **只做杂兵原型，不做核心角色** |
| 落地路径 | `assets-src/kenney/roguelike-characters/` |
| 备注 | 新版包（2.0）只提供精灵图与样例，人物全部在精灵图内；需按`Spritesheet/spritesheetInfo.txt` 的网格参数切分 |

---

## 二、项目自有素材（非第三方）

| 素材 | 路径 | 来源 | 备注 |
| --- | --- | --- | --- |
| 双角色立绘与走路图 | `assets-src/heroes/` | 家勋提供 | `niuma_*` / `roudan_*`；抠图产物在 `public/assets/heroes/` |
| 装备图标 | 无文件 | `public/js/gear-ui.js` 程序化生成 | 内联 SVG，按槽位 + 稀有度配色，非外部素材 |
| 第一幕怪物 | `public/assets/world/monster-*.png` | Kenney Tiny Dungeon | 8 类，源图经最近邻整数倍放大 |
| 宝箱与金币 | `public/assets/world/chest-*.png`、`drop-coin.png` | Kenney Tiny Dungeon | 4 档宝箱与金币掉落 |

---

## 三、渲染规范约束（防止尺寸割裂）

素材包已按用途分档，**不整套混用**。混用是尺寸割裂的根源。

| 用途 | 唯一来源 | 说明 |
| --- | --- | --- |
| 人物 | 现有立绘（`niuma` / `roudan`）+ Roguelike Characters 改的杂兵 | 核心角色不替换 |
| UI | **仅** Pixel UI Pack | 面板、按钮统一来源 |
| 功能图标 | **仅** Game Icons | 通用操作图标 |
| 第一幕世界 | **仅** Tiny Dungeon | 杂兵、Boss、宝箱、掉落与地图装饰 |

### 缩放规范

- 常规 16×16 素材统一 **×4** 放大到 64×64；Boss 为建立层级感使用 **×6** 放大到 96×96
- 缩放方式必须 **nearest-neighbor（邻近插值）**，禁止模糊缩放
  - CSS：`image-rendering: pixelated;`
  - 现有 `public/css/style.css` 已对角色行走图设置该属性，新增素材须沿用
- 角色立绘按同一「世界单位」对齐：建议角色身高 = 2 格
  - 16×16 素材放大 ×4 后为 64×64，角色立绘对应高度应约 128 像素
  - **此对齐值为推算建议，尚未在项目中实施与目视验证**

### 交付前自查

- [ ] 新增素材的许可证已登记到本文件
- [ ] 放大倍率与项目现有素材一致
- [ ] 缩放方式为 nearest-neighbor
- [ ] 未使用 Kenney Logo
- [ ] 素材按用途分档，未跨档混用

---

## 四、待确认事项

| 事项 | 状态 |
| --- | --- |
| 放大倍率最终选 ×3 还是 ×4 | **已确认 ×4**；Boss 作为唯一例外固定 ×6 |
| 角色立绘与 16×16 网格的实际对齐效果 | **已验证**；第一幕战场 64px 怪物与 96px 英雄并排无裁切 |
| UI Pack RPG 扩展（血条、长按钮） | **备选未下载**，按需再取 |
