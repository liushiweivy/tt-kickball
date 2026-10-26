/*
 * 弹踢道场 · 招式谱（纯数据 + 纯函数，无 wx/DOM 依赖）
 * 成长系统：通关章节自动解锁招式。解锁判定全部从现有 progress
 * （{unlocked, stars}，存档 key kickball_progress_v1）派生，不加存档字段、旧档兼容。
 * 条件两类：
 *   { type: "reach", n }    = progress.unlocked >= n（打到第 n 关门口）
 *   { type: "clear", idx }  = progress.stars[idx] >= 1（通关第 idx+1 关）
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KickballSkills = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SKILL_DEFS = [
    {
      id: "doubleDash", name: "连闪步", icon: "连", chapter: "第一章",
      cond: { type: "reach", n: 2 },
      desc: "闪身途中可再按一次闪身，续冲一段并续 0.2s 无敌",
    },
    {
      id: "lanyue", name: "揽月式", icon: "揽", chapter: "第一章",
      cond: { type: "clear", idx: 4 },
      desc: "完美踢判定窗 0.20s → 0.28s，金球更好摘",
    },
    {
      id: "shuriken", name: "手里剑", icon: "剑", chapter: "第二章",
      cond: { type: "reach", n: 6 },
      desc: "飞蝗石淬成手里剑：冷却 10s→7s、更快更疼，命中涨敌架势",
    },
    {
      id: "lamp", name: "指路灯", icon: "灯", chapter: "第二章",
      cond: { type: "clear", idx: 9 },
      desc: "危球落地前画落点虚圈，轨迹一眼看穿",
    },
    {
      id: "lihua", name: "梨花摆", icon: "梨", chapter: "第三章",
      cond: { type: "reach", n: 11 },
      desc: "完美踢顺带把身边最近一颗来球一起弹回（半伤）",
    },
    {
      id: "bell", name: "金钟罩", icon: "罩", chapter: "第三章",
      cond: { type: "clear", idx: 14 },
      desc: "每关首次架势满不崩体：架势清零并短暂无敌",
    },
    {
      id: "guluo", name: "锣鼓催", icon: "鼓", chapter: "第四章",
      cond: { type: "reach", n: 16 },
      desc: "狗熊哆嗦毛 2 连完美即触发（原需 3 连）",
    },
    {
      id: "blinkKick", name: "瞬身踢", icon: "瞬", chapter: "第四章",
      cond: { type: "reach", n: 18 },
      desc: "新按钮「瞬」：闪现到敌人面前踢一脚再回来（12s 冷却）",
    },
    {
      id: "revive", name: "不倒翁", icon: "翁", chapter: "通关奖励",
      cond: { type: "clear", idx: 19 },
      desc: "每关首次致命伤留 1 血并短暂无敌，宗师不倒",
    },
  ];

  function totalStars(progress) {
    var total = 0;
    var stars = (progress && progress.stars) || {};
    for (var k in stars) total += stars[k] || 0;
    return total;
  }

  function isUnlocked(def, progress) {
    if (!progress) return false;
    var c = def.cond;
    if (c.type === "reach") return (progress.unlocked || 1) >= c.n;
    return ((progress.stars || {})[c.idx] || 0) >= 1;
  }

  // 返回已解锁招式 id 数组（顺序=名册顺序）；不改原对象
  function unlockedFor(progress) {
    var out = [];
    for (var i = 0; i < SKILL_DEFS.length; i++) {
      if (isUnlocked(SKILL_DEFS[i], progress)) out.push(SKILL_DEFS[i].id);
    }
    return out;
  }

  // 解锁条件的人类可读文案（招式谱未解锁卡片用）
  function condText(def) {
    var c = def.cond;
    if (c.type === "reach") return "打到第 " + c.n + " 关解锁";
    return "通关第 " + (c.idx + 1) + " 关解锁";
  }

  return {
    SKILL_DEFS: SKILL_DEFS,
    totalStars: totalStars,
    isUnlocked: isUnlocked,
    unlockedFor: unlockedFor,
    condText: condText,
  };
});
