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
/** 喂一颗贴脸又贴心的普通球完美踢回并清场（连击计数测试用）：
 *  distance 25 < 碰撞半高 32，首帧即接触（kickAge≈0.017 ≤ 连击窗 0.2），
 *  共推进 20 帧（0.33s）覆盖踢冷却，下一次 press 不被吞 */
function perfectOnce(g) {
  incoming(g, 25);
  g.press("kick");
  step(g, 20);
  g.balls.length = 0;
}
/** 一次完整闪身：从 idle 出发，17 帧后回到 idle（DASH_TIME 0.28s）。
 *  注意是空闪（不穿球），按规则会断连击 */
function dashOnce(g) {
  g.press("dash");
  step(g, 17);
}
/** 一次完美闪身：贴身 40px 放球，按下瞬间球距 ≤427px（10cm 线内）
 *  → 完美穿球，再走完全程回 idle */
function dashThroughOnce(g) {
  incoming(g, 40);
  g.press("dash");
  step(g, 3);
  step(g, 14);
  g.balls.length = 0;
}
/** 一次球还远就闪的乱闪：朝右躲开原位，球 0.59s 后才到、闪身早走完
 *  ——没穿到球（空闪），断连击（空闪与距离线无关） */
function farBallDashOnce(g) {
  g.setHeld("right", true);
  g.press("dash");
  incoming(g, 200); // 垂直球瞄原位，玩家右闪 156.8px 后球必落空
  g.setHeld("right", false);
  step(g, 17); // 闪身走完：没处置球 → 空闪断链
  step(g, 30); // 球飞过碰撞带（miss 清掉）
  g.balls.length = 0;
}

test("开局：第一波敌人生成，玩家满血（五倍制 500），敌人血量与配表一致", () => {
  const g = new Game(mulberry32(1));
  assert.equal(g.mode, "title");
  g.start();
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, 0);
  assert.equal(g.enemy.hp, WAVES[0].hp[0]);
  assert.equal(g.player.hp, CFG.MAX_HP);
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
  assert.equal(g.player.hp, CFG.MAX_HP);
  step(g, 62); // 球飞到敌人
  assert.ok(g.seen.includes("returnHit"), JSON.stringify(g.seen));
  assert.equal(g.enemy.hp, WAVES[0].hp[0] - CFG.KICK_HP);
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
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.equal(g.enemy.hp, WAVES[0].hp[0]);
});

test("裸吃：不踢不闪，普通球撞身掉 12 血", () => {
  const g = newGame();
  incoming(g, 40);
  step(g, 2);
  assert.ok(g.events.includes("hurt"));
  assert.equal(g.player.hp, CFG.MAX_HP - CFG.E_HP);
  assert.equal(g.player.state, "hurt");
});

test("闪身步：起步即报招式名「闪身步」+ dash 事件（声/字同步）", () => {
  const g = newGame(); // 不步进：飘字必须在按下瞬间产生，不能等穿球才出
  g.press("dash");
  assert.ok(g.events.includes("dash"), "闪身起步应推 dash 音效事件");
  assert.ok(
    g.floatTexts.some((t) => t.text === "闪身步"),
    "闪身起步应飘字「闪身步」，实际：" + JSON.stringify(g.floatTexts.map((t) => t.text)),
  );
});

test("闪身步：无敌帧内普通球穿过消散，不掉血，且不再重复刷同名飘字", () => {
  const g = track(newGame());
  incoming(g, 40);
  g.press("dash");
  step(g, 3);
  assert.ok(g.seen.includes("dashThrough"), JSON.stringify(g.seen));
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.equal(g.balls.filter((b) => !b.dead).length, 0);
  // 起步已报过「闪身步」，穿普通球只给火花，不再刷第二组同名飘字
  assert.equal(g.floatTexts.filter((t) => t.text.includes("闪身步")).length, 1);
});

test("危球：按踢也受重伤；闪身无敌帧可无伤穿过", () => {
  const g = track(newGame());
  incoming(g, 40, "peril");
  g.press("kick"); // 踢危球无效
  step(g, 2);
  assert.ok(g.seen.includes("perilHit"));
  assert.equal(g.player.hp, CFG.MAX_HP - CFG.PERIL_HP);
});

