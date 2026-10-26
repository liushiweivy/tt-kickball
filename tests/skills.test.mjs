// 弹踢道场 · 招式系统测试：node --test tests/*.test.mjs
// 覆盖：解锁规则（纯函数）、九招内核效果逐招、默认无技能零污染回归、渲染集成。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, CFG, LEVELS, mulberry32, emptyProgress } = require("../js/core.js");
const skillsMod = require("../js/skills.js");
const R = require("../js/render.js");

const newGame = (skills) => {
  const g = new Game(mulberry32(7));
  g.startLevel(0);
  if (skills) g.setSkills(skills);
  return g;
};
const fullProgress = () => {
  const stars = {};
  for (let i = 0; i < 20; i++) stars[i] = 3;
  return { unlocked: 20, stars };
};

/* ---------- 解锁规则 ---------- */

test("空档（第 1 关未通）一招不解锁", () => {
  assert.deepEqual(skillsMod.unlockedFor(emptyProgress()), []);
});

test("reach 条件：unlocked≥2 悟连闪步；unlocked≥6 再悟手里剑", () => {
  assert.deepEqual(skillsMod.unlockedFor({ unlocked: 2, stars: {} }), ["doubleDash"]);
  const six = skillsMod.unlockedFor({ unlocked: 6, stars: {} });
  assert.ok(six.includes("doubleDash") && six.includes("shuriken"));
  assert.equal(six.length, 2);
});

test("clear 条件：通关第 5 关悟揽月式、通关第 10 关悟指路灯、通关第 20 关悟不倒翁", () => {
  assert.ok(skillsMod.unlockedFor({ unlocked: 6, stars: { 4: 1 } }).includes("lanyue"));
  assert.ok(skillsMod.unlockedFor({ unlocked: 11, stars: { 9: 2 } }).includes("lamp"));
  const all = skillsMod.unlockedFor(fullProgress());
  assert.equal(all.length, 9, "满档 9 招全悟");
  assert.ok(all.includes("revive"));
});

test("unlockedFor 不改原对象；harness 默认档（unlocked:20 无星）缺 4 招通关奖励", () => {
  const p = { unlocked: 20, stars: {} };
  const got = skillsMod.unlockedFor(p);
  assert.deepEqual(p.stars, {});
  assert.equal(got.length, 5, "reach 系 5 招（doubleDash/shuriken/lihua/guluo/blinkKick）");
});

/* ---------- 连闪步 ---------- */

test("连闪步：闪身途中二段续冲+无敌重发，每段一次；无技能按不动", () => {
  const g = newGame(["doubleDash"]);
  g.press("dash");
  for (let i = 0; i < 6; i++) g.update(1 / 60); // 冲到 0.1s（update 钳 dt≤0.05，分帧走）
  assert.ok(g.player.invuln < 0.15);
  g.press("dash"); // 二段
  assert.equal(g.player.dashDoubled, true);
  assert.ok(g.player.stateT < 0.02, "stateT 重置续冲");
  assert.ok(g.player.invuln > 0.19, "无敌帧重发");
  g.press("dash"); // 三段不存在
  assert.equal(g.player.state === "dash", true);

  const g2 = newGame(); // 无技能
  g2.press("dash");
  const t1 = g2.player.stateT;
  for (let i = 0; i < 6; i++) g2.update(1 / 60);
  g2.press("dash");
  assert.ok(g2.player.stateT > t1, "无技能二段被吞");
  assert.equal(g2.player.dashDoubled, false);
});

/* ---------- 揽月式 ---------- */

// 把球塞进碰撞盒、kickAge 定在 0.24s：默认 0.20 窗外（蹩脚踢），揽月 0.28 窗内（完美）
function ballAtPlayer(g) {
  const p = g.player;
  g.balls.push({
    x: p.x, y: CFG.PLAYER_Y, vx: 0, vy: 300,
    kind: "normal", dir: "down", dead: false, returned: false,
  });
}

test("揽月式：0.24s 按踢算完美；无技能同帧只算蹩脚踢", () => {
  const g = newGame(["lanyue"]);
  ballAtPlayer(g);
  g.player.kickAge = 0.24;
  g.update(1 / 60);
  assert.ok(g.events.includes("perfectKick"), "揽月窗内=完美");
  assert.equal(g.balls[0].dir, "up");

  const g2 = newGame();
  ballAtPlayer(g2);
  g2.player.kickAge = 0.24;
  g2.update(1 / 60);
  assert.ok(g2.events.includes("lowKick"), "默认窗外=蹩脚");
});

