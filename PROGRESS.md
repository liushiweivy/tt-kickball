# 影狼 · 弹踢道场（wx-kickball）— 进度断点

> 保存于 2026-10-15。

## 已完成

- **内核** `js/core.js`：竖屏 450×800，60Hz。三波（落武者 / 连射剑士 / 赤甲两管血 35% 危球）
  - 踢三档：完美（贴身 0.20s，金球反弹，敌掉 9 血 +28 架势）/ 蹩脚（0.20–0.40s 踢偏，自涨 14 架势）/ 裸吃 12 血
  - 踢冷却 0.30s（乱按不能全覆盖）；闪身 0.28s、无敌帧 0.20s
  - 危球 26 血踢不了只能闪身；架势满玩家崩 1.1s / 敌人踉跄 2.5s 内被金球命中忍杀秒杀一管
  - 敌人横向漂移追玩家，反弹球在飞时冻结漂移保证必中
- **测试 20/20 全绿**：`node --test tests/core.test.mjs tests/balance.test.mjs`
  - 平衡 bot：5 种子满血通关 62–77s、27–32 完美踢；乱按 bot 必败；站桩敌不掉血
- **花鼓灯梗完善（2026-10-15）**：百度调研后把「闪身步」梗落到玩法包装上（不改平衡数值）
  - 完美踢飘字「浪子踢球！」（花鼓灯本有同名动作）、闪身穿球飘字「闪身步！」/「闪身步」、崩架势飘字「哆嗦毛…」（楷体金字 pop+fade）
  - 敌人蓄力改三拍鼓点（隆·咚·哐）：core 发 drum 事件（telegraphBeat 助手，render 共用），audio 合成低鼓，render 手下三盏鼓灯逐一点亮
  - 闪身身姿侧倾 0.22rad（花鼓灯侧闪味）；标题页花鼓灯副标题；死亡页「鼓点没踩上」；战功称号：无伤「伞森步·身法大成」（王嘉尔口误梗）/ ≥60 血「浪子踢球·名手」/ 残血「鼓架子还得再练」
  - harness + Playwright 逐屏验证 6 张截图归档 docs/kick-meme-*.png；bot 无伤通关 61.6s / 25 完美踢
- **表现层**：render.js（月夜城楼、火柴人、球拖尾、危字、虚拟按键+冷却扇形、HUD/标题/死/战功）、audio.js（合成音效）、main.js（wx 画布/DPR/触摸/固定步长）
- **浏览器 harness 真机验证**：harness/index.html（wx shim）+ Playwright 注入 bot
  - 标题、实战（赤甲双血条+金球飞行）、战功页截图均正常；bot 满血通关 61.8s / 26 完美踢 / 4 忍杀
  - harness 抓到并修复标题页 HUD 空指针（g.enemy 为 null）、危球闪身未入统计两个 bug
- 小游戏配置：game.js / game.json（竖屏）/ project.config.json（appid = wx6ac3f5090a6b99c5 小游戏游客固定 AppID）

## 环境备忘（坑）

- 微信开发者工具 2.02.2609231，装在 `%LOCALAPPDATA%\WeChatDevTools`（cli.bat 在根目录）
- **CLI 的 auto/open 通道拒绝游客 AppID**（"不存在此 AppID"），GUI 导入不受影响；
  小程序游客号是 `touristappid`，小游戏游客号是 `wx6ac3f5090a6b99c5`（从 app.asar 挖出 GAME_TOURIST_APPID）
- miniprogram-automator 装在 `%TEMP%\kick-auto`（auto 端口方案因游客号走不通，暂未用上）
- 静态服务脚本：`%TEMP%\kick-serve.mjs`（端口 8778，根目录 wx-kickball；注意 resolve 统一盘符斜杠，否则 403）
- 截图：E:\1workspace\kick-{title,fight,victory}.png

## Code review 第二轮（2026-10-15，梗改动，APPROVE：0 CRITICAL / 0 HIGH / 1 MEDIUM / 3 LOW）

- MEDIUM：飘字贴墙出屏裁切 → spawnFloat 内横向夹取 [64, W-64]，加测试
- LOW：鼓点节拍公式 core/render 两处重复 → 导出 telegraphBeat 共用（render UMD 注入 require("./core.js")，harness/微信均支持）
- LOW：drawEnemy 超长 → 抽出 drawTelegraph；称号逻辑抽出 victoryRank；castDur/3 > 0.05 帧上限写注释钉住
- 轮外发现（首轮前就存在）：main.js 帧前事件预排空不消费，120Hz 屏可能重复播放按键音 → 播放后 `events.length = 0`

