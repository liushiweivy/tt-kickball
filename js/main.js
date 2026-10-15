/*
 * 弹踢道场 · 抖音小游戏入口适配
 * 负责：画布/DPR 适配、触摸输入、固定 60Hz 步长、音效事件转发。
 * 内核（core.js）与渲染（render.js）均无平台依赖，可在 Node / 浏览器复用。
 * 平台适配面：getSystemInfoSync/getWindowInfo、createCanvas、onTouch*、onShow/onHide。
 */
var core = require("./core.js");
var renderMod = require("./render.js");
var audioMod = require("./audio.js");

var Game = core.Game;
var CFG = core.CFG;
var BUTTONS = renderMod.BUTTONS;

var game = new Game();
var audio = audioMod.createAudio();

// 平台对象：抖音 tt 优先，兼容微信 wx（浏览器 harness 会注入 tt shim）
var api = (typeof tt !== "undefined" && tt) || (typeof wx !== "undefined" && wx) || null;

// getWindowInfo 为新 API，旧基础库回退 getSystemInfoSync
var sysInfo = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync();
var dpr = sysInfo.pixelRatio || 1;
var vw = sysInfo.windowWidth;
var vh = sysInfo.windowHeight;

var canvas = api.createCanvas();
canvas.width = Math.round(vw * dpr);
canvas.height = Math.round(vh * dpr);
var ctx = canvas.getContext("2d");
ctx.scale(dpr, dpr); // 后续全部使用 CSS 像素坐标

// 450x800 逻辑世界等比缩放到屏幕，居中
var scale = Math.min(vw / renderMod.W, vh / renderMod.H);
var offX = (vw - renderMod.W * scale) / 2;
var offY = (vh - renderMod.H * scale) / 2;

var view = {
  w: vw, h: vh, scale: scale, offX: offX, offY: offY,
  pressed: {},
  time: 0,
  kickAnimDur: core.CFG.KICK_ANIM,
  kickCooldown: core.CFG.KICK_COOLDOWN,
};

/* ---------- 触摸 ---------- */

var heldTouches = {}; // identifier -> buttonId（左右移动键支持按住）

function toWorld(touch) {
  // 抖音文档只保证 screenX/screenY；浏览器与微信提供 clientX，做兜底
  var px = touch.clientX != null ? touch.clientX : touch.screenX;
  var py = touch.clientY != null ? touch.clientY : touch.screenY;
  return {
    x: (px - offX) / scale,
    y: (py - offY) / scale,
  };
}

function hitButton(p) {
  for (var i = 0; i < BUTTONS.length; i++) {
    var b = BUTTONS[i];
    var dx = p.x - b.x, dy = p.y - b.y;
    if (dx * dx + dy * dy <= b.r * b.r) return b;
  }
  return null;
}

function flashButton(id) {
  view.pressed[id] = true;
  setTimeout(function () { view.pressed[id] = false; }, 110);
}

function tapOverlay() {
  audio.unlock();
  if (game.mode === "title" || game.mode === "victory") game.start();
  else if (game.mode === "death") game.restart();
}

api.onTouchStart(function (e) {
  var touches = e.changedTouches || [];
  for (var i = 0; i < touches.length; i++) {
    var t = touches[i];
    if (game.mode !== "fight") {
      tapOverlay();
      return;
    }
    var b = hitButton(toWorld(t));
    if (!b) continue;
    if (b.kind === "held") {
      heldTouches[t.identifier] = b.id;
      view.pressed[b.id] = true;
      game.setHeld(b.id, true);
    } else {
      flashButton(b.id);
      game.press(b.id);
    }
  }
});

function releaseTouches(e) {
  var touches = e.changedTouches || [];
  for (var i = 0; i < touches.length; i++) {
    var key = touches[i].identifier;
    var id = heldTouches[key];
    if (id) {
      delete heldTouches[key];
      // 可能有另一根手指仍按着同键
      var still = false;
      for (var k in heldTouches) if (heldTouches[k] === id) still = true;
      if (!still) {
        view.pressed[id] = false;
        game.setHeld(id, false);
      }
    }
  }
}

function releaseAllHeld() {
  for (var id in view.pressed) view.pressed[id] = false;
  for (var k in heldTouches) {
    var bid = heldTouches[k];
    game.setHeld(bid, false);
  }
  heldTouches = {};
}

api.onTouchEnd(releaseTouches);
api.onTouchCancel(releaseTouches);

// 切后台/来电回来后丢弃累积时间，避免一帧连跳；并松开所有按住键
var last = Date.now();
api.onShow(function () { last = Date.now(); });
if (api.onHide) api.onHide(function () { releaseAllHeld(); last = Date.now(); });

/* ---------- 固定步长主循环 ---------- */

var STEP = 1 / 60;
var acc = 0;

// 真机音频节点若缺失/语义偏差，音效失败只静音，绝不能让异常逃出帧循环冻结游戏
function playEvent(ev) {
  try { audio.onEvent(ev); } catch (e) { /* 静默降级 */ }
}

function frame() {
  var now = Date.now();
  var dt = (now - last) / 1000;
  last = now;
  acc += Math.min(dt, 0.1);

  // update() 开帧会清空事件队列；触摸回调（按键音）和 start/restart（开场鼓）
  // 发生在两帧之间，步进前先排空一次，否则这些事件会被静默丢弃。
  // 播放后立刻清空：120Hz 屏可能连续两帧都不满足步进，不清会重复播音效。
  if (game.events.length) {
    for (var k = 0; k < game.events.length; k++) playEvent(game.events[k]);
    game.events.length = 0;
  }

  var guard = 0;
  while (acc >= STEP && guard < 5) {
    game.update(STEP);
    for (var i = 0; i < game.events.length; i++) playEvent(game.events[i]);
    acc -= STEP;
    guard++;
  }
  acc = Math.min(acc, STEP * 2); // 严重卡顿后不无限追赶
  view.time = game.time;
  renderMod.drawScene(ctx, game, view);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试 / 自动化钩子
if (typeof globalThis !== "undefined") {
  globalThis.__kickball = { game: game, CFG: core.CFG, WAVES: core.WAVES };
}
