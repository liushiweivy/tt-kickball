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

## 收尾状态（2026-10-16 深夜，用户关机前保存）

**代码已全部落盘，闪身步返工实质完成：**

- [x] render.js：`stick()` 参数化（lToe/rToe/lLift/rLift/lBend/rBend/lArmDX/lArmDY/.../crouch/lean/bodyLift，缺省值=旧姿态，非 dash 渲染像素级不变）；新增 `legPath()` 折膝盖；`dashPoseAt(u,dir)` 分段包络（甩手 wind 0–0.24 → 蹬地 tuck 0.12–0.34 → 腾空 bodyLift sin 峰 0.48 + 前倾 lean 0.24 → 落脚 land 0.6–0.88 → 收身 0.86–1），u=0/1 严格 DEFAULT_POSE；残影按 u−0.05i 取姿；已 export
- [x] **tt 29/29 测试绿**：`node --test tests/core.test.mjs tests/balance.test.mjs tests/figure.test.mjs`（figure.test.mjs 9 项：手先脚后契约/镜像/dir=0 对称/归零）
- [x] **render.js 已同步 wx-kickball 且零差异**，wx 原 20 测试绿
- [x] CDP 逐帧人工验收（tools/cdp-dash.mjs，shots/ 12 张）：f01 甩手沉肩脚钉地 → f04 分腿蹬 → f08 腾空抬膝前倾 → f12 大步落地 → f15 交叉收身（白=无敌结束）→ f17 精确回 idle；idle0 对称；left 镜像；kick f01/f08 与旧姿态一致（零回归）
- [x] project.config.json packOptions.ignore 增补 tools/、shots/
- [x] tools/serve.mjs（备用静态服务，8821 被跨会话占用未启用）

**下次续做（关机打断点）：**

1. [x] **浏览器实战冒烟已重跑（2026-10-16）**：node tools/cdp-smoke.mjs → result=victory 75.1s / 28 完美踢 / 12 穿球 / 4 忍杀 / renderErrors=0
2. [x] tests/figure.test.mjs + poses.test.mjs 已同步 wx-kickball（tests 零差异）
3. [x] code-reviewer 两轮均 APPROVE（一审 0C/0H/1M/4L → 全修复；二审 0/0/0/0，踢腿新几何全曲线数值复核无穿插）
4. [ ] 让用户硬刷 http://127.0.0.1:8821/harness/index.html 实战看动作
5. [ ] sekiro-mini 临时文件清理仍欠：.cdp-demo.mjs/.cdp-serve.mjs/.cdp-profile3（勿手动杀 9333 Edge）

---

# 2026-10-16（二）：全身动作扩充（用户：「继续完善，需要有动作」）

render-only，core.js 零改动。起因：除闪身（上一轮返工）外，玩家 idle/踢/受击/崩架势 与敌人 idle/蓄力/受击/踉跄/起身/死亡 基本是静态色块。

- **新增姿态纯函数（render.js 内，全部 export）**：
  - `idlePoseAt(t,moving)`：静止呼吸起伏（脚钉地）；行走抬腿错步+摆臂（view.pressed.left/right 驱动）
  - `kickPoseAt(u)`：引膝沉身(0.04-0.16) → 直腿高踢到脸侧并外展避开躯干(峰值 u≈0.45，对齐完美窗口 t≤0.2s) → 腾跳 11px → 收回；对侧手外张
  - `hurtPoseAt(u)`：后仰 lean -0.28 + 双手上甩 + 小退跳，0.3s 收回
  - `breakPoseAt(u)`：塌身 crouch 15 + 摇晃，1.1s 末撑回
  - `enemyPoseAt(e,time)`：idle 慢呼吸 / telegraph 三拍沉身+双臂外张后收拢托球 / hurt 后仰甩手 / stagger 缩身 wobble / rise 深蹲(crouch22)起身 / dead 绕脚底 -1.45rad 倒地
- **stick() 删除专用 kick 分支**，腿/手统一由 toe/lift/bend/armDX/armDY/crouch/lean/bodyLift 驱动（缺省=旧站姿，非动作路径像素不变）
- **关键修复**：非 dash 姿态的 lean 原本无人应用（只有 drawDashing 包 rotate）→ drawPlayer 末尾统一 translate/rotate 包裹；受击后仰/崩架势摇晃才可见
- `drawDashDust()`：闪身蹬地段(u .08-.36)/落地段(.58-.92)确定性扬尘椭圆，画在最上层防残影遮盖
- drawTelegraph：蓄力球从腰间 y-30 随 prog 托到胸前 y-56（旧固定 y-56 中段贴脸），手随球走
- 端点契约：所有 PoseAt 的 u=0/1 严格 deepEqual DEFAULT_POSE（cleanZero 1e-8）
- **测试 39/39 绿**（新增 tests/poses.test.mjs 10 项）；tt/wx render.js + tests 零差异同步
- **CDP 验证**：tools/cdp-poses.mjs 产出 shots/act-*.png 19 帧（踢三帧高踢从"水平劈叉→贴躯干 X"调到外展高踢；受击/塌身/托球/倒地/扬尘目验通过）；cdp-smoke 实战零渲染异常
- 环境：8821 = node tools/serve.mjs（本次自启，后台 task bzwzt4fiv）；9333 无头 Edge profile %TEMP%\kick-cdp-profile（本次自启，勿杀）

---

# 2026-10-16（三）：闪身步随机左右 + 手脚配合（用户：「闪身步要随机向左向右移动，配合手上动作」）

用户反馈根因：不按方向键点闪身时 `dashDir=0`，**人原地不动**只有小幅沉身（像没反应）；且腾空段手臂与前腿同向前摆 = 顺拐。