test("完美闪身 10cm 线：线内按下穿过=Perfect，线外按下穿过=侥幸（飘「闪身步！」）", () => {
  // 线内（≈323px ≤427）：按住方向朝球的横向落点冲，1500/s 快球在第 11 帧
  // （无敌帧内）追上右闪落点 → 穿过且判完美
  const g2 = track(newGame());
  g2.setHeld("right", true);
  incoming(g2, 300, "peril", 120, 1500); // 按下瞬间球距 √(300²+120²)≈323px
  g2.press("dash");
  g2.setHeld("right", false);
  step(g2, 13);
  assert.ok(g2.seen.includes("perilDash"), JSON.stringify(g2.seen));
  assert.ok(g2.seen.includes("perfectDash"), "10cm 线内按下应算完美闪身");
  assert.equal(g2.player.hp, CFG.MAX_HP);
  assert.equal(g2.stats.dashThroughs, 1); // 危球闪身同样计入穿球统计
  assert.ok(g2.floatTexts.some((t) => t.text === "Perfect!"), "线内穿危球应弹 Perfect");

  // 线外（≈475px >427）：2400/s 超快球第 11 帧进带，同样穿过去了但按下太远
  const g3 = track(newGame());
  g3.setHeld("left", true);
  incoming(g3, 460, "peril", -120, 2400); // 按下瞬间球距 √(460²+120²)≈475px
  g3.press("dash");
  g3.setHeld("left", false);
  step(g3, 13);
  assert.ok(g3.seen.includes("perilDash"), JSON.stringify(g3.seen));
  assert.ok(!g3.seen.includes("perfectDash"), "10cm 线外按下不应算完美闪身");
  assert.equal(g3.player.hp, CFG.MAX_HP);
  const peril = g3.floatTexts.find((t) => t.text === "闪身步！");
  assert.ok(peril, "线外穿危球应飘「闪身步！」");
  // 起步飘字在 PLAYER_Y-104，危球飘字必须上移避开，同速上浮也不叠字
  // （飘字每帧 34px/s 上浮会改写 y，留一帧多的容差）
  assert.ok(
    Math.abs(peril.y - (CFG.PLAYER_Y - 132)) <= 6,
    `危球飘字 y=${peril.y} 应在 ${CFG.PLAYER_Y - 132} 附近`,
  );
});

test("盯球闪身：球还飞着不按空闪断链；躲开越线即 Perfect 并计连击", () => {
  const g = track(newGame());
  g.enemy.idleUntil = 999; // 冻结敌人新发球
  g.setHeld("right", true);
  incoming(g, 300); // 瞄原位，按下时球距 300 ≤427 → 完美待命
  g.press("dash");
  g.setHeld("right", false);
  step(g, 17); // 闪身走完：球还飞着（盯球中），不得按空闪断链
  assert.equal(g.player.state, "idle");
  assert.equal(g.stats.dashThroughs, 0, "球还没越线，尚未结算");
  step(g, 60); // 球约 59 帧时越过玩家线：躲开成功 → Perfect + 计连击
  assert.equal(g.stats.dashThroughs, 1);
  assert.equal(g.stats.perfectDashes, 1);
  assert.ok(g.seen.includes("perfectDash"), JSON.stringify(g.seen));
  assert.equal(g.player.comboType, "dash");
  assert.equal(g.player.comboN, 1);
  assert.ok(g.floatTexts.some((t) => t.text === "Perfect!"));
  assert.equal(g.player.hp, CFG.MAX_HP);
});

test("早闪：10cm 线外有球就闪 = 按下瞬间立刻断链（防乱按白嫖）；三连躲球照样触发大招", () => {
  // 线外按下：不等接触，按下瞬间即断连击（若等越线再判，乱按的最后一次按下总是近距离）
  const g = track(newGame());
  g.enemy.idleUntil = 999;
  perfectOnce(g); // 链上先有 1 个踢球连击
  assert.equal(g.player.comboN, 1);
  g.setHeld("right", true);
  incoming(g, 460, "normal", 120, 1500); // 球距 √(460²+120²)≈475 >427
  g.press("dash");
  g.setHeld("right", false);
  assert.equal(g.player.comboN, 0, "线外按下应立即断连击");
  step(g, 30);
  assert.equal(g.stats.perfectDashes, 0);
  assert.ok(!g.seen.includes("perfectDash"), JSON.stringify(g.seen));
  assert.equal(g.player.hp, CFG.MAX_HP);

  // 三连躲（线内按下）触发狗熊哆嗦毛：交替方向，避免贴墙被球追上
  const g2 = track(newGame());
  g2.enemy.idleUntil = 999;
  const dirs = ["right", "left", "right"];
  for (let i = 0; i < 3; i++) {
    g2.setHeld(dirs[i], true);
    incoming(g2, 300);
    g2.press("dash");
    g2.setHeld(dirs[i], false);
    step(g2, 70); // 球约 59 帧越线结算
    g2.balls.length = 0;
  }
  assert.equal(g2.player.state, "flail", "三连躲球应触发大招：" + JSON.stringify(g2.seen));
});

test("盯球闪身：慢速球（球速倍率调低）10cm 线内按下照样完美待命", () => {
  // 回归：旧固定 ETA 上限 1.8s 会把慢球（如 BALL_SPEED_MUL=0.6 时 ETA=2.2s）漏盯，
  // 与穿球路径的 427 线判定打架；现 ETA 不设限，品质由按下距离单线把关
  const g = track(newGame());
  g.enemy.idleUntil = 999;
  g.setHeld("right", true);
  incoming(g, 420, "normal", 0, 204); // 340×0.6 慢球：球距 420 ≤427，ETA=(420+32)/204≈2.2s
  g.press("dash");
  g.setHeld("right", false);
  assert.ok(g.player.dashWatch, "慢球在线内也应被盯住");
  step(g, 140); // 球约 133 帧越线
  assert.equal(g.stats.perfectDashes, 1, JSON.stringify(g.seen));
  assert.equal(g.player.comboType, "dash");
  assert.equal(g.player.hp, CFG.MAX_HP);
});

