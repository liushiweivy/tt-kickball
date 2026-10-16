// 弹踢道场 · 平衡性测试：node --test tests/balance.test.mjs
// 双 bot 对打：会玩的（走位对齐 + 完美踢 + 闪身危球）必须能稳通三波；
// 乱按踢的不能通关；站桩不踢时敌人永远不掉血（踢球是唯一输出）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, CFG, mulberry32 } = require("../js/core.js");

const DT = 1 / 60;
const MAX_FRAMES = 120 * 60;

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

// rollDashDir 会消耗 rng 改变后续发球序列，种子覆盖多一些防单一流水翻车
test("skilled bot：8 个种子全部通关，剩余血量 > 30", () => {
  for (const seed of [1, 7, 42, 13, 99, 2026, 314, 2718]) {
    const { g, seconds } = run(seed, skilledBot);
    assert.equal(g.mode, "victory", `seed=${seed} mode=${g.mode} hp=${g.player.hp} wave=${g.waveIndex} t=${seconds.toFixed(1)}s`);
    assert.ok(g.player.hp > 30, `seed=${seed} 残血 ${g.player.hp}，三波不应如此伤`);
    assert.ok(seconds < 120, `seed=${seed} 通关耗时 ${seconds}s 异常`);
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

test("站桩 bot：不踢不闪，敌人到玩家死都没掉过血（踢球是唯一进攻手段）", () => {
  const { g } = run(7, () => {});
  assert.equal(g.mode, "death");
  assert.equal(g.stats.perfectKicks, 0);
  assert.equal(g.enemy.hp, 120);
});
