/*
 * 弹踢道场 · WebAudio 合成音效 + 大招真录音采样（assets/snd/flail.mp3）
 * 抖音小游戏用 tt.getAudioContext()（基础库 1.34.0+，W3C Web Audio 子集），
 * 微信小游戏用 wx.createWebAudioContext()，标准浏览器降级 AudioContext。
 * 采样播放：真机走 tt/wx.createInnerAudioContext()（src 路径），
 * 浏览器走 fetch→decodeAudioData→BufferSource；任何一环失败静默回退合成鼓点。
 * 注意：抖音 AudioContext 没有 BiquadFilter，低通在生成 PCM 时用一阶滤波烘焙。
 * 环境不可用时所有方法静默为空，不影响游戏。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KickballAudio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 大招真录音：源视频片名即「狗熊哆嗦毛」，前 2.85s 人声锣鼓经
  var FLAIL_SAMPLE_URL = "assets/snd/flail.mp3";
  var FLAIL_SAMPLE_VOL = 0.9;

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

    /* ---- 大招采样：真机 InnerAudioContext（与 WebAudio 单例并存） ---- */
    var innerHost =
      (typeof tt !== "undefined" && tt.createInnerAudioContext) ? tt :
      (typeof wx !== "undefined" && wx.createInnerAudioContext) ? wx : null;
    var inner = null;        // 复用的单个 InnerAudioContext
    var innerFailed = false; // onError 后永久放弃采样
    var innerStarted = false;

    function warmInner() {
      if (inner || innerFailed) return;
      try {
        inner = innerHost.createInnerAudioContext();
        inner.src = FLAIL_SAMPLE_URL;
        inner.volume = FLAIL_SAMPLE_VOL;
        inner.obeyMuteSwitch = false; // iOS 物理静音开关也不能压住大招
        inner.onError(function () {
          innerFailed = true;
          // 已在大招时刻才报错（首播也可能）：立刻补合成鼓点，别让这发大招哑火
          if (innerStarted) synthFlail();
        });
      } catch (e) { inner = null; innerFailed = true; }
    }

    /* ---- 大招采样：浏览器 AudioBuffer 预热 ---- */
    var sampleBuf = null;    // null=未就绪
    var webState = "";       // "" | "loading" | "ready" | "failed"
    var samplePromise = null;

    function warmWeb(ac) {
      if (webState || typeof fetch !== "function" || !ac || !ac.decodeAudioData) return;
      webState = "loading";
      // 包内相对路径（小游戏式托管）在先；harness 页面挂在 /harness/ 下，再试根路径
      var urls = [FLAIL_SAMPLE_URL, "/" + FLAIL_SAMPLE_URL];
      function attempt(i) {
        if (i >= urls.length) return Promise.reject(new Error("flail sample not found"));
        return fetch(urls[i])
          .then(function (r) {
            if (!r.ok) throw new Error("http " + r.status);
            return r.arrayBuffer();
          })
          .then(function (ab) { return ac.decodeAudioData(ab); })
          .catch(function () { return attempt(i + 1); });
      }
      var p = attempt(0).then(function (buf) {
        if (!buf) throw new Error("empty flail sample");
        sampleBuf = buf;
        webState = "ready";
        return buf;
      });
      samplePromise = p;
      p.catch(function () { sampleBuf = null; webState = "failed"; });
    }

    function startBufSource(ac, buf) {
      var src = ac.createBufferSource();
      var g = ac.createGain();
      g.gain.value = FLAIL_SAMPLE_VOL;
      src.buffer = buf;
      src.connect(g);
      g.connect(ac.destination);
      src.start(0);
    }

    // 播大招采样；返回 true=采样已承接（含预热中的延迟播放），false=请走合成回退
    function playFlailSample() {
      if (innerHost) {
        if (innerFailed) return false;
        warmInner();
        if (!inner) return false;
        try {
          // 连开大招：重头播。stop() 自身即归零播放位置（tt/wx 文档均保证），
          // 不再 seek(0)——停止态 seek 在部分 iOS 机型会误触发 onError 把采样永久降级
          if (innerStarted) inner.stop();
          inner.play();
          innerStarted = true;
          return true;
        } catch (e) { innerFailed = true; return false; }
      }
      var ac = ensure();
      if (!ac) return false;
      if (webState === "ready" && sampleBuf) {
        startBufSource(ac, sampleBuf);
        return true;
      }
      if (webState === "loading" && samplePromise) {
        // 首次解锁后极短时间内就开大招：等解码完再响；解码失败则补合成
        samplePromise.then(
          function (buf) { if (actx && buf) startBufSource(actx, buf); },
          function () { synthFlail(); }
        );
        return true;
      }
      return false;
    }

    function unlock() {
      var ac = ensure();
      if (innerHost) warmInner();
      else if (ac) warmWeb(ac);
      return ac;
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

    // 花鼓灯低鼓「隆」（强拍）/「咚」（soft 弱拍，略高略轻）：膜音下滑 + 鼓皮噪
    function gu(delay, soft) {
      var d = delay || 0;
      tone(soft ? 185 : 150, 0.2, { type: "sine", freq2: soft ? 78 : 62, vol: soft ? 0.14 : 0.22, delay: d });
      noise(0.05, { cutoff: 380, vol: soft ? 0.08 : 0.12, delay: d });
    }

    // 花鼓灯大锣「哐」：金属高音 + 低频体量 + 爆点噪
    function kuang(delay) {
      var d = delay || 0;
      tone(680, 0.12, { type: "sine", freq2: 280, vol: 0.07, delay: d });
      tone(130, 0.18, { type: "sine", freq2: 58, vol: 0.16, delay: d });
      noise(0.06, { cutoff: 500, vol: 0.1, delay: d });
    }

    // 大招鼓点拍间隔（三拍一组「隆·咚·哐」=0.51s）
    var FLAIL_BEAT = 0.17;

    // 采样不可用时的合成回退：花鼓灯「隆·咚·哐」鼓点循环铺满 5s（CFG.FLAIL_TIME）。
    // 拍 0.17s、一组 0.51s，10 组最后一记哐在 4.93s，尾音自然收在 5s 外。
    function synthFlail() {
      var GROUPS = 10;
      for (var fi = 0; fi < GROUPS; fi++) {
        var g0 = fi * FLAIL_BEAT * 3;
        gu(g0, false);                   // 隆（强）
        gu(g0 + FLAIL_BEAT, true);       // 咚（弱）
        kuang(g0 + FLAIL_BEAT * 2);      // 哐
      }
    }

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
          gu(0, false);
          break;
        case "fire": // 第三拍「哐」：出球音本身落在鼓点上
          kuang(0);
          break;
        case "peril":
        case "perilFire":
          tone(300, 0.1, { type: "square", vol: 0.1 });
          tone(300, 0.12, { type: "square", vol: 0.1, delay: 0.16 });
          break;
        case "curveFire": // 弧线球：一声上挑柳哨（球路要弯了）
          tone(720, 0.14, { type: "sine", freq2: 1180, vol: 0.12 });
          break;
        case "splitFire": // 分裂球出膛：闷一点的鼓（戏在过半场那一炸）
          tone(240, 0.12, { type: "triangle", freq2: 130, vol: 0.14 });
          break;
        case "splitPop": // 裂帛：一记脆裂 + 双点散响
          noise(0.1, { cutoff: 3600, vol: 0.16 });
          tone(980, 0.07, { type: "triangle", vol: 0.1 });
          tone(1240, 0.07, { type: "triangle", vol: 0.09, delay: 0.05 });
          break;
        case "heavyFire": // 重球：低频滚雷，慢而压场
          tone(110, 0.3, { type: "sine", freq2: 55, vol: 0.2 });
          noise(0.12, { cutoff: 320, vol: 0.1 });
          break;
        case "boomerangFire": // 回旋危球出膛：警示双音（比红危球略柔）
          tone(380, 0.1, { type: "square", vol: 0.09 });
          tone(380, 0.12, { type: "square", vol: 0.09, delay: 0.14 });
          break;
        case "boomerangTurn": // 过线掉头：滑音「回马枪」
          tone(880, 0.18, { type: "sawtooth", freq2: 340, vol: 0.1 });
          break;
        case "boomerangDive": // 折返俯冲：上滑警示
          tone(340, 0.14, { type: "sawtooth", freq2: 760, vol: 0.09 });
          break;
        case "hurt": noise(0.16, { cutoff: 700, vol: 0.22 }); tone(120, 0.16, { type: "sawtooth", vol: 0.12 }); break;
        case "perilHit": noise(0.3, { cutoff: 500, vol: 0.3 }); tone(90, 0.28, { type: "sawtooth", vol: 0.16 }); break;
        case "returnHit": tone(520, 0.16, { type: "triangle", vol: 0.18 }); noise(0.08, { cutoff: 3000, vol: 0.1 }); break;
        case "pebble": noise(0.05, { cutoff: 4200, vol: 0.09 }); tone(880, 0.06, { type: "square", vol: 0.08 }); break; // 甩石子：短促破空
        case "pebbleHit": tone(660, 0.07, { type: "triangle", vol: 0.09 }); break; // 蚊子腿：轻点小木鱼
        case "pebbleBlock":
          // 半空击落来球：石击脆响（高频噪 + 下滑三角），危球时与 peril 提示叠加
          noise(0.08, { cutoff: 5200, vol: 0.14 });
          tone(1320, 0.09, { type: "triangle", freq2: 760, vol: 0.13 });
          break;
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
          // 狗熊哆嗦毛大招：优先播真录音采样，解码/文件失败静默回退合成鼓点
          if (!playFlailSample()) synthFlail();
          break;
        case "flailBounce":
          // 手舞足蹈弹飞来球：一记轻巧上挑 boing
          tone(420, 0.09, { type: "sine", freq2: 720, vol: 0.12 });
          break;
        case "deathblow":
          tone(150, 0.5, { type: "triangle", freq2: 70, vol: 0.26 });
          noise(0.4, { cutoff: 900, vol: 0.22 });
          break;
        /* ---- 招式系统 ---- */
        case "bell":
          // 金钟罩：一记沉钟（低频正弦长衰减 + 高频泛音点）
          tone(98, 0.8, { type: "sine", freq2: 60, vol: 0.24 });
          tone(784, 0.3, { type: "sine", vol: 0.08, delay: 0.01 });
          break;
        case "revive":
          // 不倒翁续命：两记上挑木鱼，晃而不倒
          tone(660, 0.1, { type: "triangle", vol: 0.16 });
          tone(880, 0.14, { type: "triangle", vol: 0.14, delay: 0.11 });
          break;
        case "blink":
          // 瞬身踢起步：比闪身更急的破空（上扫锯齿 + 高频噪）
          noise(0.14, { cutoff: 3600, vol: 0.12 });
          tone(520, 0.13, { type: "sawtooth", freq2: 1240, vol: 0.07 });
          break;
        case "blinkHit":
          // 瞬身踢命中：闷掌 + 脆响（区别于 returnHit 的金球反弹）
          tone(240, 0.12, { type: "triangle", freq2: 110, vol: 0.2 });
          noise(0.07, { cutoff: 3400, vol: 0.12 });
          break;
        case "splashKick":
          // 梨花摆溅射：轻巧双点（副球被带飞）
          tone(980, 0.08, { type: "sine", freq2: 1320, vol: 0.1 });
          break;
        case "splashHit":
          tone(760, 0.09, { type: "triangle", vol: 0.1 });
          break;
        case "wave": tone(95, 0.34, { type: "sine", freq2: 60, vol: 0.24 }); break;
        case "victory":
          MELODY.forEach(function (f, i) { tone(f, 0.22, { type: "triangle", vol: 0.16, delay: i * 0.13 }); });
          break;
        case "death": tone(380, 0.7, { type: "sawtooth", freq2: 70, vol: 0.2 }); break;
        default: break;
      }
    }

    return { unlock: unlock, onEvent: onEvent };
  }

  return { createAudio: createAudio };
});
