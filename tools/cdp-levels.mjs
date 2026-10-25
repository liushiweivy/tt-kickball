/* CDP 浏览器冒烟（二十关选关版）：真实 drawScene 渲染每帧——
   1. 选关界面（锁定/星级/章标题）零异常，截图；
   2. 抽 5 关（1 基本功 / 13 分裂 / 14 重球 / 16 回旋危球 / 20 宗师）skilled bot
      逐关通关，全程渲染零异常，胜利结算（三星 + 下一关/选关按钮）截图。
   用法：node tools/cdp-levels.mjs  （需 9333 无头 Edge + 8821 服务） */
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
    return /poses\\.js$/.test(p) ? window.__P : window.__core;
  });
  window.__g = window.__kickball.game;
  window.__cv = document.getElementById("game");
  window.__view = { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:0,
    kickAnimDur:0.26,kickCooldown:0.3,
    progress: { unlocked: 7, stars: {0:3, 1:2, 4:1} } }; // 选关界面渲染样本
  window.__errs = 0; window.__lastErr = null;
  return "ok";
})()`);

// 选关界面渲染 + 截图
const selInfo = await evalJs(`(function(){
  var g = window.__g, R = window.__R, ctx = window.__cv.getContext("2d");
  g.toSelect();
  try { R.drawScene(ctx, g, window.__view); } catch (e) { window.__lastErr = String(e); return {err:String(e)}; }
  return { png: window.__cv.toDataURL("image/png"), err: null };
})()`);
if (selInfo.err) throw new Error("select render: " + selInfo.err);
await writeFile(join(OUT, "levels-select.png"), Buffer.from(selInfo.png.split(",")[1], "base64"));
console.log("saved levels-select.png");

// 逐关：skilled bot + 每帧真实渲染
const PLAY = `(function(level, maxFrames){
  var g = window.__g, CFG = window.__core.CFG, R = window.__R;
  var ctx = window.__cv.getContext("2d"), view = window.__view;
  function nearest(){ var best=null;
    for (var i=0;i<g.balls.length;i++){var b=g.balls[i];
      if (b.dir==="down"&&!b.dead&&b.vy>0&&(!best||b.y>best.y)) best=b;} return best; }
  function perilFamily(b){ return b.kind==="peril"||b.kind==="boomerang"; }
  g.startLevel(level);
  var kinds = {};
  for (var f=0; f<maxFrames && g.mode==="fight"; f++){
    var p=g.player, b=nearest();
    g.setHeld("left",false); g.setHeld("right",false);
    if (b){ var dx=b.x-p.x;
      if (dx<-12) g.setHeld("left",true); else if (dx>12) g.setHeld("right",true);
      var near=b.y>CFG.PLAYER_Y-42;
      if (perilFamily(b)){ if (near&&Math.abs(dx)<80) g.press("dash"); }
      else if (near&&Math.abs(dx)<=32) g.press("kick");
    }
    g.update(1/60);
    view.time = g.time;
    for (var i=0;i<g.balls.length;i++) kinds[g.balls[i].kind]=1;
    try { R.drawScene(ctx, g, view); } catch (e) { window.__errs++; window.__lastErr = String(e); }
  }
  // 胜利/败北结算遮罩也渲一帧（三星 + 按钮区）
  try { R.drawScene(ctx, g, view); } catch (e) { window.__errs++; window.__lastErr = String(e); }
  return { mode: g.mode, seconds: +(g.time.toFixed(1)), hp: g.player.hp,
    stars: g.mode==="victory" ? window.__core.starsFor(g) : 0,
    kinds: Object.keys(kinds).sort().join(","),
    png: g.mode==="victory" ? window.__cv.toDataURL("image/png") : null };
})`;

const report = {};
const LEVEL_SAMPLE = [0, 12, 13, 15, 19]; // 巡场武生/裂帛娘子/铁锤太岁/回马枪客/宗师
for (const lv of LEVEL_SAMPLE) {
  const r = await evalJs(`${PLAY}(${lv}, ${150 * 60})`);
  report["lv" + (lv + 1)] = { mode: r.mode, seconds: r.seconds, hp: r.hp, stars: r.stars, kinds: r.kinds };
  if (lv === 15 && r.png) {
    await writeFile(join(OUT, "levels-victory.png"), Buffer.from(r.png.split(",")[1], "base64"));
    console.log("saved levels-victory.png");
  }
}

const errs = await evalJs("({errs: window.__errs, lastErr: window.__lastErr})");
console.log(JSON.stringify({ report, renderErrors: errs.errs, lastErr: errs.lastErr }, null, 1));

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
if (errs.errs > 0) process.exit(1);
