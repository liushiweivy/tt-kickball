// 弹踢道场 · 平衡性测试：node --test tests/balance.test.mjs
// 双 bot 对打：会玩的（走位对齐 + 完美踢 + 闪身危球）必须能稳通七阵；
// 乱按踢的不能通关；站桩不踢时敌人永远不掉血（踢球是唯一输出）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, CFG, WAVES, mulberry32 } = require("../js/core.js");

const DT = 1 / 60;
const MAX_FRAMES = 360 * 60; // 七阵全程上限 6 分钟

function run(seed, bot) {
  const g = new Game(mulberry32(seed));
  g.start();
  let frames = 0;
  while (g.mode === "fight" && frames < MAX_FRAMES) {
    bot(g);
    g.update(DT);
    frames++;
  }
  return { g, frames, seconds: frames / 60 };
}

/** 最近的下行活球 */
function nearestBall(g) {
  let best = null;
  for (const b of g.balls) {
    if (b.dir === "down" && !b.dead && (!best || b.y > best.y)) best = b;
  }
  return best;
}

/** 会玩的 bot：追球对齐，普通球贴脸踢，危球闪身 */
function skilledBot(g) {
  const p = g.player;
  const b = nearestBall(g);
  g.setHeld("left", false);
  g.setHeld("right", false);
  if (!b) return;
  const dx = b.x - p.x;
  if (dx < -12) g.setHeld("left", true);
  else if (dx > 12) g.setHeld("right", true);

  const near = b.y > CFG.PLAYER_Y - 42;
  if (b.kind === "peril") {
    if (near && Math.abs(dx) < 80) g.press("dash");
  } else if (near && Math.abs(dx) <= 32) {
    g.press("kick");
  }
}

/** 乱按 bot：每帧踢，不移动不闪身（冷却限制下窗口无法全覆盖） */
function mashKickBot(g) {
  g.press("kick");
}

/** 乱按闪身 bot：每帧按闪身（非 idle 时按键被吞），不踢 */
function mashDashBot(g) {
  g.press("dash");
}

// rollDashDir 会消耗 rng 改变后续发球序列，种子覆盖多一些防单一流水翻车
test("skilled bot：8 个种子全部通关七阵，剩余血量 > 三成", () => {
  for (const seed of [1, 7, 42, 13, 99, 2026, 314, 2718]) {
    const { g, seconds } = run(seed, skilledBot);
    assert.equal(g.mode, "victory", `seed=${seed} mode=${g.mode} hp=${g.player.hp} wave=${g.waveIndex} t=${seconds.toFixed(1)}s`);
    assert.ok(g.player.hp > CFG.MAX_HP * 0.3, `seed=${seed} 残血 ${g.player.hp}，七阵不应如此伤`);
    assert.ok(seconds < 300, `seed=${seed} 通关耗时 ${seconds}s 异常`);
  }
});

test("mashKick bot：乱按无法通关（危球 + 裸吃必然倒下）", () => {
  let victories = 0;
  for (const seed of [1, 7, 42]) {
    const { g } = run(seed, mashKickBot);
    if (g.mode === "victory") victories++;
  }
  assert.equal(victories, 0, "乱按也能通关，说明判定窗/冷却设计失败");
});

// 盯球闪身让「躲开」也计完美后，必须证明乱按闪身刷不出大招：
// 防线是「按下瞬间定品质」——球远就闪=早闪立刻断链，没球=空闪断链，
// 只有连续三次都按在 10cm 线内才触发（这是时机技术，乱按做不到）
test("mashDash bot：乱按闪身刷不出大招、通不了关（早闪/空闪断链兜底）", () => {
  // 8 种子对齐 skilled bot 覆盖（rollDashDir 消耗 rng，种子少了防不住单一流水翻车）
  for (const seed of [1, 7, 42, 13, 99, 2026, 314, 2718]) {
    const g = new Game(mulberry32(seed));
    let flails = 0;
    const origFlail = g.startFlail.bind(g);
    g.startFlail = () => { flails++; origFlail(); };
    g.start();
    let frames = 0;
    while (g.mode === "fight" && frames < MAX_FRAMES) {
      g.press("dash");
      g.update(DT);
      frames++;
    }
    assert.notEqual(g.mode, "victory", `seed=${seed} 乱按闪身不应通关`);
    assert.equal(flails, 0, `seed=${seed} 乱按闪身不应刷出大招（flails=${flails}）`);
  }
});

test("站桩 bot：不踢不闪，敌人到玩家死都没掉过血（踢球是唯一进攻手段）", () => {
  const { g } = run(7, () => {});
  assert.equal(g.mode, "death");
  assert.equal(g.stats.perfectKicks, 0);
  assert.equal(g.enemy.hp, WAVES[0].hp[0]);
});
