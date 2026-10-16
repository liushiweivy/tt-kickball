// 弹踢道场 · 音效模块无环境冒烟：node --test tests/audio.test.mjs
// Node 里没有 AudioContext，所有事件必须静默空跑，绝不能抛（main.js 帧循环靠这一点降级）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAudio } = require("../js/audio.js");

const EVENTS = [
  "kick", "perfectKick", "lowKick", "dash", "dashThrough", "perfectDash", "perilDash",
  "drum", "fire", "peril", "perilFire", "hurt", "perilHit", "returnHit",
  "stagger", "break", "deathblow", "flail", "flailBounce",
  "wave", "victory", "death", "unknown-evt",
];

test("无音频环境：unlock/onEvent 全事件静默不抛", () => {
  const audio = createAudio();
  assert.doesNotThrow(() => audio.unlock());
  for (const ev of EVENTS) {
    assert.doesNotThrow(() => audio.onEvent(ev), "事件 " + ev + " 不应抛");
  }
});

test("工厂每次返回独立实例（状态互不干扰）", () => {
  assert.notEqual(createAudio(), createAudio());
});
