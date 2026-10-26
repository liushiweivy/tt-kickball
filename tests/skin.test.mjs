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

test("二十关全配皮肤：一章咕嘎/二章大将/三章刀盾/四章奶龙，守关带体型梯度与 boss 配饰", () => {
  const byChapter = ["guga", "dajiang", "daodun", "nailong"];
  for (let i = 0; i < LEVELS.length; i++) {
    const ch = Math.floor(i / 5);
    assert.equal(LEVELS[i].skin, byChapter[ch], `第 ${i + 1} 关皮肤应为 ${byChapter[ch]}`);
    assert.ok(LEVELS[i].skinScale >= 0.8 && LEVELS[i].skinScale <= 1.3, `第 ${i + 1} 关体型梯度合法`);
  }
  assert.equal(LEVELS[0].name, "咕嘎仔");
  assert.equal(LEVELS[4].name, "咕嘎大王");
  assert.equal(LEVELS[9].name, "大将");
  assert.equal(LEVELS[14].name, "刀盾教头");
  assert.equal(LEVELS[19].name, "奶龙王");
  for (const bossIdx of [4, 9, 14, 19]) {
    assert.equal(LEVELS[bossIdx].skinTint, "boss", `第 ${bossIdx + 1} 关守关应有 boss 配饰`);
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

test("drawScene：矢量皮肤关（第 1 关咕嘎）零 drawImage、不走火柴人躯干", () => {
  const g = new Game();
  g.startLevel(0);
  const { ctx, calls } = recordingCtx();
  R.drawScene(ctx, g, fightView());
  assert.equal(calls.drawImage.length, 0, "矢量皮肤不应出现位图");
});

test("drawScene：四章奶龙关（第 16 关）注册了奶龙图则走 drawImage；奶龙王（20 关）同路径带王冠", () => {
  skins.registerSkin("nailong", nailongSet());
  for (const idx of [15, 19]) {
    const g = new Game();
    g.startLevel(idx);
    const { ctx, calls } = recordingCtx();
    R.drawScene(ctx, g, fightView());
    assert.ok(calls.drawImage.length >= 1, `第 ${idx + 1} 关应用位图皮肤`);
  }
});

test("矢量皮肤永远就绪（无需注册图片）；未知皮肤仍回退 false", () => {
  const { ctx } = recordingCtx();
  assert.equal(skins.drawSkinFigure(ctx, "guga", "idle", 225, 168, { pose: {} }), true);
  assert.equal(skins.drawSkinFigure(ctx, "dajiang", "telegraph", 225, 168, { pose: {} }), true);
  assert.equal(skins.drawSkinFigure(ctx, "daodun", "idle", 225, 168, { pose: {} }, { scale: 1.18, tint: "boss" }), true);
  assert.equal(skins.drawSkinFigure(ctx, "nobody", "idle", 225, 168, { pose: {} }), false);
});
