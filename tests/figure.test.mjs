// 弹踢道场 · 闪身姿态曲线测试：node --test tests/figure.test.mjs
// render.js 的 UMD 在 Node 走 module.exports = factory(require("./core.js"))，可直接 require
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

function pose(u, dir = 1) {
  return R.dashPoseAt(u, dir);
}

test("dashPoseAt 已导出", () => {
  assert.equal(typeof R.dashPoseAt, "function");
});

test("整条曲线（dir ±1 / 0）全部字段有限数", () => {
  for (const dir of [1, -1, 0]) {
    for (let i = 0; i <= 28; i++) {
      const p = pose(i / 28, dir);
      for (const k of POSE_KEYS) {
        assert.ok(Number.isFinite(p[k]), `dir=${dir} u=${i / 28} ${k}=${p[k]}`);
      }
    }
  }
});

test("u=0 与 u=1 严格等于默认站姿（无缝接 idle）", () => {
  for (const dir of [1, -1, 0]) {
    assert.deepEqual(pose(0, dir), DEFAULT_POSE);
    assert.deepEqual(pose(1, dir), DEFAULT_POSE);
  }
});

test("起手 u=0.06：手已经甩出，双脚仍钉地（手先于脚契约）", () => {
  const p = pose(0.06, 1);
  // 前手（右）手腕已从默认 +11 甩开
  assert.ok(Math.abs(p.rArmDX - DEFAULT_POSE.rArmDX) > 5, "前手未甩开 rArmDX=" + p.rArmDX);
  assert.ok(Math.abs(p.lArmDX - DEFAULT_POSE.lArmDX) > 2, "后手未甩开");
  // 脚没动
  assert.equal(p.rLift, 0);
  assert.equal(p.lLift, 0);
  assert.equal(p.rBend, 0);
  assert.equal(p.lBend, 0);
  assert.ok(Math.abs(p.rToe - 8) < 0.001);
  assert.ok(Math.abs(p.lToe - -8) < 0.001);
  // 蓄力沉身
  assert.ok(p.crouch > 2, "起手未沉身 crouch=" + p.crouch);
});

test("蹬地 u=0.22：双脚已有明显动作", () => {
  const p = pose(0.22, 1);
  assert.ok(
    p.rLift > 5 || p.lBend > 0.5 || p.rBend > 0.5,
    `双脚无动作 rLift=${p.rLift} lBend=${p.lBend} rBend=${p.rBend}`
  );
});

test("腾空 u=0.45：身体离地带错步，朝冲刺方向倾斜", () => {
  const p = pose(0.45, 1);
  assert.ok(p.bodyLift > 5, "没有腾空 bodyLift=" + p.bodyLift);
  assert.ok(p.lean > 0.1, "未前倾 lean=" + p.lean);
  // 前腿跨到前方
  assert.ok(p.rToe > 14, "前腿未前跨 rToe=" + p.rToe);
});

test("腾空 u=0.45：手与脚对角配合（对侧手前上摆、前腿侧手后摆），不能顺拐", () => {
  const p = pose(0.45, 1); // 向右闪：右脚为前腿
  assert.ok(p.lArmDX > 4, "对侧手（左）应向前摆 lArmDX=" + p.lArmDX);
  assert.ok(p.lArmDY < 4, "前摆的手应抬到肩以上 lArmDY=" + p.lArmDY);
  assert.ok(p.rArmDX < p.lArmDX, "前腿同侧手（右）应在后，不能与前腿同向前摆");
  const m = pose(0.45, -1); // 镜像同样成立
  assert.ok(m.rArmDX < -4, "镜像：对侧手（右）应向前摆 rArmDX=" + m.rArmDX);
  assert.ok(m.lArmDX > m.rArmDX, "镜像顺拐");
});

test("落地 u=0.8：前脚已落地（无悬空），姿态在回收", () => {
  const p = pose(0.8, 1);
  assert.equal(p.rLift, 0);
  assert.ok(p.bodyLift < 1, "落地后仍悬空 bodyLift=" + p.bodyLift);
});

test("dir=-1 与 dir=1 镜像", () => {
  for (const u of [0.06, 0.22, 0.45, 0.7]) {
    const a = pose(u, 1), b = pose(u, -1);
    assert.ok(Math.abs(b.lToe + a.rToe) < 1e-8, `u=${u} 脚尖未镜像`);
    assert.ok(Math.abs(b.rToe + a.lToe) < 1e-8, `u=${u} 脚尖未镜像`);
    assert.ok(Math.abs(b.lArmDX + a.rArmDX) < 1e-8, `u=${u} 手腕未镜像`);
    assert.ok(Math.abs(b.lean + a.lean) < 1e-8, `u=${u} 侧倾未镜像`);
    assert.ok(Math.abs(b.bodyLift - a.bodyLift) < 1e-8);
  }
});

test("dir=0（不按方向）：左右始终对称、不横倾、有沉身", () => {
  let sawCrouch = false;
  for (let i = 0; i <= 28; i++) {
    const p = pose(i / 28, 0);
    assert.ok(Math.abs(p.lToe + p.rToe) < 1e-8);
    assert.ok(Math.abs(p.lArmDX + p.rArmDX) < 1e-8);
    assert.equal(p.lean, 0);
    if (p.crouch > 2) sawCrouch = true;
  }
  assert.ok(sawCrouch, "原地闪身全程没有沉身动作");
});
