// 弹踢道场 · 二十关选关版测试：node --test tests/levels.test.mjs
// 覆盖：LEVELS 配表（4 章 × 5 关）、四种新球种（弧线/分裂/重球/回旋危球）、
// 三星评价、进度记录纯函数、startLevel/toSelect 选关。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  Game, CFG, LEVELS, mulberry32,
  starsFor, emptyProgress, recordClear,
} = require("../js/core.js");

const DT = 1 / 60;
function newGame(seed = 7) {
  const g = new Game(mulberry32(seed));
  g.start();
  return g;
}
function step(g, frames = 1) {
  for (let i = 0; i < frames; i++) g.update(DT);
}
function track(g) {
  g.seen = [];
  const orig = g.update.bind(g);
  g.update = (dt) => { orig(dt); g.seen.push(...g.events); };
  return g;
}
function incoming(g, distance, kind = "normal", dx = 0, speed) {
  const p = g.player;
  const b = {
    x: p.x + dx, y: CFG.PLAYER_Y - distance,
    vx: 0, vy: speed ?? 340,
    kind, dir: "down", dead: false,
  };
  g.balls.push(b);
  return b;
}

/* ---------- LEVELS 配表 ---------- */

test("关卡配表：20 关 = 4 章 × 5 关，字段齐全合法、难度总体递增", () => {
  assert.equal(LEVELS.length, 20);
  for (const w of LEVELS) {
    assert.ok(w.sub && w.name, "每关要有关卡名");
    assert.ok(w.hp.length >= 1 && w.hp.every((h) => h > 0), "血条为正");
    assert.ok(w.ballSpeed >= 300 && w.ballSpeed <= 650, `球速合理 ${w.name}`);
    assert.ok(w.perilChance >= 0 && w.perilChance <= 0.6, `危球率合理 ${w.name}`);
    assert.ok(w.interval >= 0.7 && w.interval <= 1.6, `节奏合理 ${w.name}`);
    const mix = w.mix || {};
    for (const k of ["curve", "split", "heavy", "boomerang"]) {
      assert.ok(mix[k] == null || (mix[k] >= 0 && mix[k] <= 0.7), `混编率合法 ${w.name}.${k}`);
    }
    const mixSum = (mix.curve || 0) + (mix.split || 0) + (mix.heavy || 0) + (mix.boomerang || 0);
    assert.ok(mixSum <= 0.95, `混编总和留普通球余量 ${w.name}`);
  }
  // 章末守关（5/10/15/20）多管血，最终宗师三管
  assert.deepEqual(
    LEVELS.map((w, i) => ((i + 1) % 5 === 0 ? w.hp.length >= 2 : true)),
    LEVELS.map(() => true),
    "每章第 5 关必须是多管血守关",
  );
  assert.equal(LEVELS[19].hp.length, 3, "镇场宗师三管血");
  // 难度总体递增：末关节奏不慢于首关、球速不慢于首关
  assert.ok(LEVELS[19].interval <= LEVELS[0].interval);
  assert.ok(LEVELS[19].ballSpeed >= LEVELS[0].ballSpeed);
  // 新球种归属：弧线 11 章三登场，分裂/重球随后，回旋危球只在第四章
  assert.ok((LEVELS[10].mix.curve || 0) > 0, "第 11 关应有弧线球");
  assert.ok((LEVELS[12].mix.split || 0) > 0, "第 13 关应有分裂球");
  assert.ok((LEVELS[13].mix.heavy || 0) > 0, "第 14 关应有重球");
  for (let i = 0; i < 15; i++) {
    assert.ok(!(LEVELS[i].mix.boomerang > 0), `回旋危球前三章不该出现（第 ${i + 1} 关）`);
  }
  assert.ok(LEVELS[15].mix.boomerang > 0, "第 16 关应有回旋危球");
});

/* ---------- startLevel / toSelect / 单关通关 ---------- */

test("startLevel(i)：直接空降第 i 关，玩家/统计全部重置", () => {
  const g = new Game(mulberry32(3));
  g.startLevel(7);
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, 7);
  assert.equal(g.enemy.name, LEVELS[7].name);
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.equal(g.stats.damageTaken, 0);
  assert.equal(g.balls.length, 0);
});

test("start() 等价于 startLevel(0)", () => {
  const g = newGame();
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, 0);
  assert.equal(g.enemy.name, LEVELS[0].name);
});

test("打死本关唯一一命 → 直接通关 victory（不再连锁下一关）", () => {
  const g = track(newGame());
  g.enemy.hp = 3;
  g.balls.push({
    x: g.enemy.x, y: CFG.ENEMY_Y + 40, vx: 0, vy: -460,
    kind: "normal", dir: "up", dead: false, returned: true,
  });
  step(g, 70); // 命中 + DEAD_HOLD 1s
  assert.equal(g.mode, "victory");
  assert.ok(g.seen.includes("victory"));
  assert.equal(g.stats.kills, 1);
  assert.ok(g.stats.clearT > 0);
});