- **core.js（本轮唯一判定改动）**：`press("dash")` 无 held 方向时改调新增 `rollDashDir()`：50/50 随机 ±1；一侧空间 < 闪身步长（DASH_SPEED*DASH_TIME=156.8）时强制开阔侧（活动宽 382 > 156.8，不可能两侧都不足）。按住方向仍听玩家。玩法后果：原"原地穿球"多数变为"侧移后球落空 miss"，两者均无伤；贴球按闪身仍可移动中交汇穿球（bot 实战 dashThroughs 3–12）
- **poses.js（render-only）**：dashPoseAt 手臂重做 —— 起手前手反向抡圆（wind −22d，+11→−11）、后手顺势外带；腾空走路式**对角摆臂**：对侧手随前腿向前上抬（dx+22d / dy−20，腕过肩），前腿同侧手向后下摆（−20d / +8）；腕距约束默认臂长 ≈23px 不拉橡筋；dir=0 分支仅作防御兜底（core 不再产生 0）
- **测试 43/43**：core 新增 3 项（16 种子随机两侧都出现 / 贴墙必选开阔侧 / 随机侧移躲原位危球无伤）；危球无敌帧测试改为按住方向横向交汇；figure 新增 u=.45 对角摆臂（不顺拐，含镜像）
- **平衡回归**：skilled bot 种子 1/7/42 满血通关 93.6/59.5/47.9s、穿球 12/5/3；乱按/站桩 bot 结论不变
- **CDP 验收**：cdp-dash.mjs 原 idle0 场景改为 auto（无方向随机，循环到左右各采到，实测 [−1,+1]）；shots/{right,autoL,autoR,left}-f*.png：f01 前手反甩脚钉地 → f08 腾空对角摆臂大步跨出 → f17 精确回站姿；kick-f01/f08 零回归；cdp-smoke **victory 78.1s / 30 完美踢 / 8 穿球 / 4 忍杀 / renderErrors=0**
- tt/wx 七文件零差异同步（core/poses/render + 四测试），双端 43/43
- 环境：8821 = 跨会话遗留 node 服务（实测服务本目录且新代码含 rollDashDir，no-store）；9333 Edge 本次用 `--headless=new` 重启（profile %TEMP%\kick-cdp-profile）

**一审 + 修复（同日）**：code-reviewer APPROVE（0 CRITICAL / 0 HIGH / 1 MEDIUM / 4 LOW），全部处理：

- MEDIUM：抽 **js/poses.js**（245 行，纯姿态模块，UMD 同构 require core）；render.js 847→**648 行**，factory(core, poses) 注入，导出名经别名保留（测试零改动）
- LOW：DEFAULT_POSE 成为 makePose 的单一事实（Object.assign）；enemyPoseAt/drawTelegraph 对 castDur=0 兜底 0.34 防 0/0=NaN 吞帧；**倒地投影从 stick 拆出 drawShadow()，在 rotate 包裹前画**（敌人 83° 倒地不再带竖条影）；stagger 末 0.35s 向站姿 smooth 插值消硬切
- 自查轮外真 bug：踢腿 rLift 相对地面，旧峰值 64 减腾跳 11 后脚尖仅过髋 19px（≈45° 低位侧摆，不是「到脸侧」）→ rLift 78 / rToe 22，脚尖过髋 33px 到脸高；poses.test 加 rLift-bodyLift>58 防回归
- tools 三个 CDP 脚本的手动 require 桩改为按路径解析 core/poses
- 修复后：tt/wx 各 39/39 绿；cdp-poses 19 帧重拍；**cdp-smoke victory 55.7s / 23 完美踢 / 4 穿球 / renderErrors=0**
- **二审 APPROVE（0C/0H/0M/0L）**：UMD 三环境加载链、残影投影 alpha、踢腿全曲线距头心最小 25.6px 无穿插、stagger 端点严格 DEFAULT_POSE 均有数值/实测证据

---

# 2026-10-16（四）：招式名飘字 + 音效强化（用户：「闪身步要有声音和文字，狗熊哆嗦毛这些也加进去」）

花鼓灯招式名体系铺开：闪身步（闪避）/ 浪子踢球（完美踢，已有）/ 狗熊哆嗦毛（架势崩）/ 黑虎掏心（处决）。

- **core.js（表现层，零数值改动）**：
  - `press("dash")` 起步瞬间 `spawnFloat("闪身步", 22px 青, life 0.7)`，与 dash 音效事件同步（此前只有穿球时才出字，空闪无反馈；寿命短防 0.28s 连闪糊屏）
  - 普通球穿球分支**删除重复「闪身步」飘字**（起步已报，火花+轻音即可）；危球穿透保留「闪身步！」（高价值时刻）
  - 崩架势文案「哆嗦毛…」→「狗熊哆嗦毛」全名，life 1.15
  - 处决踉跄敌人新增「黑虎掏心！」（28px 红，e.x / ENEMY_Y+140）；**位置坑**：先放 ENEMY_Y-96 截图实测压住顶部敌人名字+血条 HUD，移到敌人脚下（上升 39px 仍在腿下）
  - spawnFloat 增加可选 life 参数（默认 0.95 不变）
- **audio.js**：dash 从几乎听不见的单音（saw 520→180 vol0.07）改为破空 whoosh = 烘焙低通噪声(cutoff2400,0.2s)+saw 660→130；dashThrough 改轻透气音 sine1180→1560（原与 dash 同音 0.1s 内连放两遍）；perilDash 两记高音（1560+2080），whoosh 由起步 dash 事件负责不重复；break = 散噪 + 6 个交替 76/108Hz 方波短音（0.05s 间隔）模拟哆嗦
- **测试 47/47**（两端同）：core 新增 2 改 2（起步即出字、穿普通球不重复刷名、狗熊哆嗦毛精确匹配、黑虎掏心）；新增 tests/audio.test.mjs（无 AudioContext 环境全 19 事件静默不抛，主循环帧安全靠此降级）
- **CDP**：tools/cdp-moves.mjs 用 ?sound=1 走真实 W3C 音频 + AudioContext 原型插桩计数：dash=1osc+1buffer、break≥6osc+1buffer、三招飘字与 hp=0 断言、0 page error；shots/move-{dash,gouxiong,deathblow}.png 目验通过
- tt/wx 四文件（core/audio + 两测试）零差异；poses/render 未动仍零差异
- 环境：8821 后台 task bzwzt4fiv；harness 默认静音（getAudioContext 抛错），验声必须 ?sound=1

**三审（招式名轮，code-reviewer APPROVE 0C/0H/1M/2L）+ 修复**：

