# 网页交互音效

以下五个文件均由用户提供的 CC0 音效裁剪、滤波及调整峰值音量后生成。
允许复制、修改与分发，包括随本公开仓库分发。没有引入游戏或直播音轨。

| 输出文件 | 原素材及作者 | 编辑 |
| --- | --- | --- |
| `tile-land.wav` | [dom_play.mp3 — UnycodeAdmin](https://freesound.org/people/UnycodeAdmin/sounds/705347/) | 原解码音频 0.026–0.249 秒；单声道，低通 6.8 kHz，峰值 −6 dBFS |
| `stick-impact.wav` | [Pen Drop on Paper.mp3 — Coonick](https://freesound.org/people/Coonick/sounds/235664/) | 0.282–0.348 秒，仅保留第一次碰撞，不携带原录音后续回弹；低通 6.5 kHz，峰值 −6 dBFS |
| `stick-rebound.wav` | [LEGO Double Click 1 — rioforce](https://freesound.org/people/rioforce/sounds/233658/) | 0.028–0.051 秒，仅保留第二次塑料碰撞；低通 5.2 kHz，峰值 −9 dBFS |
| `button-click.wav` | [Interface Sounds — Kenney](https://kenney.nl/assets/interface-sounds)，`click_002.ogg` | 去除尾部空白；低通 6.5 kHz，峰值 −8 dBFS |
| `button-switch.wav` | 同上，`switch_006.ogg` | 去除尾部空白；低通 6 kHz，峰值 −8 dBFS |

统一输出为 44.1 kHz、16-bit PCM、单声道 WAV；100 Hz 高通去除低频杂音，
约 0.5 ms 淡入及最多 8 ms 淡出避免裁切爆音。文件合计约 42 KB。
播放时另有总音量、每类音量、轻微音高变化和波纹同时落定的合并控制。

许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。
Kenney 原包许可原文见 [Kenney-CC0.txt](./Kenney-CC0.txt)。