test("toSelect()：回到选关界面，战斗状态不推进", () => {
  const g = newGame();
  step(g, 30);
  g.toSelect();
  assert.equal(g.mode, "select");
  const hp = g.enemy.hp;
  step(g, 60);
  assert.equal(g.mode, "select");
  assert.equal(g.enemy.hp, hp, "选关界面战斗应冻结");
});

/* ---------- 受伤统计 / 三星评价 ---------- */

test("damagePlayer 累计 stats.damageTaken（普通球与危球都计）", () => {
  const g = newGame();
  incoming(g, 25, "normal");
  step(g, 3);
  assert.equal(g.stats.damageTaken, CFG.E_HP);
  incoming(g, 25, "peril", 0, 455);
  step(g, 3);
  assert.equal(g.stats.damageTaken, CFG.E_HP + CFG.PERIL_HP);
});

test("starsFor：通关保底一星；无伤二星；无伤且无蹩脚踢三星", () => {
  const g = newGame();
  g.mode = "victory";
  g.stats.damageTaken = 100;
  g.stats.lowKicks = 0;
  assert.equal(starsFor(g), 1);
  g.stats.damageTaken = 0;
  g.stats.lowKicks = 2;
  assert.equal(starsFor(g), 2);
  g.stats.lowKicks = 0;
  assert.equal(starsFor(g), 3);
});

test("emptyProgress / recordClear：解锁线性推进、星星取最高、纯函数不改原对象", () => {
  const p0 = emptyProgress();
  assert.deepEqual(p0, { unlocked: 1, stars: {} });
  const p1 = recordClear(p0, 0, 2);
  assert.equal(p1.unlocked, 2, "过第 1 关解锁第 2 关");
  assert.equal(p1.stars[0], 2);
  assert.deepEqual(p0, { unlocked: 1, stars: {} }, "recordClear 不得改原进度");
  const p2 = recordClear(p1, 0, 1); // 低星不覆盖高星
  assert.equal(p2.stars[0], 2);
  const p3 = recordClear(p2, 4, 3); // 跳关记录也只在已解锁范围内推进
  assert.equal(p3.unlocked, 6);
  const p4 = recordClear(p3, 19, 3); // 最后一关通关不溢出
  assert.equal(p4.unlocked, 20);
});

/* ---------- 弧线球 curve ---------- */

test("弧线球：下行途中持续侧向加速变轨", () => {
  const g = newGame();
  const b = incoming(g, 400, "curve", 0, 340);
  b.curveDir = 1;
  step(g, 30); // 0.5s
  assert.ok(b.vx > 40, `弧线球应侧向加速，vx=${b.vx}`);
  assert.equal(b.dir, "down");
});

test("弧线球是普通族：贴脸完美踢照样金球弹回", () => {
  const g = track(newGame());
  incoming(g, 25, "curve");
  g.press("kick");
  step(g, 6);
  assert.ok(g.seen.includes("perfectKick"), JSON.stringify(g.seen));
  assert.equal(g.balls[0].dir, "up");
});

/* ---------- 分裂球 split ---------- */

test("分裂球：越过中场炸成 2 颗普通球，只炸一次", () => {
  const g = newGame();
  g.player.x = 80; // 让开，避免子球碰人干扰计数
  const b = {
    x: 300, y: CFG.SPLIT_Y - 60, vx: 0, vy: 340,
    kind: "split", dir: "down", dead: false,
  };
  g.balls.push(b);
  step(g, 15); // 0.25s，越过 SPLIT_Y
  const kids = g.balls.filter((x) => !x.dead && x.kind === "normal" && x.dir === "down");
  assert.equal(kids.length, 2, "应炸成 2 颗普通球");
  assert.ok(!g.balls.some((x) => !x.dead && x.kind === "split"), "母球应消散");
  assert.notEqual(kids[0].vx, kids[1].vx, "两颗子球应左右分飞");
  step(g, 10);
  const kids2 = g.balls.filter((x) => !x.dead && x.dir === "down");
  assert.ok(kids2.length <= 2, "子球不得二次分裂");
});

test("分裂球本身也是普通族：中场前贴脸可踢回（不炸）", () => {
  const g = track(newGame());
  incoming(g, 25, "split");
  g.press("kick");
  step(g, 6);
  assert.ok(g.seen.includes("perfectKick"));
  assert.equal(g.balls.filter((x) => !x.dead).length, 1, "踢回应是一颗球上行");
  assert.equal(g.balls[0].dir, "up");
});

/* ---------- 慢速重球 heavy ---------- */

