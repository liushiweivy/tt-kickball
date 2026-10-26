/*
 * 弹踢道场 · 原创矢量角色（纯 Canvas 路径绘制，零素材零版权）
 * 三个章节角色：咕嘎（圆滚呆鸟）/ 大将（玄甲武人）/ 刀盾（斗笠刀盾兵）。
 * 约定：本地坐标锚点 (0,0)=脚底中心，向上为负 y，站姿高约 112 逻辑像素。
 * 每个绘制函数签名 draw(ctx, state, tint)：
 *   state = 敌人状态机 idle|telegraph|hurt|stagger|rise|dead（后四者由
 *           skins.js 外层的 lean/crouch/淡出负责，函数内按 idle 近似画即可，
 *           telegraph 举臂/举械是唯一的姿态分支）
 *   tint  = "boss"（守关战）| "" —— 只加识别性配饰，不改轮廓
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KickballVskins = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function circle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function poly(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- 咕嘎：圆滚滚呆鸟（一章） ---------- */
  function guga(ctx, state, tint) {
    var boss = tint === "boss";
    var raise = state === "telegraph";
    var cream = "#fdf3e3", creamD = "#e8d8bc", beak = "#f5a83c";

    // 脚（桔黄小蹼）
    ellipse(ctx, -11, -3, 9, 4, beak);
    ellipse(ctx, 11, -3, 9, 4, beak);
    // 尾巴小尖
    poly(ctx, [26, -30, 40, -22, 26, -18], creamD);
    // 圆身
    ellipse(ctx, 0, -52, 31, 35, cream);
    // 肚皮浅斑
    ellipse(ctx, 0, -44, 20, 20, "#fffaf0");
    // 翅膀（telegraph=右翅高举托球位；平时贴身）
    ctx.save();
    ctx.translate(0, -56);
    ctx.rotate(raise ? -1.9 : -0.25);
    ellipse(ctx, 27, 2, 9, 17, creamD);
    ctx.restore();
    ellipse(ctx, -28, -54, 8, 16, creamD);
    // 腮红
    ellipse(ctx, -15, -60, 6, 3.6, "rgba(240,130,110,0.55)");
    ellipse(ctx, 15, -60, 6, 3.6, "rgba(240,130,110,0.55)");
    // 眼睛（守关=倒八眉凶一点）
    circle(ctx, -10, -70, 3.2, "#232838");
    circle(ctx, 10, -70, 3.2, "#232838");
    if (boss) {
      ctx.strokeStyle = "#232838";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-15, -80); ctx.lineTo(-6, -76);
      ctx.moveTo(15, -80); ctx.lineTo(6, -76);
      ctx.stroke();
    }
    // 扁嘴（正面小鸭嘴）
    poly(ctx, [0, -66, -7, -60, 0, -57, 7, -60], beak);
    // 呆毛（头顶一根卷）
    ctx.strokeStyle = creamD;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -86);
    ctx.quadraticCurveTo(3, -100, -5, -103);
    ctx.stroke();
    circle(ctx, -5, -103, 2.6, creamD);
    // 守关配饰：红头带
    if (boss) {
      ctx.fillStyle = "#c84a3e";
      ctx.fillRect(-24, -86, 48, 8);
      poly(ctx, [20, -80, 34, -70, 27, -80], "#c84a3e");
    }
  }

  /* ---------- 大将：玄甲武人（二章） ---------- */
  function dajiang(ctx, state, tint) {
    var boss = tint === "boss";
    var raise = state === "telegraph";
    var armor = "#39415c", armorD = "#262c42", trim = boss ? "#e8b84a" : "#8a94b8";

    // 长戟（右手侧；telegraph 举高——蓄力球在戟尖旁）
    ctx.save();
    ctx.translate(26, -60);
    ctx.rotate(raise ? -0.5 : -0.06);
    ctx.strokeStyle = "#5a4632";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 56); ctx.lineTo(0, -58);
    ctx.stroke();
    // 戟刃（月牙 + 尖）
    poly(ctx, [0, -72, 5, -56, 0, -60, -5, -56], "#c8d2e8");
    ctx.fillStyle = "#c8d2e8";
    ctx.beginPath();
    ctx.arc(7, -58, 7, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.restore();

    // 战裙（下摆甲叶）
    poly(ctx, [-18, -44, 18, -44, 24, -6, -24, -6], armorD);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.6;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12 - 4, -40); ctx.lineTo(i * 12 - 7, -10);
      ctx.stroke();
    }
    // 脚
    ellipse(ctx, -10, -3, 9, 4, "#1a1f33");
    ellipse(ctx, 10, -3, 9, 4, "#1a1f33");
    // 胸甲（梯形甲身 + 护心镜）
    poly(ctx, [-17, -88, 17, -88, 20, -46, -20, -46], armor);
    circle(ctx, 0, -66, 7, trim);
    circle(ctx, 0, -66, 3.4, armorD);
    // 披膊（肩甲，两层圆拱）
    ellipse(ctx, -21, -84, 11, 9, armorD);
    ellipse(ctx, 21, -84, 11, 9, armorD);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-30, -82); ctx.quadraticCurveTo(-21, -76, -12, -82);
    ctx.moveTo(12, -82); ctx.quadraticCurveTo(21, -76, 30, -82);
    ctx.stroke();
    // 脸（盔下窄条，横线眼 = 肃穆）
    ctx.fillStyle = "#d8b490";
    ctx.fillRect(-9, -100, 18, 10);
    ctx.strokeStyle = "#232838";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -95); ctx.lineTo(-2, -95);
    ctx.moveTo(2, -95); ctx.lineTo(7, -95);
    ctx.stroke();
    // 红缨头盔：盔体 + 护颊 + 冲天长缨
    ctx.fillStyle = armorD;
    ctx.beginPath();
    ctx.arc(0, -101, 13, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-13, -101, 26, 4);
    ellipse(ctx, -12, -94, 3.4, 8, armorD);
    ellipse(ctx, 12, -94, 3.4, 8, armorD);
    // 盔顶红缨（守关更盛）
    var plume = boss ? "#e8564a" : "#c84a3e";
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(0, -112);
    ctx.quadraticCurveTo(boss ? 16 : 11, -122, boss ? 12 : 8, -134);
    ctx.quadraticCurveTo(4, -124, -3, -113);
    ctx.closePath();
    ctx.fill();
    circle(ctx, 0, -113, 3, trim);
  }

  /* ---------- 刀盾兵：斗笠 + 圆盾 + 环首刀（三章） ---------- */
  function daodun(ctx, state, tint) {
    var boss = tint === "boss";
    var raise = state === "telegraph";
    var robe = "#2f4a48", robeD = "#22372f", straw = "#c8a55a";

    // 脚
    ellipse(ctx, -9, -3, 8, 4, "#1a1f26");
    ellipse(ctx, 9, -3, 8, 4, "#1a1f26");
    // 袍身（直筒略摆）
    poly(ctx, [-15, -82, 15, -82, 20, -8, -20, -8], robe);
    // 腰带
    ctx.fillStyle = robeD;
    ctx.fillRect(-16, -48, 32, 6);
    // 左臂圆盾（盾面朝前：木盘 + 铜钉 + 盾鼻）
    circle(ctx, -24, -52, 20, "#6b4e2e");
    circle(ctx, -24, -52, 16, "#7d5c38");
    circle(ctx, -24, -52, 5.5, boss ? "#e8b84a" : "#b8b2a0");
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.arc(-24, -52, 20, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    // 右手环首刀（telegraph 举过肩）
    ctx.save();
    ctx.translate(22, -44);
    ctx.rotate(raise ? -2.4 : 0.5);
    // 刀身（微弯单刃）
    ctx.fillStyle = "#c8d2e8";
    ctx.beginPath();
    ctx.moveTo(-2.4, 0);
    ctx.quadraticCurveTo(-4.5, -22, 1, -44);
    ctx.lineTo(5.5, -41);
    ctx.quadraticCurveTo(1.5, -20, 2.4, 0);
    ctx.closePath();
    ctx.fill();
    // 柄 + 环首
    ctx.strokeStyle = "#3a2c1c";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.strokeStyle = boss ? "#e8b84a" : "#8a94b8";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 13, 4.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 脸（斗笠阴影下窄条）
    ctx.fillStyle = "#d8b490";
    ctx.fillRect(-8, -88, 16, 9);
    ctx.fillStyle = "#232838";
    ctx.fillRect(-6, -85, 4, 2.4);
    ctx.fillRect(2, -85, 4, 2.4);
    // 斗笠（宽檐圆锥；守关加红缨结）
    poly(ctx, [0, -112, -30, -86, 30, -86], straw);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-30, -86); ctx.lineTo(30, -86);
    ctx.moveTo(0, -112); ctx.lineTo(-14, -88);
    ctx.moveTo(0, -112); ctx.lineTo(14, -88);
    ctx.stroke();
    if (boss) {
      circle(ctx, 0, -112, 4.4, "#c84a3e");
      poly(ctx, [0, -108, 7, -98, -2, -100], "#c84a3e");
    }
  }

  return { guga: guga, dajiang: dajiang, daodun: daodun };
});
