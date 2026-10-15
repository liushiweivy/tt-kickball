// 弹踢道场 · 战斗内核测试：node --test tests/core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, CFG, WAVES, mulberry32, telegraphBeat } = require("../js/core.js");

const DT = 1 / 60;
function newGame(seed = 7) {
  const g = new Game(mulberry32(seed));
  g.start();
  return g;
}
function step(g, frames = 1) {
  for (let i = 0; i < frames; i++) g.update(DT);
}
/** events 是每帧清空的瞬时队列；track 累积全程事件供跨帧断言 */
function track(g) {
  g.seen = [];
  const orig = g.update.bind(g);
  g.update = (dt) => { orig(dt); g.seen.push(...g.events); };
  return g;
}
/** 在玩家上方 distance px 放一颗下行球（vx=0，垂直飞向玩家） */
function incoming(g, distance, kind = "normal", dx = 0, speed) {
  const p = g.player;
  const b = {
    x: p.x + dx, y: CFG.PLAYER_Y - distance,
    vx: 0, vy: speed ?? (kind === "peril" ? 455 : 340),
    kind, dir: "down", dead: false,
  };
  g.balls.push(b);
  return b;
}
/** 放一颗反弹球飞向敌人并推进到命中 */
function returnHitEnemy(g, frames = 3) {
  g.balls.push({
    x: g.enemy.x, y: CFG.ENEMY_Y + 40,
    vx: 0, vy: -460,
    kind: "normal", dir: "up", dead: false, returned: true,
  });
  step(g, frames);
}

test("开局：第一波敌人生成，玩家满血，敌人 60 血", () => {
  const g = new Game(mulberry32(1));
  assert.equal(g.mode, "title");
  g.start();
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, 0);
  assert.equal(g.enemy.hp, 60);
  assert.equal(g.player.hp, 100);
});

test("敌人：预警蓄力后发射一颗向下的球，瞄着玩家飞来", () => {
  const g = newGame();
  g.setHeld("right", true); // 玩家移到右侧，球也应朝右偏
  step(g, 240); // 4s：覆盖 idle 0.8s + cast 0.8s + 发射
  g.setHeld("right", false);
  const down = g.balls.filter((b) => b.dir === "down" && !b.dead);
  assert.ok(down.length >= 1, "应有下行球");
  assert.ok(down[0].vy > 0);
  assert.ok(down[0].x < g.player.x + 60 && down[0].vy > 0);
});

test("完美踢：球贴身前 0.2s 内按踢，金球反弹，命中敌人掉血加架势", () => {
  const g = track(newGame());
  incoming(g, 60); // 约 0.09s 后进入碰撞带
  g.press("kick");
  step(g, 6);
  assert.ok(g.seen.includes("perfectKick"), JSON.stringify(g.seen));
  assert.ok(g.floatTexts.some((t) => t.text.includes("浪子踢球")), "完美踢应飘字「浪子踢球」");
  const ball = g.balls[0];
  assert.equal(ball.dir, "up");
  assert.equal(ball.returned, true);
  assert.equal(g.player.hp, 100);
  step(g, 62); // 球飞到敌人
  assert.ok(g.seen.includes("returnHit"), JSON.stringify(g.seen));
  assert.equal(g.enemy.hp, 60 - CFG.KICK_HP);
  assert.equal(g.enemy.posture, CFG.PERFECT_E_POST);
  assert.equal(g.enemy.state, "hurt");
  assert.equal(g.stats.perfectKicks, 1);
});

test("蹩脚踢：按早了（0.2–0.4s 窗）球被踢偏消散，自己涨架势、敌人不掉血", () => {
  const g = track(newGame());
  incoming(g, 120); // 约 0.26s 后到碰撞带
  g.press("kick");
  step(g, 17);
  assert.ok(g.seen.includes("lowKick"), JSON.stringify(g.seen));
  assert.equal(g.balls.filter((b) => !b.dead).length, 0);
  assert.equal(g.player.posture, CFG.LOWKICK_P_POST);
  assert.equal(g.player.hp, 100);
  assert.equal(g.enemy.hp, 60);
});