test("重球：敌人发射速度打折（HEAVY_SPEED_MUL）", () => {
  const g = newGame();
  const e = g.enemy;
  e.castKind = "heavy";
  g.fireBall(e);
  const b = g.balls[g.balls.length - 1];
  const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const expect = LEVELS[0].ballSpeed * CFG.HEAVY_SPEED_MUL;
  assert.ok(Math.abs(spd - expect) < 1, `重球速度 ${spd} 应≈${expect}`);
  assert.equal(b.kind, "heavy");
});

test("重球裸吃重伤：玩家掉 HEAVY_HP（比普通球疼）", () => {
  const g = newGame();
  incoming(g, 25, "heavy");
  step(g, 3);
  assert.equal(g.player.hp, CFG.MAX_HP - CFG.HEAVY_HP);
  assert.equal(g.stats.damageTaken, CFG.HEAVY_HP);
});

test("重球完美踢回：命中敌人掉 HEAVY_KICK_HP（高风险高回报）", () => {
  const g = newGame();
  const hp0 = g.enemy.hp;
  incoming(g, 25, "heavy");
  g.press("kick");
  step(g, 90); // 弹回命中
  assert.equal(g.enemy.hp, hp0 - CFG.HEAVY_KICK_HP);
});

/* ---------- 回旋危球 boomerang ---------- */

test("回旋危球是危球族：踢无效，裸吃按危球伤害", () => {
  const g = track(newGame());
  incoming(g, 25, "boomerang", 0, 455);
  g.press("kick"); // 踢了也白踢
  step(g, 4);
  assert.ok(!g.seen.includes("perfectKick"), "回旋危球不得被踢回");
  assert.equal(g.player.hp, CFG.MAX_HP - CFG.PERIL_HP);
});

test("回旋危球：第一次越过玩家线不结算，掉头爬升后俯冲二段攻击", () => {
  const g = track(newGame());
  g.player.x = 80; // 让开弹道
  const b = {
    x: 300, y: CFG.PLAYER_Y - 120, vx: 0, vy: 340,
    kind: "boomerang", dir: "down", dead: false, passes: 0,
  };
  g.balls.push(b);
  step(g, 30); // 0.5s：越过玩家线
  assert.equal(b.dead, false, "第一次过线不该消散");
  assert.equal(b.passes, 1, "应记一过一");
  assert.ok(b.vy < 0, "过线后应掉头爬升");
  // 爬升到折返点后重新俯冲
  let dived = false;
  for (let i = 0; i < 600 && !dived; i++) { step(g, 1); if (b.vy > 0) dived = true; }
  assert.ok(dived, "爬升后应重新俯冲（二段攻击）");
  // 第二次越过玩家线：正常按 miss 消散
  step(g, 90);
  assert.ok(b.dead, "第二次过线应消散");
});

test("回旋危球闪身：第一段过线不领奖，第二段躲开才结算完美闪身", () => {
  const g = track(newGame());
  const b = incoming(g, 200, "boomerang", 0, 340);
  b.passes = 0;
  g.setHeld("right", true);
  g.press("dash"); // 按下瞬间球距 ≤256 → 完美待命，盯球
  g.setHeld("right", false);
  assert.ok(g.player.dashWatch, "应盯住回旋危球");
  step(g, 50); // 球越过玩家线（第一段，~41 帧过线）
  assert.equal(g.stats.dashThroughs, 0, "第一段过线不得结算闪身奖励");
  assert.ok(!b.dead && b.vy < 0, "球应掉头爬升");
  // 等它爬升、俯冲、第二次过线（爬 330 + 俯冲回线 ≈ 128 帧）
  step(g, 220);
  assert.equal(g.stats.dashThroughs, 1, "第二段躲开才结算");
  assert.ok(g.seen.includes("perfectDash"), "盯球完美闪身应弹 Perfect");
});

/* ---------- 混编发球 ---------- */

test("chooseAttack 按 mix 混编：full-mix 关卡能发出全部四种新球", () => {
  const g = new Game(mulberry32(11));
  g.startLevel(18); // 万象道人：curve/split/heavy/boomerang 全有
  const kinds = new Set();
  for (let i = 0; i < 400 && kinds.size < 4; i++) {
    g.chooseAttack();
    if (g.enemy.castKind !== "normal" && g.enemy.castKind !== "peril") kinds.add(g.enemy.castKind);
    g.enemy.state = "idle"; // 复位再抽
  }
  assert.ok(kinds.has("curve"), "应能抽中弧线球");
  assert.ok(kinds.has("split"), "应能抽中分裂球");
  assert.ok(kinds.has("heavy"), "应能抽中重球");
  assert.ok(kinds.has("boomerang"), "应能抽中回旋危球");
});