- LOW 修：spawnFloat 改按 `text.length*size/2+6` **动态半宽夹取**（固定 64 会让 140px 宽「黑虎掏心！」敌人贴墙处决时溢出约 6px）；夹取测试改按各字串实际半宽断言左右缘
- LOW 修：危球穿透「闪身步！」y 从 PLAYER_Y-104 上移到 **-132**（穿透总发生在起步后 0.2s 内，同位与起步「闪身步」近乎叠字；两条同速上浮，错 28px 全程不重叠）；测试用 ±6px 容差（飘字每帧 34px/s 上浮改写存储 y，精确值不稳）
- 附带修：wx main.js 两处 `audio.onEvent` 裸调用补 **playEvent try/catch 静默降级**（与 tt main.js 对齐，真机 WebAudio 单次抛错不再逃出帧循环冻结游戏）
- MEDIUM（不改代码）：reviewer 发现工作区 diff 中 rollDashDir 随机闪身玩法改动（第三节内容）与本轮表现层改动混在同一未提交工作区；仓库仅 1 个基线 commit，**下次提交时拆两个 commit：①玩法（rollDashDir+dashTailHitsBall+balance 扩种）②表现（飘字/音效/poses 动画）**
- 修复后双端各 47/47，cmp 九文件零差异，cdp-moves 重跑 PASS（0 page error）

---

# 2026-10-16（五）：狗熊哆嗦毛连击大招（用户：「连续 3 次浪子踢球或三次闪身步触发哆嗦毛，手舞足蹈 5s 将所有球弹回去」）

首个**真机制**改动（非表现层）。设计：同类招式连击计数（comboType/comboN），3 连触发 flail 态 5s——锁移动/踢/闪、持续无敌、来球（含危球）全部按完美踢轨迹弹回（可走伤害/踉跄/处决）。崩架势飘字全名让位：「狗熊哆嗦毛」→「哆嗦毛…」，大招独占「狗熊哆嗦毛！」。

- **连击双闸门（平衡保卫战）**：初版只按完美踢计连击 → mashKick bot（每帧按键+站桩）蒙出三连概率过高，实测 1 次大招（5s 无敌+全弹回）就把第三波必败局翻盘（seed7 108s 通关，对照实验：关大招同种子全灭）。时间窗闸门对乱按无效（按键相位均匀，任何窗口按比例命中），真正区分人机的是**走位**：最终 COMBO_KICK_WINDOW=0.08（贴脸内圈）+ COMBO_KICK_ALIGN=12（踢中瞬间横向偏差≤12px，乱按吃 ±30 瞄准散布只有 40% 满足）。乱按蒙三连 ≈0.4%/球，20 种子实测翻车率与无大招基线相同（1/20，既有 seed4 运气局）；边缘完美/偏心完美断连击
- **坑①（自测抓出）**：perfectOnce 测试辅助 6 帧连踢 < 踢冷却 0.3s，后续 press 被吞导致「3 踢不触发」假 RED——测试辅助须推进 ≥18 帧覆盖冷却
- **坑②（探针抓出）**：双闸门横向偏差先写 `Math.abs(b.x - p.x)`，但 bounceBallUp 已把 b.x 改写到玩家脚下 → 恒 0、闸门形同虚设（偏心球也触发）。改用 resolveIncoming 顶部捕获的 cx。**教训：复用对象被改写后，后续判断必须读改写前捕获的快照**
- **坑③（CDP 抓出）**：探针往 PLAYER_Y-40 放球，碰撞带只有 ±32 → 球在带外被掠过，bounce=0 假 FAIL
- 清零路径：换招/蹩脚踢/受伤（resetCombo）；dash 第三闪按下即化作大招（state dash→flail 直接接管）
- poses.js flailPoseAt(t,total)：高抬腿踏步+双臂不同频过头乱舞+连蹦，首尾 0.18/0.25s 向 DEFAULT_POSE 插值淡入淡出，t=0/total 严格站姿；render flail 分支金色 #ffb85e+光晕；audio flail=8 抖音+散噪+滑音、flailBounce=boing
- **测试 54/54 双端**（core +5 块：触发全链/三连闪身/清零三路径/双闸门反例×2/弹回处决；poses +2；audio 事件表 21）；balance 三 bot 不变量保持（skilled 8 种子全通、mash 0/3、站桩零输出）
- CDP：cdp-moves.mjs 场景 4（comboN=2 预置第三闪；完整三按链由单测覆盖）PASS：flail 飘字+事件+10osc/2buffer、两颗带内球全弹回（bounces=2/up=2）、0 page error；move-flail.png 目验（橙金发光手舞足蹈）
- 环境：8821 曾被系统内存压力回收，已重启（node tools/serve.mjs）

**四审（code-reviewer APPROVE 0C/0H/1M/2L）+ 修复**：

- MEDIUM 修：advanceWave 强制 `player.state="idle"` 会打断未结束的大招（实证：弹回处决杀穿本波后 5s 大招缩水到 2s + 姿态硬跳）→ flail 跳过强制重置（dash/hurt 短状态照旧）；这正是大招高光时刻
- LOW 补测试×2：flail 期间 posture=100 不切崩架势（guard 钉死）；弹回处决杀穿本波后 state 仍 flail、残余时间自然走完回 idle
- LOW 不改（设计决定）：连击无时间窗、可跨波保留——「连续」按语义理解为不换招/不失误，攒招是玩家主动策略，乱按概率模型已把守
- 修复后双端各 **55/55**，cmp 九文件零差异，cdp-moves 重跑 PASS
- 标题屏新增橙色一行「三连踢球/三连闪身 →「狗熊哆嗦毛」5s 全弹回」（首版 27 字×17px≈460 超宽，缩短到 24 字）

---

# 2026-10-17（六）：完美闪身闸门（用户：「3次完美闪身才能触发而不是随便三个闪身」「球快到了闪身是完美闪身」）

修订（五）的闪身连击：旧规则在 press("dash") 里直接 bumpCombo，空闪三连也能白嫖大招。新规则连击看成效：

