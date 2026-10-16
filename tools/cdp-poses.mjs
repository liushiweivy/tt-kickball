/* CDP 逐帧验证全身动作（2026-10-16 动作扩充）：
   待机呼吸 / 行走 / 弹踢三段 / 受击 / 崩架势 / 敌人蓄力三拍 / 受击 / 踉跄 / 起身 / 倒地 / 闪身扬尘。
   前置：9333 无头 Edge + 8821 服务。用法：node tools/cdp-poses.mjs */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = "http://127.0.0.1:9333";
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "shots");
await mkdir(SHOTS, { recursive: true });

const target = await (await fetch(CDP + "/json/new?http://127.0.0.1:8821/harness/index.html", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++mid; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 450, height: 800, deviceScaleFactor: 2, mobile: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.requestAnimationFrame=()=>0;" });
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html?poseprobe=1" });
await new Promise((r) => setTimeout(r, 1200));

await evalJs(`(function(){
  function loadMod(path, req) {
    var x = new XMLHttpRequest(); x.open("GET", path, false); x.send();
    var m = { exports: {} };
    new Function("module","exports","require",x.responseText)(m,m.exports,req||function(){});
    return m.exports;
  }
  window.__core = loadMod("/js/core.js");
  window.__P = loadMod("/js/poses.js", function(){ return window.__core; });
  window.__R = loadMod("/js/render.js", function(p){
    return /poses\.js$/.test(p) ? window.__P : window.__core;
  });
  var g = window.__kickball.game;
  g.start();
  window.__render = function(over) {
    over = over || {};
    var p = g.player, e = g.enemy;
    if (over.p) Object.keys(over.p).forEach(function(k){ p[k] = over.p[k]; });
    if (over.e) Object.keys(over.e).forEach(function(k){ e[k] = over.e[k]; });
    if (over.time != null) g.time = over.time;
    var view = { w:450,h:800,scale:1,offX:0,offY:0,
      pressed: over.pressed || {}, time:g.time, kickAnimDur:0.26, kickCooldown:0.3 };
    window.__R.drawScene(document.getElementById("game").getContext("2d"), g, view);
  };
  return "ok";
})()`);

// 玩家：待机呼吸两帧 / 行走两帧
await evalJs(`window.__render({time:0.3})`);
await shot("act-idle-a.png");
await evalJs(`window.__render({time:1.05})`);
await shot("act-idle-b.png");
await evalJs(`window.__render({time:0.2, pressed:{right:true}})`);
await shot("act-walk-a.png");
await evalJs(`window.__render({time:0.42, pressed:{right:true}})`);
await shot("act-walk-b.png");

// 弹踢：引膝 / 峰值 / 收回（u = 1 - kickAnim/0.26）
for (const [u, name] of [[0.12, "chamber"], [0.45, "peak"], [0.62, "recover"]]) {
  await evalJs(`window.__render({p:{kickAnim:${(0.26 * (1 - u)).toFixed(4)}}})`);
  await shot(`act-kick-${name}.png`);
}

// 受击三帧 / 崩架势
await evalJs(`window.__render({p:{state:"hurt", stateT:0, kickAnim:0}})`);
await shot("act-hurt-0.png");
await evalJs(`window.__render({p:{state:"hurt", stateT:0.15}})`);
await shot("act-hurt-1.png");
await evalJs(`window.__render({p:{state:"break", stateT:0.5}})`);
await shot("act-break.png");
// 复位玩家
await evalJs(`window.__render({p:{state:"idle", stateT:0, hp:100}})`);

// 敌人：蓄力起手/中段/满，受击，踉跄，起身，倒地
await evalJs(`window.__render({e:{state:"telegraph", stateT:0, castDur:0.8}})`);
await shot("act-ete-0.png");
await evalJs(`window.__render({e:{state:"telegraph", stateT:0.4, castDur:0.8}})`);
await shot("act-ete-1.png");
await evalJs(`window.__render({e:{state:"telegraph", stateT:0.8, castDur:0.8}})`);
await shot("act-ete-2.png");
await evalJs(`window.__render({e:{state:"hurt", stateT:0}})`);
await shot("act-ehurt.png");
await evalJs(`window.__render({e:{state:"stagger", stateT:0.5}, time:1.0})`);
await shot("act-estagger.png");
await evalJs(`window.__render({e:{state:"rise", stateT:0.1}})`);
await shot("act-erise.png");
await evalJs(`window.__render({e:{state:"dead", stateT:0.55}})`);
await shot("act-edead.png");

// 真实闪身扬尘：驱动内核，抓蹬地帧（f3）与落地帧（f13）
await evalJs(`(function(){
  var g = window.__kickball.game;
  g.start();
  g.setHeld("right", true);
  g.press("dash");
  return g.player.state;
})()`);
for (let f = 1; f <= 17; f++) {
  await evalJs(`(function(){
    var g = window.__kickball.game;
    g.update(1/60);
    var view = { w:450,h:800,scale:1,offX:0,offY:0,pressed:{right:true},
                 time:g.time, kickAnimDur:0.26, kickCooldown:0.3 };
    window.__R.drawScene(document.getElementById("game").getContext("2d"), g, view);
  })()`);
  if (f === 2 || f === 5 || f === 12) await shot(`act-dash-dust-f${String(f).padStart(2, "0")}.png`);
}

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
console.log("done");
