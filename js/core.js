/*
 * 弹踢道场 · 战斗模拟内核（无 DOM / wx 依赖，Node 可直接测试）
 *
 * 核心机制（只狼弹反 → 踢球改编）：
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
    // 生命 / 架势
    MAX_HP: 100,
    MAX_POSTURE: 100,
    // 踢
    KICK_PERFECT: 0.2,
    KICK_TOTAL: 0.4,
    KICK_COOLDOWN: 0.3,
    KICK_ANIM: 0.26,
    KICK_HP: 9,            // 完美反弹命中伤害
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
    // 瞄准散布
    AIM_JITTER: 30,
    AIM_JITTER_BOSS: 20,
  };

  // 三波：interval 发球节奏 / ballSpeed 球速 / cast 预警时长 /
  // comboChance 连射概率 / perilChance 危球概率 / drift 敌人横向漂移速度
  var WAVES = [
    { sub: "第一阵", name: "落武者", hp: [60], interval: 1.5, ballSpeed: 320, cast: 0.8, comboChance: 0, perilChance: 0, drift: 46 },
    { sub: "第二阵", name: "苇名流剑士", hp: [80], interval: 1.15, ballSpeed: 385, cast: 0.62, comboChance: 0.45, perilChance: 0, drift: 60 },
    { sub: "主将战", name: "武士大将 · 赤甲", hp: [90, 76], interval: 1.0, ballSpeed: 455, cast: 0.55, comboChance: 0.5, perilChance: 0.35, drift: 70 },
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

  // 蓄力鼓点节拍（返回 0/1/2/3）：内核鼓声与渲染三点指示灯共用同一公式。
  // 不变量：castDur/3 必须大于单帧上限 0.05s（当前最短蓄力 0.34s，安全），
  // 否则一个钳制大步可能整拍跳空、漏发鼓声。
  function telegraphBeat(stateT, castDur) { return Math.floor(stateT / (castDur / 3)); }

  function makePlayer() {
    return {
      x: CFG.WORLD_W / 2,
      hp: CFG.MAX_HP,
      posture: 0,
      state: "idle", // idle|dash|hurt|break
      stateT: 0,
      heldDir: 0,
      dashDir: 0,
      invuln: 0,
      kickAge: 99,   // 距上次有效踢的时间
      kickCd: 0,     // 踢冷却
      kickAnim: 0,   // 踢腿动画计时
      postDelay: 0,
    };
  }

  function Game(rng) {
    this.rng = rng || Math.random;
    this.mode = "title"; // title|fight|death|victory
    this.time = 0;
    this.waveIndex = -1;
    this.player = makePlayer();
    this.enemy = null;
    this.balls = [];
    this.floatTexts = [];
    this.held = { left: false, right: false };
    this.events = [];
    this.fx = [];
    this.shake = 0;
    this.banner = null;
    this.stats = {
      perfectKicks: 0, lowKicks: 0, dashThroughs: 0,
      returnHits: 0, kills: 0, clearT: 0,
    };
  }

  Game.prototype.start = function () {
    this.mode = "fight";
    this.waveIndex = -1;
    this.time = 0;
    this.player = makePlayer();
    this.balls = [];
    this.fx = [];
    this.floatTexts = [];
    this.stats = {
      perfectKicks: 0, lowKicks: 0, dashThroughs: 0,
      returnHits: 0, kills: 0, clearT: 0,
    };
    this.spawnWave(0);
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
    var w = WAVES[i];
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
      // 崩体 / 受伤中不能踢；冷却内按键被吞掉（不刷新窗口）
      if (p.state === "break" || p.state === "hurt") return;
      if (p.kickCd > 0) return;
      p.kickAge = 0;
      p.kickCd = CFG.KICK_COOLDOWN;
      p.kickAnim = CFG.KICK_ANIM;
      this.events.push("kick");
      return;
    }
    if (action === "dash") {
      if (p.state !== "idle") return;
      p.state = "dash";
      p.stateT = 0;
      p.invuln = CFG.DASH_INVULN;
      p.dashDir = this.held.left ? -1 : this.held.right ? 1 : 0;
      this.events.push("dash");
    }
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

  // 招式名飘字（花鼓灯梗：闪身步 / 浪子踢球 / 哆嗦毛）
  Game.prototype.spawnFloat = function (x, y, text, color, size) {
    this.floatTexts.push({
      // 最宽飘字约 120px（半宽 60），横向夹取防止贴墙时出屏被裁切
      x: clamp(x, 64, CFG.WORLD_W - 64), y: y, text: text, t: 0, life: 0.95,
      color: color, size: size || 22,
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
    if (p.invuln > 0) p.invuln -= dt;
    p.heldDir = this.held.left ? -1 : this.held.right ? 1 : 0;

    // 架势满立即崩（优先于本帧架势回复）
    if (p.posture >= CFG.MAX_POSTURE && p.state !== "break") {
      p.state = "break";
      p.stateT = 0;
      p.posture = CFG.MAX_POSTURE;
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "哆嗦毛…", "#ff8a7a", 18);
      this.events.push("break");
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
        if (p.stateT >= CFG.DASH_TIME) { p.state = "idle"; p.stateT = 0; }
        break;
      case "hurt":
        if (p.stateT >= CFG.HURT_PLAYER) { p.state = "idle"; p.stateT = 0; }
        break;
      case "break":
        p.posture = CFG.MAX_POSTURE;
        if (p.stateT >= CFG.BREAK_TIME) { p.posture = 0; p.state = "idle"; p.stateT = 0; }
        break;
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

  Game.prototype.chooseAttack = function () {
    var e = this.enemy, w = e.wave;
    var peril = w.perilChance > 0 && this.rng() < w.perilChance;
    e.state = "telegraph";
    e.stateT = 0;
    e.lastBeat = 0;
    e.castKind = peril ? "peril" : "normal";
    e.castDur = w.cast * (peril ? 1.35 : 1);
    e.comboLeft = (!peril && w.comboChance > 0 && this.rng() < w.comboChance) ? 1 : 0;
    this.events.push(peril ? "peril" : "telegraph");
  };

  Game.prototype.fireBall = function (e) {
    var p = this.player;
    var w = e.wave;
    var jitter = e.nodes > 1 ? CFG.AIM_JITTER_BOSS : CFG.AIM_JITTER;
    var tx = clamp(p.x + (this.rng() * 2 - 1) * jitter, CFG.MARGIN, CFG.WORLD_W - CFG.MARGIN);
    var dx = tx - e.x;
    var dy = CFG.PLAYER_Y - CFG.ENEMY_Y;
    var len = Math.sqrt(dx * dx + dy * dy);
    this.balls.push({
      x: e.x, y: CFG.ENEMY_Y + 14,
      vx: (dx / len) * w.ballSpeed,
      vy: (dy / len) * w.ballSpeed,
      kind: e.castKind, dir: "down", dead: false, returned: false,
    });
    this.events.push(e.castKind === "peril" ? "perilFire" : "fire");

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

  Game.prototype.ballsTick = function (dt) {
    var p = this.player, e = this.enemy;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.dead) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.dir === "down") {
        var hitP = Math.abs(b.x - p.x) <= CFG.HIT_HALF_W &&
          b.y >= CFG.PLAYER_Y - CFG.HIT_HALF_H &&
          b.y <= CFG.PLAYER_Y + CFG.HIT_HALF_H;
        if (hitP) { this.resolveIncoming(b); continue; }
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

  Game.prototype.resolveIncoming = function (b) {
    var p = this.player;
    var cx = b.x, cy = b.y;

    // 危球：踢无效，只能无敌帧穿
    if (b.kind === "peril") {
      b.dead = true;
      if (p.invuln > 0) {
        this.stats.dashThroughs++;
        this.spawnSparks(cx, cy, 8, "#bcd8ff", 0.7);
        this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "闪身步！", "#7fe4ef", 24);
        this.events.push("perilDash");
      } else {
        this.damagePlayer(CFG.PERIL_HP, CFG.PERIL_P_POST, true);
      }
      return;
    }

    // 完美踢：金球反弹
    if (p.state !== "break" && p.kickAge <= CFG.KICK_PERFECT) {
      b.dead = false;
      b.dir = "up";
      b.returned = true;
      var e = this.enemy;
      var dx = e.x - p.x;
      var dy = CFG.ENEMY_Y - CFG.PLAYER_Y;
      var len = Math.sqrt(dx * dx + dy * dy);
      var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * CFG.RETURN_SPEED_MUL;
      b.x = p.x; b.y = CFG.PLAYER_Y - 26;
      b.vx = (dx / len) * speed;
      b.vy = (dy / len) * speed;
      this.spawnRing(cx, cy, "#ffe985");
      this.spawnSparks(cx, cy, 12, "#ffd98a", 1);
      this.shake = 0.18;
      this.stats.perfectKicks++;
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "浪子踢球！", "#ffd45e", 24);
      this.events.push("perfectKick");
      return;
    }

    b.dead = true;

    // 蹩脚踢：踢偏保命
    if (p.state !== "break" && p.kickAge <= CFG.KICK_TOTAL) {
      p.posture += CFG.LOWKICK_P_POST;
      p.postDelay = CFG.P_POST_DELAY;
      this.spawnSparks(cx, cy, 7, "#cfd6e4", 0.6);
      this.stats.lowKicks++;
      this.events.push("lowKick");
      return;
    }

    // 闪身无敌帧：穿球
    if (p.invuln > 0) {
      this.spawnSparks(cx, cy, 7, "#bcd8ff", 0.6);
      this.stats.dashThroughs++;
      this.spawnFloat(p.x, CFG.PLAYER_Y - 104, "闪身步", "#7fe4ef", 20);
      this.events.push("dashThrough");
      return;
    }

    // 裸吃
    this.damagePlayer(CFG.E_HP, CFG.HURT_P_POST, false);
  };

  Game.prototype.resolveReturnHit = function (b) {
    var e = this.enemy;
    b.dead = true;
    var cy = CFG.ENEMY_Y;

    // 踉跄中：忍杀，直接清空当前这管血
    if (e.state === "stagger") {
      e.hp = 0;
      this.spawnSparks(e.x, cy, 24, "#d4302f", 1.4);
      this.spawnRing(e.x, cy, "#ff5a4d");
      this.shake = 0.55;
      this.events.push("deathblow");
      this.killNode();
      return;
    }

    e.hp -= CFG.KICK_HP;
    e.posture += CFG.PERFECT_E_POST;
    e.postDelay = CFG.E_POST_DELAY;
    this.stats.returnHits++;
    this.spawnSparks(b.x, cy, 10, "#ffd98a", 0.9);
    this.shake = 0.2;
    this.events.push("returnHit");

    if (e.hp <= 0) {
      e.hp = 0;
      this.killNode();
    } else if (e.posture >= CFG.MAX_POSTURE) {
      e.posture = CFG.MAX_POSTURE;
      e.state = "stagger";
      e.stateT = 0;
      e.comboLeft = 0;
      this.banner = { main: "破架势", sub: "再踢一球 · 忍杀", t: 1.4, tmax: 1.4, peril: false };
      this.events.push("stagger");
    } else {
      e.state = "hurt";
      e.stateT = 0;
      e.comboLeft = 0;
    }
  };

  Game.prototype.damagePlayer = function (hpDmg, postDmg, isPeril) {
    var p = this.player;
    p.hp -= hpDmg;
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

  Game.prototype.advanceWave = function () {
    if (this.waveIndex + 1 < WAVES.length) {
      this.balls = [];
      this.spawnWave(this.waveIndex + 1);
      this.player.state = "idle";
      this.player.stateT = 0;
    } else {
      this.mode = "victory";
      this.balls = []; // 结算遮罩下不留飞球
      this.stats.clearT = this.time;
      this.events.push("victory");
    }
  };

  return {
    Game: Game, CFG: CFG, WAVES: WAVES,
    mulberry32: mulberry32, telegraphBeat: telegraphBeat,
  };
});
