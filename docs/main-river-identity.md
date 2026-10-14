# 下方牌河文字：方案 03

下方 6 × 3 牌河展开后拼接显示「豬頭神龍」。中文水平居中，底部左侧为 `5h1nRyu`，右侧为 `Coder / Creator`，两块英文分别对齐中文的可见左缘与右缘。

以整幅左上角为原点，单位均为设计像素：

| 元素 | 字体 / 字重 | 字号 | 可见左缘 | 可见右缘 | 纵向定位 |
| --- | --- | --- | --- | --- | --- |
| 豬頭神龍 | Noto Sans SC / 900 | 196 | 61.744 | 840.256 | 字形顶部 125 |
| 5h1nRyu | JetBrains Mono ExtraBold / 800 | 42 | 61.744 | 232.936 | 文本基线 502 |
| Coder / Creator | JetBrains Mono ExtraBold / 800 | 42 | 466.036 | 840.256 | 文本基线 502 |

- 整幅尺寸 `902 × 596`；中文可见宽度 `778.512`，左右留白均为 `61.744`。
- 背景 `#F4F0E6`，文字 `#101010`；页面缩放时整体等比缩放。
- 英文使用真实 800 字重，所用英文、数字、空格与斜杠均为等宽字形，每格为字号的 `0.6` 倍。
- [main-river-identity.svg](../assets/main-river-identity.svg) 保存文字的矢量轮廓。字形已转为路径，运行时无需系统字体或在线字体服务。
- `buildTextures()` 在 `(151c, 200r)` 处取 `147 × 196` 的片段，`c = 0..5`、`r = 0..2`。牌缝对应的 4 像素不进入任何牌的纹理；每张牌独立携带自己的片段，悬停、展开和合牌时同步运动。
- 三处牌河全部展开后，点击任意正面牌都以该牌为中心波纹合上全部 54 张牌。合牌后仅刷新两侧随机日麻牌面，下方文字片段保留。波纹过程中忽略重复点击。

## 字体来源

- 中文：[Noto Sans SC / Google Fonts](https://github.com/google/fonts/tree/main/ofl/notosanssc)，以 900 字重的繁体字形转为轮廓。
- 英文：[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono)，采用 [Google Fonts 的可变字体](https://github.com/google/fonts/tree/main/ofl/jetbrainsmono)，固定 `wght = 800` 后转为轮廓。
- 字体许可分别保留在 [NotoSansSC-OFL.txt](../assets/fonts/NotoSansSC-OFL.txt) 与 [JetBrainsMono-OFL.txt](../assets/fonts/JetBrainsMono-OFL.txt)。

## 验证

`npm run check` 与 `npm test`；交互测试覆盖三处牌河全部 54 个合牌起点，以及翻牌、合牌中的重复点击保护。矢量图与分片坐标检查确认标题居中、底部英文齐边和共享基线。浏览器运行预览受当前环境限制，未完成；合牌与重新展开的状态逻辑已通过 Node 测试。