test("裸吃：不踢不闪，普通球撞身掉 12 血", () => {
  const g = newGame();
  incoming(g, 40);
  step(g, 2);
  assert.ok(g.events.includes("hurt"));
  assert.equal(g.player.hp, 100 - CFG.E_HP);
  assert.equal(g.player.state, "hurt");
});

test("闪身步：无敌帧内普通球穿过消散，不掉血", () => {
  const g = track(newGame());
  incoming(g, 40);
  g.press("dash");
  step(g, 3);
  assert.ok(g.seen.includes("dashThrough"), JSON.stringify(g.seen));
  assert.equal(g.player.hp, 100);
  assert.equal(g.balls.filter((b) => !b.dead).length, 0);
});

test("危球：按踢也受 26 重伤；闪身无敌帧可无伤穿过", () => {
  const g = track(newGame());
  incoming(g, 40, "peril");
  g.press("kick"); // 踢危球无效
  step(g, 2);
  assert.ok(g.seen.includes("perilHit"));
  assert.equal(g.player.hp, 100 - CFG.PERIL_HP);

  const g2 = track(newGame());
  incoming(g2, 70, "peril"); // 球第 6 帧进入碰撞带
  g2.press("dash");
  step(g2, 7); // 无敌帧 0.2s（12 帧）覆盖命中时刻
  assert.ok(g2.seen.includes("perilDash"), JSON.stringify(g2.seen));
  assert.equal(g2.player.hp, 100);
  assert.equal(g2.stats.dashThroughs, 1); // 危球闪身同样计入穿球统计
  assert.ok(g2.floatTexts.some((t) => t.text.includes("闪身步")), "危球闪身应飘字「闪身步」");
});

test("漏球：球从身侧飞过、落出屏幕无伤，球被移除", () => {
  const g = track(newGame());
  g.enemy.idleUntil = 999; // 冻结敌人，场上只有测试构造的这颗球
  incoming(g, 40, "normal", 220); // 远远偏离玩家
  step(g, 140);
  assert.equal(g.player.hp, 100);
  assert.equal(g.balls.filter((b) => !b.dead).length, 0);
  assert.ok(!g.seen.includes("hurt"));
});

test("踢有冷却：0.3s 内连按不刷新判定窗（乱按不能无敌）", () => {
  const g = newGame();
  g.press("kick");
  step(g, 5); // 0.083s
  const ageBefore = g.player.kickAge;
  g.press("kick"); // 冷却内，被忽略
  step(g, 1);
  assert.ok(Math.abs(g.player.kickAge - (ageBefore + DT)) < DT * 0.5);
  step(g, 20); // 凑过 0.3s 冷却
  g.press("kick");
  assert.ok(g.player.kickAge < 0.05); // 冷却后可重新开窗
});

test("花鼓灯鼓点：敌人蓄力期间按 1/3、2/3 进度敲鼓，出球时第三声", () => {
  const g = track(newGame());
  const e = g.enemy;
  e.state = "telegraph";
  e.stateT = 0;
  e.castDur = 0.6;
  e.castKind = "normal";
  step(g, 13); // 0.217s：过第一拍
  assert.ok(g.seen.includes("drum"), JSON.stringify(g.seen));
  const drumsBefore = g.seen.filter((x) => x === "drum").length;
  step(g, 13); // 0.433s：过第二拍
  assert.ok(g.seen.filter((x) => x === "drum").length >= drumsBefore + 1);
  step(g, 14); // 0.667s：第三拍 = 出球
  assert.ok(g.seen.includes("fire"));
});