- **判定**：一次闪身的**首次穿球**定品质（player.dashScored 闸门，同闪连穿多球只判一次）——穿球瞬间闪身年龄（stateT）≤ **COMBO_DASH_WINDOW 0.12s**（0.2s 无敌帧的前 6 成）= **完美闪身**（球快到了才闪），bumpCombo("dash") + stats.perfectDashes + 飘字「完美闪身」(PLAYER_Y-150) + perfectDash 风铃音（1980→2640 sine 0.08s）；闪太早侥幸穿过（0.12–0.2s）= 失误断链；闪身走完没穿到任何球 = **空闪断链**（playerTick dash 收尾 !dashScored → resetCombo）。空闪同时也断踢球链（「连续」= 中途没有失败动作）
- 危球完美闪身飘「完美闪身！」（非完美仍「闪身步！」-132），perfectDash 与 perilDash 同帧叠加成和弦；普通球完美才出飘字（普通穿球原本无飘字）
- **人机区分天然成立**：发球间隔 1.0–1.5s，乱按 bot 在两次来球之间必然空闪断链，时间窗相位论证都不需要。20 种子探针实测：mashDashOnly **0 触发 0 通关**、mashKick+Dash **0/20 通关 0 触发**；会玩 bot 只闪身不踢：**20/20 局能攒出大招但 0 通关**（可练出来但踢球仍是主攻）
- 坑：测试辅助连踢后 20 帧（kickAge 0.333）紧接闪身穿球会被 0.2–0.4s 蹩脚踢窗吞成 lowKick（球没穿成→空闪清零），换招用例需补 5 帧等踢窗关闭
- **CDP 场景 4 返工**：活 rAF 驱动三闪（sleep 400ms）竞态失败（throughs=1 后被乱球打成 hurt）→ 改确定性：stub K.update 冻帧、K.start() 清场、手动 17 帧/轮×3、事件当场喂 `__kickball.audio.onEvent`（main.js 调试钩子新增导出 audio）；节点计数实测 20osc/4buffer
- 飘字 -150：第三次完美闪身同帧出 28px「狗熊哆嗦毛！」(-104)，-132 间隔 28px 贴脸，完美闪身统一抬到 -150（截图目验两行分离）
- 标题行改「三连浪子踢球/三连完美闪身→狗熊哆嗦毛·5s全弹回」（450 宽内，CDP 截图目验）
- 测试：双端各 **59/59**（core +4：三完美触发/三空闪不触发、空闪断双链、多球一计、时机窗早闪、飘字音效含危球；改 3 处旧 flail 用例），audio 事件表 +perfectDash

**五审（code-reviewer APPROVE 0C/0H/2M/2L）+ 修复**：

- MEDIUM 修①（core.js 801→798 行）：CFG/方法注释压缩回 800 限内；**下一个机制落地前必须先拆模块**（按 poses.js 先例把 enemy/wave 或 combo 段抽出）
- MEDIUM 修②（幽灵空闪）：踢完立刻闪身时，球被残留踢窗完美踢掉，但 dashScored 未置位 → 闪身走完的空闪断链把刚赚的踢球连击也抹掉（reviewer 构造实证）。完美踢/蹩脚踢两分支在 `state==="dash"` 时置 dashScored=true（闪身尽到处置义务）；补回归测试（踢后 3 帧闪身、第 1 帧贴身接触、走完 17 帧 comboN=1 保留）
- LOW 修①：render.js 删一行被覆盖的死 fillStyle
- LOW 修②：同闪第二球曾按当前年龄重判品质（同一次完美闪身可能后出「闪身步！」）→ 首次判定存 player.dashPerfect 复用
- 修复后双端各 **60/60**，cmp 九文件零差异，cdp-moves 重跑 PASS（20osc/4buffer）

---

# 2026-10-17（七）：六项手感修订（用户：「完美闪身要记录次数，第一关血量再厚一倍，踢过去三次没触发哆嗦毛，哆嗦毛伤害减半，完美闪距离2-3厘米，多弹出perfect」）

- **完美闪身改距离判定**：删掉（六）的时机窗 COMBO_DASH_WINDOW，改为按下闪身瞬间来球在 **DASH_PERFECT_PX=128 世界像素（≈3cm）** 内。物理证明：0.2s 无敌帧最多迎上 455×0.2+32≈123px，所以「真穿到球」⟺「128px 内按下」，无需在按键时扫球。实现用运动学反推：首次穿球时按 stateT 还原按下瞬间 px0/bx0/by0（测试/实战都可能在按下后才放球，按下时扫球的初版直接失效）；品质存 player.dashPerfect，同闪多球复用
- **Perfect! 弹字**：完美闪身（普通球/危球一致）飘金色 "Perfect!"（PLAYER_Y-150，0.8s）+ perfectDash 风铃音；危球非完美仍「闪身步！」
- **次数记录**：stats.perfectDashes，战斗 HUD 右下青色「完美闪身 N」（完美踢下一行），通关结算新增一行
- **第一关血量翻倍**：落武者 60→120；skilled bot 8 种子不变量不破（均通关、hp>30、<120s）
- **哆嗦毛弹回伤害减半**：新增 CFG.FLAIL_KICK_HP=5（完美踢 9 的一半，向下取整）；弹回球带 b.flail 标记，resolveReturnHit 按标记选伤害；架势积累/踉跄/黑虎掏心处决不打折
- **踢三连触发修复（关键平衡返工）**：旧双闸门 kickAge≤0.08s **且** |dx|≤12px——12px≈3mm 走位精度是真人「踢中三次却不触发」的真凶。**删除横向对齐闸门，只留时机窗**。窗口取值用 20 种子乱按探针三档对照：0.08→乱按 0 触发/2 胜（2 胜在禁大招对照组同样发生=纯运气基线）；0.10→8 局触发/4 胜（大招白嫖翻盘）；0.12→12 局触发/38 次弹回。定 **0.08**（球贴身约 50px/1cm 内按踢，接触帧 kickAge≈0.067s）。另做隔离实验：120 血本身让乱按通关从 4/20 降到 2/20
- 测试：双端各 **61/61**（距离判定/Perfect 飘字音效/计数器/120 血/减半伤害/0.08 边界 50px 计·70px 断·偏心 dx20 计），cmp 九文件零差异，cdp-moves 场景 4 PASS（3 Perfect! + 大招 + 双球弹回，0 page error）；core.js 压回整 800 行（注释压缩，无逻辑删减），**下一个机制前必须先拆模块**

**六审（code-reviewer APPROVE 0C/0H/2M/1L）+ 修复**（双端同名提交，wx 314eba6）：

- MEDIUM 修①（贴墙假阴性）：距离反推原用 `p.x - dashDir*DASH_SPEED*stateT` 还原按下位置，但贴墙闪身位移被 clamp，反推位置冲出墙外、距离虚增——实测贴左墙+球距 122px（真完美）被判 159px 早闪断连击。改为 press 时记录 **player.dashPressX**（球位置仍按球速反推，球不受 clamp）。物理证明的隐含前提（线性无阻位移）就此补掉
- MEDIUM 修②（品质复用残留 false）：闪身途中残留踢窗先踢掉普通球时只置 dashScored、未算品质，同闪再穿危球复用 dashPerfect=false → 真完美弹「闪身步！」。抽出 **judgeDashPerfect(b)**（dashJudged 闸门，同闪只判一次），两个踢窗分支在 dash 态也调它定品质；奖励/连击仍只归首次穿球（踢窗认领的闪身不双计，避免与踢连击互冲）
- LOW：测试两处注释残留上轮 0.12s 数值，改为 128px/0.08s
- 新增回归测试×2（贴墙 122px 速 500 球 Perfect；踢窗+同闪危球 63px Perfect），双端 **63/63**，cmp 零差异，cdp-moves PASS，core.js 压回整 800