/* ---------- 手里剑 ---------- */

test("手里剑：CD 7s、速度 900、伤 12、命中 +10 架势，满架势即踉跄", () => {
  const g = newGame(["shuriken"]);
  g.press("pebble");
  assert.ok(Math.abs(g.player.pebbleCd - CFG.SHURI_CD) < 0.001, "CD=7s");
  const b = g.balls[g.balls.length - 1];
  assert.equal(b.shuriken, true);
  const spd = Math.hypot(b.vx, b.vy);
  assert.ok(Math.abs(spd - CFG.SHURI_SPEED) < 1, `速度≈900，实际 ${spd}`);

  const e = g.enemy;
  const hp0 = e.hp;
  g.resolveReturnHit(b);
  assert.equal(e.hp, hp0 - CFG.SHURI_HP);
  assert.equal(e.posture, CFG.SHURI_POST);

  const b2 = { x: e.x, y: CFG.ENEMY_Y, vx: 0, vy: -900, kind: "normal", dir: "up", dead: false, pebble: true, shuriken: true };
  e.posture = CFG.MAX_POSTURE - 5;
  g.resolveReturnHit(b2);
  assert.equal(e.state, "stagger", "手里剑打满架势→踉跄");
});

/* ---------- 梨花摆 ---------- */

test("梨花摆：完美踢顺带弹回 90px 内最近来球（半伤不涨架势）；危球族不参与", () => {
  const g = newGame(["lihua"]);
  const p = g.player;
  ballAtPlayer(g); // 主球
  g.balls.push({ x: p.x + 60, y: CFG.PLAYER_Y, vx: 0, vy: 300, kind: "normal", dir: "down", dead: false, returned: false });
  g.balls.push({ x: p.x + 40, y: CFG.PLAYER_Y, vx: 0, vy: 300, kind: "peril", dir: "down", dead: false, returned: false }); // 危球踢不动（且避开碰撞盒 30px）
  g.player.kickAge = 0.1;
  g.update(1 / 60);
  assert.ok(g.events.includes("perfectKick") && g.events.includes("splashKick"));
  const splash = g.balls.find((b) => b.splash);
  assert.ok(splash && splash.dir === "up", "副球被溅射弹回");
  assert.ok(g.balls.find((b) => b.kind === "peril" && b.dir === "down"), "危球原地不动");

  const e = g.enemy, hp0 = e.hp, post0 = e.posture;
  g.resolveReturnHit(splash);
  assert.equal(e.hp, hp0 - Math.round(CFG.KICK_HP / 2), "溅射半伤");
  assert.equal(e.posture, post0, "溅射不涨架势");
});

/* ---------- 锣鼓催 ---------- */

test("锣鼓催：2 连完美出大招；默认仍需 3 连", () => {
  const g = newGame(["guluo"]);
  g.bumpCombo("kick");
  assert.equal(g.player.state, "idle");
  g.bumpCombo("kick");
  assert.equal(g.player.state, "flail", "2 连触发");

  const g2 = newGame();
  g2.bumpCombo("kick");
  g2.bumpCombo("kick");
  assert.equal(g2.player.state, "idle", "默认 2 连不触发");
  g2.bumpCombo("kick");
  assert.equal(g2.player.state, "flail");
});

/* ---------- 金钟罩 ---------- */

test("金钟罩：每关首次架势满免崩（清零+无敌），第二次照崩", () => {
  const g = newGame(["bell"]);
  g.player.posture = CFG.MAX_POSTURE;
  g.update(1 / 60);
  assert.ok(g.events.includes("bell"));
  assert.equal(g.player.state, "idle", "免崩不进 break");
  assert.equal(g.player.posture, 0, "架势清零");
  assert.ok(g.player.invuln > 0.5, "短暂无敌");

  g.player.invuln = 0;
  g.player.posture = CFG.MAX_POSTURE;
  g.update(1 / 60);
  assert.equal(g.player.state, "break", "第二次照崩");
});

/* ---------- 不倒翁 ---------- */

test("不倒翁：首次致命伤留 1 血续命；再致命照死", () => {
  const g = newGame(["revive"]);
  g.player.hp = 10;
  g.damagePlayer(50, 10, false);
  assert.equal(g.player.hp, 1, "留 1 血");
  assert.ok(g.events.includes("revive"));
  assert.ok(g.player.invuln >= 0.9, "续命无敌");
  assert.equal(g.mode, "fight");

  g.player.state = "idle";
  g.player.invuln = 0;
  g.damagePlayer(50, 0, false);
  g.update(1 / 60);
  assert.equal(g.mode, "death", "第二次致命照死");
});

