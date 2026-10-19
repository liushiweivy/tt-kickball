# 闪身步 · 弹踢道场（tt-kickball · 抖音小游戏版）

弹反玩法 × 花鼓灯身法包装的**抖音小游戏**：敌人从城楼发球，你用「闪身步」穿球、用「踢」把能量弹反弹回去打敌人。七阵通关，纯 Canvas、零素材零依赖（音效用 WebAudio 合成）。

> 同源项目：微信小游戏版 `E:\1workspace\wx-kickball`，网页版内核共用。本目录是抖音移植版，**不改动原版**。

## 玩法

- **白球（能量弹）**：球贴身前一瞬间按 **踢** = 完美反弹，球变金色飞回敌人，掉血 + 涨敌人架势；按早了只能把球踢偏保命，自己涨架势。
- **红球（危）**：踢不了，硬吃 26 血。只能按 **闪身**，用无敌帧（0.2s）从球上穿过去。
- **架势**：自己架势满 → 崩体硬直 1.1s；敌人架势满 → 踉跄 2.5s，此时踢回金球命中 = **忍杀**，直接清空一管血。
- 七阵：巡场武生 → 疾风刀客 → 赤甲教头（两管血）→ 夜鹞子 → 铁猿双煞（双血条）→ 危球天师 → 镇场宗师·白眉（三管血）。

花鼓灯梗包装（闪身步 / 浪子踢球 / 隆咚哐鼓点 / 狗熊哆嗦毛 / 伞森步称号）详见微信版 README。

## 抖音适配点（相对 wx-kickball）

| 项 | 微信 | 抖音 |
|---|---|---|
| 平台对象 | `wx` | `tt`（main.js 内 `api` 归一，tt 优先、wx 兜底） |
| 主屏画布 | `wx.createCanvas()` | `tt.createCanvas()` |
| 触摸 | `wx.onTouchStart/End/Cancel` | `tt.*` 同名；坐标增加 `screenX/screenY` 兜底（抖音文档只保证 screen 系） |
| 音频 | `wx.createWebAudioContext()` | **`tt.getAudioContext()`（基础库 ≥1.34.0）**；抖音无 BiquadFilter，鼓皮噪声的低通改为一阶 RC 滤波烘焙进 PCM |
| 生命周期 | onShow | onShow + 新增 **onHide 松键**（回后台释放所有按住键） |

core.js / render.js / tests **零改动**（纯逻辑 UMD + 纯绘制函数）。

## 运行

1. 打开**抖音开发者工具**（本仓用 4.5.6 验证）→ 导入项目 → 选择本目录 → 类型「小游戏」。
2. AppID 选**测试号**（可编译/预览调试，不可上传）；`project.config.json` 里 appid 留空，导入时手动选测试号。
3. 基础库 ≥ 1.34.0（音频需要）。

浏览器联调（core/render/audio 均无强平台依赖）：

```powershell
# Git Bash
"/c/Users/4v/AppData/Local/Programs/Python/Python312/python.exe" -m http.server 8821
# 打开 http://127.0.0.1:8821/harness/index.html
```

harness 内置 `tt` shim（含 screenX/Y 双坐标），默认静音。

## 测试

```powershell
node --test tests/core.test.mjs tests/balance.test.mjs
```

- 20 个测试全绿：17 机制测试 + 3 bot 平衡测试（会玩的 bot 三种子满血通关 / 乱按必败 / 站桩敌人不掉血）。
- harness 实测：bot 三波满血通关（29 次完美踢、68.6s），截图见 `docs/`（title/fight/victory），console 0 error。

## 发布备注（暂未做）

- 测试号不能上传；正式发布需在抖音开放平台注册小游戏 AppID（游戏类目通常需企业主体 + 版号等资质）。
- 上传有审核预检：**必接「侧边栏复访」`tt.navigateToScene`**，否则上传被拦截；建议接添加桌面/订阅消息。本地编译与预览不受影响。

## 结构

```
game.js              入口：require("./js/main.js")
game.json            竖屏配置
project.config.json  抖音工程配置（appid 留空=导入时选测试号）
js/core.js           纯逻辑 UMD（战斗/波次/鼓点节拍，仅用 Math，可注入随机源）
js/render.js         纯绘制（吃 ctx，无 DOM）
js/audio.js          WebAudio 合成（tt.getAudioContext / wx / 浏览器 三分支）
js/main.js           平台层：画布、触摸、固定 60Hz、音频转发、生命周期
harness/index.html   浏览器 tt shim + 同步 CommonJS 加载器
tests/               node:test 机制 + 平衡测试
docs/                harness 实测截图
```