---

# 2026-10-17（八）：手感放宽 + 血量五倍制 + 七阵 + harness 修改器（用户：「完美闪身触发不了改 10cm 或给修改器、踢 3 次没触发哆嗦毛、血量太低翻 5 倍、多设计关卡」）

- **完美闪身 3cm→10cm**：DASH_PERFECT_PX 128→427（按 128px≈3cm 换算）。物理现实：0.2s 无敌帧内能穿到的球必然按在此范围内 → 实战「穿到 ≈ 完美」，乱闪没穿到仍算空闪断链（保护机制不变）
- **踢连击窗 0.08→0.2**（=完美踢窗）：任何完美踢都计连击，三连浪子踢球稳定触发狗熊哆嗦毛。旧 0.08s 是「踢 3 次没触发」的真凶（真人按键相位难压进 50px 内圈）；乱按防线由「危球+蹩脚踢断链」继续兜底（balance 乱按 3 种子仍 0 胜）
- **血量五倍制**：玩家 MAX_HP 100→500；敌血与踢伤同步 ×5（KICK_HP 9→45、FLAIL_KICK_HP 5→25、落武者 120→600…），单阵节奏与旧三阵一致；玩家承伤（12/26）不变 → 有效生存 ×5。render 血条比例改 CFG.MAX_HP 驱动（旧硬编码 /100），战功称号改按比例
- **三阵→七阵**：新增 第四阵「寄鹰众·忍者」（500 速快球）、第五阵「双猿·鬼兄弟」（双 400 血）、第六阵「危球天师」（55% 危球）、宗师战「道场宗师·白眉」（三管血 500/450/400、570 速、60% 连射）；标题页改「打穿七阵 · 宗师三管血」
- **harness 修改器**：右上角 ⚙ 面板，10 项 CFG 直改（闪身距/连击窗/连击数/完美踢窗/玩家血/踢伤/承伤×2/球速倍率/大招时长），判定类即时生效、血量波次类「保存并重开」生效，localStorage 持久化；配套 CFG.BALL_SPEED_MUL 全局球速倍率（fireBall 挂钩）
- 测试：双端各 **65/65**（core 38 + balance 3 + 其他 24）。新增「10cm 线内外」双例（323px 穿过=Perfect / 475px 2400 速穿过=侥幸）、七阵配表合法性与递增性、宗师三管血通关；旧「按早断连击」例反转为「放宽后计连击」；「大将两管血通关」改打末阵三管；balance 预算 120s→300s、残血阈值改 CFG.MAX_HP×0.3； skilled bot 8 种子七阵全通
- 真机验证（harness :8821 Playwright）：CFG 值生效（427/0.2/500/45）、七阵名单、修改器面板截图、注入球实测 完美闪身+1 / 三连踢→flail / 敌血 600

---

# 2026-10-18（九）：盯球闪身（躲开也算完美）+ 大招弹回降伤（用户：「闪身改成 20000000 都出不了完美」「大招不该让球伤害变高，弹回所有球已经很 bug 了」）

- **根因**：「出不了完美」瓶颈从来不在距离窗——敌人瞄**原位**发球，闪身移开 157px 后球直接落空，无敌帧内没有「穿球」发生，judgeDashPerfect 整段代码根本没被执行，距离改多大都没用
- **盯球闪身**：press("dash") 时 pickDashWatch() 盯住「最快越过玩家线」的下行球（ETA≤1.8s，覆盖最慢球全程），记下按下瞬间直线距离：
  - **≤10cm 线（427px）**：完美待命——穿到球（老路径）**或球落空越过玩家线**（新路径 scoreDashDodge）都弹 Perfect! 并计连击。躲开本身就是一次成功闪身
  - **>线**：**早闪**，按下瞬间立刻断连击并结算本闪（dashScored 置位，后续穿到只算侥幸）——品质必须在按下瞬间定死：若等越线再判，乱按闪身的「最后一次按下」总是近距离，白嫖大招（设计推演实锤）
  - **没球**：老规矩空闪断链；按下后才生成的球接触仍按运动学反推定品质（旧测试契约不变）
  - 闪身走完但盯的球还飞着 = 不按空闪断链（等球越线结算）；盯球作废三路：被打中（damagePlayer）/ 球被踢回（bounceBallUp）/ 换阵（spawnWave）
- **大招弹回降伤**：FLAIL_KICK_HP 25→**10**（象征性伤害，全弹回含危球本身已是奖励）；架势/踉跄/处决不打折；修改器面板新增「大招弹回伤害」项（共 11 项）
- 测试：双端各 **68/68**。新增「盯球闪身越线结算 Perfect + 计连击」「早闪按下即断链 + 三连躲球触发大招」、balance「mashDash bot 乱按闪身 3 种子 0 大招 0 通关」（早闪/空闪断链兜底），core.js 830 行
- 真机验证（harness :8821 Playwright 注入）：300px 躲开 → dashThroughs+1 / perfectDashes+1 / Perfect! 飘字 / 连击 dash×1；三连躲 → flail；CFG 生效（427/10）
- **用户须知**：自己浏览器 localStorage 里存的 DASH_PERFECT_PX=20000000 建议点修改器「恢复默认」——2e7 下任何盯球都完美、早闪永不触发，乱按闪身也能连大招

**七审（code-reviewer APPROVE 0C/0H/1M/2L，200 种子乱按压测防线稳固）+ 修复**：

- MEDIUM 修（慢球漏盯）：pickDashWatch 旧固定 ETA 上限 1.8s——球速倍器调低时（如 0.6）10cm 线内慢球 ETA=2.2s 不被盯，躲开按空闪处理，与穿球路径 427 线判定打架。删除固定上限（品质由按下距离单线把关）
- LOW 修（状态守卫）：break/flail 期间被盯球越线仍结算奖励（硬直中赚连击/大招期统计噪音）→ scoreDashDodge 加 `p.state === "break" || "flail"` 守卫（clear 不结算）
- 补测试盲区×3：慢球（vy=204，ETA 2.2s）线内按下照样完美待命；盯球本尊被残留踢窗踢回→盯球作废转踢球连击；break/flail pending 越线不结算。mashDash 种子 3→8（对齐 skilled bot 覆盖，rollDashDir 耗 rng 防单一流水翻车）
- 双端 **71/71**，三文件已同步 wx