/* ---------- 瞬身踢 ---------- */

test("瞬身踢：冲刺-出脚-回程三段，45 伤 28 架势，全程无敌，结束 CD 12s、回到原点", () => {
  const g = newGame(["blinkKick"]);
  const p = g.player, e = g.enemy;
  p.x = 150; // 与敌人错开，验证位移
  const hp0 = e.hp;
  g.press("blink");
  assert.equal(p.state, "blink");
  assert.equal(p.blinkFrom, 150);

  for (let i = 0; i < 14; i++) g.update(1 / 60); // ≈0.23s：冲过出脚点（浮点 12 帧可能差一丝）
  assert.equal(p.blinkHit, true);
  assert.equal(e.hp, hp0 - CFG.KICK_HP, "踢伤=完美踢档 45");
  assert.equal(e.posture, CFG.PERFECT_E_POST, "架势=完美踢档 28");
  assert.ok(Math.abs(p.x - e.x) < 30, "出脚点在敌人脚下");
  assert.ok(p.invuln > 0, "全程无敌");

  for (let i = 0; i < 30; i++) g.update(1 / 60); // 走完回程
  assert.equal(p.state, "idle");
  assert.ok(Math.abs(p.x - 150) < 1, "回到出发点");
  assert.ok(p.blinkCd > 11 && p.blinkCd <= CFG.BLINK_CD, `CD≈12s，实际 ${p.blinkCd}`);
  assert.equal(g.stats.returnHits, 0, "不占完美反弹统计");

  g.press("blink"); // 冷却中被吞
  assert.equal(p.state, "idle");
});

test("瞬身踢：踉跄中出脚=忍杀（复用黑虎掏心全链）", () => {
  const g = newGame(["blinkKick"]);
  const e = g.enemy;
  e.state = "stagger";
  e.stateT = 0;
  g.press("blink");
  for (let i = 0; i < 14; i++) g.update(1 / 60);
  assert.equal(e.hp, 0);
  assert.equal(e.state, "dead", "单管血守关被忍杀致死");
});

/* ---------- 回归：非闪身无敌不污染闪身结算（评审 HIGH 修复） ---------- */

test("金钟罩无敌期来球穿过：不进闪身统计、不判品质、不动连击链", () => {
  const g = newGame(["bell"]);
  const p = g.player;
  p.posture = CFG.MAX_POSTURE;
  g.update(1 / 60); // 金钟罩免崩，invuln≈0.6，state=idle
  assert.equal(p.state, "idle");
  // 先攒一条合法连击链，验证不被冤枉断掉
  p.comboType = "kick";
  p.comboN = 2;
  ballAtPlayer(g); // 空闪后残值的 dashPressX/stateT 下，旧逻辑会误判品质
  const d0 = g.stats.dashThroughs, pd0 = g.stats.perfectDashes;
  g.update(1 / 60);
  assert.equal(g.stats.dashThroughs, d0, "非闪身无敌不算穿球");
  assert.equal(g.stats.perfectDashes, pd0, "不判假完美");
  assert.ok(!g.events.includes("dashThrough") && !g.events.includes("perfectDash"));
  assert.equal(p.comboN, 2, "连击链不被冤枉 resetCombo");
});

test("瞬身途中来球穿过：只挡伤不进闪身结算，大招不打断瞬身", () => {
  const g = newGame(["blinkKick", "guluo"]); // 锣鼓催 2 连即大招：旧链最危险路径
  const p = g.player;
  p.x = 150;
  g.press("blink");
  assert.ok(p.blinkCd > 11.5, "冷却起手即计");
  p.comboType = "dash";
  p.comboN = 1; // 再来一次「完美闪身」就会 startFlail
  g.update(1 / 60);
  g.balls.push({
    x: p.x, y: CFG.PLAYER_Y, vx: 0, vy: 300,
    kind: "normal", dir: "down", dead: false, returned: false,
  });
  g.update(1 / 60);
  assert.equal(p.state, "blink", "瞬身不被大招顶掉");
  assert.equal(g.stats.dashThroughs, 0);
  assert.equal(g.stats.perfectDashes, 0, "无假完美");
  for (let i = 0; i < 40; i++) g.update(1 / 60); // 走完回程
  assert.equal(p.state, "idle");
  assert.ok(Math.abs(p.x - 150) < 1, "回到原点未被晾在中场");
  assert.ok(p.blinkCd <= CFG.BLINK_CD - CFG.BLINK_TIME + 0.01, "冷却从出招起算（含 0.6s 过程）");
});

