/* CDP 逐帧验证闪身姿态：冻结 rAF 后手动步进内核+渲染，关键帧截图。
   前置：独立无头 Edge --remote-debugging-port=9333；8821 服务在跑。
   用法：node tools/cdp-dash.mjs */
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = "http://127.0.0.1:9333";
const SHOTS = join(dirname(fileURLToPath(new URL(".", import.meta.url))), "shots");
await mkdir(SHOTS, { recursive: true });

const target = await (await fetch(CDP + "/json/new?http://127.0.0.1:8821/harness/index.html", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res) => (ws.onopen = res));

let mid = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) {
  const id = ++mid;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}

await send("Page.enable");
// 页面脚本运行前冻住主循环，改由本脚本手动 g.update + drawScene
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: "window.requestAnimationFrame=function(){return 0;};",
});
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html?dashprobe=1" });
await new Promise((r) => setTimeout(r, 1200));

// harness 的 CommonJS 加载器不挂全局；手动同步加载 core+render 模块
await evalJs(`(function(){
  function loadMod(path, req) {
    var x = new XMLHttpRequest(); x.open("GET", path, false); x.send();
    var m = { exports: {} };
    new Function("module", "exports", "require", x.responseText)(m, m.exports, req || function () {});
    return m.exports;
  }
  window.__core = loadMod("/js/core.js");
  window.__R = loadMod("/js/render.js", function () { return window.__core; });
  return typeof window.__R.drawScene;
})()`);

// 一组闪身：held 方向 + press(dash)，推进 n 帧，指定帧截图
async function runDash(label, heldDir, frames) {
  await evalJs(`(function(){
    var g = window.__kickball.game;
    g.start();
    g.setHeld("left", ${heldDir === "left"});
    g.setHeld("right", ${heldDir === "right"});
    g.press("dash");
    window.__frame = 0;
    return g.player.state + ":" + g.player.dashDir;
  })()`);
  for (let f = 1; f <= 17; f++) {
    await evalJs(`(function(){
      var g = window.__kickball.game;
      g.update(1/60);
      var cv = document.getElementById("game");
      var ctx = cv.getContext("2d");
      var view = { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:g.time,
                   kickAnimDur:0.26,kickCooldown:0.3 };
      window.__view = view;
      window.__R.drawScene(ctx, g, view);
      return g.player.state;
    })()`);
    if (frames.includes(f)) await shot(`${label}-f${String(f).padStart(2,"0")}.png`);
  }
}

// 右向闪身：f1 起手甩手 / f4 蹬地 / f8 腾空 / f12 落脚 / f15 收身 / f17 回 idle
await runDash("right", "right", [1, 4, 8, 12, 15, 17]);
// 原地闪身：f3 沉身
await runDash("idle0", null, [3, 8]);
// 左向镜像：f8 腾空
await runDash("left", "left", [1, 8]);

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
console.log("done");