---

# 2026-10-18（十）：大招蓄能条 + 飞蝗石（用户：「加大招蓄能条；加个技能每隔 10s 自己发射一个伤害很小的小球，发射按钮小、放最左边、平时不管用，也加蓄能条」）

- **大招蓄能条**（HUD 架势条下）：平时=三连击进度 comboN/3（踢链金色/闪身链青色），哆嗦毛期间=剩余时间橙色倒减；纯渲染读取 comboN/comboType/stateT，内核零改动
- **飞蝗石**（新技能）：最左最小按钮「石」（r24，x32；◀▶ 右移至 98/182），press("pebble") 就绪即发一颗冰蓝小球（r6）直击敌人——PEBBLE_HP=5 蚊子腿伤害，**不涨架势/不触发忍杀/不打断敌人动作**（踉跄中也只掉 5 血），残血可收头；PEBBLE_CD=10s 蓄能，冷却中按下被吞（平时不管用），按钮扇形显示蓄能（同踢冷却样式）；break/hurt/flail 锁操作状态不能发；球带 pebble 标记，resolveReturnHit 专列分支（在踉跄忍杀分支之前）
- **音效**：pebble=短促破空（高频噪声+880Hz 方波）、pebbleHit=轻点木鱼（660Hz 三角）；audio.js 未知事件本就走 default 静默，新增无回归风险
- **配套**：stats.pebbleHits 进通关结算；标题页新增飞蝗石说明行；harness 修改器 +PEBBLE_CD/PEBBLE_HP（共 13 项）；makePlayer 初始化 pebbleCd=0（开局/重开即就绪）
- 测试：双端各 **74/74**。新增「就绪即发+命中 5 血不涨架势」「冷却吞键+三状态锁发+蓄能再发」「踉跄中收头不触发忍杀」三例；balance 不受影响（bot 不按 pebble，站桩不掉血契约保持）
- 真机验证（harness :8821 Playwright）：真实 mousedown 触摸路径点「石」→ 发球+CD=10，再点被吞；截图目验按钮布局（石在最左/◀▶ 右移）+ 大招蓄能条 2/3 青色显示

## 2026-10-18（十一）飞蝗石可忍杀（用户修订，双端 74 测）

- **需求**：小石子在架势条满时可以忍杀——推翻上一版「飞蝗石不触发忍杀」的设计
- **实现**：resolveReturnHit 分支重排——踉跄忍杀分支挪到 pebble 分支**之前**，踉跄中飞蝗石与金球同权（hp=0/黑虎掏心！/deathblow 事件/killNode），10s 蓄能攒的就是这一下；非踉跄仍是蚊子腿（5 血/不涨架势/不打断，残血收头不算忍杀）
- **配套**：标题页说明行改「飞蝗石 10 秒一颗，破架势可忍杀」；core 三处注释同步修订
- 测试：双端各 **74/74**。旧「踉跄中也只掉 5 血」用例重写为两段式：踉跄+满血→一石忍杀（deathblow/黑虎掏心！/kills+1）；非踉跄+残血→收头不触发忍杀
- 真机验证（harness :8821 Playwright）：真实 mousedown 触摸路径点「石」→ 踉跄敌人 hp=0/dead/kills=1/飘「黑虎掏心！」

## 2026-10-18（十二）改名去只狼化（双端 74 测）

- **需求**：游戏名改成「闪身步」，人物名全改，不借用只狼
- **游戏名**：影狼 · 弹踢道场 → **闪身步**（标题页主标「闪 身 步」，副标改「花鼓灯身法 · 弹踢道场」）；harness 标题、core/game.js 头注、双端 README/project.config.json 描述同步去 Sekiro 字样
- **七阵改名**（数值零改动，WAVES 只动 name 字段）：落武者→巡场武生、苇名流剑士→疾风刀客、武士大将·赤甲→赤甲教头、寄鹰众·忍者→夜鹞子、双猿·鬼兄弟→铁猿双煞、道场宗师·白眉→镇场宗师·白眉；「危球天师」是自造词保留；招式名（浪子踢球/狗熊哆嗦毛/黑虎掏心）全花鼓灯原创不动
- 测试：双端各 **74/74**（名字不进断言，纯文本替换零风险）；grep 校验 js/harness/README/config 无 影狼/只狼/Sekiro/落武者/苇名/寄鹰 残留
- 真机目验：harness 标题页截图确认新主副标渲染正常

## 2026-10-22（十三）狗熊哆嗦毛音效改花鼓灯鼓点（用户：「狗熊哆嗦毛的时候发出隆咚哐隆咚哐的声音」）

- **audio.js（双端零差异）**：flail 音效从「8 下 155/196Hz 方波滑稽抖音 + 散噪 + 上扬滑音」改为「**隆·咚·哐**」循环鼓点铺满 FLAIL_TIME=5s：拍 0.17s、三拍一组 0.51s、10 组，末拍哐在 4.93s 尾音自然溢出
  - 抽 `gu(delay, soft)`（隆=150→62Hz/vol.22 强拍，咚=185→78Hz/vol.14 弱拍，均 0.2s+鼓皮噪）与 `kuang(delay)`（680→280 金属 + 130→58 低鼓 + 锣面噪），case drum/fire 重构为调用二者，**敌人蓄力鼓点逐参数不变**
- **测试**：tt **76/76**（新增 figure.test.mjs 后基线 74→74+2 音频用例；wx 无 figure 套件为 66/66）。audio.test.mjs 新增 mock AudioContext：锁三拍 delay 网格（含 30 噪声拍点必须与网格重合）、强弱拍音量分层；drum/fire 逐参数守卫（freq/freq2/vol/dur/噪声时长音量）。code-reviewer 提出两条 MEDIUM 已修：mock 原先 ramp 空操作测不到 vol/freq2、全局 AudioContext 污染使「无环境静默」用例依赖声明顺序（改 t.after 还原 + 用例开头显式 delete）
- **真机**：headless Edge CDP（?sound=1）flail 实测 51 osc/33 buffer、0 page error，cdp-moves 断言阈值 8/1→40/30，顺手修陈旧 hp 断言 100→500（MAX_HP 早已 ×5）；有头 Edge 实放听感确认
- **待办**：抖音真机/开发者工具里跑一次 flail——一次性前瞻排程约 140 节点（70 gain+40 osc+30 buffer）是此前未到过的量级，留意 tt.getAudioContext 子集与挂起恢复后 currentTime 跳变

