/* CDP 验证招式名飘字 + WebAudio 音效：闪身步（起步即出字+破空音）、
   崩架势「哆嗦毛…」（6 抖音）、黑虎掏心（处决飘字）、
   狗熊哆嗦毛大招（三连闪身触发 + 手舞足蹈弹回全部来球）。
   前置：9333 无头 Edge + 8821 服务。用法：node tools/cdp-moves.mjs */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = "http://127.0.0.1:9333";
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "shots");
await mkdir(SHOTS, { recursive: true });

const target = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let mid = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(m.params.exceptionDetails.exception?.description || JSON.stringify(m.params.exceptionDetails));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}

/* 页面脚本前给 AudioContext 装节点计数器（headless 下 context suspended，但节点照常创建） */
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__audioCounts = { osc: 0, buffer: 0 };
  (function () {
    if (!globalThis.AudioContext) return;
    const po = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      window.__audioCounts.osc++;
      return po.call(this);
    };
    const pb = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      window.__audioCounts.buffer++;
      return pb.call(this);
    };
  })();
` });
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 450, height: 800, deviceScaleFactor: 2, mobile: true });
// sound=1 才走真实 AudioContext（默认 harness getAudioContext 抛错走静音，探针测不到节点）
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html?movesprobe=1&sound=1" });
await sleep(1200);

const floats = () => evalJs(`__kickball.game.floatTexts.map((t) => t.text)`);
const counts = () => evalJs(`JSON.parse(JSON.stringify(window.__audioCounts))`);

/* 1. 闪身步：起步瞬间出字 + whoosh（1 噪声源 + 1 振荡器） */
await evalJs(`__kickball.game.start()`);
await sleep(200);
await evalJs(`window.__audioCounts.osc = 0; window.__audioCounts.buffer = 0; __kickball.game.press("dash")`);
await sleep(220); // 事件在 rAF 帧头排空播音
const dashTexts = await floats();
const dashAudio = await counts();
console.log("dash floats:", JSON.stringify(dashTexts), "audio:", JSON.stringify(dashAudio));
await shot("move-dash.png");

/* 2. 崩架势「哆嗦毛…」：架势满崩溃 → 半截飘字 + 6 抖音 + 1 噪声 */
await evalJs(`window.__audioCounts.osc = 0; window.__audioCounts.buffer = 0; __kickball.game.player.posture = 100`);
await sleep(260);
const breakTexts = await floats();
const breakAudio = await counts();
console.log("break floats:", JSON.stringify(breakTexts), "audio:", JSON.stringify(breakAudio));
await shot("move-gouxiong.png");

/* 3. 黑虎掏心：踉跄敌人被处决。冻住 rAF 的自动步进，手动跑一帧避免球被主循环先消费 */
const dbResult = await evalJs(`(function () {
  const K = __kickball.game, CFG = __kickball.CFG;
  const real = K.update.bind(K);
  K.update = function () {};
  const e = K.enemy;
  e.posture = 100; e.state = "stagger"; e.stateT = 0;
  K.balls.push({ x: e.x, y: CFG.ENEMY_Y + 40, vx: 0, vy: -460, kind: "normal", dir: "up", dead: false, returned: true });
  real(1 / 60);
  const texts = K.floatTexts.map((t) => t.text);
  const hp = e.hp;
  K.update = real;
  return { texts, hp };
})()`);
console.log("deathblow:", JSON.stringify(dbResult));
await sleep(80);
await shot("move-deathblow.png");

/* 4. 狗熊哆嗦毛大招：三次「完美闪身」（按下时球距 ≤128px/3cm）触发
      → 飘「狗熊哆嗦毛！」+ 8 抖音滑稽音；手舞足蹈期间来球（含危球）全部弹回。
      冻 rAF 步进、手动逐帧确定性驱动，事件当场喂 audio 做节点计数 */
const flailResult = await evalJs(`(function () {
  const K = __kickball.game, CFG = __kickball.CFG;
  const real = K.update.bind(K);
  K.update = function () {}; // 接管步进（rAF 照常渲染冻结画面）
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      real(1 / 60);
      for (const ev of K.events) __kickball.audio.onEvent(ev); // 手动排空=主循环 drain
      K.events.length = 0;
    }
  };
  K.start(); // 干净第一波：抹掉前三个场景的崩架势/处决残留
  for (const ev of K.events) __kickball.audio.onEvent(ev);
  K.events.length = 0;
  window.__audioCounts.osc = 0; window.__audioCounts.buffer = 0;

  for (let c = 0; c < 3; c++) {
    K.balls.length = 0;
    K.enemy.idleUntil = 9999; // 冻住敌人自动发球，场上只有探针的球
    // 贴身 40px：按下时球距 40 ≤ 128px，反推判定为完美闪身
    K.balls.push({ x: K.player.x, y: CFG.PLAYER_Y - 40, vx: 0, vy: 340, kind: "normal", dir: "down", dead: false });
    K.press("dash");
    for (const ev of K.events) __kickball.audio.onEvent(ev); // dash 起步 whoosh
    K.events.length = 0;
    step(3);  // 第 2 帧：完美穿球 perfectDash
    step(14); // 闪身走完回 idle
  }
  const out = {
    state0: K.player.state,
    perfectDashes: K.stats.perfectDashes,
    throughs: K.stats.dashThroughs,
    texts: K.floatTexts.map((t) => t.text),
  };

  // 大招期间喂一颗普通球 + 一颗危球，两球都应被弹回（dir=up/returned）
  K.balls.length = 0;
  K.stats.flailBounces = 0;
  // 碰撞带仅 PLAYER_Y±32，球必须放带内（-40 在带外会被直接掠过）
  K.balls.push({ x: K.player.x, y: CFG.PLAYER_Y - 25, vx: 0, vy: 340, kind: "normal", dir: "down", dead: false });
  K.balls.push({ x: K.player.x, y: CFG.PLAYER_Y - 25, vx: 0, vy: 455, kind: "peril", dir: "down", dead: false });
  step(1);
  out.bounce = {
    state: K.player.state, hp: K.player.hp,
    bounces: K.stats.flailBounces,
    up: K.balls.filter((b) => b.dir === "up" && b.returned).length,
  };
  K.update = real; // 交还主循环（acc 有钳制，不会爆补帧）
  K.events.length = 0;
  return out;
})()`);
const flailAudio = await counts();
const bounceResult = flailResult.bounce;
console.log("flail:", JSON.stringify(flailResult), "audio:", JSON.stringify(flailAudio));
await shot("move-flail.png");

await fetch(CDP + "/json/close/" + target.id);
ws.close();

const ok =
  dashTexts.includes("闪身步") && dashAudio.osc >= 1 && dashAudio.buffer >= 1 &&
  breakTexts.includes("哆嗦毛…") && breakAudio.osc >= 6 && breakAudio.buffer >= 1 &&
  dbResult.texts.includes("黑虎掏心！") && dbResult.hp === 0 &&
  flailResult.state0 === "flail" && flailResult.perfectDashes === 3 &&
  flailResult.throughs === 3 && flailResult.texts.includes("狗熊哆嗦毛！") &&
  flailAudio.osc >= 8 && flailAudio.buffer >= 1 &&
  bounceResult.state === "flail" && bounceResult.hp === 100 &&
  bounceResult.bounces === 2 && bounceResult.up === 2 &&
  errors.length === 0;
console.log("page errors:", JSON.stringify(errors));
console.log(ok ? "PASS" : "FAIL");
if (!ok) process.exit(1);