/* ---------- 回归：默认无技能零污染 ---------- */

test("无技能：blink 按键无效、石 CD 10s、完美窗 0.20s、崩体无金钟罩", () => {
  const g = newGame();
  g.press("blink");
  assert.equal(g.player.state, "idle", "无技能瞬身踢无效");
  g.press("pebble");
  assert.ok(Math.abs(g.player.pebbleCd - CFG.PEBBLE_CD) < 0.001);
  g.player.posture = CFG.MAX_POSTURE;
  g.update(1 / 60);
  assert.equal(g.player.state, "break", "无金钟罩照崩");
});

/* ---------- 渲染集成 ---------- */

function recordingCtx() {
  const calls = { drawImage: 0, fillText: [], arc: 0 };
  const grad = { addColorStop() {} };
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    drawImage: () => calls.drawImage++,
    fillText: (s) => calls.fillText.push(String(s)),
    arc: () => calls.arc++,
    measureText: () => ({ width: 0 }),
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k === "canvas") return { width: 450, height: 800 };
      if (typeof k === "symbol") return undefined;
      if (k in t) return t[k];
      return () => {};
    },
    set() { return true; },
  });
  return { ctx, calls };
}

function fightView(skills) {
  return {
    w: 450, h: 800, scale: 1, offX: 0, offY: 0,
    time: 1, pressed: {}, kickAnimDur: 0.25, kickCooldown: 0.5,
    progress: emptyProgress(), skills: skills || [],
  };
}

test("招式谱屏：9 张卡片全画出（含未解锁？？？），返回按钮存在", () => {
  const g = newGame();
  g.toSkills();
  const { ctx, calls } = recordingCtx();
  R.drawScene(ctx, g, fightView());
  assert.ok(calls.fillText.includes("招 式 谱"));
  assert.ok(calls.fillText.includes("？？？"), "空档九卡全锁显 ？？？");
  assert.ok(calls.fillText.includes("打到第 2 关解锁"), "锁定卡显解锁条件");
  assert.ok(calls.fillText.includes("返回"));
});

test("满星档招式谱：9 招全显名", () => {
  const g = newGame();
  g.toSkills();
  const { ctx, calls } = recordingCtx();
  const view = fightView();
  view.progress = fullProgress();
  R.drawScene(ctx, g, view);
  for (const name of ["连闪步", "揽月式", "手里剑", "指路灯", "梨花摆", "金钟罩", "锣鼓催", "瞬身踢", "不倒翁"]) {
    assert.ok(calls.fillText.includes(name), `缺 ${name}`);
  }
});

test("瞬身踢按钮仅解锁后绘制；手里剑解锁后石按钮换「剑」标", () => {
  const g = newGame();
  const r1 = recordingCtx();
  R.drawScene(ctx0(r1), g, fightView([]));
  assert.ok(!r1.calls.fillText.includes("瞬"), "未解锁不画瞬");

  const g2 = newGame();
  const r2 = recordingCtx();
  R.drawScene(r2.ctx, g2, fightView(["blinkKick", "shuriken"]));
  assert.ok(r2.calls.fillText.includes("瞬"), "解锁后画瞬");
  assert.ok(r2.calls.fillText.includes("剑"), "手里剑换剑标");
  assert.ok(!r2.calls.fillText.includes("石"), "石标被替换");
});

function ctx0(r) { return r.ctx; }

test("指路灯：危球下行画落点圈；手里剑投射物走矢量十字（零 drawImage）", () => {
  const g = newGame();
  const p = g.player;
  g.balls.push({ x: p.x + 40, y: 400, vx: 0, vy: 300, kind: "peril", dir: "down", dead: false, returned: false });
  g.balls.push({ x: 200, y: 300, vx: 0, vy: -900, kind: "normal", dir: "up", dead: false, returned: false, pebble: true, shuriken: true });
  const r = recordingCtx();
  R.drawScene(r.ctx, g, fightView(["lamp"]));
  assert.ok(r.calls.fillText.includes("落"), "落点圈带字");
  assert.equal(r.calls.drawImage, 0, "手里剑纯矢量");
});

test("选关页有招式谱入口胶囊", () => {
  const g = newGame();
  g.toSelect();
  const r = recordingCtx();
  R.drawScene(r.ctx, g, fightView());
  assert.ok(r.calls.fillText.some((s) => s.includes("招 式 谱")), "入口文案");
  assert.ok(R.SKILL_ENTRY_ZONE && R.SKILLS_ZONES.length === 1, "命中区导出");
});