## 2026-10-22（十四）完美闪身 10cm→6cm 加难度（双端 tt 76/wx 66 测）

- **需求**：「完美闪身加点难度」——DASH_PERFECT_PX 427(10cm)→**256(6cm)**，在 3cm 太紧与 10cm 太松之间取中；按下瞬间球在 6cm 内才计完美（穿球/盯球躲开两路径共线不变）
- **测试重标定**（旧探针距离按 0.6 缩放，几何重新验算 HIT_HALF_W=30 内确实相交）：6cm 线用例线内 323→209px（200/偏移60/1500速，第7~9帧相交）、线外 475→299px（290/-72/2400速，第7~8帧侥幸穿）；盯球躲 300→200；早闪 475→300（垂直快球，闪在 103px 外碰不到）；慢球 420@204→250@204（ETA 1.4s 仍验无 ETA 上限）
- **平衡不变量全绿**：skilled bot 8 种子通关（bot 只在 42px 内闪身，远严于新线）、mashDash 8 种子 0 大招（线收紧只会更强）、mashKick 0 通关、站桩 0 输出
- 同步更新 core 三处注释、cdp-moves 注释（≤256px/6cm，其探针 40px 不受影响）

## 2026-10-22（十五）飞蝗石半空截球（用户：「小石子能打掉一个球」，双端 tt 81/wx 71 测）

- **新机制**：飞蝗石上行途中撞下来球（含危球）=一石换一球双双消散；一颗只换一颗；偏离石子轨迹的球不截，石子继续飞打敌人。新增 `pebbleIntercept(dt)` 在 ballsTick **所有移动/碰撞之前**扫（同帧石球相遇不能算砸到玩家），`blockBall(s,o,udt)` 给表现
- **扫掠判定防穿透**：石子 640+球 570 相向 ~1210px/s≈20px/帧，固定半径必隧穿；用帧内相对匀速直线最近距离（u∈[0,1] 钳制），CFG.PEBBLE_BLOCK_R=20（视觉半径 6+11=17）
- **盯球作废**：被截球若正是 dashWatch，清引用不发 Perfect/不计连击（闪身没躲成，是石子打的）；表现=冰蓝火花+小环+飘字「击落」+pebbleBlock 事件（脆响：5200Hz 噪+1320→760 三角），危球火花转红
- **状态规则不变**：dash 途中允许发石（测试依赖：闪身盯球时发石截球），break/hurt/flail 仍锁；CD 10s 不变；stats.pebbleBlocks 进战功页（464 行下加 488，称号/再战顺移 522/564）
- **TDD 5 例**：同线普通球截杀零伤不占穿球统计/一石一换远球续飞/危球可截/盯球被截不领奖励/偏 28px（>20 半径 <30 受击半宽）不截且石子照常命中敌人。几何注：偏球测试初版用 120px 偏移会直接漏出受击带（HIT_HALF_W=30），改 28 才同时满足「不截+砸到人」
- 平衡 bot 不按石子，8 种子通关/乱按防线不变量全绿；CDP 真机冻帧三场景 PASS（blocks 1→2、危球零伤、偏球 hp500→488 且 enemyHits=1），0 page error

## 2026-10-24（十六）大招真录音：狗熊哆嗦毛采样替换合成鼓海（双端 tt 87/wx audio 1 套件）

- **需求**：用户提供 `C:\Users\4v\20261024_143042.mp4`（屏幕录像，片名即「狗熊哆嗦毛」），裁出音频在大招时播放
- **素材**：源 7.4s，有效人声锣鼓只在 0–2.7s（其后数字静音）；ffmpeg `-t 2.85 -af "afade in 12ms,loudnorm I=-14:TP=-1.5:LRA=11,afade out 90ms" -ar 44100 -b:a 128k` → `assets/snd/flail.mp3`（47KB，2.85s），双端首个打包资源（游戏原本全程序化无素材）
- **播放**：真机 `tt/wx.createInnerAudioContext()`（包内相对路径 `assets/snd/flail.mp3`，复用单实例 stop()→play() 重播——stop 自带归零，不 seek(0)，避免停止态 seek 在 iOS 误触发 onError；`obeyMuteSwitch=false`，onError 永久回退且若已在大招时刻则立即补合成，首发放哑也不哑火）；浏览器 fetch→decodeAudioData→BufferSource（unlock 时预热；harness 页在 /harness/ 下，相对路径 404 → 自动回退根路径 `/assets/...`；预热中触发则等解码，解码失败补合成）；无环境/全失败静默回退原 10 组「隆·咚·哐」合成鼓点
- **TDD**：audio.test.mjs 76→87，新增 5 例（InnerAudio 首播只 play/重播 stop+play 不 seek/onError 事前与 play 后异步报错两路径回退；浏览器 BufferSource 预热+连开两源；相对 404→根路径回退；解码失败回退）；既有 10 组鼓点网格用例保留=回退守卫；code review APPROVE（0 CRITICAL/HIGH，2 MEDIUM 即上面去 seek+异步 onError 补合成，已修）
- **真机**：headless Edge CDP ?sound=1 三连闪身触发：事件序列 dash/dashThrough/perfectDash×3+flail+flailBounce×2，采样 BufferSource 时长 2.85s 恰好最后播、短噪声源 3 个、无 40 osc 鼓海，0 page error，cdp-moves 断言改为 durs 时长识别；serve.mjs 补 .mp3/.wav/.ogg MIME（仅 tt 有 tools/）
- **待办**：抖音/微信真机或开发者工具各听一次（InnerAudio 包内路径与 iOS 静音开关表现）

## 2026-10-25（十七）二十关选关版：4 章 × 5 关 + 四种新球 + 线性解锁三星（双端 107 测）

