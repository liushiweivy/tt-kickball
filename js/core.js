/*
 * 闪身步 · 弹踢道场 · 战斗模拟内核（无 DOM / wx 依赖，Node 可直接测试）
 *
 * 核心机制（弹反 → 踢球改编）：
 *   1. 敌人从顶部发球：普通球（白）可踢回，危球（红）只能闪身
 *   2. 踢三档：完美（贴身 0.20s 内，金球反弹，敌人掉血+架势）
 *      / 蹩脚（0.20–0.40s，球被踢偏保自己，自己涨架势）/ 裸吃
 *   3. 踢有 0.30s 冷却：乱按无法让判定窗全覆盖
 *   4. 架势：玩家满 → 崩体硬直；敌人满 → 踉跄窗口，被反弹球命中即忍杀
 *   5. 反弹球是唯一进攻手段（敌人在高处，玩家摸不到）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Kickball = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CFG = {
    WORLD_W: 450,
    WORLD_H: 800,
    ENEMY_Y: 150,
    PLAYER_Y: 656,
    MARGIN: 34,
    // 移动 / 闪身
    SPEED: 265,
    DASH_TIME: 0.28,
    DASH_INVULN: 0.2,
    DASH_SPEED: 560,
    // 生命 / 架势（血量五倍制：玩家 500；敌人血量与踢伤同步 ×5，单阵节奏不变）
    MAX_HP: 500,
    MAX_POSTURE: 100,
    // 踢
    KICK_PERFECT: 0.2,
    KICK_TOTAL: 0.4,
    KICK_COOLDOWN: 0.3,
    KICK_ANIM: 0.26,
    KICK_HP: 45,           // 完美反弹命中伤害
    PERFECT_E_POST: 28,    // 完美反弹给敌人的架势
    LOWKICK_P_POST: 14,    // 蹩脚踢自己涨的架势
    RETURN_SPEED_MUL: 1.35,
    // 球 / 碰撞
    BALL_R: 11,
    HIT_HALF_W: 30,
    HIT_HALF_H: 32,
    E_HIT_HALF_W: 34,
    E_HIT_HALF_H: 42,
    // 受伤
    E_HP: 12,
    PERIL_HP: 26,
    HURT_P_POST: 10,
    PERIL_P_POST: 18,
    HURT_PLAYER: 0.3,
    HURT_ENEMY: 0.45,
    // 架势回复
    P_POST_DELAY: 1.5,
    P_POST_REGEN: 30,
    E_POST_DELAY: 2.0,
    E_POST_REGEN: 12,
    // 硬直 / 处决窗口
    BREAK_TIME: 1.1,
    STAGGER_TIME: 2.5,
    DEAD_HOLD: 1.0,
    RISE_TIME: 1.1,
    // 狗熊哆嗦毛（连击大招）：连续 3 次同类完美招式触发，手舞足蹈 5s 全弹回
    COMBO_NEED: 3,
    // 踢连击：接触时 kickAge≤0.2s（=完美踢窗），即任何完美踢都计连击；
    // 旧 0.08s 内圈窗对真人过严（踢球 3 次难触发大招），已放宽
    COMBO_KICK_WINDOW: 0.2,
    // 完美闪身距离：按下时来球在 256px（≈6cm，按 128px≈3cm 换算）内；
    // 10cm 太松（穿到≈完美没难度），3cm 太紧真人按不出，取中间 6cm。
    // 穿球与「盯球躲开」两条路径共用这条线定品质
    DASH_PERFECT_PX: 256,
    // 大招弹回只给象征性伤害：全弹回（含危球）本身已是奖励，不该再放大输出（架势/处决不打折）
    FLAIL_KICK_HP: 10,
    FLAIL_TIME: 5,
    // 瞄准散布
    AIM_JITTER: 30,
    AIM_JITTER_BOSS: 20,
    // 全局球速倍率（修改器调难度用，默认 1）
    BALL_SPEED_MUL: 1,
    // 飞蝗石（玩家自射小球）：10s 蓄能一颗，蚊子腿伤害——不涨架势/不打断敌人；踉跄中命中可忍杀
    PEBBLE_CD: 10,
    PEBBLE_HP: 5,
    PEBBLE_SPEED: 640,
    // 截球半径：石子(r6)+来球(r11) 视觉半径 17，取 20（扫掠判定另补偿高速穿透）
    PEBBLE_BLOCK_R: 20,
    // ---- 四种新球种（二十关选关版）----
    // 弧线球（普通族，可踢）：下行途中持续侧向加速
    CURVE_ACCEL: 150,
    // 分裂球（普通族，可踢）：越过中场炸成 2 颗普通球，只炸一次
    SPLIT_Y: 430,
    SPLIT_SPREAD: 110,
    // 慢速重球（普通族，可踢）：慢但疼，踢回高伤——高风险高回报
    HEAVY_HP: 24,
    HEAVY_P_POST: 16,
    HEAVY_SPEED_MUL: 0.55,
    HEAVY_KICK_HP: 68,
    HEAVY_R: 16,
    // 回旋危球（危球族，踢无效）：第一次越过玩家线不结算，掉头爬升后俯冲二段攻击
    BOOMERANG_SPEED_MUL: 0.6,
    BOOMERANG_CLIMB_Y: 330,
    // ---- 招式系统（skills.js 名册对应的数值；默认无技能时一律不生效）----
    KICK_PERFECT_LONG: 0.28, // 揽月式：完美踢判定窗放宽
    SHURI_CD: 7,             // 手里剑：飞蝗石强化（冷却/速度/伤害/架势）
    SHURI_HP: 12,
    SHURI_POST: 10,
    SHURI_SPEED: 900,
    SPLASH_RANGE: 90,        // 梨花摆：完美踢顺带弹回的近距范围
    BLINK_TIME: 0.6,         // 瞬身踢：全程时长（去 0.2s + 回 0.4s）
    BLINK_STRIKE: 0.2,       // 冲刺段时长（到点出脚）
    BLINK_CD: 12,
    BELL_INVULN: 0.6,        // 金钟罩：免崩后的短暂无敌
    REVIVE_INVULN: 1.0,      // 不倒翁：留血续命后的无敌
  };

  // 二十关 = 4 章 × 5 关，每章第 5 关守关（多管血）。
  // 字段：interval 节奏/ballSpeed 球速/cast 预警/comboChance 连射/perilChance 危球/drift 横漂
  //      mix 新球种混入率 {curve 弧线/split 分裂/heavy 重球/boomerang 回旋危球}
  //      skin 可选位图皮肤（纯表现层，render 注册了对应图片才生效；缺省=火柴人）
  // 一章纯普通球定型；二章危球识读；三章弧线→分裂→重球逐个登场；四章回旋危球+全混编。
  // 血量五倍制（KICK_HP 同步 ×5，单关节奏与旧七阵一致）
  // skin=章节原创角色（矢量皮肤来自 vskins.js，nailong 为位图）；
  // skinScale 体型梯度（同章递增，守关最大）；skinTint="boss" 给守关加配饰。
  var LEVELS = [
    // 第一章 · 基本功（纯普通球）——咕嘎族群（圆滚呆鸟）
    { sub: "第 1 关", name: "咕嘎仔", skin: "guga", skinScale: 0.85, hp: [600], interval: 1.5, ballSpeed: 320, cast: 0.8, comboChance: 0, perilChance: 0, drift: 46, mix: {} },
    { sub: "第 2 关", name: "快枪教习", skin: "guga", skinScale: 0.95, hp: [450], interval: 1.3, ballSpeed: 360, cast: 0.72, comboChance: 0.3, perilChance: 0, drift: 56, mix: {} },
    { sub: "第 3 关", name: "连珠炮手", skin: "guga", skinScale: 1.0, hp: [500], interval: 1.15, ballSpeed: 390, cast: 0.66, comboChance: 0.5, perilChance: 0, drift: 64, mix: {} },
    { sub: "第 4 关", name: "夜行刀客", skin: "guga", skinScale: 1.05, hp: [550], interval: 1.05, ballSpeed: 420, cast: 0.6, comboChance: 0.5, perilChance: 0, drift: 72, mix: {} },
    { sub: "守关战", name: "咕嘎大王", skin: "guga", skinScale: 1.18, skinTint: "boss", hp: [480, 400], interval: 0.95, ballSpeed: 450, cast: 0.55, comboChance: 0.55, perilChance: 0, drift: 78, mix: {} },
    // 第二章 · 危球识读——大将卫兵（玄甲武人）
    { sub: "第 6 关", name: "红灯信使", skin: "dajiang", skinScale: 0.9, hp: [550], interval: 1.1, ballSpeed: 440, cast: 0.6, comboChance: 0.4, perilChance: 0.25, drift: 80, mix: {} },
    { sub: "第 7 关", name: "危球学徒", skin: "dajiang", skinScale: 0.95, hp: [600], interval: 1.0, ballSpeed: 460, cast: 0.56, comboChance: 0.45, perilChance: 0.35, drift: 86, mix: {} },
    { sub: "第 8 关", name: "双刃婆子", skin: "dajiang", skinScale: 1.0, hp: [620], interval: 0.95, ballSpeed: 480, cast: 0.52, comboChance: 0.5, perilChance: 0.4, drift: 90, mix: {} },
    { sub: "第 9 关", name: "暗影镖师", skin: "dajiang", skinScale: 1.05, hp: [650], interval: 0.9, ballSpeed: 500, cast: 0.5, comboChance: 0.55, perilChance: 0.45, drift: 96, mix: {} },
    { sub: "守关战", name: "大将", skin: "dajiang", skinScale: 1.18, skinTint: "boss", hp: [550, 450], interval: 0.85, ballSpeed: 520, cast: 0.46, comboChance: 0.55, perilChance: 0.5, drift: 100, mix: {} },
    // 第三章 · 花式弹反（弧线 → 分裂 → 重球逐个登场）——刀盾兵（斗笠刀盾）
    { sub: "第 11 关", name: "弧月书生", skin: "daodun", skinScale: 0.9, hp: [650], interval: 1.0, ballSpeed: 470, cast: 0.55, comboChance: 0.45, perilChance: 0.2, drift: 90, mix: { curve: 0.5 } },
    { sub: "第 12 关", name: "弯刀胡旋", skin: "daodun", skinScale: 0.95, hp: [700], interval: 0.95, ballSpeed: 490, cast: 0.52, comboChance: 0.5, perilChance: 0.25, drift: 96, mix: { curve: 0.65 } },
    { sub: "第 13 关", name: "裂帛娘子", skin: "daodun", skinScale: 1.0, hp: [700], interval: 0.95, ballSpeed: 480, cast: 0.52, comboChance: 0.45, perilChance: 0.2, drift: 92, mix: { split: 0.5 } },
    { sub: "第 14 关", name: "铁锤太岁", skin: "daodun", skinScale: 1.05, hp: [800], interval: 1.05, ballSpeed: 460, cast: 0.6, comboChance: 0.4, perilChance: 0.2, drift: 80, mix: { heavy: 0.55 } },
    { sub: "守关战", name: "刀盾教头", skin: "daodun", skinScale: 1.18, skinTint: "boss", hp: [550, 500], interval: 0.88, ballSpeed: 510, cast: 0.48, comboChance: 0.55, perilChance: 0.3, drift: 100, mix: { curve: 0.3, split: 0.3, heavy: 0.25 } },
    // 第四章 · 回旋绝杀（回旋危球 + 全混编；peril+mix 总和 ≤0.9 留普通球余量）——奶龙群
    { sub: "第 16 关", name: "回马枪客", skin: "nailong", skinScale: 0.9, hp: [700], interval: 0.95, ballSpeed: 500, cast: 0.52, comboChance: 0.5, perilChance: 0.15, drift: 100, mix: { boomerang: 0.4 } },
    { sub: "第 17 关", name: "幻影先生", skin: "nailong", skinScale: 0.95, hp: [750], interval: 0.9, ballSpeed: 520, cast: 0.48, comboChance: 0.55, perilChance: 0.25, drift: 106, mix: { curve: 0.35, boomerang: 0.3 } },
    { sub: "第 18 关", name: "疾风雷神", skin: "nailong", skinScale: 1.0, hp: [780], interval: 0.85, ballSpeed: 545, cast: 0.46, comboChance: 0.6, perilChance: 0.2, drift: 112, mix: { split: 0.25, heavy: 0.25, boomerang: 0.2 } },
    { sub: "第 19 关", name: "万象道人", skin: "nailong", skinScale: 1.05, hp: [800], interval: 0.82, ballSpeed: 560, cast: 0.44, comboChance: 0.6, perilChance: 0.15, drift: 118, mix: { curve: 0.2, split: 0.2, heavy: 0.2, boomerang: 0.15 } },
    { sub: "宗师战", name: "奶龙王", skin: "nailong", skinScale: 1.25, skinTint: "boss", hp: [550, 480, 420], interval: 0.78, ballSpeed: 580, cast: 0.42, comboChance: 0.65, perilChance: 0.2, drift: 125, mix: { curve: 0.2, split: 0.2, heavy: 0.15, boomerang: 0.15 } },
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // 蓄力鼓点节拍（0/1/2/3），内核鼓声与渲染三点灯共用。castDur/3 须 > 单帧
  // 上限 0.05s（最短蓄力 0.34s，安全），否则钳制大步会整拍跳空漏鼓
  function telegraphBeat(stateT, castDur) { return Math.floor(stateT / (castDur / 3)); }

  function makePlayer() {
    return {
      x: CFG.WORLD_W / 2,
      hp: CFG.MAX_HP,
      posture: 0,
      state: "idle", // idle|dash|hurt|break|flail
      stateT: 0,
      heldDir: 0,
      dashDir: 0,
      invuln: 0,
      kickAge: 99,   // 距上次有效踢的时间
      kickCd: 0,     // 踢冷却
      kickAnim: 0,   // 踢腿动画计时
      postDelay: 0,
      comboType: "",  // 当前连击链：""|"kick"|"dash"
      comboN: 0,      // 当前链长度（换招/蹩脚踢/受伤/空闪/早闪清零）
      dashPressX: 0,   // 按下位置（防贴墙 clamp 反推失真）；首次处置按按下瞬间球距≤DASH_PERFECT_PX 定品质
      dashScored: false,
      dashJudged: false,
      dashPerfect: false,
      dashWatch: null, // 按下时盯住的在飞来球 {b, dist}：躲开它也算闪身成功
      pebbleCd: 0,   // 飞蝗石蓄能计时（0=就绪可发）
      // ---- 招式系统字段（默认无技能时全部闲置）----
      dashDoubled: false, // 连闪步：本段闪身已续冲过
      bellUsed: false,    // 金钟罩：本关已免崩一次
      reviveUsed: false,  // 不倒翁：本关已续命一次
      blinkCd: 0,         // 瞬身踢冷却
      blinkFrom: 0,       // 瞬身踢出发点（回程落点）
      blinkHit: false,    // 瞬身踢已出脚
    };
  }

  // damageTaken 是三星评价（无伤）的依据；其余为结算展示/平衡测试用
  function freshStats() {
    return {
      perfectKicks: 0, lowKicks: 0, dashThroughs: 0, perfectDashes: 0,
      flailBounces: 0, pebbleHits: 0, pebbleBlocks: 0,
      returnHits: 0, kills: 0, clearT: 0, damageTaken: 0,
    };
  }

  function Game(rng) {
    this.rng = rng || Math.random;
    this.mode = "title"; // title|select|fight|death|victory|skills
    this.time = 0;
    this.waveIndex = -1; // 当前关卡下标（LEVELS）
    this.player = makePlayer();
    this.enemy = null;
    this.balls = [];
    this.floatTexts = [];
    this.held = { left: false, right: false };
    this.events = [];
    this.fx = [];
    this.shake = 0;
    this.banner = null;
    this.stats = freshStats();
    this.skills = []; // 已解锁招式 id（main.js 按进度注入；默认空=原始玩法）
  }

  // 招式注入：skills.js 的 unlockedFor(progress) 结果（数组，indexOf 查找，9 条量级足够）
  Game.prototype.setSkills = function (list) {
    this.skills = list || [];
  };
  Game.prototype.hasSkill = function (id) {
    return this.skills.indexOf(id) >= 0;
  };

  Game.prototype.start = function () {
    this.startLevel(0);
  };

  // 选关版：直接空降第 i 关，玩家/球/特效/统计全部重置
  Game.prototype.startLevel = function (i) {
    i = clamp(Math.floor(i) || 0, 0, LEVELS.length - 1);
    this.mode = "fight";
    this.waveIndex = -1;
    this.time = 0;
    this.player = makePlayer();
    this.balls = [];
    this.fx = [];
    this.floatTexts = [];
    this.stats = freshStats();
    this.spawnWave(i);
  };

  // 回选关界面：战斗冻结（update 非 fight 不推进），飞球清场
  Game.prototype.toSelect = function () {
    this.mode = "select";
    this.balls = [];
    this.banner = null;
  };

  // 招式谱：选关界面的子屏，返回即回选关
  Game.prototype.toSkills = function () {
    this.mode = "skills";
  };
  Game.prototype.backFromSkills = function () {
    this.mode = "select";
  };

  // 死亡后重开本波（友好规则，不回第一波）
  Game.prototype.restart = function () {
    if (this.mode !== "death") return;
    this.player = makePlayer();
    this.balls = [];
    this.floatTexts = [];
    this.spawnWave(this.waveIndex);
    this.mode = "fight";
  };

  Game.prototype.spawnWave = function (i) {
    this.waveIndex = i;
    var w = LEVELS[i];
    this.enemy = {
      wave: w,
      name: w.name,
      nodes: w.hp.length,
      nodeIndex: 0,
      maxHp: w.hp[0],
      hp: w.hp[0],
      posture: 0,
      x: CFG.WORLD_W / 2,
      state: "idle", // idle|telegraph|hurt|stagger|rise|dead
      stateT: 0,
      idleUntil: 0.9,
      castDur: 0,
      castKind: "normal",
      comboLeft: 0,
      postDelay: 0,
    };
    this.player.x = CFG.WORLD_W / 2;
    this.player.dashWatch = null; // 换阵清场，上一阵的盯球不再结算
    this.banner = { main: w.sub, sub: w.name, t: 1.8, tmax: 1.8, peril: false };
    this.events.push("wave");
  };

  /* ---------- 输入 ---------- */

  Game.prototype.setHeld = function (dir, on) {
    if (dir === "left" || dir === "right") this.held[dir] = !!on;
  };

  Game.prototype.press = function (action) {
    if (this.mode !== "fight") return;
    var p = this.player;
    if (action === "kick") {
      // 崩体 / 受伤 / 手舞足蹈 / 瞬身途中不能踢；冷却内按键被吞掉（不刷新窗口）
      if (p.state === "break" || p.state === "hurt" || p.state === "flail" || p.state === "blink") return;
      if (p.kickCd > 0) return;
      p.kickAge = 0;
      p.kickCd = CFG.KICK_COOLDOWN;
      p.kickAnim = CFG.KICK_ANIM;
      this.events.push("kick");
      return;
    }
    if (action === "pebble") {
      // 飞蝗石（手里剑：冷却更短）：崩体/受伤/手舞足蹈/瞬身途中不能发
      if (p.state === "break" || p.state === "hurt" || p.state === "flail" || p.state === "blink") return;
      if (p.pebbleCd > 0) return;
      p.pebbleCd = this.hasSkill("shuriken") ? CFG.SHURI_CD : CFG.PEBBLE_CD;
      this.firePebble();
      return;
    }
    if (action === "blink") {
      // 瞬身踢（独立按钮）：站稳才可用；冲到敌人面前踢一脚再回原位
      if (!this.hasSkill("blinkKick")) return;
      if (p.state !== "idle") return;
      if (p.blinkCd > 0) return;
      if (!this.enemy || this.enemy.state === "dead") return;
      p.state = "blink";
      p.stateT = 0;
      p.blinkFrom = p.x;
      p.blinkHit = false;
      p.invuln = CFG.BLINK_TIME;
      p.blinkCd = CFG.BLINK_CD; // 起手即计冷却：任何中途打断（如未来新状态顶掉 blink）都不会白嫖无冷却瞬身
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "瞬身踢", "#ffe9a8", 22, 0.7);
      this.events.push("blink");
      return;
    }
    if (action === "dash") {
      if (p.state !== "idle") {
        // 连闪步：闪身途中可再冲一段（每段一次）；只续位移与无敌帧，
        // 不重判品质（沿用首段判定，防刷新无敌白嫖 Perfect）
        if (p.state === "dash" && this.hasSkill("doubleDash") && !p.dashDoubled) {
          p.dashDoubled = true;
          p.stateT = 0;
          p.invuln = CFG.DASH_INVULN;
          var held2 = this.held.left ? -1 : this.held.right ? 1 : 0;
          p.dashDir = held2 !== 0 ? held2 : this.rollDashDir();
          this.events.push("dash");
        }
        return;
      }
      p.state = "dash";
      p.stateT = 0;
      p.invuln = CFG.DASH_INVULN;
      p.dashDoubled = false; // 连闪步：新一段闪身重新给一次续冲机会
      // 按住方向听玩家的；没按方向则花鼓灯式随机左/右闪（不原地顿步）
      var heldDir = this.held.left ? -1 : this.held.right ? 1 : 0;
      p.dashDir = heldDir !== 0 ? heldDir : this.rollDashDir();
      // 招式名与起步 whoosh 同步出字（穿球时不再刷同名飘字）；寿命短，连闪不糊屏
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "闪身步", "#7fe4ef", 22, 0.7);
      this.events.push("dash");
      // 品质在按下瞬间定死，不等接触（否则乱按闪身能白嫖：最后一次按下总是近距离）：
      //  有球且 ≤6cm 线：完美待命——穿到或躲开都弹 Perfect 并计连击
      //  有球但 >线：早闪！立刻断连击并结算本闪（后续穿到也只算侥幸不给奖励）
      //  没球：老规矩——走完没处置球 = 空闪断链；按下后生成的球接触仍按反推定品质
      p.dashPressX = p.x; p.dashScored = false; p.dashJudged = false; p.dashPerfect = false;
      p.dashWatch = null;
      var watch = this.pickDashWatch();
      if (watch && watch.dist <= CFG.DASH_PERFECT_PX) {
        p.dashWatch = watch;
        p.dashJudged = true;
        p.dashPerfect = true;
      } else if (watch) {
        p.dashJudged = true;
        p.dashPerfect = false;
        p.dashScored = true; // 早闪已按失败结算，走完不按空闪重复断链
        this.resetCombo();
      }
    }
  };

  // 盯球：找「最快越过玩家线」的下行球，记下按下瞬间直线距离。
  // 敌人瞄原位发球，闪身移开后球大多落空——躲开它本来就是一次成功闪身。
  // ETA 不设固定上限：球速倍率调低时 6cm 线内的慢球 ETA 可能 >1.8s，
  // 固定上限会让它漏盯、与穿球路径共用 256 线定品质的承诺打架；品质由 dist 单线把关。
  Game.prototype.pickDashWatch = function () {
    var p = this.player;
    var best = null, bestT = Infinity;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.dead || b.dir !== "down" || b.vy <= 0) continue;
      var t = (CFG.PLAYER_Y + CFG.HIT_HALF_H - b.y) / b.vy;
      if (t < 0 || t >= bestT) continue;
      bestT = t;
      best = b;
    }
    if (!best) return null;
    var dx = best.x - p.x, dy = best.y - CFG.PLAYER_Y;
    return { b: best, dist: Math.sqrt(dx * dx + dy * dy) };
  };

  // 盯球闪身结算：被盯的球越过玩家线且没打中 = 躲开成功（按下时已定完美，直接发奖）
  Game.prototype.scoreDashDodge = function (b) {
    var p = this.player;
    if (!p.dashWatch || p.dashWatch.b !== b || p.dashScored) return;
    // 崩架势/大招/瞬身期间不结算（硬直中「赚连击」是语义瑕疵；大招本身就是奖励；
    // 瞬身途中若结算出连击满会 startFlail 顶掉 blink 态，玩家被晾在中场且 blinkCd 被跳过）
    if (p.state === "break" || p.state === "flail" || p.state === "blink") { p.dashWatch = null; return; }
    p.dashWatch = null;
    p.dashScored = true;
    this.stats.dashThroughs++;
    this.stats.perfectDashes++;
    this.spawnSparks(b.x, CFG.PLAYER_Y, 6, "#bcd8ff", 0.5);
    this.spawnFloat(p.x, CFG.PLAYER_Y - 150, "Perfect!", "#ffe9a8", 24, 0.8);
    this.events.push("perfectDash");
    this.events.push("dashThrough");
    this.bumpCombo("dash");
  };

  // 飞蝗石：朝敌人自射一颗小球，蚊子腿伤害（不涨架势/不打断），踉跄中命中=忍杀。
  // 手里剑（招式）：速度/伤害/架势全面强化，截球能力不变
  Game.prototype.firePebble = function () {
    var p = this.player, e = this.enemy;
    var shuri = this.hasSkill("shuriken");
    var speed = shuri ? CFG.SHURI_SPEED : CFG.PEBBLE_SPEED;
    var dx = e.x - p.x;
    var dy = CFG.ENEMY_Y - (CFG.PLAYER_Y - 26);
    var len = Math.sqrt(dx * dx + dy * dy);
    this.balls.push({
      x: p.x, y: CFG.PLAYER_Y - 26,
      vx: (dx / len) * speed, vy: (dy / len) * speed,
      kind: "normal", dir: "up", dead: false, returned: false, pebble: true,
      shuriken: shuri,
    });
    this.spawnFloat(p.x, CFG.PLAYER_Y - 120, shuri ? "手里剑" : "飞蝗石", "#cfe8ff", 16, 0.6);
    this.events.push("pebble");
  };

  /* ---------- 连击 / 狗熊哆嗦毛大招 ---------- */

  // 同类招式累加连击，换招从 1 重数；凑满 COMBO_NEED 发大招
  Game.prototype.bumpCombo = function (type) {
    var p = this.player;
    if (p.state === "flail") return;
    p.comboN = p.comboType === type ? p.comboN + 1 : 1;
    p.comboType = type;
    // 锣鼓催（招式）：连击需求 3→2
    var need = this.hasSkill("guluo") ? 2 : CFG.COMBO_NEED;
    if (p.comboN >= need) this.startFlail();
  };

  // 蹩脚踢 / 受伤 / 空闪 / 早闪：连击链作废
  Game.prototype.resetCombo = function () {
    this.player.comboType = "";
    this.player.comboN = 0;
  };

  // 按球速反推按下瞬间球与玩家距离（玩家读 dashPressX：贴墙 clamp 实际位移<名义位移）。同闪只判一次
  Game.prototype.judgeDashPerfect = function (b) {
    var p = this.player;
    if (p.dashJudged) return p.dashPerfect;
    p.dashJudged = true;
    var t = p.stateT;
    var dx = b.x - (b.vx || 0) * t - p.dashPressX;
    var dy = b.y - b.vy * t - CFG.PLAYER_Y;
    p.dashPerfect = dx * dx + dy * dy <= CFG.DASH_PERFECT_PX * CFG.DASH_PERFECT_PX;
    return p.dashPerfect;
  };

  // 首次穿球结算：完美→Perfect+风铃音+连击，侥幸穿=断链；踢窗先处置过仅返品质；silent=危球用自己的飘字
  Game.prototype.scoreDashThrough = function (b, silent) {
    var p = this.player;
    var first = !p.dashScored;
    p.dashScored = true;
    var perfect = this.judgeDashPerfect(b);
    if (!first) return perfect;
    if (perfect) {
      this.stats.perfectDashes++;
      // -150：第三次同帧的「狗熊哆嗦毛！」在 -104，错开避免贴脸
      if (!silent) this.spawnFloat(p.x, CFG.PLAYER_Y - 150, "Perfect!", "#ffe9a8", 24, 0.8);
      this.events.push("perfectDash");
      this.bumpCombo("dash");
      return true;
    }
    this.resetCombo();
    return false;
  };

  Game.prototype.startFlail = function () {
    var p = this.player;
    p.state = "flail";
    p.stateT = 0;
    p.invuln = CFG.FLAIL_TIME;
    p.comboType = "";
    p.comboN = 0;
    this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "狗熊哆嗦毛！", "#ffa84b", 28, 1.3);
    this.events.push("flail");
  };

  // 无方向闪身选边：一侧放不下闪身步时强制开阔侧；否则排除「无敌帧尾段
  // （0.2–0.28s）会把人送进在飞球」的一侧——随机方向是系统替玩家掷的，
  // 不能让玩家为非自愿的尾段暴露买单。两侧都安全才掷币。
  Game.prototype.rollDashDir = function () {
    var move = CFG.DASH_SPEED * CFG.DASH_TIME;
    var leftRoom = this.player.x - CFG.MARGIN;
    var rightRoom = CFG.WORLD_W - CFG.MARGIN - this.player.x;
    var canL = leftRoom >= move;
    var canR = rightRoom >= move;
    if (!canL) return 1;
    if (!canR) return -1;
    var safeL = !this.dashTailHitsBall(-1);
    var safeR = !this.dashTailHitsBall(1);
    if (safeL && !safeR) return -1;
    if (safeR && !safeL) return 1;
    return this.rng() < 0.5 ? -1 : 1;
  };

  // 预测沿 dir 闪身时无敌帧尾段是否与下行球交汇：8 个 0.01s 采样步
  //（尾段 0.08s，远小于球穿带 ≥0.14s，不漏检），碰撞盒同 resolveIncoming
  Game.prototype.dashTailHitsBall = function (dir) {
    var p = this.player, x0 = p.x;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.dead || b.dir !== "down") continue;
      for (var k = 0; k <= 8; k++) {
        var t = CFG.DASH_INVULN + (CFG.DASH_TIME - CFG.DASH_INVULN) * (k / 8);
        var px = clamp(x0 + dir * CFG.DASH_SPEED * t, CFG.MARGIN, CFG.WORLD_W - CFG.MARGIN);
        if (Math.abs(px - (b.x + b.vx * t)) > CFG.HIT_HALF_W) continue;
        var by = b.y + b.vy * t;
        if (by >= CFG.PLAYER_Y - CFG.HIT_HALF_H && by <= CFG.PLAYER_Y + CFG.HIT_HALF_H) return true;
      }
    }
    return false;
  };

  /* ---------- 特效 ---------- */

  Game.prototype.spawnSparks = function (x, y, n, color, power) {
    for (var i = 0; i < n; i++) {
      var a = this.rng() * Math.PI * 2;
      var sp = (60 + this.rng() * 240) * (power || 1);
      this.fx.push({
        kind: "spark", x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        t: 0, life: 0.25 + this.rng() * 0.3,
        color: color, size: 1.5 + this.rng() * 2.5, g: 460,
      });
    }
  };

  Game.prototype.spawnRing = function (x, y, color) {
    this.fx.push({ kind: "ring", x: x, y: y, t: 0, life: 0.34, color: color });
  };

  // 招式名飘字（花鼓灯梗：闪身步 / 浪子踢球 / 狗熊哆嗦毛 / 黑虎掏心）
  Game.prototype.spawnFloat = function (x, y, text, color, size, life) {
    var s = size || 22;
    // 全角字宽≈字号，按实际字串半宽 + 6px 安全边夹取（固定 64 会让
    // 140px 宽的「黑虎掏心！」贴墙时溢出约 6px 被裁切）
    var halfW = (text.length * s) / 2 + 6;
    this.floatTexts.push({
      x: clamp(x, halfW, CFG.WORLD_W - halfW), y: y, text: text, t: 0,
      life: life != null ? life : 0.95,
      color: color, size: s,
    });
  };

  /* ---------- 主推进 ---------- */

  Game.prototype.update = function (dt) {
    dt = Math.min(dt, 0.05); // 切后台回来不跳帧
    this.time += dt;
    this.events = [];
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    this.updateFx(dt);
    if (this.mode !== "fight") return;

    this.playerTick(dt);
    this.enemyTick(dt);
    this.ballsTick(dt);

    // 仅当本帧没有触发通关时才判死（避免同帧死亡覆盖胜利）
    if (this.mode === "fight" && this.player.hp <= 0) {
      this.player.hp = 0;
      this.mode = "death";
      this.balls = []; // 结算遮罩下不留飞球
      this.events.push("death");
    }
  };

  Game.prototype.updateFx = function (dt) {
    var next = [];
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      f.t += dt;
      if (f.kind === "spark") {
        f.vy += f.g * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      }
      if (f.t < f.life) next.push(f);
    }
    this.fx = next;
    var ftNext = [];
    for (var j = 0; j < this.floatTexts.length; j++) {
      var ft = this.floatTexts[j];
      ft.t += dt;
      ft.y -= 34 * dt;
      if (ft.t < ft.life) ftNext.push(ft);
    }
    this.floatTexts = ftNext;
  };

  /* ---------- 玩家 ---------- */

  Game.prototype.playerTick = function (dt) {
    var p = this.player;
    p.stateT += dt;
    p.kickAge += dt;
    p.kickAnim = Math.max(0, p.kickAnim - dt);
    if (p.kickCd > 0) p.kickCd -= dt;
    if (p.pebbleCd > 0) p.pebbleCd -= dt;
    if (p.blinkCd > 0) p.blinkCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    p.heldDir = this.held.left ? -1 : this.held.right ? 1 : 0;

    // 架势满立即崩（优先于本帧架势回复）；大招进行中不会挨打/涨架势，双保险不打断
    if (p.posture >= CFG.MAX_POSTURE && p.state !== "break" && p.state !== "flail") {
      // 金钟罩（招式）：每关首次架势满不崩——清零架势 + 短暂无敌
      if (this.hasSkill("bell") && !p.bellUsed) {
        p.bellUsed = true;
        p.posture = 0;
        p.postDelay = CFG.P_POST_DELAY;
        p.invuln = Math.max(p.invuln, CFG.BELL_INVULN);
        this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "金钟罩！", "#ffd45e", 22, 1.0);
        this.events.push("bell");
      } else {
        p.state = "break";
        p.stateT = 0;
        p.posture = CFG.MAX_POSTURE;
        // 全名「狗熊哆嗦毛！」已让给三连击大招，崩架势只配半截「哆嗦毛…」
        this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "哆嗦毛…", "#ff8a7a", 20, 1.15);
        this.events.push("break");
      }
    }
    if (p.postDelay > 0) p.postDelay -= dt;
    else if (p.posture > 0 && p.state !== "break") {
      p.posture = Math.max(0, p.posture - CFG.P_POST_REGEN * dt);
    }

    switch (p.state) {
      case "idle":
        p.x += p.heldDir * CFG.SPEED * dt;
        break;
      case "dash":
        p.x += p.dashDir * CFG.DASH_SPEED * dt;
        if (p.stateT >= CFG.DASH_TIME) {
          // 走完整个闪身没穿到球、也没盯到来球 = 随便乱闪，连击作废；
          // 盯了球的等球越过玩家线再结算（球还飞着，不算空闪）
          if (!p.dashScored && !p.dashWatch) this.resetCombo();
          p.state = "idle";
          p.stateT = 0;
        }
        break;
      case "hurt":
        if (p.stateT >= CFG.HURT_PLAYER) { p.state = "idle"; p.stateT = 0; }
        break;
      case "break":
        p.posture = CFG.MAX_POSTURE;
        if (p.stateT >= CFG.BREAK_TIME) { p.posture = 0; p.state = "idle"; p.stateT = 0; }
        break;
      case "flail":
        // 手舞足蹈钉在原地（不走 idle 移动分支），持续无敌；来球由 resolveIncoming 弹回
        p.invuln = Math.max(0, CFG.FLAIL_TIME - p.stateT);
        if (p.stateT >= CFG.FLAIL_TIME) { p.invuln = 0; p.state = "idle"; p.stateT = 0; }
        break;
      case "blink": {
        // 瞬身踢：0–BLINK_STRIKE 直线冲到敌人正下方，到点出脚（伪球走
        // resolveReturnHit 全链：伤害/架势/踉跄忍杀），随后直线回原位；全程无敌
        var be = this.enemy;
        var strikeT = CFG.BLINK_STRIKE, totalT = CFG.BLINK_TIME;
        if (p.stateT < strikeT) {
          var btx = be ? be.x : p.blinkFrom;
          p.x = p.blinkFrom + (btx - p.blinkFrom) * (p.stateT / strikeT);
        } else {
          if (!p.blinkHit && be && be.state !== "dead") {
            p.blinkHit = true;
            p.kickAnim = CFG.KICK_ANIM; // 出脚动画（不产生踢球判定窗）
            this.resolveReturnHit({
              x: be.x, y: CFG.ENEMY_Y, vx: 0, vy: 0,
              dir: "up", kind: "normal", blink: true, dead: false,
            });
          }
          var back = Math.min(1, (p.stateT - strikeT) / (totalT - strikeT));
          var bx2 = be ? be.x : p.blinkFrom;
          p.x = bx2 + (p.blinkFrom - bx2) * back;
        }
        p.invuln = Math.max(0, totalT - p.stateT);
        if (p.stateT >= totalT) {
          p.state = "idle";
          p.stateT = 0;
          // blinkCd 起手已计（press 处），这里不再重置——冷却从出招瞬间起算
          p.invuln = 0;
        }
        break;
      }
    }
    p.x = clamp(p.x, CFG.MARGIN, CFG.WORLD_W - CFG.MARGIN);
  };

  /* ---------- 敌人 ---------- */

  Game.prototype.hasReturnBall = function () {
    for (var i = 0; i < this.balls.length; i++) {
      if (this.balls[i].dir === "up" && !this.balls[i].dead) return true;
    }
    return false;
  };

  Game.prototype.enemyTick = function (dt) {
    var p = this.player, e = this.enemy;
    e.stateT += dt;

    // 架势回复（被踢后延迟；血越少回得越快）
    if (e.postDelay > 0) e.postDelay -= dt;
    else if (e.posture > 0 && e.state !== "stagger") {
      var rate = CFG.E_POST_REGEN * (0.25 + 0.75 * (e.hp / e.maxHp));
      e.posture = Math.max(0, e.posture - rate * dt);
    }

    // 反弹球在飞时冻结漂移（保证踢回的球必中）
    if ((e.state === "idle" || e.state === "telegraph") && !this.hasReturnBall()) {
      var dx = p.x - e.x;
      if (Math.abs(dx) > 6) e.x += clamp(dx, -1, 1) * e.wave.drift * dt;
      e.x = clamp(e.x, CFG.MARGIN + 30, CFG.WORLD_W - CFG.MARGIN - 30);
    }

    switch (e.state) {
      case "idle":
        if (e.stateT >= e.idleUntil) this.chooseAttack();
        break;
      case "telegraph": {
        // 花鼓灯鼓点：蓄力三等分，前两拍敲鼓（隆·咚），第三拍出球（哐）
        var beat = telegraphBeat(e.stateT, e.castDur);
        if (beat > (e.lastBeat || 0) && beat < 3) {
          e.lastBeat = beat;
          this.events.push("drum");
        }
        if (e.stateT >= e.castDur) this.fireBall(e);
        break;
      }
      case "hurt":
        if (e.stateT >= CFG.HURT_ENEMY) { e.state = "idle"; e.stateT = 0; e.idleUntil = 0.15; }
        break;
      case "stagger":
        if (e.stateT >= CFG.STAGGER_TIME) {
          e.posture = 0;
          e.state = "idle"; e.stateT = 0; e.idleUntil = 0.3;
          this.events.push("staggerEnd");
        }
        break;
      case "rise":
        if (e.stateT >= CFG.RISE_TIME) { e.state = "idle"; e.stateT = 0; e.idleUntil = 0.4; }
        break;
      case "dead":
        if (e.stateT >= CFG.DEAD_HOLD) this.advanceWave();
        break;
    }
  };

  // 混编抽球：一次掷骰按 危球 → 回旋危球 → 弧线 → 分裂 → 重球 累加命中，
  // 落空才是普通球。perilChance + mix 总和配表约束 ≤0.95（留普通球余量）
  Game.prototype.chooseAttack = function () {
    var e = this.enemy, w = e.wave;
    var mix = w.mix || {};
    var r = this.rng();
    var acc = w.perilChance || 0;
    var kind = "normal";
    if (r < acc) kind = "peril";
    else if (r < (acc += mix.boomerang || 0)) kind = "boomerang";
    else if (r < (acc += mix.curve || 0)) kind = "curve";
    else if (r < (acc += mix.split || 0)) kind = "split";
    else if (r < (acc += mix.heavy || 0)) kind = "heavy";
    var perilous = kind === "peril" || kind === "boomerang";
    e.state = "telegraph";
    e.stateT = 0;
    e.lastBeat = 0;
    e.castKind = kind;
    e.castDur = w.cast * (perilous ? 1.35 : 1);
    e.comboLeft = (!perilous && w.comboChance > 0 && this.rng() < w.comboChance) ? 1 : 0;
    this.events.push(perilous ? "peril" : "telegraph");
  };

  var FIRE_EVENT = {
    normal: "fire", peril: "perilFire", boomerang: "boomerangFire",
    curve: "curveFire", split: "splitFire", heavy: "heavyFire",
  };

  Game.prototype.fireBall = function (e) {
    var p = this.player;
    var w = e.wave;
    var jitter = e.nodes > 1 ? CFG.AIM_JITTER_BOSS : CFG.AIM_JITTER;
    var tx = clamp(p.x + (this.rng() * 2 - 1) * jitter, CFG.MARGIN, CFG.WORLD_W - CFG.MARGIN);
    var dx = tx - e.x;
    var dy = CFG.PLAYER_Y - CFG.ENEMY_Y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var spd = w.ballSpeed * (CFG.BALL_SPEED_MUL || 1);
    if (e.castKind === "heavy") spd *= CFG.HEAVY_SPEED_MUL;
    else if (e.castKind === "boomerang") spd *= CFG.BOOMERANG_SPEED_MUL;
    var b = {
      x: e.x, y: CFG.ENEMY_Y + 14,
      vx: (dx / len) * spd,
      vy: (dy / len) * spd,
      kind: e.castKind, dir: "down", dead: false, returned: false,
    };
    if (e.castKind === "curve") b.curveDir = this.rng() < 0.5 ? -1 : 1;
    if (e.castKind === "heavy") b.r = CFG.HEAVY_R;
    if (e.castKind === "boomerang") b.passes = 0;
    this.balls.push(b);
    this.events.push(FIRE_EVENT[e.castKind] || "fire");

    if (e.comboLeft > 0) {
      e.comboLeft = 0;
      e.state = "telegraph";
      e.stateT = 0;
      e.lastBeat = 0;
      e.castKind = "normal";
      e.castDur = 0.34;
      this.events.push("combo");
    } else {
      e.state = "idle";
      e.stateT = 0;
      e.idleUntil = e.wave.interval * (0.7 + this.rng() * 0.6);
    }
  };

  /* ---------- 球 / 碰撞 ---------- */

  // 飞蝗石截球：必须先于一切碰撞结算——同帧石球相遇时球要算被击落，不能砸到玩家
  Game.prototype.pebbleIntercept = function (dt) {
    var p = this.player;
    for (var i = 0; i < this.balls.length; i++) {
      var s = this.balls[i];
      if (s.dead || !s.pebble) continue;
      for (var j = 0; j < this.balls.length; j++) {
        var o = this.balls[j];
        if (o.dead || o.pebble || o.dir !== "down") continue;
        // 两者本帧均匀速：相对轨迹是直线，取帧内最近距离（扫掠判定，防高速穿透）
        var rx = o.x - s.x, ry = o.y - s.y;
        var vx = (o.vx - s.vx) * dt, vy = (o.vy - s.vy) * dt;
        var den = vx * vx + vy * vy;
        var u = den > 0 ? -(rx * vx + ry * vy) / den : 0;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        var cx = rx + vx * u, cy = ry + vy * u;
        if (cx * cx + cy * cy <= CFG.PEBBLE_BLOCK_R * CFG.PEBBLE_BLOCK_R) {
          this.blockBall(s, o, u * dt);
          break; // 一颗石子只换一颗球
        }
      }
    }
  };

  // 一石换一球：双双消散；若被截的正是闪身盯球，盯球作废（闪身不领奖励）
  Game.prototype.blockBall = function (s, o, udt) {
    var mx = (s.x + s.vx * udt + o.x + o.vx * udt) / 2;
    var my = (s.y + s.vy * udt + o.y + o.vy * udt) / 2;
    if (this.player.dashWatch && this.player.dashWatch.b === o) this.player.dashWatch = null;
    s.dead = true;
    o.dead = true;
    this.stats.pebbleBlocks++;
    this.spawnSparks(mx, my, 9, o.kind === "peril" ? "#ffb3a8" : "#cfe8ff", 0.8);
    this.spawnRing(mx, my, o.kind === "peril" ? "#ff8a7a" : "#bcd8ff");
    this.spawnFloat(mx, my - 14, "击落", "#cfe8ff", 16, 0.7);
    this.events.push("pebbleBlock");
  };

  Game.prototype.ballsTick = function (dt) {
    var p = this.player, e = this.enemy;
    this.pebbleIntercept(dt);
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.dead) continue;
      // 弧线球：下行途中持续侧向加速，球路是弯的（可读性=看得到弧）
      if (b.kind === "curve" && b.dir === "down") b.vx += (b.curveDir || 1) * CFG.CURVE_ACCEL * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.dir === "down") {
        // 分裂球：本帧越过中场线才炸成 2 颗普通球（穿越语义：已在场下的球不炸；
        // 子球 kind=normal 不会二次分裂）
        if (b.kind === "split" && b.vy > 0 &&
          b.y >= CFG.SPLIT_Y && b.y - b.vy * dt < CFG.SPLIT_Y) { this.splitBall(b); continue; }
        // vy>0 才伤人：回旋危球爬升段（vy<0）从玩家身边退开，不该判定命中
        var hitP = b.vy > 0 &&
          Math.abs(b.x - p.x) <= CFG.HIT_HALF_W &&
          b.y >= CFG.PLAYER_Y - CFG.HIT_HALF_H &&
          b.y <= CFG.PLAYER_Y + CFG.HIT_HALF_H;
        if (hitP) { this.resolveIncoming(b); continue; }
        // 回旋危球：第一次过线不结算，掉头爬升；爬过折返点重新俯冲；
        // 第二段（passes>=2）过线才按正常躲开/出界结算
        if (b.kind === "boomerang") {
          if (b.vy > 0 && b.y > CFG.PLAYER_Y + CFG.HIT_HALF_H) {
            if ((b.passes || 0) >= 1) {
              b.passes = 2;
              this.scoreDashDodge(b);
              if (b.y > CFG.WORLD_H + 24) { b.dead = true; this.events.push("miss"); }
            } else {
              b.passes = 1;
              b.vy = -Math.abs(b.vy);
              this.spawnFloat(b.x, CFG.PLAYER_Y + 44, "回马枪", "#ffb3a8", 18, 0.8);
              this.events.push("boomerangTurn");
            }
          } else if (b.vy < 0 && b.y <= CFG.BOOMERANG_CLIMB_Y) {
            b.vy = Math.abs(b.vy);
            this.events.push("boomerangDive");
          }
          continue;
        }
        // 越过玩家线还没碰到人：若本次闪身盯的是它 → 躲开成功，结算品质
        if (b.y > CFG.PLAYER_Y + CFG.HIT_HALF_H) this.scoreDashDodge(b);
        if (b.y > CFG.WORLD_H + 24) { b.dead = true; this.events.push("miss"); }
      } else {
        if (e.state !== "rise" && e.state !== "dead" &&
          Math.abs(b.x - e.x) <= CFG.E_HIT_HALF_W &&
          b.y <= CFG.ENEMY_Y + CFG.E_HIT_HALF_H &&
          b.y >= CFG.ENEMY_Y - CFG.E_HIT_HALF_H) {
          this.resolveReturnHit(b);
          continue;
        }
        if (b.y < CFG.ENEMY_Y - 80) b.dead = true; // 踢歪了，飞过敌人
      }
    }
    this.balls = this.balls.filter(function (b) { return !b.dead; });
  };

  // 分裂球炸开：母球消散，原地分出 2 颗左右分飞的普通球（子球 normal，不再炸）
  Game.prototype.splitBall = function (b) {
    b.dead = true;
    for (var s = -1; s <= 1; s += 2) {
      this.balls.push({
        x: b.x, y: b.y,
        vx: b.vx + s * CFG.SPLIT_SPREAD, vy: b.vy,
        kind: "normal", dir: "down", dead: false, returned: false, splitChild: true,
      });
    }
    this.spawnSparks(b.x, b.y, 8, "#d8c8ff", 0.7);
    this.spawnFloat(b.x, b.y - 18, "裂帛", "#d8c8ff", 16, 0.6);
    this.events.push("splitPop");
  };

  // 把来球改写成朝敌人飞回的反弹球（完美踢与狗熊哆嗦毛共用同一条轨迹）
  Game.prototype.bounceBallUp = function (b) {
    var p = this.player, e = this.enemy;
    // 被盯的球改道弹回：「躲开」已无从谈起，盯球作废（完美踢/蹩脚踢已另行定品质）
    if (p.dashWatch && p.dashWatch.b === b) p.dashWatch = null;
    var dx = e.x - p.x;
    var dy = CFG.ENEMY_Y - CFG.PLAYER_Y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * CFG.RETURN_SPEED_MUL;
    b.dead = false;
    b.dir = "up";
    b.returned = true;
    b.x = p.x;
    b.y = CFG.PLAYER_Y - 26;
    b.vx = (dx / len) * speed;
    b.vy = (dy / len) * speed;
  };

  // 狗熊哆嗦毛弹反：轨迹与完美踢相同（能掉血/涨架势/触发处决），
  // 但不计完美踢统计、不刷「浪子踢球」飘字，只给金橙火花
  Game.prototype.flailBounce = function (b) {
    var cx = b.x, cy = b.y;
    this.bounceBallUp(b);
    b.flail = true; // resolveReturnHit 据此伤害减半（轨迹与完美踢一致）
    this.stats.flailBounces++;
    this.spawnRing(cx, cy, "#ffa84b");
    this.spawnSparks(cx, cy, 10, "#ffc46b", 0.9);
    this.events.push("flailBounce");
  };

  // 梨花摆（招式）：完美踢顺带把身边最近一颗同族下行球一起弹回
  //（危球族踢不动；溅射球半伤、不涨架势，见 resolveReturnHit 的 splash 分支）
  Game.prototype.splashKick = function (main) {
    var p = this.player, best = null, bestD = CFG.SPLASH_RANGE;
    for (var i = 0; i < this.balls.length; i++) {
      var o = this.balls[i];
      if (o === main || o.dead || o.dir !== "down") continue;
      if (o.kind === "peril" || o.kind === "boomerang") continue;
      var d = Math.abs(o.x - p.x);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) return;
    this.bounceBallUp(best);
    best.splash = true;
    this.spawnRing(best.x, CFG.PLAYER_Y - 20, "#cfe8ff");
    this.spawnFloat(best.x, CFG.PLAYER_Y - 132, "梨花摆", "#cfe8ff", 18, 0.7);
    this.events.push("splashKick");
  };

  Game.prototype.resolveIncoming = function (b) {
    var p = this.player;
    var cx = b.x, cy = b.y;

    // 狗熊哆嗦毛：手舞足蹈期间来什么球都原样弹回（危球也不例外）
    if (p.state === "flail") {
      this.flailBounce(b);
      return;
    }

    // 危球族（红危球 / 回旋危球）：踢无效，只能无敌帧穿
    if (b.kind === "peril" || b.kind === "boomerang") {
      b.dead = true;
      if (p.invuln > 0) {
        this.stats.dashThroughs++;
        this.spawnSparks(cx, cy, 8, "#bcd8ff", 0.7);
        // 完美弹金色 Perfect（避让起步「闪身步」与同帧大招名）；早闪只配「闪身步！」
        var perfect = this.scoreDashThrough(b, true);
        if (perfect) {
          this.spawnFloat(p.x, CFG.PLAYER_Y - 150, "Perfect!", "#ffe9a8", 24, 0.8);
        } else {
          this.spawnFloat(p.x, CFG.PLAYER_Y - 132, "闪身步！", "#7fe4ef", 24);
        }
        this.events.push("perilDash");
      } else {
        this.damagePlayer(CFG.PERIL_HP, CFG.PERIL_P_POST, true);
      }
      return;
    }

    // 完美踢：金球反弹（揽月式放宽判定窗；瞬身途中不出脚）
    var perfectWin = this.hasSkill("lanyue") ? CFG.KICK_PERFECT_LONG : CFG.KICK_PERFECT;
    if (p.state !== "break" && p.state !== "blink" && p.kickAge <= perfectWin) {
      // 闪身途中球被残留踢窗处理：尽到处置义务（收尾不算空闪），并定下品质供同闪后续穿球复用
      if (p.state === "dash") { p.dashScored = true; this.judgeDashPerfect(b); }
      this.bounceBallUp(b);
      if (this.hasSkill("lihua")) this.splashKick(b); // 梨花摆：顺带弹回身旁一颗来球
      this.spawnRing(cx, cy, "#ffe985");
      this.spawnSparks(cx, cy, 12, "#ffd98a", 1);
      this.shake = 0.18;
      this.stats.perfectKicks++;
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "浪子踢球！", "#ffd45e", 24);
      this.events.push("perfectKick");
      // 贴脸 0.08s 内才计连击（横向不挑，碰撞带内踢中就算）
      if (p.kickAge <= CFG.COMBO_KICK_WINDOW) this.bumpCombo("kick");
      else this.resetCombo();
      return;
    }

    b.dead = true;

    // 蹩脚踢：踢偏保命，同时连击链作废（瞬身途中不出脚）
    if (p.state !== "break" && p.state !== "blink" && p.kickAge <= CFG.KICK_TOTAL) {
      if (p.state === "dash") { p.dashScored = true; this.judgeDashPerfect(b); } // 同完美踢
      p.posture += CFG.LOWKICK_P_POST;
      p.postDelay = CFG.P_POST_DELAY;
      this.spawnSparks(cx, cy, 7, "#cfd6e4", 0.6);
      this.stats.lowKicks++;
      this.resetCombo();
      this.events.push("lowKick");
      return;
    }

    // 闪身无敌帧穿球：起步已报「闪身步」，这里只给火花+轻音，品质由 scoreDashThrough 判。
    // 仅闪身态进结算——金钟罩/不倒翁/瞬身踢的无敌只挡伤：不进闪身统计、不判品质，
    // 否则 dashPressX/stateT 是上一闪的残值，会判出假 Perfect（涨连击甚至触发大招打断瞬身）或冤枉断链
    if (p.invuln > 0) {
      this.spawnSparks(cx, cy, 7, "#bcd8ff", 0.6);
      if (p.state === "dash") {
        this.stats.dashThroughs++;
        this.events.push("dashThrough");
        this.scoreDashThrough(b);
      }
      return;
    }

    // 裸吃（重球更疼）
    if (b.kind === "heavy") this.damagePlayer(CFG.HEAVY_HP, CFG.HEAVY_P_POST, false);
    else this.damagePlayer(CFG.E_HP, CFG.HURT_P_POST, false);
  };

  // 架势打满 → 踉跄（完美踢与手里剑共用）
  Game.prototype.enterStagger = function () {
    var e = this.enemy;
    e.posture = CFG.MAX_POSTURE;
    e.state = "stagger";
    e.stateT = 0;
    e.comboLeft = 0;
    this.banner = { main: "破架势", sub: "再踢一球 · 忍杀", t: 1.4, tmax: 1.4, peril: false };
    this.events.push("stagger");
  };

  Game.prototype.resolveReturnHit = function (b) {
    var e = this.enemy;
    b.dead = true;
    var cy = CFG.ENEMY_Y;

    // 踉跄中：忍杀，直接清空当前这管血（飞蝗石/瞬身踢也算——蓄的就是这一下）
    if (e.state === "stagger") {
      e.hp = 0;
      this.spawnSparks(e.x, cy, 24, "#d4302f", 1.4);
      this.spawnRing(e.x, cy, "#ff5a4d");
      // 敌人脚下方（ENEMY_Y-96 会撞顶部名字/血条 HUD），上升 39px 后仍在腿下
      this.spawnFloat(e.x, CFG.ENEMY_Y + 140, "黑虎掏心！", "#ff5a4d", 28, 1.15);
      this.shake = 0.55;
      this.events.push("deathblow");
      this.killNode();
      return;
    }

    // 飞蝗石：蚊子腿伤害——不涨架势、不打断敌人动作（残血可收头）。
    // 手里剑（招式）：伤害 5→12 且命中 +10 架势（满架势力可致踉跄）
    if (b.pebble) {
      e.hp -= b.shuriken ? CFG.SHURI_HP : CFG.PEBBLE_HP;
      this.stats.pebbleHits++;
      this.spawnSparks(b.x, cy, 5, "#cfe8ff", 0.5);
      this.events.push("pebbleHit");
      if (e.hp <= 0) { e.hp = 0; this.killNode(); return; }
      if (b.shuriken) {
        e.posture += CFG.SHURI_POST;
        e.postDelay = CFG.E_POST_DELAY;
        if (e.posture >= CFG.MAX_POSTURE) this.enterStagger();
      }
      return;
    }

    // 梨花摆溅射球：半伤、不涨架势、不打断（白捡的便宜不能放大）
    if (b.splash) {
      e.hp -= Math.round((b.kind === "heavy" ? CFG.HEAVY_KICK_HP : CFG.KICK_HP) / 2);
      this.spawnSparks(b.x, cy, 7, "#cfe8ff", 0.7);
      this.events.push("splashHit");
      if (e.hp <= 0) { e.hp = 0; this.killNode(); }
      return;
    }

    // 狗熊哆嗦毛弹回的球伤害减半（架势/处决不打折）；重球踢回高伤——高风险高回报
    e.hp -= b.flail ? CFG.FLAIL_KICK_HP : (b.kind === "heavy" ? CFG.HEAVY_KICK_HP : CFG.KICK_HP);
    e.posture += CFG.PERFECT_E_POST;
    e.postDelay = CFG.E_POST_DELAY;
    if (!b.blink) this.stats.returnHits++; // 瞬身踢不占用「完美反弹命中」统计
    this.spawnSparks(b.x, cy, 10, "#ffd98a", 0.9);
    this.shake = 0.2;
    this.events.push(b.blink ? "blinkHit" : "returnHit");

    if (e.hp <= 0) {
      e.hp = 0;
      this.killNode();
    } else if (e.posture >= CFG.MAX_POSTURE) {
      this.enterStagger();
    } else {
      e.state = "hurt";
      e.stateT = 0;
      e.comboLeft = 0;
    }
  };

  Game.prototype.damagePlayer = function (hpDmg, postDmg, isPeril) {
    var p = this.player;
    this.resetCombo(); // 挨揍了，连招断了
    p.dashWatch = null; // 盯球闪身作废：球没躲开
    p.hp -= hpDmg;
    this.stats.damageTaken += hpDmg; // 三星评价（无伤）依据
    // 不倒翁（招式）：每关首次致命伤留 1 血 + 1s 无敌（掉血已计，三星照常失去）
    if (p.hp <= 0 && this.hasSkill("revive") && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = 1;
      p.invuln = Math.max(p.invuln, CFG.REVIVE_INVULN);
      this.spawnFloat(p.x, CFG.PLAYER_Y - 130, "不倒翁！", "#7fe4ef", 24, 1.2);
      this.events.push("revive");
    }
    p.posture += postDmg;
    p.postDelay = CFG.P_POST_DELAY;
    if (p.state !== "break") {
      p.state = "hurt";
      p.stateT = 0;
    }
    this.spawnSparks(p.x, CFG.PLAYER_Y - 40, isPeril ? 14 : 9, isPeril ? "#ff7a6b" : "#e8b8a0", isPeril ? 1.2 : 0.8);
    this.shake = isPeril ? 0.45 : 0.3;
    this.events.push(isPeril ? "perilHit" : "hurt");
  };

  /* ---------- 波次 ---------- */

  Game.prototype.killNode = function () {
    var e = this.enemy;
    e.nodes--;
    this.stats.kills++;
    this.banner = { main: "忍殺", sub: "", t: 1, tmax: 1, peril: true };
    if (e.nodes > 0) {
      e.nodeIndex++;
      e.maxHp = e.wave.hp[e.nodeIndex];
      e.hp = e.maxHp;
      e.posture = 0;
      e.postDelay = 0;
      e.state = "rise";
      e.stateT = 0;
    } else {
      e.state = "dead";
      e.stateT = 0;
    }
  };

  // 选关版：每关独立——打死本关最后一名敌人即通关，回选关界面点下一关
  //（不再连锁推进；狗熊哆嗦毛 5s 长状态在结算遮罩下自然定格，不硬切姿态）
  Game.prototype.advanceWave = function () {
    this.mode = "victory";
    this.balls = []; // 结算遮罩下不留飞球
    this.stats.clearT = this.time;
    this.events.push("victory");
  };

  /* ---------- 三星评价 / 进度（纯函数，main.js 负责持久化） ---------- */

  // ★ 通关保底；★ 无伤（damageTaken==0）；★ 无伤且无蹩脚踢
  function starsFor(game) {
    var s = game.stats;
    if (s.damageTaken > 0) return 1;
    if (s.lowKicks > 0) return 2;
    return 3;
  }

  function emptyProgress() {
    return { unlocked: 1, stars: {} };
  }

  // 通关第 idx 关：解锁下一关（封顶 20），星星取历史最高；不改原对象
  function recordClear(progress, idx, stars) {
    var next = { unlocked: progress.unlocked, stars: {} };
    for (var k in progress.stars) next.stars[k] = progress.stars[k];
    next.unlocked = Math.min(LEVELS.length, Math.max(progress.unlocked, idx + 2));
    next.stars[idx] = Math.max(progress.stars[idx] || 0, stars);
    return next;
  }

  return {
    Game: Game, CFG: CFG, LEVELS: LEVELS,
    mulberry32: mulberry32, telegraphBeat: telegraphBeat,
    starsFor: starsFor, emptyProgress: emptyProgress, recordClear: recordClear,
  };
});
