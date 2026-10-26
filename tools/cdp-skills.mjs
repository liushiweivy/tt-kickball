/* CDP 截帧：四章原创角色 + 招式谱屏 + 手里剑/瞬身踢/指路灯。
   用法：node tools/cdp-skills.mjs  （需 9333 无头 Edge + 8821 服务） */
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
await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.requestAnimationFrame=()=>0;" });
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html" });
await new Promise((r) => setTimeout(r, 2500)); // 冻 rAF 下图片解码慢，等奶龙 PNG 就绪

// 注入满星存档 → 9 招全开，再手动重载
await evalJs(`(function(){
  var stars={}; for (var i=0;i<20;i++) stars[i]=3;
  localStorage.setItem('kickball_progress_v1', JSON.stringify({unlocked:20,stars}));
})()`);
await send("Page.navigate", { url: "http://127.0.0.1:8821/harness/index.html" });
await new Promise((r) => setTimeout(r, 2500));

const view = `var cv=document.getElementById("game"), ctx=cv.getContext("2d");
  var view={w:450,h:800,scale:1,offX:0,offY:0,pressed:{},time:3,
    kickAnimDur:KB.CFG.KICK_ANIM,kickCooldown:KB.CFG.KICK_COOLDOWN,
    progress:KB.getProgress(),skills:KB.game.skills};`;

// ① 选关页（四章角色名 + 招式谱入口）
await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
  g.startLevel(0); g.toSelect(); ${view}
  KB.render.drawScene(ctx,g,view); })()`);
await shot("sk-01-select.png");

// ② 招式谱屏（满星全解锁）
await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
  g.toSkills(); ${view}
  KB.render.drawScene(ctx,g,view); })()`);
await shot("sk-02-skills.png");

// ③–⑧ 四章角色：L1 咕嘎仔 / L5 咕嘎大王 / L10 大将 / L15 刀盾教头 / L16 奶龙 / L20 奶龙王
const levelShot = async (idx, name, setup) => {
  console.log(await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
    g.startLevel(${idx}); ${setup || ""}
    for (var i=0;i<4;i++) g.update(1/60);
    ${view} view.time=g.time+3;
    KB.render.drawScene(ctx,g,view);
    return {name:g.enemy.name, skin:g.enemy.wave.skin, state:g.enemy.state}; })()`));
  await shot(name);
};
await levelShot(0, "sk-03-l1-guga.png");
await levelShot(4, "sk-04-l5-guga-boss.png", "g.enemy.state='telegraph'; g.enemy.stateT=0.3; g.enemy.castDur=0.8; g.enemy.castKind='normal';");
await levelShot(9, "sk-05-l10-dajiang.png", "g.enemy.state='telegraph'; g.enemy.stateT=0.2; g.enemy.castDur=0.6; g.enemy.castKind='peril';");
await levelShot(14, "sk-06-l15-daodun.png", "g.enemy.state='telegraph'; g.enemy.stateT=0.2; g.enemy.castDur=0.6; g.enemy.castKind='curve';");
await levelShot(15, "sk-07-l16-nailong.png");
await levelShot(19, "sk-08-l20-nailong-boss.png");

// ⑨ 手里剑投射物（满星档按「石」）
await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
  g.startLevel(5); g.press("pebble");
  for (var i=0;i<20;i++) g.update(1/60); ${view} view.time=g.time;
  KB.render.drawScene(ctx,g,view); })()`);
await shot("sk-09-shuriken.png");

// ⑩ 瞬身踢冲刺帧（去程中点）
await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
  g.startLevel(17); g.player.x=120; g.press("blink");
  for (var i=0;i<7;i++) g.update(1/60); ${view} view.time=g.time;
  KB.render.drawScene(ctx,g,view); })()`);
await shot("sk-10-blink-dash.png");

// ⑪ 指路灯：危球下行落点圈（L7 危球学徒）
await evalJs(`(function(){ var KB=window.__kickball,g=KB.game;
  g.startLevel(6);
  g.balls.push({x:300,y:380,vx:0,vy:300,kind:"peril",dir:"down",dead:false,returned:false});
  g.balls.push({x:140,y:520,vx:0,vy:280,kind:"boomerang",dir:"down",dead:false,returned:false,passes:0});
  g.update(1/60); ${view} view.time=g.time;
  KB.render.drawScene(ctx,g,view); })()`);
await shot("sk-11-lamp.png");

ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
console.log("done");
