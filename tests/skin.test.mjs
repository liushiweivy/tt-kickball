// 弹踢道场 · 敌人位图皮肤测试：node --test tests/skin.test.mjs
// 覆盖：第一关奶龙配表、skins.js 状态→精灵选择/未就绪回退、render 集成（位图优先于火柴人）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Game, LEVELS, emptyProgress } = require("../js/core.js");
const R = require("../js/render.js");
const skins = require("../js/skins.js");

const fakeImg = (w = 96, h = 191) => ({ width: w, height: h });
const nailongSet = () => ({
  idle: fakeImg(119, 198),
  cast: fakeImg(120, 198),
  hurt: fakeImg(127, 198),
  rise: fakeImg(96, 191),
});

/* ---------- 关卡配表 ---------- */

test("第 1 关是奶龙皮肤、名为「奶龙」；其余 19 关仍是火柴人（无 skin）", () => {
  assert.equal(LEVELS[0].skin, "nailong");
  assert.equal(LEVELS[0].name, "奶龙");
  for (let i = 1; i < LEVELS.length; i++) {
    assert.equal(LEVELS[i].skin, undefined, `第 ${i + 1} 关不该有皮肤`);
  }
});

/* ---------- skins.js 单元 ---------- */

function recordingCtx() {
  const calls = { drawImage: [], strokeCount: 0 };
  const grad = { addColorStop() {} };
  const target = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    drawImage: (img, ...args) => calls.drawImage.push([img, ...args]),
    stroke: () => { calls.strokeCount++; },
    measureText: () => ({ width: 0 }),
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k === "canvas") return { width: 450, height: 800 };
      if (typeof k === "symbol") return undefined;
      if (k in t) return t[k];
      return () => {}; // 其余路径方法一律 no-op
    },
    set() { return true; },
  });
  return { ctx, calls };
}

test("未注册皮肤 / 未知皮肤 / 图片未解码(width=0)：返回 false 让 render 回退火柴人", () => {
  const { ctx } = recordingCtx();
  assert.equal(skins.drawSkinFigure(ctx, "nailong", "idle", 225, 168, { pose: {} }), false);
  skins.registerSkin("nailong", { idle: { width: 0, height: 0 } });
  assert.equal(skins.drawSkinFigure(ctx, "nailong", "idle", 225, 168, { pose: {} }), false);
  assert.equal(skins.drawSkinFigure(ctx, "nobody", "idle", 225, 168, { pose: {} }), false);
});

test("六状态各取对应精灵；dead 复用 idle；未知状态回退 idle；脚底中心锚定", () => {
  const set = nailongSet();
  skins.registerSkin("nailong", set);
  const cases = [
    ["idle", set.idle], ["telegraph", set.cast], ["hurt", set.hurt],
    ["stagger", set.hurt], ["rise", set.rise], ["dead", set.idle],
    ["bogus", set.idle],
  ];
  for (const [state, img] of cases) {
    const { ctx, calls } = recordingCtx();
    const ok = skins.drawSkinFigure(ctx, "nailong", state, 225, 168, { pose: {} });
    assert.ok(ok, `${state} 应画位图`);
    assert.equal(calls.drawImage.length, 1, `${state} 只画一张`);
    const [gotImg, dx, dy, dw, dh] = calls.drawImage[0];
    assert.equal(gotImg, img, `${state} 取错精灵`);
    assert.equal(dx + dw / 2, 225, `${state} 水平中心锚定`);
    assert.equal(dy + dh, 168, `${state} 脚底锚定 y=168`);
    assert.ok(dw > 0 && dh > 0 && Number.isFinite(dw) && Number.isFinite(dh));
  }
});

test("crouch 深蹲：绕脚底压扁（高度变低、不翻转）；bodyLift 整体上移", () => {
  const set = nailongSet();
  skins.registerSkin("nailong", set);
  const { ctx, calls } = recordingCtx();
  skins.drawSkinFigure(ctx, "nailong", "rise", 225, 168, { pose: { crouch: 22, bodyLift: 0 } });
  let [, , dy1, , dh1] = calls.drawImage[0];
  assert.ok(dh1 < 118, `深蹲高度应低于站姿 118，实际 ${dh1}`);
  assert.ok(dh1 > 118 * 0.72, "压扁下限 0.72");
  assert.ok(Math.abs(dy1 + dh1 - 168) < 0.001, "绕脚底压缩：脚底不上移");

  const r2 = recordingCtx();
  skins.drawSkinFigure(r2.ctx, "nailong", "idle", 225, 168, { pose: { bodyLift: 3 } });
  const [, , dy2, , dh2] = r2.calls.drawImage[0];
  assert.ok(Math.abs(dy2 + dh2 - 165) < 0.001, `bodyLift=3 应整体上移 3px，实际脚底 ${dy2 + dh2}`);
});

/* ---------- render 集成：drawScene 皮肤优先、缺图回退火柴人 ---------- */

function fightView() {
  return {
    w: 450, h: 800, scale: 1, offX: 0, offY: 0,
    time: 0, pressed: {}, kickAnimDur: 0.25, kickCooldown: 0.5,
    progress: emptyProgress(),
  };
}

test("drawScene：第一关注册了奶龙图则走 drawImage，不再画火柴人躯干", () => {
  skins.registerSkin("nailong", nailongSet());
  const g = new Game();
  g.startLevel(0);
  const { ctx, calls } = recordingCtx();
  R.drawScene(ctx, g, fightView());
  assert.ok(calls.drawImage.length >= 1, "应用位图皮肤");
  assert.equal(calls.drawImage[0][0].width >= 0, true);
});

test("drawScene：未注册皮肤的关卡（第 2 关）零 drawImage，火柴人路径不回归", () => {
  const g = new Game();
  g.startLevel(1);
  const { ctx, calls } = recordingCtx();
  R.drawScene(ctx, g, fightView());
  assert.equal(calls.drawImage.length, 0, "火柴人关卡不应出现位图");
  assert.ok(calls.strokeCount >= 3, "火柴人靠 stroke 画躯干四肢");
});
