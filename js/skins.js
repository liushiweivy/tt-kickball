/*
 * 弹踢道场 · 敌人皮肤层（纯绘制，无 wx 依赖，可在 Node 直接 require）
 * 两类皮肤：
 *   位图（奶龙）：平台入口（main.js）异步把图片对象 registerSkin 进来；
 *     未注册或图片尚未解码（width=0）时返回 false，render 回退火柴人。
 *   矢量（咕嘎/大将/刀盾）：vskins.js 的 Canvas 路径绘制函数，永远就绪。
 * drawSkinFigure(ctx, name, state, x, y, ep, opts)：
 *   opts.scale 乘身高（一章咕嘎仔 0.85 → 守关 1.18 的梯度）；opts.tint="boss"
 *   给矢量角色加守关配饰，给奶龙位图加金色小王冠（奶龙王）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./vskins.js"));
  else root.KickballSkins = factory(root.KickballVskins);
})(typeof self !== "undefined" ? self : this, function (vskins) {
  "use strict";

  // 皮肤配置：h=站姿逻辑像素高（敌人火柴人约 93px，皮肤角色略大略萌）。
  // 位图条目 sprites 把敌人状态机映到平台注入的图片键；矢量条目 draw 即画。
  var SKIN_CONF = {
    nailong: {
      h: 118,
      sprites: {
        idle: "idle",        // 正面站
        telegraph: "cast",   // 抬手蓄力（蓄力球/鼓灯仍由 render 叠画）
        hurt: "hurt",        // 跑动姿，受击后仰靠 render 的 lean
        stagger: "hurt",     // 踉跄共用，左右 wobble 靠 lean
        rise: "rise",        // 深蹲起身
        dead: "idle",        // 绕脚底后倒靠 render 的 lean（-1.45rad）
      },
    },
    guga: { h: 108, draw: vskins.guga },
    dajiang: { h: 118, draw: vskins.dajiang },
    daodun: { h: 112, draw: vskins.daodun },
  };

  var skinImages = {};

  // imgMap：{idle, cast, hurt, rise} → 平台 Image 对象；重复注册即热替换
  function registerSkin(name, imgMap) {
    skinImages[name] = imgMap;
  }

  // 奶龙王：头顶金色小王冠（锯齿三角冠 + 顶珠），纯路径无素材
  function drawCrown(ctx, x, topY) {
    ctx.fillStyle = "#ffd45e";
    ctx.beginPath();
    ctx.moveTo(x - 13, topY + 7);
    ctx.lineTo(x - 13, topY - 2);
    ctx.lineTo(x - 8, topY + 3);
    ctx.lineTo(x - 4, topY - 4);
    ctx.lineTo(x, topY + 2);
    ctx.lineTo(x + 4, topY - 4);
    ctx.lineTo(x + 8, topY + 3);
    ctx.lineTo(x + 13, topY - 2);
    ctx.lineTo(x + 13, topY + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ff8a5e";
    ctx.beginPath();
    ctx.arc(x, topY + 3, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  /*
   * 画一个皮肤敌人。锚点 (x, y)=脚底中心；调用方已套好：
   *   - 绕脚底的 rotate(ep.lean)（受伤后仰/踉跄 wobble/倒地）
   *   - globalAlpha（死亡淡出）
   * 本函数只负责选图/选矢量 + 用 ep.pose 做绕脚底的蹲压/呼吸微浮。
   * 返回 true=已画；false=没皮肤/位图没就绪，调用方画火柴人。
   */
  function drawSkinFigure(ctx, name, state, x, y, ep, opts) {
    var conf = SKIN_CONF[name];
    if (!conf) return false;
    var scale = (opts && opts.scale) || 1;
    var tint = (opts && opts.tint) || "";
    var pose = (ep && ep.pose) || {};
    var crouch = pose.crouch || 0; // rise 深蹲最大 22，telegraph 鼓点小幅沉身
    var lift = pose.bodyLift || 0; // idle 呼吸 ±1px、受击小跳 3px
    // 绕脚底压扁（下限 0.72，rise 最深蹲 ≈0.84）；压短时横向略胖补偿
    var sy = Math.max(0.72, 1 - crouch / 140);
    var bottomY = y - lift;

    if (conf.draw) {
      // 矢量皮肤：永远就绪；蹲压/胖补偿用变换实现，角色函数按站姿身高画
      ctx.save();
      ctx.translate(x, bottomY);
      ctx.scale(scale * (1 + (1 - sy) * 0.45), scale * sy);
      conf.draw(ctx, state, tint);
      ctx.restore();
      return true;
    }

    var imgMap = skinImages[name];
    if (!imgMap) return false;
    var key = conf.sprites[state] || "idle";
    var img = imgMap[key] || imgMap.idle;
    if (!img || !img.width || !img.height) return false;

    var h = conf.h * scale * sy;
    var w = (img.width / img.height) * conf.h * scale * (1 + (1 - sy) * 0.45);
    ctx.drawImage(img, x - w / 2, bottomY - h, w, h);
    if (tint === "boss") drawCrown(ctx, x, bottomY - h - 4);
    return true;
  }

  return {
    SKIN_CONF: SKIN_CONF,
    registerSkin: registerSkin,
    drawSkinFigure: drawSkinFigure,
  };
});
