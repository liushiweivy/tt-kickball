// 弹踢道场 · 平衡性测试（二十关选关版）：node --test tests/balance.test.mjs
// 逐关对打：会玩的 bot（走位对齐 + 完美踢 + 闪身危球族）每一关都必须能稳过；
// 乱按踢过不了危球关；站桩不踢时敌人永远不掉血（踢球是唯一输出）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, CFG, LEVELS, mulberry32 } = require("../js/core.js");

const DT = 1 / 60;
const MAX_FRAMES = 150 * 60; // 单关上限 2.5 分钟

function run(seed, bot, level = 0) {
  const g = new Game(mulberry32(seed));
  g.startLevel(level);
  let frames = 0;
  while (g.mode === "fight" && frames < MAX_FRAMES) {
    bot(g);
    g.update(DT);
    frames++;
  }
  return { g, frames, seconds: frames / 60 };
}

/** 最近的下行活球（爬升段的回旋危球 vy<0 不算逼近） */
function nearestBall(g) {
  let best = null;
  for (const b of g.balls) {
    if (b.dir === "down" && !b.dead && b.vy > 0 && (!best || b.y > best.y)) best = b;
  }
  return best;
}

/** 危球族：踢无效，只能闪身 */
function isPerilFamily(b) {
  return b.kind === "peril" || b.kind === "boomerang";
}

/** 会玩的 bot：追球对齐，普通族贴脸踢，危球族闪身 */
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
  if (isPerilFamily(b)) {
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
test("skilled bot：20 关 × 4 种子逐关全通，单关耗时不异常", () => {
  for (let level = 0; level < LEVELS.length; level++) {
    for (const seed of [1, 7, 42, 13]) {
      const { g, seconds } = run(seed, skilledBot, level);
      assert.equal(
        g.mode, "victory",
        `level=${level + 1}(${LEVELS[level].name}) seed=${seed} mode=${g.mode} hp=${g.player.hp} t=${seconds.toFixed(1)}s`,
      );
      assert.ok(seconds < 150, `level=${level + 1} seed=${seed} 耗时 ${seconds}s 异常`);
    }
  }
});

test("skilled bot：第一章（纯普通球）4 种子都应残血充足通关", () => {
  for (let level = 0; level < 5; level++) {
    for (const seed of [1, 7, 42, 13]) {
      const { g } = run(seed, skilledBot, level);
      assert.ok(
        g.player.hp > CFG.MAX_HP * 0.3,
        `level=${level + 1} seed=${seed} 残血 ${g.player.hp}，第一章不应如此伤`,
      );
    }
  }
});

// 选关版单关独立（回满血开打），旧七阵靠跨波血量磨损放倒乱按的防线没了；
// 现防线是「踢免球密度」：危球+回旋危球合计 >50% 时乱按踢必死。
// 低星评价（无伤/无蹩脚踢三星）是引导玩家放弃乱按的胡萝卜。
test("mashKick bot：乱按过不了踢免球过半的关（危球+回旋危球必然放倒）", () => {
  let victories = 0;
  for (const seed of [1, 7, 42, 13, 99]) {
    const { g } = run(seed, mashKickBot, 16); // 幻影先生：危球 0.25 + 回旋危球 0.3
    if (g.mode === "victory") victories++;
  }
  assert.equal(victories, 0, "踢免球过半还乱按能过，说明判定窗/冷却设计失败");
});

// 盯球闪身让「躲开」也计完美后，必须证明乱按闪身刷不出大招：
// 防线是「按下瞬间定品质」——球远就闪=早闪立刻断链，没球=空闪断链，
// 只有连续三次都按在 6cm 线内才触发（这是时机技术，乱按做不到）
test("mashDash bot：乱按闪身刷不出大招、通不了关（早闪/空闪断链兜底）", () => {
  for (const seed of [1, 7, 42, 13]) {
    const g = new Game(mulberry32(seed));
    let flails = 0;
    const origFlail = g.startFlail.bind(g);
    g.startFlail = () => { flails++; origFlail(); };
    g.startLevel(9); // 危球天师：球最多最密
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

test("回旋危球关：站桩必死；会玩的 bot 能过（第二段攻击可读）", () => {
  const stand = run(7, () => {}, 15); // 回马枪客
  assert.equal(stand.g.mode, "death");
  for (const seed of [1, 7, 42, 13]) {
    const { g } = run(seed, skilledBot, 15);
    assert.equal(g.mode, "victory", `回旋危球关 seed=${seed} 应可通关`);
  }
});

test("站桩 bot：不踢不闪，敌人到玩家死都没掉过血（踢球是唯一进攻手段）", () => {
  const { g } = run(7, () => {}, 0);
  assert.equal(g.mode, "death");
  assert.equal(g.stats.perfectKicks, 0);
  assert.equal(g.enemy.hp, LEVELS[0].hp[0]);
});
