/*
 * 弹踢道场 · 敌人位图皮肤（纯绘制，无 wx 依赖，可在 Node 直接 require）
 * 平台入口（main.js）异步把图片对象 registerSkin 进来；未注册或图片尚未
 * 解码（HTMLImage/wx Image 的 width=0）时 drawSkinFigure 返回 false，
 * render.js 回退火柴人——标题界面、弱网真机、Node 测试全部安全。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KickballSkins = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 皮肤配置：h=站姿逻辑像素高（敌人火柴人约 93px，奶龙略大略萌），
  // 宽度按各自裁后宽高比；sprites 把敌人状态机映到平台注入的图片键。
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
  };

  var skinImages = {};

  // imgMap：{idle, cast, hurt, rise} → 平台 Image 对象；重复注册即热替换
  function registerSkin(name, imgMap) {
    skinImages[name] = imgMap;
  }

  /*
   * 画一个皮肤敌人。锚点 (x, y)=脚底中心；调用方已套好：
   *   - 绕脚底的 rotate(ep.lean)（受伤后仰/踉跄 wobble/倒地）
   *   - globalAlpha（死亡淡出）
   * 本函数只负责选图 + 用 ep.pose 做绕脚底的蹲压/呼吸微浮。
   * 返回 true=已画；false=没皮肤/图没就绪，调用方画火柴人。
   */
  function drawSkinFigure(ctx, name, state, x, y, ep) {
    var conf = SKIN_CONF[name];
    var imgMap = skinImages[name];
    if (!conf || !imgMap) return false;
    var key = conf.sprites[state] || "idle";
    var img = imgMap[key] || imgMap.idle;
    if (!img || !img.width || !img.height) return false;

    var pose = (ep && ep.pose) || {};
    var crouch = pose.crouch || 0; // rise 深蹲最大 22，telegraph 鼓点小幅沉身
    var lift = pose.bodyLift || 0; // idle 呼吸 ±1px、受击小跳 3px
    // 绕脚底压扁（下限 0.72，rise 最深蹲 ≈0.84）；压短时横向略胖补偿
    var sy = Math.max(0.72, 1 - crouch / 140);
    var h = conf.h * sy;
    var w = (img.width / img.height) * conf.h * (1 + (1 - sy) * 0.45);
    var bottomY = y - lift;
    ctx.drawImage(img, x - w / 2, bottomY - h, w, h);
    return true;
  }

  return {
    SKIN_CONF: SKIN_CONF,
    registerSkin: registerSkin,
    drawSkinFigure: drawSkinFigure,
  };
});
