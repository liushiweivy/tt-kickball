// 弹踢道场 · 全身动作姿态函数测试：node --test tests/poses.test.mjs
// 覆盖：踢 / 受击 / 崩架势 / 待机呼吸·行走 / 敌人五态。render-only，不碰 core。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../js/render.js");

const DEFAULT_POSE = {
  lToe: -8, rToe: 8, lLift: 0, rLift: 0, lBend: 0, rBend: 0,
  lArmDX: -11, lArmDY: 16, rArmDX: 11, rArmDY: 16,
  crouch: 0, lean: 0, bodyLift: 0,
};
const POSE_KEYS = Object.keys(DEFAULT_POSE);

function finite(p, where) {
  for (const k of POSE_KEYS) {
    assert.ok(Number.isFinite(p[k]), `${where} ${k}=${p[k]}`);
  }
}

/* ---------- 踢：引膝 → 腾空弹踢 → 收身落回 ---------- */

test("kickPoseAt 已导出，整条曲线字段有限", () => {
  assert.equal(typeof R.kickPoseAt, "function");
  for (let i = 0; i <= 40; i++) finite(R.kickPoseAt(i / 40), `kick u=${i / 40}`);
});

test("踢 u=0/1 严格回到默认站姿（不打断 idle）", () => {
  assert.deepEqual(R.kickPoseAt(0), DEFAULT_POSE);
  assert.deepEqual(R.kickPoseAt(1), DEFAULT_POSE);
});

test("引膝 u=0.12：沉身屈膝折叠（还没弹出）", () => {
  const p = R.kickPoseAt(0.12);
  assert.ok(p.crouch > 3, "未沉身 crouch=" + p.crouch);
  assert.ok(p.rBend > 0.5, "踢腿未折叠 rBend=" + p.rBend);
});

test("弹踢 u≈0.45（完美窗口内）：脚尖高过髋部到脸侧 + 全身腾起", () => {
  const p = R.kickPoseAt(0.45);
  assert.ok(p.rLift > 60, "抬腿高度不足 rLift=" + p.rLift);
  // 髋部约在地面上 34+bodyLift；脚尖须高出髋部 24px 以上，否则只是低位侧摆
  assert.ok(p.rLift - p.bodyLift > 58,
    "脚尖没高过髋部 rLift-bodyLift=" + (p.rLift - p.bodyLift));
  assert.ok(p.bodyLift > 3, "没有腾空 bodyLift=" + p.bodyLift);
  assert.ok(p.rToe > p.lToe, "踢腿应在前侧");
});

/* ---------- 受击：瞬间后仰、手臂上甩，0.3s 收回 ---------- */

test("hurtPoseAt：u=0 强后仰+甩手，u=1 回站姿，全程有限", () => {
  assert.equal(typeof R.hurtPoseAt, "function");
  const h0 = R.hurtPoseAt(0);
  finite(h0, "hurt u=0");
  assert.ok(Math.abs(h0.lean) > 0.12, "后仰不足 lean=" + h0.lean);
  assert.ok(h0.rArmDY < 8 && h0.lArmDY < 8, "手没甩起来 rArmDY=" + h0.rArmDY);
  for (let i = 1; i < 20; i++) finite(R.hurtPoseAt(i / 20), `hurt u=${i / 20}`);
  assert.deepEqual(R.hurtPoseAt(1), DEFAULT_POSE);
});

/* ---------- 崩架势：瘫塌缩身，1.1s 末站回 ---------- */

test("breakPoseAt：中段明显塌身，u=0/1 为站姿", () => {
  assert.equal(typeof R.breakPoseAt, "function");
  const mid = R.breakPoseAt(0.45);
  finite(mid, "break u=.45");
  assert.ok(mid.crouch > 8, "塌身不足 crouch=" + mid.crouch);
  assert.deepEqual(R.breakPoseAt(0), DEFAULT_POSE);
  assert.deepEqual(R.breakPoseAt(1), DEFAULT_POSE);
});

/* ---------- 待机呼吸 / 行走 ---------- */

