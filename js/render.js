/*
 * 弹踢道场 · 表现层（纯绘制函数，无 wx 依赖）
 * 输入：2D context、Game 内核状态、view（屏幕映射 + 按键状态）
 * 所有游戏元素都画在 450x800 的逻辑世界内，由 main.js 负责缩放/偏移。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"), require("./poses.js"));
  else root.KickballRender = factory(root.Kickball, root.KickballPoses);
})(typeof self !== "undefined" ? self : this, function (core, poses) {
  "use strict";

  var telegraphBeat = core.telegraphBeat;
  var CFG = core.CFG;

  // 姿态曲线在 poses.js（纯函数、零 ctx），render 只负责画
  var dashPoseAt = poses.dashPoseAt;
  var idlePoseAt = poses.idlePoseAt;
  var kickPoseAt = poses.kickPoseAt;
  var hurtPoseAt = poses.hurtPoseAt;
  var breakPoseAt = poses.breakPoseAt;
  var flailPoseAt = poses.flailPoseAt;
  var enemyPoseAt = poses.enemyPoseAt;

  var W = 450;
  var H = 800;

  // 虚拟按键（逻辑坐标），main.js 用同一份布局做触摸命中
  var BUTTONS = [
    { id: "left", kind: "held", x: 66, y: 728, r: 38, label: "◀" },
    { id: "right", kind: "held", x: 150, y: 728, r: 38, label: "▶" },
    { id: "dash", kind: "tap", x: 298, y: 728, r: 42, label: "闪身" },
    { id: "kick", kind: "tap", x: 392, y: 728, r: 46, label: "踢" },
  ];

  var COL = {
    ink: "#e8ecf8",
    enemy: "#9aa4c7",
    enemyBoss: "#d0584a",
    ball: "#dfe8ff",
    peril: "#ff4d4d",
    gold: "#ffd45e",
    hp: "#e0473e",
    posture: "#e8a83c",
    dash: "#5fd0e0",
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawScene(ctx, g, view) {
    drawBackdrop(ctx, view);
    var sx = 0, sy = 0;
    if (g.shake > 0) {
      sx = (Math.random() - 0.5) * g.shake * 14;
      sy = (Math.random() - 0.5) * g.shake * 14;
    }
    ctx.save();
    ctx.translate(view.offX + sx, view.offY + sy);
    ctx.scale(view.scale, view.scale);

    drawPlatform(ctx);
    drawEnemy(ctx, g, view.time);
    for (var i = 0; i < g.balls.length; i++) drawBall(ctx, g.balls[i]);
    drawPlayer(ctx, g, view);
    drawFx(ctx, g);
    drawFloatTexts(ctx, g);
    drawHud(ctx, g);
    drawButtons(ctx, g, view.pressed, view.kickCooldown);
    if (g.banner) drawBanner(ctx, g.banner);
    if (g.mode !== "fight") drawOverlay(ctx, g);

    ctx.restore();
  }

  /* ---------- 背景（铺物理屏，避免留黑边） ---------- */

  function drawBackdrop(ctx, view) {
    var grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, "#070a1a");
    grad.addColorStop(0.55, "#121833");
    grad.addColorStop(1, "#1d2447");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    // 月亮（位置换算回物理坐标）
    var mx = view.offX + 348 * view.scale;
    var my = view.offY + 108 * view.scale;
    var mr = 44 * view.scale;
    var halo = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3.2);
    halo.addColorStop(0, "rgba(244,236,216,0.28)");
    halo.addColorStop(1, "rgba(244,236,216,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 3.4, my - mr * 3.4, mr * 6.8, mr * 6.8);
    ctx.fillStyle = "#f4ecd8";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlatform(ctx) {
    // 敌人脚下的城楼高台
    ctx.fillStyle = "#0a0e20";
    ctx.fillRect(0, 168, W, 26);
    ctx.fillStyle = "#070a16";
    for (var x = 12; x < W; x += 46) ctx.fillRect(x, 150, 18, 18);
    ctx.fillRect(0, 194, W, 4);
    // 玩家地面
    ctx.fillStyle = "#0d1228";
    ctx.fillRect(0, 700, W, 100);
    ctx.fillStyle = "#161d3d";
    ctx.fillRect(0, 700, W, 3);
  }

  /* ---------- 火柴人 ---------- */

  // 一条腿：髋 →（屈膝时）膝点朝脚尖方向顶出 → 脚尖
  function legPath(ctx, hx, hipY, toeX, toeY, bend, s) {
    ctx.moveTo(hx, hipY);
    if (bend > 0.08) {
      var dir = toeX === 0 ? 1 : toeX > 0 ? 1 : -1;
      var kx = hx + toeX * 0.42 + dir * bend * 5 * s;
      var ky = hipY + (toeY - hipY) * 0.52 + 2 * s;
      ctx.lineTo(kx, ky);
    }
    ctx.lineTo(hx + toeX, toeY);
  }

  function stick(ctx, x, y, opt) {
    // y = 脚底；正面小人，单位比例固定
    var s = opt.scale || 1;
    var c = opt.color || COL.ink;
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4 * s;

    // bodyLift=腾空整体上移；crouch=沉身（髋/肩/头下压，脚不动）
    // 投影由 drawShadow() 在旋转包裹之外另画，倒地时也钉在地面
    var bodyUp = (opt.bodyLift || 0) * s;
    var crouch = (opt.crouch || 0) * s;
    var hipY = y - 34 * s - bodyUp + crouch;
    var shoulderY = y - 58 * s - bodyUp + crouch;
    var headY = y - 74 * s - bodyUp + crouch;

    // 腿（姿态全部由 toe/lift/bend 字段驱动，缺省即旧站姿 ±8、零抬零屈）
    ctx.beginPath();
    legPath(ctx, x, hipY, (opt.lToe != null ? opt.lToe : -8) * s,
      y - (opt.lLift || 0) * s, opt.lBend || 0, s);
    legPath(ctx, x, hipY, (opt.rToe != null ? opt.rToe : 8) * s,
      y - (opt.rLift || 0) * s, opt.rBend || 0, s);
    ctx.stroke();

    // 躯干
    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo(x, shoulderY);
    ctx.stroke();

    // 手臂（手腕偏移相对肩点 shoulderY+4，缺省即旧站姿 ±11,+16）
    ctx.beginPath();
    var ldx = (opt.lArmDX != null ? opt.lArmDX : -11) * s;
    var ldy = (opt.lArmDY != null ? opt.lArmDY : 16) * s;
    var rdx = (opt.rArmDX != null ? opt.rArmDX : 11) * s;
    var rdy = (opt.rArmDY != null ? opt.rArmDY : 16) * s;
    ctx.moveTo(x, shoulderY + 4 * s);
    ctx.lineTo(x + ldx, shoulderY + 4 * s + ldy);
    ctx.moveTo(x, shoulderY + 4 * s);
    ctx.lineTo(x + rdx, shoulderY + 4 * s + rdy);
    ctx.stroke();

    // 头 + 头巾
    ctx.beginPath();
    ctx.arc(x, headY, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 9 * s, headY - 4 * s, 18 * s, 4 * s);
  }

  // 地面投影：必须在 lean 旋转包裹之外画，倒地/闪身时也钉在地面
  function drawShadow(ctx, x, y, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + 3 * s, 18 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function poseOpt(pose, color) {
    var o = { color: color };
    Object.keys(pose).forEach(function (k) { o[k] = pose[k]; });
    return o;
  }

  // 闪身中的小人：绕脚底按 lean 侧倾；glow=无敌帧青色微光
  function drawDashing(ctx, x, y, pose, color, glow) {
    ctx.save();
    drawShadow(ctx, x, y, 1); // 旋转前画，残影的 globalAlpha 自动生效
    if (glow) {
      ctx.shadowColor = COL.dash;
      ctx.shadowBlur = 16;
    }
    ctx.translate(x, y);
    ctx.rotate(pose.lean);
    ctx.translate(-x, -y);
    stick(ctx, x, y, poseOpt(pose, color));
    ctx.restore();
  }

  // 闪身扬尘：蹬地段（0.1–0.34）尘在身后，落地段（0.6–0.92）尘在脚前；
  // 纯表现、由 u 确定性推出，不向 core 写 fx。
  function drawDashDust(ctx, x, y, u, dir) {
    var phase, ox;
    if (u >= 0.08 && u < 0.36) { phase = (u - 0.08) / 0.28; ox = -(dir || 0); }
    else if (u >= 0.58 && u < 0.92) { phase = (u - 0.58) / 0.34; ox = dir || 0; }
    else return;
    ctx.save();
    ctx.fillStyle = "rgba(198,220,245,0.75)";
    for (var i = 0; i < 6; i++) {
      var side = i % 2 ? 1 : -1;
      var px = x + ox * (6 + i * 5 + phase * 12) + side * (3 + i * 1.5);
      var r = (2.5 + phase * 7) * (1 - i * 0.08);
      ctx.globalAlpha = 0.6 * (1 - phase * 0.55);
      ctx.beginPath();
      ctx.ellipse(px, y + 2, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(ctx, g, view) {
    var p = g.player;
    var x = p.x, y = 690;
    var color = COL.ink;
    if (p.state === "hurt") color = "#ff9b8e";
    if (p.state === "break") color = "#8a90a8";

    if (p.state === "dash") {
      var u = Math.min(1, p.stateT / CFG.DASH_TIME);
      var dir = p.dashDir;
      // 残影：位置在身后，姿态取稍早时刻（手先甩脚后蹬的节奏同样可见）
      for (var i = 1; i <= 2; i++) {
        ctx.globalAlpha = 0.18 / i;
        drawDashing(ctx, x - dir * 22 * i, y, dashPoseAt(Math.max(0, u - i * 0.05), dir), COL.dash, false);
      }
      ctx.globalAlpha = 1;
      drawDashing(ctx, x, y, dashPoseAt(u, dir), p.invuln > 0 ? COL.dash : color, p.invuln > 0);
      drawDashDust(ctx, x, y, u, dir); // 扬尘画在最上层，免被残影/身体盖住
      return;
    }

    var pose;
    if (p.state === "hurt") {
      pose = hurtPoseAt(Math.min(1, p.stateT / CFG.HURT_PLAYER));
    } else if (p.state === "break") {
      pose = breakPoseAt(Math.min(1, p.stateT / CFG.BREAK_TIME));
    } else if (p.state === "flail") {
      // 狗熊哆嗦毛：金色描边的手舞足蹈循环（投影照常，lean 随 pose）
      pose = flailPoseAt(p.stateT, CFG.FLAIL_TIME);
      drawShadow(ctx, x, y, 1);
      ctx.save();
      ctx.shadowColor = "#ff9a3c";
      ctx.shadowBlur = 18;
      ctx.translate(x, y);
      ctx.rotate(pose.lean || 0);
      ctx.translate(-x, -y);
      stick(ctx, x, y, poseOpt(pose, "#ffb85e"));
      ctx.restore();
      return;
    } else if (p.kickAnim > 0) {
      pose = kickPoseAt(1 - p.kickAnim / view.kickAnimDur);
    } else {
      var moving = !!(view.pressed && (view.pressed.left || view.pressed.right));
      pose = idlePoseAt(g.time, moving);
    }

    // 投影先画（不随后仰旋转）；绕脚底应用 lean（受击后仰 / 崩架势摇晃），
    // 无敌帧外加青色微光（保险分支：当前 core 只有闪身给无敌帧）
    drawShadow(ctx, x, y, 1);
    ctx.save();
    if (p.invuln > 0) {
      ctx.shadowColor = COL.dash;
      ctx.shadowBlur = 16;
    }
    ctx.translate(x, y);
    ctx.rotate(pose.lean || 0);
    ctx.translate(-x, -y);
    stick(ctx, x, y, poseOpt(pose, color));
    ctx.restore();
  }

  // 敌人蓄力表现：手中蓄力球 + 花鼓灯三点鼓灯（隆咚哐）+ 危球警告
  function drawTelegraph(ctx, e, x, y, time) {
    var castDur = e.castDur || 0.34; // core 保证 ≥0.34，render 侧兜底防 NaN
    var prog = Math.min(1, e.stateT / castDur);
    var peril = e.castKind === "peril";
    var col = peril ? COL.peril : COL.ball;
    // 蓄力球从腰间托起、随进度举到胸前（避免贴脸；末位置仍是旧的 y-56）
    var hx = x, hy = y - 30 - 26 * prog;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 + prog * 22;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55 + prog * 0.45;
    ctx.beginPath();
    ctx.arc(hx, hy, 5 + prog * 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    var lit = Math.min(3, telegraphBeat(e.stateT, castDur) + 1);
    var beatCol = peril ? COL.peril : COL.gold;
    for (var bi = 0; bi < 3; bi++) {
      ctx.beginPath();
      ctx.arc(hx - 22 + bi * 22, hy + 28, 4.5, 0, Math.PI * 2);
      if (bi < lit) {
        ctx.fillStyle = beatCol;
        ctx.shadowColor = beatCol;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (peril) {
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 16);
      ctx.strokeStyle = COL.peril;
      ctx.lineWidth = 3;
      rr(ctx, x - 26, y - 112, 52, 34, 6);
      ctx.stroke();
      ctx.fillStyle = COL.peril;
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("危", x, y - 95);
      ctx.restore();
    }
  }

  function drawEnemy(ctx, g, time) {
    var e = g.enemy;
    if (!e) return;
    var x = e.x, y = 168;
    var base = e.wave.hp.length > 1 ? COL.enemyBoss : COL.enemy;

    var ep = enemyPoseAt(e, time);
    var fade = e.state === "dead" ? Math.max(0, 1 - e.stateT) : 1;
    // 投影不随倒地旋转；死亡淡出时投影一起淡
    ctx.save();
    ctx.globalAlpha = fade;
    drawShadow(ctx, x, y, 1.12);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.rotate(ep.lean);
    ctx.translate(-x, -y);
    var enemyOpt = poseOpt(ep.pose, base);
    enemyOpt.scale = 1.12;
    stick(ctx, x, y, enemyOpt);
    ctx.restore();

    // 蓄力中的球（举在手上）+ 鼓点指示灯 + 危字警告
    if (e.state === "telegraph") drawTelegraph(ctx, e, x, y, time);

    // 踉跄 stars
    if (e.state === "stagger") {
      ctx.fillStyle = COL.gold;
      for (var s = 0; s < 3; s++) {
        var a = time * 3 + (s * Math.PI * 2) / 3;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 24, y - 100 + Math.sin(a) * 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 球 ---------- */

  function drawBall(ctx, b) {
    var col = b.kind === "peril" ? COL.peril : b.returned ? COL.gold : COL.ball;
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    // 拖尾（沿速度反方向）
    for (var i = 3; i >= 1; i--) {
      var t = (i * 7) / speed;
      ctx.globalAlpha = 0.12 * (4 - i);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(b.x - b.vx * t, b.y - b.vy * t, 10 - i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = b.returned ? 22 : 14;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(b.x - 3, b.y - 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 特效 ---------- */

  function drawFx(ctx, g) {
    for (var i = 0; i < g.fx.length; i++) {
      var f = g.fx[i];
      var k = f.t / f.life;
      if (f.kind === "spark") {
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === "ring") {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 8 + k * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 招式名飘字 ---------- */

  function drawFloatTexts(ctx, g) {
    for (var i = 0; i < g.floatTexts.length; i++) {
      var t = g.floatTexts[i];
      var k = t.t / t.life;
      var pop = t.t < 0.12 ? 0.7 + (t.t / 0.12) * 0.3 : 1; // 出场轻微放大
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      ctx.font = "bold " + t.size + "px KaiTi, STKaiti, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(8,10,24,0.75)";
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
  }

  /* ---------- HUD ---------- */

  function bar(ctx, x, y, w, h, ratio, color, bg) {
    ctx.fillStyle = bg || "rgba(0,0,0,0.45)";
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.save();
      rr(ctx, x, y, Math.max(h, w * ratio), h, h / 2);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  }

  function drawHud(ctx, g) {
    var e = g.enemy, p = g.player;
    if (!e) return; // 标题画面尚未生成敌人
    ctx.textAlign = "center";

    // 敌人
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 15px sans-serif";
    ctx.fillText(e.name + (e.nodes > 1 ? "  ×" + e.nodes : ""), W / 2, 26);
    var totalW = 260;
    // 多管血：分段
    var seg = e.wave.hp.length;
    for (var i = 0; i < seg; i++) {
      var sw = (totalW - (seg - 1) * 6) / seg;
      var sx = W / 2 - totalW / 2 + i * (sw + 6);
      var ratio = i < e.nodeIndex ? 0 : i === e.nodeIndex ? e.hp / e.maxHp : 1;
      bar(ctx, sx, 34, sw, 9, ratio, COL.hp);
    }
    bar(ctx, W / 2 - totalW / 2, 47, totalW, 5, e.posture / 100, COL.posture, "rgba(0,0,0,0.35)");
    if (e.state === "stagger") {
      ctx.fillStyle = COL.gold;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("破架势 · 快踢回金球忍杀！", W / 2, 68);
    }

    // 玩家（底部，按钮上方）
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "12px sans-serif";
    ctx.fillText("体", 24, 612);
    bar(ctx, 42, 602, 190, 10, p.hp / 100, COL.hp);
    bar(ctx, 42, 616, 190, 6, p.posture / 100, COL.posture, "rgba(0,0,0,0.35)");

    // 统计
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "12px sans-serif";
    ctx.fillText("完美踢 " + g.stats.perfectKicks, W - 20, 608);
    ctx.fillStyle = "rgba(167,236,255,0.75)";
    ctx.fillText("完美闪身 " + g.stats.perfectDashes, W - 20, 626);
  }

  /* ---------- 虚拟按键 ---------- */

  function drawButtons(ctx, g, pressed, kickCooldown) {
    var p = g.player;
    for (var i = 0; i < BUTTONS.length; i++) {
      var b = BUTTONS[i];
      var on = pressed[b.id];
      var accent = b.id === "kick" ? COL.gold : b.id === "dash" ? COL.dash : "#aeb8da";

      ctx.save();
      ctx.globalAlpha = on ? 0.85 : 0.5;
      ctx.fillStyle = on ? accent : "rgba(18,24,51,0.7)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 踢冷却扇形
      if (b.id === "kick" && p.kickCd > 0) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + (p.kickCd / kickCooldown) * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = on && b.kind === "held" ? "#10162e" : accent;
      ctx.font = b.label.length > 1 ? "600 19px sans-serif" : "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x, b.y + 1);
    }
  }

  /* ---------- Banner / 覆盖层 ---------- */

  function drawBanner(ctx, bn) {
    var k = bn.t < 0.3 ? bn.t / 0.3 : bn.tmax - bn.t < 0.3 ? (bn.tmax - bn.t) / 0.3 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, k));
    ctx.textAlign = "center";
    ctx.fillStyle = bn.peril ? COL.peril : "#f4ecd8";
    ctx.font = "bold 52px sans-serif";
    ctx.shadowColor = bn.peril ? COL.peril : "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 18;
    ctx.fillText(bn.main, W / 2, 350);
    if (bn.sub) {
      ctx.shadowBlur = 0;
      ctx.font = "600 18px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(bn.sub, W / 2, 388);
    }
    ctx.restore();
  }

  function overlay(ctx, alpha) {
    ctx.fillStyle = "rgba(6,9,22," + alpha + ")";
    ctx.fillRect(0, 0, W, H);
  }

  // 战功称号（花鼓灯梗）：无伤 = 王嘉尔口误「伞森步」；残血 = 鼓架子再练
  function victoryRank(hp) {
    if (hp >= 100) return "称号 ·「伞森步 · 身法大成」";
    if (hp >= 60) return "称号 ·「浪子踢球 · 名手」";
    return "称号 ·「鼓架子还得再练」";
  }

  function drawOverlay(ctx, g) {
    ctx.textAlign = "center";
    if (g.mode === "title") {
      overlay(ctx, 0.72);
      ctx.fillStyle = "#f4ecd8";
      ctx.font = "bold 44px sans-serif";
      ctx.fillText("影狼 · 弹踢道场", W / 2, 292);
      ctx.font = "14px KaiTi, STKaiti, serif";
      ctx.fillStyle = "rgba(127,228,239,0.85)";
      ctx.fillText("—— 花鼓灯身法：闪身步 × 浪子踢球 ——", W / 2, 324);
      ctx.font = "17px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText("白球 ·「浪子踢球」贴身一瞬，金球反弹打敌", W / 2, 366);
      ctx.fillText("红球「危」· 踢不得，「闪身步」左右侧撤避过", W / 2, 396);
      ctx.fillText("左下移动对齐，打穿三阵 · 赤甲两管血", W / 2, 426);
      ctx.fillStyle = "rgba(255,168,75,0.9)";
      ctx.fillText("三连浪子踢球/三连完美闪身→狗熊哆嗦毛·5s全弹回", W / 2, 456);
      ctx.fillStyle = COL.gold;
      ctx.font = "600 22px sans-serif";
      var blink = 0.55 + 0.45 * Math.sin((g.time || 0) * 5);
      ctx.globalAlpha = blink;
      ctx.fillText("点击屏幕 开 战", W / 2, 500);
      ctx.globalAlpha = 1;
    } else if (g.mode === "death") {
      overlay(ctx, 0.6);
      ctx.fillStyle = COL.peril;
      ctx.font = "bold 96px sans-serif";
      ctx.shadowColor = COL.peril;
      ctx.shadowBlur = 26;
      ctx.fillText("死", W / 2, 380);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,180,160,0.9)";
      ctx.font = "16px KaiTi, STKaiti, serif";
      ctx.fillText("鼓点没踩上，再听一遍「隆咚哐」", W / 2, 424);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "600 20px sans-serif";
      ctx.fillText("点击屏幕 重开本阵", W / 2, 460);
    } else if (g.mode === "victory") {
      overlay(ctx, 0.68);
      ctx.fillStyle = COL.gold;
      ctx.font = "bold 48px sans-serif";
      ctx.shadowColor = COL.gold;
      ctx.shadowBlur = 22;
      ctx.fillText("战 功", W / 2, 280);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "18px sans-serif";
      ctx.fillText("通关用时 " + g.stats.clearT.toFixed(1) + " 秒", W / 2, 344);
      ctx.fillText("完美反弹 " + g.stats.perfectKicks + " 次", W / 2, 374);
      ctx.fillText("完美闪身 " + g.stats.perfectDashes + " 次", W / 2, 404);
      ctx.fillText("闪身穿球 " + g.stats.dashThroughs + " 次", W / 2, 434);
      // 称号（花鼓灯梗）：无伤 = 王嘉尔口误「伞森步」；残血 = 鼓架子再练
      var title2 = victoryRank(g.player.hp);
      ctx.fillStyle = COL.gold;
      ctx.font = "600 19px KaiTi, STKaiti, serif";
      ctx.fillText(title2, W / 2, 474);
      ctx.font = "600 20px sans-serif";
      ctx.fillText("点击屏幕 再战", W / 2, 516);
    }
  }

  return {
    W: W, H: H, BUTTONS: BUTTONS,
    drawScene: drawScene,
    dashPoseAt: dashPoseAt,
    idlePoseAt: idlePoseAt,
    kickPoseAt: kickPoseAt,
    hurtPoseAt: hurtPoseAt,
    breakPoseAt: breakPoseAt,
    flailPoseAt: flailPoseAt,
    enemyPoseAt: enemyPoseAt,
  };
});