## Code review 第一轮（2026-10-15，code-reviewer，0 CRITICAL / 2 HIGH，已全部修复）

- HIGH：帧间事件（kick/dash 按键音、start/wave 开场鼓）被 update 清队列丢弃 → main.js 步进前先排空一次
- HIGH：Boss 已打掉血条段画成满血 → 已灭段 ratio=0（截图 docs/kick-bossbar.png 验证）
- MEDIUM：harness/ 加入 packOptions.ignore
- LOW：同帧胜利/死亡覆盖（mode!==fight 不判死）、结算清飞球、acc 追赶钳制、getWindowInfo 新 API、死代码与硬编码常量清理

## 下次待做

1. [ ] 用户在开发者工具 GUI 导入项目（测试号）确认模拟器/真机效果 —— CLI 自动化此路不通
2. [ ] 真机触屏手感微调（按键位置/大小、DPR 异形屏 safe area）
3. [x] code-reviewer 过一遍，处理 CRITICAL/HIGH（2026-10-15 完成）
4. [ ] 需要发布时换正式 AppID，加分享/排行榜（wx.openDataContext）
5. [ ] 收尾归档：更新 1AI topic；可选推 GitHub

---

# 2026-10-16：抖音移植完成 + 闪身步动画返工（进行中）

> 本文件上半是 wx-kickball 断点；以下起为本目录（tt-kickball）专用。

## 抖音移植状态（WF1 已完成，细节见 README）

- `js/core.js` / `js/render.js` / `tests/` 与 wx-kickball **零差异**（diff 实测仅 audio.js、main.js 不同：tt.getAudioContext、onHide 松键、screenX/Y 兜底）
- 20 测试绿：`node --test tests/core.test.mjs tests/balance.test.mjs`
- 浏览器联调：**8821 端口的跨会话 http 服务仍在跑**（curl 验 main.js 含 onHide = tt 版根目录）；新增 `tools/serve.mjs`（node 零依赖静态服务，系统 python/py 已坏时替代，`node tools/serve.mjs`，/ 自动跳 harness/index.html）
- DevTools 4.5.6 未装 → 真机编译仍待用户过 UAC + 登录

## 用户反馈：「闪身步没动作」（2026-10-16，本次返工主线）

**根因（render.js:179-211）**：`stick()` 只有 kick 姿态分支；dash 表现 = 整人 `rotate(dashDir*0.22)` + 2 个**静态平移残影**，手臂、双腿全程零姿态变化（正面小人常态就是两条直腿）。0.28s 横移 156.8px，玩家眼里就是"滑过去"，没有闪身动作语言。

**返工方案（render-only，core 一行不动）**：

- 战斗判定零变化：DASH_TIME 0.28 / DASH_INVULN 0.2 / DASH_SPEED 560（位移 156.8px）
- 新增 `dashPoseAt(u, dir)` 分段姿态（对标 sekiro-mini 已验收的同款节奏，适配横向正面小人）：
  1. 起手（u 0–0.12）：**手臂先反向甩出**（与冲刺方向相反下摆）、沉肩，脚未动
  2. 蹬地（0.12–0.28）：双脚交错蹬出（一腿折叠前抬、一腿后蹬）
  3. 腾空错步（0.28–0.72）：双脚离地/小错步，身体前倾
  4. 落脚收身（0.72–1）：按 dir 方向前脚落地，全部姿态字段 u=1 归零无缝接 idle
- `dashDir=0`（没按方向）也要有合理姿态：原地沉身顿步
- 实体与残影共用 dashPoseAt；stick() 的 opt 扩展腿/手臂字段，非 dash 缺省回退旧姿态（保证踢/kick 路径零影响）
- TDD：tests/ 新增 figure 测试（node:vm 沙箱加载 render.js，桩 require("./core.js")，抄 sekiro-mini tests/figure.test.mjs 模式）；契约：u=0.06 手已动而腿未动、u=0.2 双腿有动作、u=1 全归零、全曲线有限数
- 改完 **render.js 同步复制到 wx-kickball**（两版该文件零差异是既定约定），跑两项目全部测试 + balance 双 bot
- 真机/harness 验证：CDP 截闪身逐帧（harness 可注 `__kickball`）

## 教训（已入 1AI topic + 自动记忆）

- 用户前几轮说的「闪身步」**一直指本游戏**，前序会话误在 sekiro-mini（网页只狼，也有闪身步）上改了一整轮（手甩脚蹬/帮助面板/dodge-demo 都不是用户当时想要的）。同名玩法词跨项目时必须先确认项目，不能凭词猜。
