/*
 * 弹踢道场 · 姿态曲线（纯函数，零 ctx / 零 core 写入）
 * 输入归一化时间 u（或游戏时间 t），输出 13 字段姿态对象；
 * stick() 按字段摆火柴人，战斗判定与数值全部留在 core.js。
 * 约定：一次性动作的 u=0/1 必须严格等于 DEFAULT_POSE（无缝接 idle）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.KickballPoses = factory(root.Kickball);
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var CFG = core.CFG;

  var DEFAULT_POSE = {
    lToe: -8, rToe: 8, lLift: 0, rLift: 0, lBend: 0, rBend: 0,
    lArmDX: -11, lArmDY: 16, rArmDX: 11, rArmDY: 16,
    crouch: 0, lean: 0, bodyLift: 0,
  };

  function seg(u, s, e) { return u <= s ? 0 : u >= e ? 1 : (u - s) / (e - s); }
  function smooth(x) { return x * x * (3 - 2 * x); }
  function cleanZero(v) { return Math.abs(v) < 1e-8 ? 0 : v; }

  function makePose() { return Object.assign({}, DEFAULT_POSE); }
  function cleanPose(p) {
    Object.keys(p).forEach(function (k) { p[k] = cleanZero(p[k]); });
    return p;
  }

  /* ---------- 闪身姿态曲线（纯表现：core 的位移/无敌帧判定零变化） ----------
     u = stateT / DASH_TIME（0..1），dir = -1|0|1（冲刺方向）。
     动作语言：起手前手向后下反甩抡圆、后手顺势后带、沉身（双脚仍钉地）→
     后腿蹬地、前腿抬起前跨 → 腾空错步（小跳弧、身体前倾），手臂走路式
     对角配合：对侧手随前腿向前上抬、前腿侧手向后下摆（不顺拐）→
     前脚跨大步落地、后脚收步、双手收回站姿。
     u=0 与 u=1 都严格等于默认站姿，无缝接 idle。
     dir=0：core 已保证无方向闪身随机选边，此分支仅作防御兜底（原地沉身顿步）。 */
  function dashPoseAt(u, dir) {
    var p = makePose();
    if (!dir) {
      // 兜底原地闪身：沉身顿步 + 双手下摆，左右严格对称、不横倾
      var c0 = Math.sin(Math.PI * Math.min(1, u / 0.82));
      p.crouch = 7 * c0;
      p.lArmDX = -11 - 5 * c0;
      p.rArmDX = 11 + 5 * c0;
      p.lArmDY = 16 + 6 * c0;
      p.rArmDY = 16 + 6 * c0;
      return cleanPose(p);
    }
    var d = dir > 0 ? 1 : -1;
    var f = d > 0 ? "r" : "l"; // 前脚（冲刺方向）
    var b = d > 0 ? "l" : "r"; // 后脚

    // 分段包络
    var wind = smooth(seg(u, 0, 0.1)) * (1 - smooth(seg(u, 0.1, 0.24)));  // 起手甩手
    var armFly = smooth(seg(u, 0.24, 0.46)) * (1 - smooth(seg(u, 0.74, 0.92))); // 腾空摆臂
    var tuckF = smooth(seg(u, 0.12, 0.28));  // 前腿抬起前跨
    var landF = smooth(seg(u, 0.6, 0.8));    // 前脚下踩
    var tuckB = smooth(seg(u, 0.16, 0.34));  // 后腿折叠
    var landB = smooth(seg(u, 0.68, 0.88));  // 后脚收步
    var settle = smooth(seg(u, 0.86, 1));    // 末段收脚回站姿
    var flyLean = smooth(seg(u, 0.16, 0.34)) * (1 - smooth(seg(u, 0.78, 0.96)));

    // 手（腕点峰值偏离默认站姿 ≤~23px，火柴人胳膊不拉橡筋）：
    // 起手 wind：前手从身前向后下反甩抡圆（+11 → -11），后手本就在身后、
    // 顺势小幅外带下沉；腾空 armFly：对侧手（后手）随前腿向前上抬到肩以上，
    // 前腿同侧手沉到后下方 —— 走路式对角摆臂，与前脚/后蹬腿配合，不顺拐。
    p[f + "ArmDX"] = 11 * d + wind * (-22 * d) + armFly * (-16 * d);
    p[f + "ArmDY"] = 16 + wind * 4 + armFly * 6;
    p[b + "ArmDX"] = -11 * d + wind * (-4 * d) + armFly * (22 * d);
    p[b + "ArmDY"] = 16 + wind * 2 + armFly * -20;

    // 前脚：蹬出抬起、前跨、下踩落地，末段收步
    p[f + "Toe"] = d * (8 + 14 * tuckF * (1 - settle));
    p[f + "Lift"] = 13 * tuckF * (1 - landF);
    p[f + "Bend"] = 0.5 * tuckF * (1 - landF);
    // 后脚：屈膝蹬地、折叠拖随、收步回位
    p[b + "Toe"] = -d * (8 + 4 * tuckB * (1 - landB));
    p[b + "Lift"] = 13 * tuckB * (1 - landB);
    p[b + "Bend"] = tuckB * (1 - landB);

    p.bodyLift = 10 * Math.sin(seg(u, 0.24, 0.72) * Math.PI); // 小跳弧
    p.crouch = 5 * wind;                                       // 起手沉身
    p.lean = d * (-0.12 * wind + 0.24 * flyLean);              // 先反扭后前倾

    return cleanPose(p);
  }

  /* ---------- 待机呼吸 / 行走错步 ----------
     moving=false：小幅呼吸起伏，双脚始终钉地；
     moving=true ：走步循环，两腿交替抬落 + 身体起伏 + 摆臂。 */
  function idlePoseAt(t, moving) {
    var p = makePose();
    if (!moving) {
      var b = Math.sin(t * 2.2);
      p.bodyLift = 1 + b * 0.9;
      p.lArmDY = 16 + b * 1.1;
      p.rArmDY = 16 + b * 1.1;
      return cleanPose(p);
    }
    var sw = Math.sin(t * 10.5);
    p.lLift = 8 * Math.max(0, sw);
    p.rLift = 8 * Math.max(0, -sw);
    p.lToe = -8 - 4.5 * sw;
    p.rToe = 8 - 4.5 * sw;
    p.lBend = 0.45 * Math.max(0, sw);
    p.rBend = 0.45 * Math.max(0, -sw);
    p.bodyLift = 1 + 2 * Math.abs(sw);
    p.lArmDX = -11 + 4 * sw;
    p.rArmDX = 11 + 4 * sw;
    return cleanPose(p);
  }

  /* ---------- 弹踢（u = 已播放比例 0..1）----------
     引膝沉身（0.05–0.2）→ 直腿朝天弹出 + 全身腾起（0.2–0.5）→ 收身落回（0.6–1）。
     球从上方来，踢腿向屏幕上方高抬。u=0/1 严格站姿。 */
  function kickPoseAt(u) {
    var p = makePose();
    if (u <= 0 || u >= 1) return p;
    // 时段对齐判定：完美窗口为按键后 0–0.2s（即 u 0–0.77），弹出峰值放在 u≈0.45
    var chamber = smooth(seg(u, 0.04, 0.16)) * (1 - smooth(seg(u, 0.28, 0.46)));
    var extend = smooth(seg(u, 0.2, 0.42)) * (1 - smooth(seg(u, 0.56, 0.78)));
    var jump = Math.sin(seg(u, 0.16, 0.74) * Math.PI);

    // 弹踢朝屏幕上方：折叠时提膝，弹出后脚尖高抬到脸侧（lift 相对地面，
    // 峰值髋部约 y-45、头 y-85，故 78 ≈ 脸高；水平外展按腿长 45 收到 22 避开躯干）
    p.rToe = 8 + 6 * chamber + 22 * extend;
    p.rLift = 14 * chamber + 78 * extend;
    p.rBend = 0.9 * chamber * (1 - 0.9 * extend);
    p.lToe = -8 - 4 * jump;                     // 支撑腿沉屈
    p.lBend = 0.4 * jump;
    p.lArmDX = -11 - 8 * extend;                // 对侧手向外张维持平衡（不与踢腿交叉）
    p.lArmDY = 16 + 6 * chamber - 4 * extend;
    p.rArmDX = 11 + 11 * chamber;               // 踢腿同侧手向后甩开
    p.rArmDY = 16 + 6 * chamber + 4 * extend;
    p.bodyLift = 11 * jump;
    p.crouch = 8 * chamber;
    return cleanPose(p);
  }

  /* ---------- 受击（u = stateT/HURT_PLAYER）：瞬间后仰甩手、小退跳，末段回站姿 ---------- */
  function hurtPoseAt(u) {
    var p = makePose();
    if (u >= 1) return p;
    var rec = 1 - smooth(seg(u, 0, 0.6));
    var hop = Math.sin(Math.min(1, u / 0.5) * Math.PI);
    p.lean = -0.28 * rec;
    p.lArmDX = -11 - 9 * rec;
    p.rArmDX = 11 + 9 * rec;
    p.lArmDY = 16 - 18 * rec;
    p.rArmDY = 16 - 18 * rec;
    p.bodyLift = 4 * hop * (1 - smooth(seg(u, 0.5, 1)));
    p.crouch = 3 * hop;
    return cleanPose(p);
  }

  /* ---------- 崩架势（u = stateT/BREAK_TIME）：塌身缩肩、摇晃，末段撑回 ---------- */
  function breakPoseAt(u) {
    var p = makePose();
    if (u <= 0 || u >= 1) return p;
    var slump = smooth(seg(u, 0, 0.22)) * (1 - smooth(seg(u, 0.82, 1)));
    p.crouch = 15 * slump;
    p.lean = Math.sin(u * 9) * 0.06 * slump;
    p.lArmDX = -11 - 7 * slump;
    p.rArmDX = 11 + 7 * slump;
    p.lArmDY = 16 + 11 * slump;
    p.rArmDY = 16 + 11 * slump;
    p.lToe = -8 - 3 * slump;
    p.rToe = 8 + 3 * slump;
    return cleanPose(p);
  }

  /* ---------- 狗熊哆嗦毛（连击大招，循环态 t = stateT，总长 total=5s）：
     高抬腿踏步 + 双臂不同频过头乱舞 + 连蹦带晃。首尾 0.18/0.25s 淡入淡出，
     t=0 与 t=total 严格 DEFAULT_POSE，进出大招都不跳帧。 ---------- */
  function flailPoseAt(t, total) {
    var p = makePose();
    var enter = smooth(Math.min(1, t / 0.18));
    var leave = t > total - 0.25 ? 1 - smooth((t - (total - 0.25)) / 0.25) : 1;
    var k = enter * leave;
    if (k <= 0) return p;

    var m = Math.sin(t * 11);              // 双腿高抬腿踏步
    var a1 = Math.sin(t * 8.5);            // 双臂不同频，故意不协调
    var a2 = Math.sin(t * 7.3 + 1.7);

    p.lLift = 22 * Math.max(0, m);
    p.rLift = 22 * Math.max(0, -m);
    p.lToe = -8 + 9 * m;
    p.rToe = 8 + 9 * m;
    p.lBend = 0.95 * Math.max(0, m);
    p.rBend = 0.95 * Math.max(0, -m);
    // dy 越小手越高：峰 16-30=-14 过肩，谷 +46 甩到腿外
    p.lArmDX = -11 - 14 * a1;
    p.rArmDX = 11 - 14 * a2;
    p.lArmDY = 16 - 30 * a1;
    p.rArmDY = 16 - 30 * a2;
    p.bodyLift = 3 + 6 * Math.abs(Math.sin(t * 5.5)); // 连蹦
    p.crouch = 6 + 3 * m;
    p.lean = 0.1 * Math.sin(t * 4.7);

    // 按 k 向默认站姿插值（淡入淡出），保证端点严格 DEFAULT_POSE
    Object.keys(DEFAULT_POSE).forEach(function (key) {
      p[key] = DEFAULT_POSE[key] + (p[key] - DEFAULT_POSE[key]) * k;
    });
    return cleanPose(p);
  }

  /* ---------- 敌人姿态机：返回 { pose, lean }，时间全部取自 e.stateT ---------- */
  function enemyPoseAt(e, time) {
    var pose = makePose();
    var lean = 0;
    if (e.state === "telegraph") {
      // 蓄力：双臂先外张后收拢到球侧，三拍鼓点每拍沉身一次
      // core 不变量 castDur ≥ 0.34；render 侧兜底防 0/0=NaN 导致整帧被 canvas 静默吞掉
      var cd = e.castDur || 0.34;
      var prog = Math.min(1, e.stateT / cd);
      var c = smooth(seg(prog, 0.05, 0.75));
      var wind = smooth(seg(prog, 0, 0.12)) * (1 - smooth(seg(prog, 0.12, 0.3)));
      var q = (e.stateT / (cd / 3)) % 1;
      var pulse = Math.sin(Math.min(1, q) * Math.PI);
      // 手随蓄力球走：起手下伸到腰间（dy≈24），再收拢托到胸前（dy=4）
      var earlyDY = 16 + 8 * wind;
      pose.lArmDX = -11 * (1 - c) + -5 * c + wind * -8;
      pose.rArmDX = 11 * (1 - c) + 5 * c + wind * 8;
      pose.lArmDY = earlyDY * (1 - c) + 4 * c;
      pose.rArmDY = earlyDY * (1 - c) + 4 * c;
      pose.crouch = 2.5 * pulse + 2 * c;
    } else if (e.state === "hurt") {
      var hu = Math.min(1, e.stateT / CFG.HURT_ENEMY);
      var rec = 1 - smooth(seg(hu, 0, 0.7));
      lean = -0.17 * rec;
      pose.lArmDX = -11 - 8 * rec;
      pose.rArmDX = 11 + 8 * rec;
      pose.lArmDY = 16 - 16 * rec;
      pose.rArmDY = 16 - 16 * rec;
      pose.bodyLift = 3 * Math.sin(hu * Math.PI);
    } else if (e.state === "stagger") {
      // 缩身 wobble；末 0.35s 向默认站姿插值，避免切 idle 单帧硬跳
      var k = 1;
      if (e.stateT > CFG.STAGGER_TIME - 0.35) {
        k = smooth(Math.max(0, (CFG.STAGGER_TIME - e.stateT) / 0.35));
      }
      lean = Math.sin(time * 14) * 0.1 * k;
      var wob = 0.5 + 0.5 * Math.sin(time * 9);
      pose.crouch = (10 + wob * 3) * k;
      pose.lArmDX = -11 * (1 - k) + -17 * k;
      pose.rArmDX = 11 * (1 - k) + 17 * k;
      pose.lArmDY = 16 * (1 - k) + 25 * k;
      pose.rArmDY = 16 * (1 - k) + 25 * k;
    } else if (e.state === "rise") {
      // 下一管血起身：深蹲 → 站直
      var ru = Math.min(1, e.stateT / CFG.RISE_TIME);
      var up = 1 - smooth(seg(ru, 0, 0.8));
      pose.crouch = 22 * up;
      pose.lArmDY = 22 * up + 16 * (1 - up);
      pose.rArmDY = 22 * up + 16 * (1 - up);
    } else if (e.state === "dead") {
      // 绕脚底向后倒（投影不随身体转，见 render.drawShadow）
      var du = Math.min(1, e.stateT / CFG.DEAD_HOLD);
      lean = -1.45 * smooth(seg(du, 0, 0.7));
      pose.lArmDX = -20;
      pose.rArmDX = 20;
      pose.lArmDY = 10;
      pose.rArmDY = 10;
    } else {
      // idle：大个子慢呼吸
      var b = Math.sin(time * 1.8);
      pose.bodyLift = 1 + b * 0.8;
      pose.lArmDY = 16 + b;
      pose.rArmDY = 16 + b;
    }
    return { pose: cleanPose(pose), lean: lean };
  }

  return {
    DEFAULT_POSE: DEFAULT_POSE,
    seg: seg, smooth: smooth, cleanZero: cleanZero,
    makePose: makePose, cleanPose: cleanPose,
    dashPoseAt: dashPoseAt,
    idlePoseAt: idlePoseAt,
    kickPoseAt: kickPoseAt,
    hurtPoseAt: hurtPoseAt,
    breakPoseAt: breakPoseAt,
    flailPoseAt: flailPoseAt,
    enemyPoseAt: enemyPoseAt,
  };
});
