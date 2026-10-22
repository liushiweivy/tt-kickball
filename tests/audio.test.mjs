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
  // 显式钉死「无环境」：mock 用例的全局污染一旦因顺序/并发泄漏到这里，本用例必须立刻失真可见
  delete globalThis.AudioContext;
  const audio = createAudio();
  assert.doesNotThrow(() => audio.unlock());
  for (const ev of EVENTS) {
    assert.doesNotThrow(() => audio.onEvent(ev), "事件 " + ev + " 不应抛");
  }
});

test("工厂每次返回独立实例（状态互不干扰）", () => {
  assert.notEqual(createAudio(), createAudio());
});

/* ---------- mock AudioContext：采集排程的振荡器/噪声，验证节奏型 ---------- */

// mock AudioParam：完整记录 set/ramp 调用，tone 的 vol/freq2/dur 全走这两条通道
function mockParam() {
  const calls = [];
  return {
    calls,
    setValueAtTime(v, t) { calls.push({ m: "set", v, t }); },
    exponentialRampToValueAtTime(v, t) { calls.push({ m: "ramp", v, t }); },
  };
}

function installMockAudio() {
  const started = [];  // { freq, freq2, vol, dur, at, type }
  const buffered = []; // { at, n, vol }（cutoff 烘焙进 PCM，W3C API 层不可见）
  const out = {};
  class MockAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = out;
    }
    resume() {}
    createOscillator() {
      const osc = { type: "", frequency: mockParam(), _gain: null };
      osc.connect = (target) => { osc._gain = target.gain; return target; };
      osc.start = (t) => {
        const ramps = osc._gain.calls.filter((c) => c.m === "ramp");
        started.push({
          freq: osc.frequency.calls[0].v,
          freq2: osc.frequency.calls.find((c) => c.m === "ramp")?.v,
          vol: ramps[0].v,           // gain：set .0001 → ramp vol → ramp .0001
          dur: ramps[1].t - t,       // 末段 ramp 落在 t0+dur
          at: t,
          type: osc.type,
        });
      };
      osc.stop = () => {};
      return osc;
    }
    createGain() {
      const g = { gain: mockParam() };
      g.connect = () => out;
      return g;
    }
    createBuffer(ch, n) { return { n, getChannelData: () => new Float32Array(n) }; }
    createBufferSource() {
      const src = { _n: 0, _gain: null };
      Object.defineProperty(src, "buffer", { set(b) { src._n = b.n; } });
      src.connect = (target) => { src._gain = target.gain; return target; };
      src.start = (t) => buffered.push({ at: t, n: src._n, vol: src._gain.calls[0].v });
      return src;
    }
  }
  const prev = globalThis.AudioContext;
  globalThis.AudioContext = MockAudioContext;
  const restore = () => {
    if (prev) globalThis.AudioContext = prev;
    else delete globalThis.AudioContext;
  };
  return { started, buffered, restore, sr: 44100 };
}

test("狗熊哆嗦毛：flail 排程「隆·咚·哐」循环鼓点铺满 5s（10 组 × 三拍）", (t) => {
  const { started, buffered, restore, sr } = installMockAudio();
  t.after(restore);
  const audio = createAudio();
  audio.onEvent("flail");

  // 三拍：隆 150Hz 强鼓 / 咚 185Hz 弱鼓 / 哐 680Hz 金属锣（另带 130Hz 低鼓体量）
  const lon = started.filter((n) => n.freq === 150);
  const dong = started.filter((n) => n.freq === 185);
  const kuang = started.filter((n) => n.freq === 680);
  assert.equal(lon.length, 10, "隆鼓 10 下");
  assert.equal(dong.length, 10, "咚鼓 10 下");
  assert.equal(kuang.length, 10, "哐锣 10 下");
  // 每拍 0.17s，一组 0.51s：第 g 组在 g*0.51 / +0.17 / +0.34
  const beatGrid = [];
  for (let g = 0; g < 10; g++) {
    const t0 = g * 0.51;
    assert.ok(Math.abs(lon[g].at - t0) < 1e-6, "隆 组" + g);
    assert.ok(Math.abs(dong[g].at - (t0 + 0.17)) < 1e-6, "咚 组" + g);
    assert.ok(Math.abs(kuang[g].at - (t0 + 0.34)) < 1e-6, "哐 组" + g);
    beatGrid.push(t0, t0 + 0.17, t0 + 0.34);
  }
  assert.equal(buffered.length, 30, "每拍带鼓皮/锣面噪声，共 30");
  // 噪声拍点必须与三拍网格逐点重合（不允许统一堆在组尾）
  const noiseAt = buffered.map((b) => b.at).sort((a, b) => a - b);
  beatGrid.sort((a, b) => a - b).forEach((bt, i) => {
    assert.ok(Math.abs(noiseAt[i] - bt) < 1e-6, "噪声拍点 " + i);
  });
  // 铺满 FLAIL_TIME=5s：最后一记哐在 4.93s，尾音自然溢进 5.1s
  assert.ok(Math.abs(kuang[9].at - 4.93) < 1e-6);

  // 强/弱拍音量分层：隆 0.22 > 咚 0.14；噪声 0.05s
  assert.ok(lon.every((n) => Math.abs(n.vol - 0.22) < 1e-9));
  assert.ok(dong.every((n) => Math.abs(n.vol - 0.14) < 1e-9));
  assert.ok(buffered.every((b) => b.n === Math.floor(sr * 0.05) || b.n === Math.floor(sr * 0.06)));
});

test("drum/fire 旧音色逐参数不变（重构 gu/kuang 守卫）", (t) => {
  const { started, buffered, sr, restore } = installMockAudio();
  t.after(restore);
  const audio = createAudio();
  audio.onEvent("drum");
  audio.onEvent("fire");

  // drum = gu(false)：150→62Hz / vol .22 / dur .2 + 噪声 0.05s vol .12
  const d = started.find((n) => n.freq === 150);
  assert.ok(d && d.at === 0 && d.freq2 === 62 && d.vol === 0.22 && Math.abs(d.dur - 0.2) < 1e-9, "drum 隆鼓参数");
  // fire = kuang：680→280/.07/.12 与 130→58/.16/.18 两根振荡器
  const k1 = started.find((n) => n.freq === 680);
  const k2 = started.find((n) => n.freq === 130);
  assert.ok(k1 && k1.freq2 === 280 && k1.vol === 0.07 && Math.abs(k1.dur - 0.12) < 1e-9, "哐金属音参数");
  assert.ok(k2 && k2.freq2 === 58 && k2.vol === 0.16 && Math.abs(k2.dur - 0.18) < 1e-9, "哐低鼓体量参数");
  // drum 噪声 0.05s/.12，fire 噪声 0.06s/.10（顺序：drum 先排程）
  assert.equal(buffered.length, 2);
  assert.ok(Math.abs(buffered[0].n - Math.floor(sr * 0.05)) === 0 && buffered[0].vol === 0.12, "drum 噪声");
  assert.ok(Math.abs(buffered[1].n - Math.floor(sr * 0.06)) === 0 && buffered[1].vol === 0.1, "fire 噪声");
});