- **需求**：「做成可以直接选关的，至少要有20关」——WAVES 七阵连打制废除，改关卡制直选
- **关卡结构**：`LEVELS` 20 关 = 4 章 × 5 关（巡场/危球/花样/宗师），章末 5/10/15/20 多管血（宗师 3 管 550/480/420）；`startLevel(i)` 单关独立开局（stats 每关重计）、`toSelect()` 回选关、打死一命即 `victory`（advanceWave 不再连打下一阵）
- **四种新球**（配表 `mix:{curve,split,heavy,boomerang}` 混入率，chooseAttack 一次 rng 按 peril→boomerang→curve→split→heavy 累加命中，peril 族 cast×1.35 推预警）：
  - **弧线球 curve**（绿）：下行中 `vx += curveDir·150·dt` 侧飘，普通族可踢
  - **分裂球 split**（紫）：**穿越** SPLIT_Y=430 瞬间（`y>=430 && 上帧y<430`，防静置误判）炸成 2 颗 normal 子球 ±110 vx，splitChild 不二次分裂，踢回不炸
  - **慢速重球 heavy**（灰，r=16）：0.55 倍速，裸吃 24 / 踢回 68 高伤
  - **回旋危球 boomerang**（橙）：危球族踢无效；首段过线掉头爬升、爬过 330 折返俯冲、二段过线才结算闪身/ miss；hitP 加 `vy>0` 门爬升段不伤人；前三章不出现
- **选关/进度**：render 导出 SELECT_LAYOUT(4×5, r=30)/CHAPTERS/VICTORY_ZONES/DEATH_ZONES；星星收进节点圆内（数字 z.y-7、星 11px z.y+13、关名圆下）防与章标题撞行；线性解锁 + 三星评价 `starsFor`（★通关/★★无伤 damageTaken==0/★★★无伤且无蹩脚踢 lowKicks==0），`recordClear` 不可变取高星封顶 20；存档 `kickball_progress_v1` 走 getStorageSync（harness shim 补 localStorage 版），victory 事件帧循环排空时 onVictory 落盘
- **平衡发现**：单关独立后旧七阵「跨波血量磨损放倒乱按」防线消失，mashKick 实测能过多数单关——新防线=踢免球密度（危球+回旋危球>50% 必死，乱按打 Lv17 幻影先生 0/5），三星评价是反乱按胡萝卜
- **TDD**：新增 levels.test.mjs（配表约束/startLevel/三星/recordClear/四球语义/混编可抽齐）；core.test WAVES→LEVELS 全换、flail 定格断言改 victory、「敌人发球」改逐帧轮询（chooseAttack 必消耗 rng 致流水偏移）；balance.test 重写——skilled 20 关 ×4 种子逐关全通、mashKick 断言移到 Lv17、回旋危球关站桩必死 skilled 全过。双端各 **107/107**
- **真机**：新 tools/cdp-levels.mjs（无头 Edge 9333 + 8821）——选关界面截图（注入 unlocked:7 样本）、抽 1/13/14/16/20 五关 skilled bot 每帧真实 drawScene 全 victory、0 render error（lv16 回旋危球关 ~90-115s 仅 1 星，明显更难符合设计；lv20 全混编四种新球齐出）；选关布局经两轮截图目检修撞行
- **音效**：curveFire/splitFire/splitPop/heavyFire/boomerangFire/boomerangTurn/boomerangDive 七事件补齐

## 2026-10-26（十八）第 1 关对手换奶龙位图皮肤（双端 113 测）

- **需求**：「闪身步第一关用奶龙形象做对手」——纯视觉换皮，玩法/判定/血量/球种零改动；第 1 关名「巡场武生」改「奶龙」（横幅「第 1 关 · 奶龙」+ 选关节点同步），其余 19 关保持火柴人
- **素材**：奶龙桌宠项目 `E:\1workspace\nailong-pet\sprites` 的 192×208 透底 PNG——waiting→nailong-idle、waving→nailong-cast（抬手蓄力）、running-left→nailong-hurt（hurt/stagger 共用）、jumping→nailong-rise；新写 `tools/make_nailong_assets.py`（Python311+PIL/numpy/scipy）：alpha>8 裁 bbox、脚底贴输出底边；jumping 烘焙灰地影用「低饱和(sat<45)且高亮(mx>200)的连通分量、触及 y≥200 即删」去掉 549px（游戏内 drawShadow 另画动态投影）；裁后 96–127 宽 ×191–198 高
- **皮肤层** `js/skins.js`（新 UMD，无平台依赖可 Node require）：`SKIN_CONF.nailong={h:118, sprites:{状态→图键}}` + `registerSkin(name,imgMap)`（平台入口注入，可热替换）+ `drawSkinFigure(ctx,name,state,x,y,ep)`；锚点=脚底中心 (x,168)，用 `ep.pose.crouch` 绕脚底压扁（sy∈[0.72,1]，横向 0.45 系数胖补偿）、`bodyLift` 整体微浮；**图未就绪（img.width=0）/未注册/未知皮肤一律返回 false**，render 回退火柴人
- **render.js**：UMD factory 加 require ./skins.js；drawEnemy 现有 translate/rotate(lean)/globalAlpha 包裹内先试皮肤、false 才 stick（scale 1.12）；投影、蓄力球/鼓灯/危字、踉跄星星、死亡绕脚底后倒（lean -1.45rad）+淡出全部在外层共用，零改动；导出 registerSkin
- **入口** main.js（双端各维护）：启动后 loadSkins() 用 api.createImage/wx.createImage 异步加载 4 张包内 `assets/img/nailong-*.png`，try/catch 静默失败→火柴人兜底，绝不出帧循环；tt 多 `if(!api.createImage)return` 守卫
- **harness shim**：tt createImage 包相对路径在 /harness/ 页面会解析成 /harness/assets/（404），shim 用 Object.defineProperty 重写 img.src 把 `assets/..` 重写到站点根 `/assets/..`（真机包根不受影响）
- **TDD**：新增 skin.test.mjs 6 例（配表仅 LEVELS[0] 有 skin 且名「奶龙」；三路径回退 false；六状态+伪状态选图、脚底中心锚定；crouch 压扁/bodyLift 上移；drawScene 第1关走 drawImage、第2关零 drawImage 且火柴人 stroke≥3）；recordingCtx 用 Proxy 兜底全部 ctx 方法，补 createRadialGradient（drawBackdrop 用）。双端各 **113/113**
- **真机尺寸目检**：tools/cdp-skins.mjs（无头 Edge 9333 + 8821，冻 rAF 手动 drawScene）截 8 帧：idle/telegraph/hurt/stagger/rise/dead/选关/第2关对照；坑=冻 rAF 的 headless 解码慢，等待须 2500ms（1000ms 时图未就绪全回退火柴人）；倒下帧奶龙横在城楼台上
- **微信送审**：6 张效果图（六宫格 nailong-effects.png 拼图+5 关键帧）经 wechat-claude-bridge/tools/send_self_images.py（venv，CF_DIB 剪贴板+UIA 头像进 simple 自聊窗）发送成功
