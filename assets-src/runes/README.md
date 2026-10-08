# 符文图标源素材说明

本目录下的符文图标**没有二进制源图**——源图形以代码形式定义在
`scripts/prep-rune-assets.cjs`（像素绘图原语 + 18 个绘制函数），
运行脚本生成 `public/assets/runes/rune-<key>.png`。

- 素材性质：项目自有素材（程序化绘制），不来自 Kenney 或任何第三方包
- 修改图标的正确方式：改 `scripts/prep-rune-assets.cjs` 后重新运行脚本
- 禁止手工覆盖 `public/assets/runes/` 下的产物（AGENTS.md 2.2.6）
- 许可登记见 `assets/LICENSES.md`
