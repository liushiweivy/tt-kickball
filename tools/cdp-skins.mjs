/* CDP 截帧：第一关奶龙各状态 + 选关界面 + 第 2 关火柴人对照。
   用法：node tools/cdp-skins.mjs  （需 9333 无头 Edge + 8821 服务） */
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
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(OUT, name), Buffer.from(r.result.data, "base64"));
  console.log("saved", name);
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 450, height: 800, deviceScaleFactor: 2, mobile: true });
// 冻帧：main.js 首帧 requestAnimationFrame 被吞，之后用 __kickball 手动驱动
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.requestAnimationFrame=()=>0;" });
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html" });
await new Promise((r) => setTimeout(r, 2500)); // 冻 rAF 的 headless 解码偏慢，等皮肤 PNG 就绪

const draw = `(function (setup) {
  var KB = window.__kickball, g = KB.game, CFG = KB.CFG;
  var cv = document.getElementById("game"), ctx = cv.getContext("2d");
  var view = { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},
    time:3,kickAnimDur:CFG.KICK_ANIM,kickCooldown:CFG.KICK_COOLDOWN,
    progress:KB.getProgress() };
  g.startLevel(0);
  setup(g);
  for (var i=0;i<4;i++) g.update(1/60);
  view.time = g.time + 3;
  KB.render.drawScene(ctx, g, view);
  return { state: g.enemy.state, skin: g.enemy.wave.skin };
})`;

// idle
console.log(await evalJs(draw + "(function(){})"));
await shot("skin-01-idle.png");

// telegraph（蓄力 0.45s/0.8s，鼓灯第二拍）
console.log(await evalJs(draw + "(function(g){ g.enemy.state='telegraph'; g.enemy.stateT=0.45; g.enemy.castDur=0.8; g.enemy.castKind='normal'; })"));
await shot("skin-02-telegraph.png");

// hurt（后仰）
console.log(await evalJs(draw + "(function(g){ g.enemy.state='hurt'; g.enemy.stateT=0.12; })"));
await shot("skin-03-hurt.png");

// stagger（星星 + wobble）
console.log(await evalJs(draw + "(function(g){ g.enemy.state='stagger'; g.enemy.stateT=1.0; })"));
await shot("skin-04-stagger.png");

// rise（深蹲起身）
console.log(await evalJs(draw + "(function(g){ g.enemy.state='rise'; g.enemy.stateT=0.25; })"));
await shot("skin-05-rise.png");

// dead（绕脚底后倒，0.55s 既倒得下又未淡出没）
console.log(await evalJs(draw + "(function(g){ g.enemy.state='dead'; g.enemy.stateT=0.55; })"));
await shot("skin-06-dead.png");

// 选关界面：第 1 关名「奶龙」
await evalJs(`(function(){
  var KB=window.__kickball, g=KB.game;
  g.startLevel(0); g.toSelect();
  var cv=document.getElementById("game"), ctx=cv.getContext("2d");
  KB.render.drawScene(ctx, g, { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:1,
    kickAnimDur:KB.CFG.KICK_ANIM,kickCooldown:KB.CFG.KICK_COOLDOWN,progress:KB.getProgress() });
})()`);
await shot("skin-07-select.png");

// 第 2 关对照：仍是火柴人
console.log(await evalJs(`(function(){
  var KB=window.__kickball, g=KB.game;
  g.startLevel(1);
  for (var i=0;i<4;i++) g.update(1/60);
  var cv=document.getElementById("game"), ctx=cv.getContext("2d");
  KB.render.drawScene(ctx, g, { w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:g.time+3,
    kickAnimDur:KB.CFG.KICK_ANIM,kickCooldown:KB.CFG.KICK_COOLDOWN,progress:KB.getProgress() });
  return { state:g.enemy.state, skin:g.enemy.wave.skin, name:g.enemy.name };
})()`));
await shot("skin-08-level2-stick.png");

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
