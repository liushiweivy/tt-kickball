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
 *  distance 25 < 碰撞半高 32，首帧即接触（kickAge≈0.017 ≤ 内圈窗 0.08），
 *  dx=0 满足贴心 ≤12；共推进 20 帧（0.33s）覆盖踢冷却，下一次 press 不被吞 */
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
/** 一次完美闪身（球快到了才闪）：贴身 40px 放球，第 2 帧进碰撞带时
 *  闪身年龄仅 0.033s（≤ 完美窗 0.12s）、位移 18.7px 仍在带内 → 完美穿球，
 *  再走完全程回 idle */
function dashThroughOnce(g) {
  incoming(g, 40);
  g.press("dash");
  step(g, 3);
  step(g, 14);
  g.balls.length = 0;
}
/** 一次球还远就闪的乱闪：球在 200px（约 5cm）外就闪身，朝右躲开原位，
 *  球 0.59s 后才到、闪身早走完——没穿到球（空闪），断连击 */
function farBallDashOnce(g) {
  g.setHeld("right", true);
  g.press("dash");
  incoming(g, 200); // 垂直球瞄原位，玩家右闪 156.8px 后球必落空
  g.setHeld("right", false);
  step(g, 17); // 闪身走完：没处置球 → 空闪断链
  step(g, 30); // 球飞过碰撞带（miss 清掉）
  g.balls.length = 0;
}

test("开局：第一波敌人生成，玩家满血，敌人 120 血（加厚一倍）", () => {
  const g = new Game(mulberry32(1));
  assert.equal(g.mode, "title");
  g.start();
  assert.equal(g.mode, "fight");
  assert.equal(g.waveIndex, 0);
  assert.equal(g.enemy.hp, 120);
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
  assert.equal(g.enemy.hp, 120 - CFG.KICK_HP);
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
  assert.equal(g.enemy.hp, 120);
});

test("裸吃：不踢不闪，普通球撞身掉 12 血", () => {
  const g = newGame();
  incoming(g, 40);
  step(g, 2);
  assert.ok(g.events.includes("hurt"));
  assert.equal(g.player.hp, 100 - CFG.E_HP);
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
  assert.equal(g.player.hp, 100);
  assert.equal(g.balls.filter((b) => !b.dead).length, 0);
  // 起步已报过「闪身步」，穿普通球只给火花，不再刷第二组同名飘字
  assert.equal(g.floatTexts.filter((t) => t.text.includes("闪身步")).length, 1);
});

test("危球：按踢也受 26 重伤；闪身无敌帧可无伤穿过", () => {
  const g = track(newGame());
  incoming(g, 40, "peril");
  g.press("kick"); // 踢危球无效
  step(g, 2);
  assert.ok(g.seen.includes("perilHit"));
  assert.equal(g.player.hp, 100 - CFG.PERIL_HP);

  // 按住方向朝球的横向落点冲，移动中与球交汇 → 无敌帧穿球
  const g2 = track(newGame());
  g2.setHeld("left", true);
  // 按下瞬间球距 √(130²+110²)=170px（约 4.5cm，超过 3cm 完美线）；600/s 快球
  // 在第 10 帧（无敌帧内）追上左闪落点 → 穿是穿过去了，但不是完美闪身
  incoming(g2, 130, "peril", -110, 600);
  g2.press("dash");               // dashDir=-1，第 10 帧位移 93px，与球差 17px
  step(g2, 11);
  assert.ok(g2.seen.includes("perilDash"), JSON.stringify(g2.seen));
  assert.ok(!g2.seen.includes("perfectDash"), "3cm 外按下不应算完美闪身");
  assert.equal(g2.player.hp, 100);
  assert.equal(g2.stats.dashThroughs, 1); // 危球闪身同样计入穿球统计
  const peril = g2.floatTexts.find((t) => t.text === "闪身步！");
  assert.ok(peril, "穿危球应飘「闪身步！」");
  // 起步飘字在 PLAYER_Y-104，危球飘字必须上移避开，同速上浮也不叠字
  // （飘字每帧 34px/s 上浮会改写 y，留一帧多的容差）
  assert.ok(
    Math.abs(peril.y - (CFG.PLAYER_Y - 132)) <= 6,
    `危球飘字 y=${peril.y} 应在 ${CFG.PLAYER_Y - 132} 附近`,
  );
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
  assert.equal(g.player.hp, 100);
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
  b.x = g.player.x + 9; // 第 1 帧贴身接触（踢中年龄 0.067s，在 0.12s 连击窗内）
  step(g, 17); // 第 1 帧完美踢计连击；第 17 帧闪身走完不得空闪清零
  assert.equal(g.stats.perfectKicks, 1);
  assert.equal(g.stats.dashThroughs, 0, "球被踢窗处理，不算穿球");
  assert.equal(g.player.comboType, "kick");
  assert.equal(g.player.comboN, 1, "踢球连击不应被幽灵空闪抹掉");
});

test("完美闪身距离判定：球离身约 2–3cm（≤128 世界像素）内闪才算；球还远就闪=空闪断链", () => {
  // 物理事实：无敌帧 0.2s 内球最多逼近 123px（455 速），所以真正能穿到球的闪身
  // 必然按在球距 ≤128px（约 3cm）内——穿到 = 完美。球还 200px（5cm）外就闪，
  // 人闪开了球也落空：没穿到 = 空闪
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

test("踢连击只看时机不挑横向：贴身 0.08s 内都计；偏心 ≤30 也计；按早了断连击", () => {
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

  // 按太早：distance 70 → 接触时 kickAge≈0.117s 超出 0.08s 连击窗，断连击
  const g3 = track(newGame());
  perfectOnce(g3);
  perfectOnce(g3);
  incoming(g3, 70);
  g3.press("kick");
  step(g3, 20);
  assert.ok(g3.seen.includes("perfectKick"), "70px 球仍是完美踢（0.2s 窗内）");
  g3.balls.length = 0;
  perfectOnce(g3);
  perfectOnce(g3);
  assert.notEqual(g3.player.state, "flail", "按早了（>0.08s）应断连击");
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

test("狗熊哆嗦毛弹回的球伤害减半（9→5），但架势/处决不变", () => {
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
  assert.equal(g.enemy.hp, hp0 - CFG.FLAIL_KICK_HP, "弹回伤害应为一半（5 点）");
  assert.equal(g.enemy.posture, CFG.PERFECT_E_POST, "架势积累不减半");
});

test("不按方向闪身也能躲开瞄着原位的危球：随机侧移后球落空、无伤", () => {
  const g = track(newGame());
  incoming(g, 70, "peril"); // 球第 6 帧到碰撞带，瞄着原位
  g.press("dash");          // 随机侧移，6 帧后离原位 56px（碰撞半宽仅 30）
  step(g, 30);
  assert.equal(g.player.hp, 100);
  assert.ok(!g.seen.includes("perilHit"), "随机闪身应躲开危球：" + JSON.stringify(g.seen));
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