test("盯球本尊被残留踢窗踢回：盯球作废转踢球连击，不再结算躲开", () => {
  const g = track(newGame());
  g.enemy.idleUntil = 999;
  g.player.x = CFG.MARGIN; // 贴墙向左闪：原地不动，球始终在轴线上
  g.setHeld("left", true);
  g.press("kick"); // 残留完美踢窗 0.2s
  incoming(g, 60); // 闪身按下时球距 60 ≤427 → 完美待命
  g.press("dash");
  g.setHeld("left", false);
  step(g, 6); // 第 ~5 帧接触：踢窗优先，完美踢回
  assert.equal(g.stats.perfectKicks, 1);
  assert.equal(g.stats.dashThroughs, 0, "球被踢窗处理，不算穿球/躲开");
  assert.equal(g.player.dashWatch, null, "球被踢回后盯球应作废");
  assert.equal(g.player.comboType, "kick");
  assert.equal(g.player.comboN, 1);
  step(g, 60); // 球已改道上飞
  assert.equal(g.stats.perfectDashes, 0, "改道上飞后不得再结算躲开");
});

test("盯球 pending 中崩架势/大招：越线不结算奖励（状态守卫）", () => {
  // break：盯球 pending 时架势打满 → 硬直中球越线，不发 Perfect/连击
  const g = track(newGame());
  g.enemy.idleUntil = 999;
  g.setHeld("right", true);
  incoming(g, 200); // 越线约 41 帧
  g.press("dash");
  g.setHeld("right", false);
  step(g, 17); // 闪身走完，盯球 pending
  g.player.posture = CFG.MAX_POSTURE;
  step(g, 1);
  assert.equal(g.player.state, "break");
  step(g, 50); // 硬直中球越线
  assert.equal(g.stats.perfectDashes, 0, "崩架势期间不结算盯球奖励");
  assert.equal(g.stats.dashThroughs, 0);
  assert.ok(!g.seen.includes("perfectDash"));

  // flail：盯球 pending 时三连踢触发大招 → 手舞足蹈中越线同样不结算
  const g2 = track(newGame());
  g2.enemy.idleUntil = 999;
  g2.setHeld("right", true);
  incoming(g2, 420); // 越线约 80 帧：闪身 17 + 三踢 60 = 77 帧触发大招，越线落在大招期内
  g2.press("dash");
  g2.setHeld("right", false);
  step(g2, 17);
  perfectOnce(g2);
  perfectOnce(g2);
  perfectOnce(g2);
  assert.equal(g2.player.state, "flail");
  step(g2, 10); // 球越线（大招期内）
  assert.equal(g2.stats.perfectDashes, 0, "大招期间不结算盯球奖励");
  assert.equal(g2.stats.dashThroughs, 0);
});

/* ---------- 飞蝗石：10s 蓄能的自射小球 ---------- */

test("飞蝗石：就绪即发一颗上行小球，命中敌人掉 5 血、不涨架势不打断动作", () => {
  const g = track(newGame());
  g.enemy.idleUntil = 999;
  g.press("pebble");
  assert.ok(g.events.includes("pebble"));
  assert.ok(g.floatTexts.some((t) => t.text === "飞蝗石"));
  const b = g.balls[0];
  assert.equal(b.dir, "up");
  assert.equal(b.pebble, true);
  assert.ok(b.vy < 0);
  step(g, 60); // 640 速飞 ~480px ≈ 0.75s
  assert.equal(g.enemy.hp, WAVES[0].hp[0] - CFG.PEBBLE_HP, "蚊子腿伤害");
  assert.equal(g.enemy.posture, 0, "飞蝗石不涨架势");
  assert.equal(g.enemy.state, "idle", "飞蝗石不打断敌人动作");
  assert.equal(g.stats.pebbleHits, 1);
  assert.equal(g.stats.returnHits, 0, "飞蝗石不算反弹命中");
});

test("飞蝗石：10s 蓄能，冷却中按下被吞（平时不管用）；break/hurt/flail 中不能发", () => {
  const g = newGame();
  g.enemy.idleUntil = 999;
  g.press("pebble");
  assert.equal(g.balls.length, 1);
  g.press("pebble");
  assert.equal(g.balls.length, 1, "冷却中应立即吞掉");
  step(g, 60); // 第一颗命中清场，冷却过了 1s
  g.press("pebble");
  assert.equal(g.balls.length, 0, "冷却未满（剩 9s）仍吞");
  step(g, Math.ceil(CFG.PEBBLE_CD * 60));
  g.press("pebble");
  assert.equal(g.balls.length, 1, "蓄能完毕可再发");
  g.balls.length = 0;

  // 三种锁操作状态都不能发
  for (const st of ["break", "hurt", "flail"]) {
    g.player.pebbleCd = 0;
    g.player.state = st;
    g.press("pebble");
    assert.equal(g.balls.length, 0, `${st} 中不能发飞蝗石`);
    g.player.state = "idle";
  }
});

