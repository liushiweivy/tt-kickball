/* CDP 浏览器冒烟：skilled bot 在页面内连跑三波（渲染每帧真实 drawScene），
   验证 render 层在所有状态/危球闪身组合下零异常，并抓一张实战闪身帧。
   用法：node tools/cdp-smoke.mjs  （需 9333 无头 Edge + 8821 服务） */
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = "http://127.0.0.1:9333";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "shots");
const target = await (await fetch(CDP + "/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 450, height: 800, deviceScaleFactor: 2, mobile: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.requestAnimationFrame=()=>0;" });
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html?smoke=1" });
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
  window.__g = window.__kickball.game;
  window.__cv = document.getElementById("game");
  window.__view = { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:0,kickAnimDur:0.26,kickCooldown:0.3 };
  window.__g.start();
  return "ok";
})()`);

// 单帧：bot 决策 + update + 真实渲染；记录首个危球闪身帧的截图
const STEP = `(function(n){
  var g = window.__g, CFG = window.__core.CFG, R = window.__R;
  var ctx = window.__cv.getContext("2d"), view = window.__view, errors = 0;
  function nearest(){ var best=null;
    for (var i=0;i<g.balls.length;i++){var b=g.balls[i];
      if (b.dir==="down"&&!b.dead&&(!best||b.y>best.y)) best=b;} return best; }
  for (var f=0; f<n; f++){
    var p=g.player, b=nearest();
    g.setHeld("left",false); g.setHeld("right",false);
    if (b){ var dx=b.x-p.x;
      if (dx<-12) g.setHeld("left",true); else if (dx>12) g.setHeld("right",true);
      var near=b.y>CFG.PLAYER_Y-42;
      if (b.kind==="peril"){ if (near&&Math.abs(dx)<80) g.press("dash"); }
      else if (near&&Math.abs(dx)<=32) g.press("kick");
    }
    var wasDash = p.state==="dash", wasThru = g.stats.dashThroughs;
    g.update(1/60);
    view.time = g.time;
    try { R.drawScene(ctx, g, view); } catch (e) { errors++; window.__lastErr = String(e); }
    if (!window.__shotPng && wasDash && g.stats.dashThroughs>wasThru){
      window.__shotPng = window.__cv.toDataURL("image/png");
    }
    if (g.mode!=="fight") return {done:true,errors:errors,mode:g.mode,hp:g.hp,
      frames:g.time,stats:g.stats,err:window.__lastErr||null};
  }
  return {done:false,errors:errors,mode:g.mode,hp:g.hp,frames:g.time,
    stats:g.stats,err:window.__lastErr||null};
})(60)`;

let totalErrors = 0, info;
for (let batch = 0; batch < 90; batch++) { // 90×60帧 = 90s 游戏时间上限
  info = await evalJs(STEP);
  totalErrors += info.errors;
  if (info.done) break;
}

const png = await evalJs("window.__shotPng || ''");
if (png) {
  await writeFile(join(OUT, "smoke-dash-through.png"), Buffer.from(png.split(",")[1], "base64"));
  console.log("saved smoke-dash-through.png");
}
console.log(JSON.stringify({ result: info.done ? info.mode : "TIMEOUT", hp: info.hp,
  seconds: +info.frames.toFixed(1), perfectKicks: info.stats.perfectKicks,
  dashThroughs: info.stats.dashThroughs, kills: info.stats.kills,
  renderErrors: totalErrors, lastErr: info.err }, null, 0));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
