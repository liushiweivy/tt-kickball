/*
 * 弹踢道场 · 抖音小游戏入口适配
 * 负责：画布/DPR 适配、触摸输入、固定 60Hz 步长、音效事件转发。
 * 内核（core.js）与渲染（render.js）均无平台依赖，可在 Node / 浏览器复用。
 * 平台适配面：getSystemInfoSync/getWindowInfo、createCanvas、onTouch*、onShow/onHide。
 */
var core = require("./core.js");
var renderMod = require("./render.js");
var audioMod = require("./audio.js");
var skillsMod = require("./skills.js");

var Game = core.Game;
var CFG = core.CFG;
var BUTTONS = renderMod.BUTTONS;

var game = new Game();
var audio = audioMod.createAudio();

// 平台对象：抖音 tt 优先，兼容微信 wx（浏览器 harness 会注入 tt shim）
var api = (typeof tt !== "undefined" && tt) || (typeof wx !== "undefined" && wx) || null;

/* ---------- 敌人位图皮肤（异步加载；未解码前 render 自动回退火柴人） ---------- */

function loadSkins() {
  if (!api.createImage) return;
  var list = {
    idle: "assets/img/nailong-idle.png",
    cast: "assets/img/nailong-cast.png",
    hurt: "assets/img/nailong-hurt.png",
    rise: "assets/img/nailong-rise.png",
  };
  var map = {};
  try {
    Object.keys(list).forEach(function (k) {
      var img = api.createImage();
      img.src = list[k];
      map[k] = img;
    });
    renderMod.registerSkin("nailong", map);
  } catch (e) { /* 皮肤失败不影响游戏：火柴人兜底 */ }
}
loadSkins();

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
  progress: null, // 选关界面读这份进度（recordClear 换引用时同步换）
};

/* ---------- 进度持久化（选关版：线性解锁 + 三星） ---------- */

var PROGRESS_KEY = "kickball_progress_v1";
var progress = loadProgress();
view.progress = progress;

/* ---------- 招式注入：由进度派生，通关后重算 ---------- */

function applySkills() {
  var list = skillsMod.unlockedFor(progress);
  game.setSkills(list);
  view.skills = list;
}
applySkills();

function loadProgress() {
  try {
    var raw = api.getStorageSync(PROGRESS_KEY);
    var p = typeof raw === "string" && raw ? JSON.parse(raw) : raw;
    if (p && typeof p === "object" && p.unlocked >= 1 && p.stars) return p;
  } catch (e) { /* 存档损坏则重来 */ }
  return core.emptyProgress();
}

function saveProgress() {
  try { api.setStorageSync(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* 静默 */ }
}

// 通关事件在帧循环排空时调用：记星 + 解锁下一关（同帧重复 victory 事件幂等）
function onVictory() {
  progress = core.recordClear(progress, game.waveIndex, core.starsFor(game));
  view.progress = progress;
  saveProgress();
  applySkills(); // 通关可能新悟招式，立刻注入
}

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
  // 瞬身踢按钮：仅解锁后参与命中
  if (view.skills && view.skills.indexOf("blinkKick") >= 0) {
    var bb = renderMod.BUTTON_BLINK;
    var bx = p.x - bb.x, by = p.y - bb.y;
    if (bx * bx + by * by <= bb.r * bb.r) return bb;
  }
  return null;
}

function flashButton(id) {
  view.pressed[id] = true;
  setTimeout(function () { view.pressed[id] = false; }, 110);
}

function hitZone(zones, p) {
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) return z;
  }
  return null;
}

function hitSelect(p) {
  var layout = renderMod.SELECT_LAYOUT;
  for (var i = 0; i < layout.length; i++) {
    var z = layout[i];
    var dx = p.x - z.x, dy = p.y - z.y;
    if (dx * dx + dy * dy <= z.r * z.r) return z;
  }
  return null;
}

// 非战斗界面的点按路由：标题→选关；选关→开已解锁的关/进招式谱；招式谱→返回；
// 败北→重打/选关（点空白=重打）；胜利→下一关/选关（点空白=重打本关）
function tapOverlay(p) {
  audio.unlock();
  if (game.mode === "title") { game.toSelect(); return; }
  if (game.mode === "select") {
    if (hitZone([renderMod.SKILL_ENTRY_ZONE], p)) { game.toSkills(); return; }
    var s = hitSelect(p);
    if (s && s.i < progress.unlocked) game.startLevel(s.i);
    return;
  }
  if (game.mode === "skills") {
    if (hitZone(renderMod.SKILLS_ZONES, p)) game.backFromSkills();
    return;
  }
  if (game.mode === "death") {
    var dz = hitZone(renderMod.DEATH_ZONES, p);
    if (dz && dz.id === "select") game.toSelect();
    else game.restart();
    return;
  }
  if (game.mode === "victory") {
    var vz = hitZone(renderMod.VICTORY_ZONES, p);
    if (vz && vz.id === "select") { game.toSelect(); return; }
    if (vz && vz.id === "next" && game.waveIndex + 1 < core.LEVELS.length) {
      game.startLevel(game.waveIndex + 1);
      return;
    }
    if (!vz) game.startLevel(game.waveIndex); // 点空白重打本关
  }
}

api.onTouchStart(function (e) {
  var touches = e.changedTouches || [];
  for (var i = 0; i < touches.length; i++) {
    var t = touches[i];
    if (game.mode !== "fight") {
      tapOverlay(toWorld(t));
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
    for (var i = 0; i < game.events.length; i++) {
      if (game.events[i] === "victory") onVictory();
      playEvent(game.events[i]);
    }
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
  globalThis.__kickball = {
    game: game, CFG: core.CFG, LEVELS: core.LEVELS, audio: audio,
    render: renderMod, // CDP/调试：直接调 drawScene 截帧
    getProgress: function () { return progress; },
  };
}