test("飞蝗石：架势满（踉跄）时命中=忍杀；非踉跄收残血只掉 5 血不触发忍杀", () => {
  // 踉跄中：飞蝗石与金球同权，一石忍杀
  const g1 = track(newGame());
  g1.enemy.idleUntil = 999;
  const e1 = g1.enemy;
  e1.hp = 400; // 满血也照杀
  e1.posture = 100;
  e1.state = "stagger";
  e1.stateT = 0;
  g1.press("pebble");
  step(g1, 60);
  assert.equal(e1.hp, 0, "忍杀直接清空当前这管血");
  assert.equal(g1.stats.kills, 1);
  assert.ok(g1.seen.includes("deathblow"), "飞蝗石命中踉跄敌人触发忍杀");
  assert.ok(g1.floatTexts.some((t) => t.text === "黑虎掏心！"), "飘处决名");
  assert.equal(g1.enemy.state, "dead");

  // 非踉跄：仍是蚊子腿，恰好收头也不触发忍杀
  const g2 = track(newGame());
  g2.enemy.idleUntil = 999;
  const e2 = g2.enemy;
  e2.hp = CFG.PEBBLE_HP; // 恰好一石
  g2.press("pebble");
  step(g2, 60);
  assert.equal(g2.stats.kills, 1, "残血可收头");
  assert.ok(!g2.seen.includes("deathblow"), "非踉跄收头不算忍杀");
  assert.ok(!g2.floatTexts.some((t) => t.text === "黑虎掏心！"), "不飘处决名");
  assert.equal(g2.enemy.state, "dead");
});

test("闪身不按方向：花鼓灯式随机向左/向右横移，不再有原地闪身", () => {
  const dirs = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const g = new Game(mulberry32(seed));
    g.start();
    g.press("dash"); // 不按左右
    assert.ok(
      g.player.dashDir === 1 || g.player.dashDir === -1,
      `seed=${seed} dashDir=${g.player.dashDir}，不应原地不动`
    );
    dirs.add(g.player.dashDir);
  }
  assert.ok(dirs.has(1) && dirs.has(-1), "随机闪身左右两个方向都应出现");
});

test("闪身不按方向但贴墙：必选开阔一侧（位移不能被墙吃光）", () => {
  const g = new Game(mulberry32(1));
  g.start();
  g.player.x = CFG.MARGIN + 4; // 贴左墙
  g.press("dash");
  assert.equal(g.player.dashDir, 1);

  const g2 = new Game(mulberry32(1));
  g2.start();
  g2.player.x = CFG.WORLD_W - CFG.MARGIN - 4; // 贴右墙
  g2.press("dash");
  assert.equal(g2.player.dashDir, -1);
});

test("随机选边会避开尾段（无敌帧结束后）会撞进去的在飞球：球堵右侧必闪左", () => {
  // 垂直下落球在闪身 t≈0.24s（无敌帧已结束的尾段）进碰撞带，x 瞄着向右闪身的终点
  for (let i = 0; i < 8; i++) {
    const g = new Game(mulberry32(i + 100));
    g.start();
    g.enemy.idleUntil = 999; // 冻结敌人新发球
    g.player.x = CFG.WORLD_W / 2;
    const rightEnd = g.player.x + CFG.DASH_SPEED * CFG.DASH_TIME;
    const yAtPress = CFG.PLAYER_Y - CFG.HIT_HALF_H - 455 * 0.24;
    g.balls.push({ x: rightEnd, y: yAtPress, vx: 0, vy: 455, kind: "normal", dir: "down", dead: false });
    g.press("dash");
    assert.equal(g.player.dashDir, -1, `rng 种子 ${i + 100} 仍选了被球堵住的右侧`);
  }
});

/* ---------- 狗熊哆嗦毛：三连击大招（3 次浪子踢球 或 3 次闪身步） ---------- */