test("节拍助手/飘字夹取：内核与渲染共用的鼓点公式及贴墙飘字不出屏", () => {
  assert.equal(telegraphBeat(0, 0.6), 0);
  assert.equal(telegraphBeat(0.21, 0.6), 1);
  assert.equal(telegraphBeat(0.6, 0.6), 3);
  const g = newGame();
  g.spawnFloat(0, 600, "浪子踢球！", "#ffd45e", 24);
  g.spawnFloat(CFG.WORLD_W + 50, 600, "闪身步！", "#7fe4ef", 24);
  const floats = g.floatTexts;
  assert.ok(floats[0].x >= 64 && floats[0].x <= CFG.WORLD_W - 64);
  assert.ok(floats[1].x >= 64 && floats[1].x <= CFG.WORLD_W - 64);
});

test("玩家架势满 → 崩架势硬直，期间不能踢/闪身，之后清零恢复", () => {
  const g = newGame();
  g.player.posture = 100;
  step(g, 1);
  assert.equal(g.player.state, "break");
  assert.ok(g.events.includes("break"));
  assert.ok(g.floatTexts.some((t) => t.text.includes("哆嗦毛")), "崩架势应飘字「哆嗦毛」");
  g.press("kick");
  g.press("dash");
  assert.equal(g.player.kickAge > 0.4 || g.player.kickAge === 0, true); // kick 未开窗
  assert.notEqual(g.player.state, "dash");
  step(g, Math.ceil(CFG.BREAK_TIME / DT) + 1);
  assert.equal(g.player.state, "idle");
  assert.equal(g.player.posture, 0);
});

test("敌人架势满 → 踉跄；踉跄中被反弹球命中 = 忍杀，直接清空一管血", () => {
  const g = track(newGame());
  const e = g.enemy;
  e.posture = 100;
  e.state = "stagger";
  e.stateT = 0;
  assert.ok(e.hp > 20);
  returnHitEnemy(g);
  assert.ok(g.seen.includes("deathblow"), JSON.stringify(g.seen));
  assert.equal(e.hp, 0);
  assert.equal(e.nodes, 0);
});

test("敌人踉跄超时未被处决：架势清零恢复战斗", () => {
  const g = newGame();
  const e = g.enemy;
  e.posture = 100;
  e.state = "stagger";
  e.stateT = 0;
  step(g, Math.ceil(CFG.STAGGER_TIME / DT) + 1);
  assert.equal(e.state, "idle");
  assert.equal(e.posture, 0);
});

test("打死一命敌人 → 进入第二波", () => {
  const g = newGame();
  g.enemy.hp = 3;
  returnHitEnemy(g);
  assert.equal(g.enemy.state, "dead");
  step(g, 65); // 死亡停留 1s
  assert.equal(g.waveIndex, 1);
  assert.equal(g.enemy.name, WAVES[1].name);
  assert.equal(g.stats.kills, 1);
});

test("大将两管血：处决一管后复活新血条，再打死才通关", () => {
  const g = newGame();
  g.spawnWave(2);
  assert.equal(g.enemy.nodes, 2);
  g.enemy.hp = 3;
  returnHitEnemy(g);
  assert.equal(g.enemy.nodes, 1);
  assert.equal(g.enemy.hp, WAVES[2].hp[1]);
  assert.equal(g.enemy.state, "rise");
  step(g, 75); // 起身
  assert.equal(g.mode, "fight");
  g.enemy.hp = 3;
  returnHitEnemy(g);
  step(g, 65);
  assert.equal(g.mode, "victory");
  assert.equal(g.stats.kills, 2);
  assert.ok(g.stats.clearT > 0);
});

test("玩家死亡 → 重开本波，玩家回满、敌人重置", () => {
  const g = newGame();
  g.player.hp = 5;
  incoming(g, 40);
  step(g, 2);
  assert.equal(g.mode, "death");
  const waveBefore = g.waveIndex;
  g.restart();
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, waveBefore);
  assert.equal(g.player.hp, 100);
  assert.equal(g.enemy.hp, WAVES[waveBefore].hp[0]);
});