test("idlePoseAt：静止有呼吸起伏但双脚钉地；行走有抬腿错步", () => {
  assert.equal(typeof R.idlePoseAt, "function");
  let breathed = false;
  for (let i = 0; i < 60; i++) {
    const t = i * 0.1;
    const p = R.idlePoseAt(t, false);
    finite(p, `idle t=${t}`);
    assert.equal(p.lLift, 0);
    assert.equal(p.rLift, 0);
    assert.equal(Math.abs(p.lean), 0);
    if (Math.abs(p.bodyLift) > 0.3 || Math.abs(p.lArmDY - 16) > 0.3) breathed = true;
  }
  assert.ok(breathed, "待机完全没有呼吸起伏");

  let stepped = false;
  for (let i = 0; i < 40; i++) {
    const p = R.idlePoseAt(i * 0.05, true);
    finite(p, `walk t=${i * 0.05}`);
    if (p.lLift > 3 || p.rLift > 3) stepped = true;
  }
  assert.ok(stepped, "行走时双脚没有抬落");
});

/* ---------- 狗熊哆嗦毛（手舞足蹈循环态）：首尾严格站姿，中段四肢大动作 ---------- */

test("flailPoseAt：t=0 与 t=total 严格站姿（淡入淡出不跳帧）", () => {
  assert.equal(typeof R.flailPoseAt, "function");
  assert.deepEqual(R.flailPoseAt(0, 5), DEFAULT_POSE);
  assert.deepEqual(R.flailPoseAt(5, 5), DEFAULT_POSE);
});

test("flailPoseAt：中段手舞足蹈（高抬腿+手臂过头+身体起伏），全程字段有限", () => {
  let wild = false;
  for (let i = 1; i < 50; i++) {
    const t = (i / 50) * 5;
    const p = R.flailPoseAt(t, 5);
    finite(p, `flail t=${t.toFixed(2)}`);
    if (p.lLift > 8 || p.rLift > 8) wild = true;
    if (p.lArmDY < 6 || p.rArmDY < 6) wild = true;
  }
  assert.ok(wild, "中段没有手舞足蹈动作");
});

/* ---------- 敌人：idle / 蓄力 / 受击 / 踉跄 / 起身 / 死亡 ---------- */

test("enemyPoseAt 已导出且各姿态有限", () => {
  assert.equal(typeof R.enemyPoseAt, "function");
  const cases = [
    { state: "idle", stateT: 0, castDur: 1 },
    { state: "telegraph", stateT: 0, castDur: 0.8 },
    { state: "telegraph", stateT: 0.8, castDur: 0.8 },
    { state: "hurt", stateT: 0, castDur: 1 },
    { state: "stagger", stateT: 1, castDur: 1 },
    { state: "rise", stateT: 0, castDur: 1 },
    { state: "dead", stateT: 0.9, castDur: 1 },
  ];
  for (const e of cases) {
    const r = R.enemyPoseAt(e, 0.5);
    finite(r.pose, `enemy ${e.state} t=${e.stateT}`);
    assert.ok(Number.isFinite(r.lean), `enemy ${e.state} lean`);
  }
});

test("敌人蓄力：起手站姿，蓄满双手收拢到球侧", () => {
  const a = R.enemyPoseAt({ state: "telegraph", stateT: 0, castDur: 0.8 }, 0);
  assert.deepEqual(a.pose, DEFAULT_POSE);
  const b = R.enemyPoseAt({ state: "telegraph", stateT: 0.8, castDur: 0.8 }, 0);
  assert.ok(Math.abs(b.pose.lArmDX) < 9 && Math.abs(b.pose.rArmDX) < 9,
    "手未收拢 l=" + b.pose.lArmDX + " r=" + b.pose.rArmDX);
  assert.ok(b.pose.lArmDY < 8 && b.pose.rArmDY < 8, "手未抬到球的高度 dy=" + b.pose.lArmDY);
});

test("敌人受击瞬间后仰；死亡倒地；起身初始蹲伏；踉跄缩身", () => {
  const hurt = R.enemyPoseAt({ state: "hurt", stateT: 0, castDur: 1 }, 0);
  assert.ok(Math.abs(hurt.lean) > 0.08, "受击未后仰 lean=" + hurt.lean);
  const dead = R.enemyPoseAt({ state: "dead", stateT: 0.9, castDur: 1 }, 0);
  assert.ok(Math.abs(dead.lean) > 1.0, "死亡未倒地 lean=" + dead.lean);
  const rise = R.enemyPoseAt({ state: "rise", stateT: 0, castDur: 1 }, 0);
  assert.ok(rise.pose.crouch > 8, "起身未蹲伏 crouch=" + rise.pose.crouch);
  const st = R.enemyPoseAt({ state: "stagger", stateT: 0.5, castDur: 1 }, 0);
  assert.ok(st.pose.crouch > 3, "踉跄未缩身 crouch=" + st.pose.crouch);
});