test("狗熊哆嗦毛：连续 3 次浪子踢球触发，5s 内锁操作/钉原地/无敌并把所有来球弹回", () => {
  const g = track(newGame());
  perfectOnce(g);
  perfectOnce(g);
  assert.notEqual(g.player.state, "flail", "两次完美踢不应触发");
  perfectOnce(g);
  assert.equal(g.player.state, "flail", "第三次完美踢应触发狗熊哆嗦毛");
  assert.ok(g.seen.includes("flail"));
  assert.ok(g.floatTexts.some((t) => t.text === "狗熊哆嗦毛！"), "应飘大招名");

  // 手舞足蹈期间：按键全吞、钉在原地
  const x0 = g.player.x;
  const seenBefore = g.seen.length;
  g.setHeld("left", true);
  g.press("kick");
  g.press("dash");
  step(g, 2);
  assert.equal(g.player.x, x0, "手舞足蹈期间不应移动");
  assert.equal(g.player.state, "flail");
  assert.deepEqual(g.seen.slice(seenBefore), [], "大招期间踢/闪事件应被吞掉");
  g.setHeld("left", false);

  // 普通球、危球统统弹回（球向上、反弹计数、不掉血、出弹反音效）
  incoming(g, 40);
  step(g, 2);
  incoming(g, 40, "peril");
  step(g, 2);
  assert.equal(g.stats.flailBounces, 2);
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.ok(g.seen.filter((e) => e === "flailBounce").length >= 2);
  assert.ok(g.balls.every((b) => b.dir === "up" && b.returned));

  // 持续 5s：触发于第三批的第 5 帧，循环前又过了约 21 帧，故剩余≈279 帧
  let n = 0;
  while (g.player.state === "flail" && n < 330) { step(g, 1); n++; }
  assert.equal(g.player.state, "idle");
  assert.ok(n >= 270 && n <= 292, `大招剩余持续 ${n} 帧，应≈279`);
  assert.equal(g.player.invuln, 0);
});

test("狗熊哆嗦毛：连续 3 次完美闪身（穿球）触发；随便三个空闪不触发", () => {
  // 三次完美闪身 → 触发
  const g = track(newGame());
  dashThroughOnce(g);
  dashThroughOnce(g);
  assert.notEqual(g.player.state, "flail", "两次穿球不应触发");
  dashThroughOnce(g);
  assert.equal(g.player.state, "flail", "第三次穿球应触发");
  assert.ok(g.seen.includes("flail"));

  // 三次空闪（随便闪）：不触发
  const g2 = track(newGame());
  dashOnce(g2);
  dashOnce(g2);
  dashOnce(g2);
  assert.notEqual(g2.player.state, "flail", "三次空闪不应触发大招");
});

test("完美闪身才计连击：空闪断链（闪身链和踢球链都断）", () => {
  // 两次穿球后跟一次空闪：链断，需重新攒满三次
  const g = track(newGame());
  dashThroughOnce(g);
  dashThroughOnce(g);
  dashOnce(g); // 空闪 → 清零
  dashThroughOnce(g);
  dashThroughOnce(g);
  assert.notEqual(g.player.state, "flail", "空闪应断闪身连击");
  dashThroughOnce(g);
  assert.equal(g.player.state, "flail");

  // 空闪也会断踢球链（「连续」= 中途没有失败动作）
  const g2 = track(newGame());
  perfectOnce(g2);
  perfectOnce(g2);
  dashOnce(g2); // 空闪断链
  perfectOnce(g2);
  perfectOnce(g2);
  assert.notEqual(g2.player.state, "flail", "空闪应断踢球连击");
});

test("一次闪身穿过多颗球只计一次连击（按闪身次数数，不按球数）", () => {
  const g = track(newGame());
  g.press("dash"); // 先按，拿到系统掷出的闪身方向
  incoming(g, 40); // 第一球瞄原位：第 2 帧位移 18.7px < 半宽 30，必中
  const b2 = incoming(g, 40); // 第二球放在闪身方向上，第 2 帧同样在带内
  b2.x = g.player.x + g.player.dashDir * 18;
  step(g, 3);
  assert.equal(g.stats.dashThroughs, 2, "一闪穿两球");
  assert.equal(g.player.comboType, "dash");
  assert.equal(g.player.comboN, 1, "同一次闪身只计 1 连击");
  assert.equal(g.stats.perfectDashes, 1);
});

test("闪身途中球被踢窗处理：不算空闪，不抹掉刚赚的踢球连击", () => {
  // 踢完立刻闪身，残留踢窗（kickAge 0.2s）优先于穿球分支把球完美踢回：
  // 闪身尽到处置义务（dashScored 置位），走完不按空闪清零踢球连击
  const g = track(newGame());
  g.press("kick");
  step(g, 3); // kickAge 0.05：下一帧接触时 0.067 仍在内圈窗
  g.setHeld("right", true);
  g.press("dash");
  g.setHeld("right", false);
  const b = incoming(g, 37);
  b.x = g.player.x + 9; // 第 1 帧贴身接触（踢中年龄 0.067s，在 0.2s 连击窗内）
  step(g, 17); // 第 1 帧完美踢计连击；第 17 帧闪身走完不得空闪清零
  assert.equal(g.stats.perfectKicks, 1);
  assert.equal(g.stats.dashThroughs, 0, "球被踢窗处理，不算穿球");
  assert.equal(g.player.comboType, "kick");
  assert.equal(g.player.comboN, 1, "踢球连击不应被幽灵空闪抹掉");
});

