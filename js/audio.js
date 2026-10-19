/*
 * 弹踢道场 · WebAudio 合成音效（无音频文件）
 * 抖音小游戏用 tt.getAudioContext()（基础库 1.34.0+，W3C Web Audio 子集），
 * 微信小游戏用 wx.createWebAudioContext()，标准浏览器降级 AudioContext。
 * 注意：抖音 AudioContext 没有 BiquadFilter，低通在生成 PCM 时用一阶滤波烘焙。
 * 环境不可用时所有方法静默为空，不影响游戏。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KickballAudio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createAudio() {
    var actx = null;

    function ensure() {
      if (actx) {
        if (actx.state === "suspended") actx.resume();
        return actx;
      }
      try {
        if (typeof tt !== "undefined" && tt.getAudioContext) {
          actx = tt.getAudioContext(); // 抖音小游戏，单例
        } else if (typeof wx !== "undefined" && wx.createWebAudioContext) {
          actx = wx.createWebAudioContext();
        } else if (typeof globalThis !== "undefined" && globalThis.AudioContext) {
          actx = new globalThis.AudioContext();
        }
      } catch (e) { actx = null; }
      return actx;
    }

    function tone(freq, dur, opt) {
      var ac = ensure();
      if (!ac) return;
      opt = opt || {};
      var t0 = ac.currentTime + (opt.delay || 0);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = opt.type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (opt.freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.freq2), t0 + dur);
      var vol = opt.vol != null ? opt.vol : 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, opt) {
      var ac = ensure();
      if (!ac) return;
      opt = opt || {};
      var t0 = ac.currentTime + (opt.delay || 0);
      var n = Math.floor(ac.sampleRate * dur);
      var buf = ac.createBuffer(1, n, ac.sampleRate);
      var data = buf.getChannelData(0);
      // 一阶 RC 低通直接烘焙进 PCM（抖音 AudioContext 无 BiquadFilter）
      // 精确离散化：alpha = 1 - e^(-2π·fc/sr)，使 −3dB 点精确落在标称 fc
      var alpha = 1 - Math.exp(-2 * Math.PI * (opt.cutoff || 1200) / ac.sampleRate);
      var lp = 0;
      for (var i = 0; i < n; i++) {
        var white = Math.random() * 2 - 1;
        lp += alpha * (white - lp);
        data[i] = lp * (1 - i / n);
      }
      var src = ac.createBufferSource();
      src.buffer = buf;
      var gain = ac.createGain();
      gain.gain.setValueAtTime(opt.vol != null ? opt.vol : 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(gain).connect(ac.destination);
      src.start(t0);
    }

    var MELODY = [523, 587, 659, 784, 880]; // 胜利：宫调式上行

    function onEvent(ev) {
      switch (ev) {
        case "kick": tone(170, 0.07, { type: "triangle", vol: 0.12 }); break;
        case "perfectKick":
          tone(1240, 0.16, { type: "sine", vol: 0.2 });
          tone(1860, 0.12, { type: "sine", vol: 0.1, delay: 0.02 });
          break;
        case "lowKick": tone(210, 0.09, { type: "square", vol: 0.08 }); break;
        case "dash":
          // 破空「嗖」：高通感短噪声 + 下滑锯齿（原单音 0.07 太轻，几乎听不见）
          noise(0.2, { cutoff: 2400, vol: 0.14 });
          tone(660, 0.16, { type: "sawtooth", freq2: 130, vol: 0.05 });
          break;
        case "dashThrough":
          // 起步 whoosh 之后穿普通球：一记轻巧透气音，不与 whoosh 抢
          tone(1180, 0.1, { type: "sine", freq2: 1560, vol: 0.08 });
          break;
        case "perfectDash":
          // 球快到了才闪的完美判定：一记短促清亮风铃（危球时与 perilDash 叠加成和弦）
          tone(1980, 0.08, { type: "sine", freq2: 2640, vol: 0.1 });
          break;
        case "perilDash":
          // 穿过危球：起步 whoosh 之外补一记亮音（高风险高回报）
          tone(1560, 0.14, { type: "sine", vol: 0.16 });
          tone(2080, 0.12, { type: "sine", vol: 0.1, delay: 0.07 });
          break;
        case "drum": // 花鼓灯「隆·咚」：低鼓膜音 + 一记鼓皮噪声
          tone(150, 0.2, { type: "sine", freq2: 62, vol: 0.22 });
          noise(0.05, { cutoff: 380, vol: 0.12 });
          break;
        case "fire": // 第三拍「哐」：出球音本身落在鼓点上
          tone(680, 0.12, { type: "sine", freq2: 280, vol: 0.07 });
          tone(130, 0.18, { type: "sine", freq2: 58, vol: 0.16 });
          noise(0.06, { cutoff: 500, vol: 0.1 });
          break;
        case "peril":
        case "perilFire":
          tone(300, 0.1, { type: "square", vol: 0.1 });
          tone(300, 0.12, { type: "square", vol: 0.1, delay: 0.16 });
          break;
        case "hurt": noise(0.16, { cutoff: 700, vol: 0.22 }); tone(120, 0.16, { type: "sawtooth", vol: 0.12 }); break;
        case "perilHit": noise(0.3, { cutoff: 500, vol: 0.3 }); tone(90, 0.28, { type: "sawtooth", vol: 0.16 }); break;
        case "returnHit": tone(520, 0.16, { type: "triangle", vol: 0.18 }); noise(0.08, { cutoff: 3000, vol: 0.1 }); break;
        case "pebble": noise(0.05, { cutoff: 4200, vol: 0.09 }); tone(880, 0.06, { type: "square", vol: 0.08 }); break; // 甩石子：短促破空
        case "pebbleHit": tone(660, 0.07, { type: "triangle", vol: 0.09 }); break; // 蚊子腿：轻点小木鱼
        case "stagger":
          tone(1560, 0.1, { type: "sine", vol: 0.14 });
          tone(2080, 0.14, { type: "sine", vol: 0.12, delay: 0.08 });
          break;
        case "break":
          // 崩架势「哆嗦毛…」：六下低频哆嗦抖音 + 一记散噪声
          noise(0.25, { cutoff: 5000, vol: 0.15 });
          for (var bi = 0; bi < 6; bi++) {
            tone(bi % 2 ? 108 : 76, 0.05, { type: "square", vol: 0.07, delay: bi * 0.05 });
          }
          break;
        case "flail":
          // 狗熊哆嗦毛大招发功：八下交替滑稽抖音 + 散噪 + 一记上扬滑音
          noise(0.35, { cutoff: 1800, vol: 0.13 });
          for (var fi = 0; fi < 8; fi++) {
            tone(fi % 2 ? 196 : 155, 0.08, { type: "square", vol: 0.07, delay: fi * 0.09 });
          }
          tone(520, 0.5, { type: "sawtooth", freq2: 820, vol: 0.04, delay: 0.1 });
          break;
        case "flailBounce":
          // 手舞足蹈弹飞来球：一记轻巧上挑 boing
          tone(420, 0.09, { type: "sine", freq2: 720, vol: 0.12 });
          break;
        case "deathblow":
          tone(150, 0.5, { type: "triangle", freq2: 70, vol: 0.26 });
          noise(0.4, { cutoff: 900, vol: 0.22 });
          break;
        case "wave": tone(95, 0.34, { type: "sine", freq2: 60, vol: 0.24 }); break;
        case "victory":
          MELODY.forEach(function (f, i) { tone(f, 0.22, { type: "triangle", vol: 0.16, delay: i * 0.13 }); });
          break;
        case "death": tone(380, 0.7, { type: "sawtooth", freq2: 70, vol: 0.2 }); break;
        default: break;
      }
    }

    return { unlock: ensure, onEvent: onEvent };
  }

  return { createAudio: createAudio };
});