test("完美闪身距离判定：球离身约 10cm（≤427 世界像素）内闪才算；球还远就闪=空闪断链", () => {
  // 物理事实：无敌帧 0.2s 内球最多逼近 123px（455 速），所以真正能穿到球的闪身
  // 必然按在 10cm 线内——穿到 ≈ 完美。球还 200px 外就闪且没穿到 = 空闪
  const g = track(newGame());
  dashThroughOnce(g);
  assert.equal(g.stats.perfectDashes, 1);

  // 两连完美闪身后乱闪一记远球：清零，要再攒三次
  const g2 = track(newGame());
  dashThroughOnce(g2);
  dashThroughOnce(g2);
  farBallDashOnce(g2);
  dashThroughOnce(g2);
  dashThroughOnce(g2);
  assert.notEqual(g2.player.state, "flail", "远球空闪应断闪身连击");
  dashThroughOnce(g2);
  assert.equal(g2.player.state, "flail");
});

test("完美闪身弹 Perfect 字样 + 音效事件（普通球/危球一致），并计入统计", () => {
  const g = track(newGame());
  dashThroughOnce(g);
  assert.ok(g.seen.includes("perfectDash"), JSON.stringify(g.seen));
  assert.ok(g.floatTexts.some((t) => t.text === "Perfect!"), "普通球应弹 Perfect");
  assert.equal(g.stats.perfectDashes, 1);

  // 危球的完美闪身：perfectDash + perilDash 两事件，同样弹 Perfect
  const g2 = track(newGame());
  incoming(g2, 40, "peril"); // 第 2 帧接触，球距 40px≈1cm 内
  g2.press("dash");
  step(g2, 3);
  assert.ok(g2.seen.includes("perfectDash"), JSON.stringify(g2.seen));
  assert.ok(g2.seen.includes("perilDash"));
  assert.ok(g2.floatTexts.some((t) => t.text === "Perfect!"));
});

test("贴墙闪身不被位移 clamp 误判：真完美（球距 122px）照样 Perfect", () => {
  const g = track(newGame());
  g.player.x = CFG.MARGIN; // 贴左墙，向左闪全程被 clamp 在原地
  g.setHeld("left", true);
  incoming(g, 122, "normal", 0, 500); // 按下时球距 122 ≤427；约 0.18s 后入带，仍在无敌帧
  g.press("dash");
  g.setHeld("left", false);
  step(g, 12);
  assert.equal(g.stats.dashThroughs, 1, JSON.stringify(g.seen));
  assert.equal(g.stats.perfectDashes, 1, "真完美不得因反推被墙放大而漏判");
  assert.ok(g.floatTexts.some((t) => t.text === "Perfect!"), JSON.stringify(g.floatTexts.map((t) => t.text)));
});

test("闪身途中踢窗先处置普通球，同闪再穿危球：品质按真距离判定照样 Perfect", () => {
  const g = track(newGame());
  g.player.x = CFG.MARGIN; // 贴墙向左闪：玩家被 clamp 原地，球始终在廊道轴线上
  g.setHeld("left", true);
  g.press("kick"); // 残留完美踢窗 0.2s
  g.press("dash"); // 紧接着闪身（球还未放出）
  g.setHeld("left", false);
  // 普通球已在带内：第 1 帧被残留踢窗完美踢掉，同时按真距离（≈25px）定下闪身品质
  incoming(g, 25);
  step(g, 1);
  assert.equal(g.stats.perfectKicks, 1);
  // 同一次闪身再穿一颗危球：按下瞬间虚拟球距约 63px（≤427），不得复用残留 false
  g.balls.push({
    x: g.player.x, y: CFG.PLAYER_Y - 56, vx: 0, vy: 455,
    kind: "peril", dir: "down", dead: false,
  });
  step(g, 6);
  assert.equal(g.stats.dashThroughs, 1);
  assert.ok(g.floatTexts.some((t) => t.text === "Perfect!"), JSON.stringify(g.floatTexts.map((t) => t.text)));
  assert.ok(!g.floatTexts.some((t) => t.text === "闪身步！"), "真完美不得弹早闪字样");
});

test("连击清零：中途换招/蹩脚踢/受伤后要重新数", () => {
  // 两踢后改完美闪身：踢连击清零，从闪身重数，再三闪才触发
  const g = track(newGame());
  perfectOnce(g);
  perfectOnce(g);
  step(g, 5); // 等蹩脚踢窗（踢后 0.4s）关闭，否则第一颗穿球会被旧踢窗吃掉
  dashThroughOnce(g);
  dashThroughOnce(g);
  assert.notEqual(g.player.state, "flail");
  dashThroughOnce(g);
  assert.equal(g.player.state, "flail", "换招后需要重新凑满三次完美闪身");

  // 两记完美踢后跟一记蹩脚踢：计数清零，再两记完美踢不触发
  const g2 = track(newGame());
  perfectOnce(g2);
  perfectOnce(g2);
  incoming(g2, 120); // @340 约 0.26s 后到碰撞带，落在蹩脚窗（0.2–0.4s）
  g2.press("kick");
  step(g2, 22);
  assert.ok(g2.seen.includes("lowKick"));
  perfectOnce(g2);
  perfectOnce(g2);
  assert.notEqual(g2.player.state, "flail", "蹩脚踢应清零踢连击");

  // 受伤清零
  const g3 = track(newGame());
  perfectOnce(g3);
  perfectOnce(g3);
  step(g3, 30); // 等踢判定窗（0.4s）彻底关闭，下一球才是裸吃
  incoming(g3, 40);
  step(g3, 8); // 裸吃
  assert.ok(g3.seen.includes("hurt"));
  step(g3, 20); // 等受伤硬直结束
  perfectOnce(g3);
  perfectOnce(g3);
  assert.notEqual(g3.player.state, "flail", "受伤应清零连击");
});

test("狗熊哆嗦毛：架势满不打断大招；弹回处决杀穿本波也不打断（5s 承诺）", () => {
  const g = track(newGame());
  dashThroughOnce(g);
  dashThroughOnce(g);
  dashThroughOnce(g); // 第三次完美穿球当帧触发
  assert.equal(g.player.state, "flail");

  // 防线一：flail 期间架势满不得切崩架势（否则大招被打断）
  g.player.posture = 100;
  step(g, 5);
  assert.equal(g.player.state, "flail", "大招期间架势满不应触发崩架势");

  // 防线二：弹回球处决本波最后一名敌人，波次推进后大招继续（5s 承诺不缩水）
  const e = g.enemy;
  e.posture = 100;
  e.state = "stagger";
  e.stateT = 0;
  incoming(g, 25);
  step(g, 140); // 弹回 66 帧 + 处决 + DEAD_HOLD 60 帧后进下一波
  assert.equal(g.waveIndex, 1, "处决后应推进到第二波");
  assert.equal(g.player.state, "flail", "波次切换不应打断狗熊哆嗦毛");
  // 大招结束后正常回 idle（残余时间自然走完）
  let n = 0;
  while (g.player.state === "flail" && n < 330) { step(g, 1); n++; }
  assert.equal(g.player.state, "idle");
});

test("踢连击只看时机不挑横向：完美踢（0.2s 窗内）都计连击；偏心 ≤30 也计", () => {
  // 真人节奏：球在 50px 外按踢，接触时 kickAge≈0.067s，计连击（球到躯干才按）
  const g = track(newGame());
  perfectOnce(g);
  perfectOnce(g);
  incoming(g, 50);
  g.press("kick");
  step(g, 20);
  assert.ok(g.seen.includes("perfectKick"), "50px 球仍是完美踢");
  assert.equal(g.player.state, "flail", "50px 贴脸第三踢应触发大招");
  g.balls.length = 0;

  // 偏心 20px（碰撞带内）照样计连击——走位不要求像素级贴心
  const g2 = track(newGame());
  perfectOnce(g2);
  perfectOnce(g2);
  incoming(g2, 25, "normal", 20);
  g2.press("kick");
  step(g2, 20);
  assert.ok(g2.seen.includes("perfectKick"), "偏心球仍是完美踢");
  g2.balls.length = 0;
  // 两记前置 + 一记偏心完美 = 三连，应触发
  assert.equal(g2.player.state, "flail", "偏心完美应计连击");

  // 放宽后：70px 外按踢，接触时 kickAge≈0.117s 仍在 0.2s 连击窗内 → 计连击
  const g3 = track(newGame());
  perfectOnce(g3);
  perfectOnce(g3);
  incoming(g3, 70);
  g3.press("kick");
  step(g3, 20);
  assert.ok(g3.seen.includes("perfectKick"), "70px 球仍是完美踢（0.2s 窗内）");
  assert.equal(g3.player.state, "flail", "完美踢即计连击，第三踢应触发大招");
});

test("狗熊哆嗦毛弹回的球是真反弹：踉跄敌人被命中照样黑虎掏心处决", () => {
  const g = track(newGame());
  dashThroughOnce(g);
  dashThroughOnce(g);
  dashThroughOnce(g); // 三完美闪身触发大招
  const e = g.enemy;
  e.posture = 100;
  e.state = "stagger";
  e.stateT = 0;
  incoming(g, 40);
  step(g, 80); // 弹回后飞 506px ≈ 1.1s
  assert.equal(g.stats.flailBounces, 1);
  assert.ok(g.seen.includes("deathblow"), JSON.stringify(g.seen));
  assert.equal(e.hp, 0);
});

test("狗熊哆嗦毛弹回只给象征性伤害（FLAIL_KICK_HP=10）：全弹回本身已是奖励；架势/处决不变", () => {
  const g = track(newGame());
  dashThroughOnce(g);
  dashThroughOnce(g);
  dashThroughOnce(g);
  assert.equal(g.player.state, "flail");
  const hp0 = g.enemy.hp;
  // 直接放弹回球飞向敌人（轨迹与完美踢相同，但带 flail 标记）
  g.balls.push({
    x: g.enemy.x, y: CFG.ENEMY_Y + 40, vx: 0, vy: -460,
    kind: "normal", dir: "up", dead: false, returned: true, flail: true,
  });
  step(g, 3);
  assert.equal(g.enemy.hp, hp0 - CFG.FLAIL_KICK_HP, "弹回伤害应为象征性 10 点");
  assert.equal(g.enemy.posture, CFG.PERFECT_E_POST, "架势积累不缩水");
});

test("不按方向闪身也能躲开瞄着原位的危球：随机侧移后球落空、无伤", () => {
  const g = track(newGame());
  incoming(g, 70, "peril"); // 球第 6 帧到碰撞带，瞄着原位
  g.press("dash");          // 随机侧移，6 帧后离原位 56px（碰撞半宽仅 30）
  step(g, 30);
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.ok(!g.seen.includes("perilHit"), "随机闪身应躲开危球：" + JSON.stringify(g.seen));
});

test("漏球：球从身侧飞过、落出屏幕无伤，球被移除", () => {
  const g = track(newGame());
  g.enemy.idleUntil = 999; // 冻结敌人，场上只有测试构造的这颗球
  incoming(g, 40, "normal", 220); // 远远偏离玩家
  step(g, 140);
  assert.equal(g.player.hp, CFG.MAX_HP);
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

test("节拍助手/飘字夹取：鼓点公式 + 按实际字串半宽贴墙不出屏（含大字黑虎掏心！）", () => {
  assert.equal(telegraphBeat(0, 0.6), 0);
  assert.equal(telegraphBeat(0.21, 0.6), 1);
  assert.equal(telegraphBeat(0.6, 0.6), 3);
  const g = newGame();
  g.spawnFloat(0, 600, "浪子踢球！", "#ffd45e", 24);
  g.spawnFloat(CFG.WORLD_W + 50, 600, "闪身步！", "#7fe4ef", 24);
  g.spawnFloat(0, 600, "黑虎掏心！", "#ff5a4d", 28); // 5×28=140，半宽 70 > 旧固定夹取 64
  for (const f of g.floatTexts) {
    const halfW = (f.text.length * f.size) / 2;
    assert.ok(f.x - halfW >= 0, `${f.text} 左缘出屏 x=${f.x}`);
    assert.ok(f.x + halfW <= CFG.WORLD_W, `${f.text} 右缘出屏 x=${f.x}`);
  }
});

test("玩家架势满 → 崩架势硬直，期间不能踢/闪身，之后清零恢复", () => {
  const g = newGame();
  g.player.posture = 100;
  step(g, 1);
  assert.equal(g.player.state, "break");
  assert.ok(g.events.includes("break"));
  assert.ok(g.floatTexts.some((t) => t.text === "哆嗦毛…"), "崩架势应飘字「哆嗦毛…」（全名让给三连击大招）");
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
  assert.ok(
    g.floatTexts.some((t) => t.text === "黑虎掏心！"),
    "处决踉跄敌人应飘字「黑虎掏心！」，实际：" + JSON.stringify(g.floatTexts.map((t) => t.text)),
  );
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

test("关卡配表：七阵齐全，血量/球速/危球率合法且难度递增", () => {
  assert.equal(WAVES.length, 7);
  for (const w of WAVES) {
    assert.ok(w.sub && w.name, "每阵要有阵名");
    assert.ok(w.hp.length >= 1 && w.hp.every((h) => h > 0), "血条为正");
    assert.ok(w.ballSpeed >= 300 && w.ballSpeed <= 650, `球速合理 ${w.name}`);
    assert.ok(w.perilChance >= 0 && w.perilChance <= 0.6, `危球率合理 ${w.name}`);
    assert.ok(w.interval >= 0.7 && w.interval <= 1.6, `节奏合理 ${w.name}`);
  }
  // 节奏总体递增（允许个别持平）：末阵 interval 不大于一阵，球速不慢于一阵
  assert.ok(WAVES[6].interval <= WAVES[0].interval);
  assert.ok(WAVES[6].ballSpeed >= WAVES[0].ballSpeed);
  // 多管血只在主将/双煞/宗师
  assert.deepEqual(WAVES.map((w) => w.hp.length), [1, 1, 2, 1, 2, 1, 3]);
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

test("宗师三管血：处决一管后复活新血条，三管全打完才通关", () => {
  const g = newGame();
  const last = WAVES.length - 1;
  g.spawnWave(last);
  assert.equal(g.enemy.nodes, 3);
  g.enemy.hp = 3;
  returnHitEnemy(g);
  assert.equal(g.enemy.nodes, 2);
  assert.equal(g.enemy.hp, WAVES[last].hp[1]);
  assert.equal(g.enemy.state, "rise");
  step(g, 75); // 起身
  assert.equal(g.mode, "fight");
  g.enemy.hp = 3;
  returnHitEnemy(g);
  assert.equal(g.enemy.nodes, 1);
  assert.equal(g.enemy.hp, WAVES[last].hp[2]);
  step(g, 75);
  g.enemy.hp = 3;
  returnHitEnemy(g);
  step(g, 65);
  assert.equal(g.mode, "victory");
  assert.equal(g.stats.kills, 3);
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
  assert.equal(g.player.hp, CFG.MAX_HP);
  assert.equal(g.enemy.hp, WAVES[waveBefore].hp[0]);
});
