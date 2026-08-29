/* metamorphosis.beauty — vision.sys v0.3 (glitched)
 * 静态油画《The Accolade》+ 崩坏版 YOLO 识别框覆盖层
 * 框坐标为归一化图像坐标（相对原图），由 cover-fit 换算到屏幕。
 */
(function () {
  "use strict";

  var canvas = document.getElementById("vision");
  var ctx = canvas.getContext("2d");

  var IMG_SRC = "assets/bg.jpg";
  var FOCUS = { x: 0.5, y: 0.42 }; // 与 CSS background-position 保持一致

  var COLORS = {
    green: "#00ff88",
    cyan: "#28d7ff",
    yellow: "#ffd400",
    magenta: "#ff4dff",
    red: "#ff3355"
  };

  // 识别目标：归一化坐标 (cx, cy, w, h) + 标签 + 基准置信度
  var TARGETS = [
    { cx: 0.335, cy: 0.545, w: 0.420, h: 0.630, label: "person", conf: 0.97, color: "green" },   // 女王全身
    { cx: 0.550, cy: 0.750, w: 0.400, h: 0.480, label: "person", conf: 0.94, color: "cyan" },    // 骑士全身
    { cx: 0.405, cy: 0.300, w: 0.100, h: 0.062, label: "face", conf: 0.98, color: "green" },     // 女王面部
    { cx: 0.525, cy: 0.550, w: 0.095, h: 0.065, label: "face", conf: 0.95, color: "cyan" },      // 骑士头部
    { cx: 0.748, cy: 0.315, w: 0.082, h: 0.062, label: "face", conf: 0.91, color: "yellow" },    // 白须老者
    { cx: 0.893, cy: 0.375, w: 0.075, h: 0.058, label: "face", conf: 0.87, color: "magenta" },   // 粉衣青年
    { cx: 0.958, cy: 0.322, w: 0.062, h: 0.058, label: "face", conf: 0.81, color: "red" }        // 右侧侧脸
  ];

  var GLITCH_CHARS = "0123456789ABCDEF#$%&@!?/\\_";

  var img = new Image();
  var imgReady = false;
  img.onload = function () { imgReady = true; };
  img.src = IMG_SRC;

  var W = 0, H = 0, DPR = 1;
  var mouse = { x: -9999, y: -9999 };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // 每个框的运行时状态：高频抖动 / 置信度波动 / 崩坏(glitch)状态
  var state = TARGETS.map(function (t, i) {
    return {
      ox: 0, oy: 0, tox: 0, toy: 0,
      seed: i * 137.31,
      nextJitter: 0,
      glitchUntil: 0,     // 崩坏结束时间
      nextGlitch: performance.now() + 800 + Math.random() * 3000
    };
  });

  // cover-fit：返回图像在视口中的显示矩形
  function coverRect() {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(W / iw, H / ih);
    var dw = iw * scale, dh = ih * scale;
    var dx = (W - dw) * FOCUS.x;
    var dy = (H - dh) * FOCUS.y;
    return { dx: dx, dy: dy, dw: dw, dh: dh };
  }

  function drawBox(x, y, w, h, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // 细框
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeRect(x, y, w, h);
    // 角标
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    var L = Math.min(14, w * 0.22, h * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
    ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
    ctx.moveTo(x, y + h - L); ctx.lineTo(x, y + h); ctx.lineTo(x + L, y + h);
    ctx.moveTo(x + w - L, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - L);
    ctx.stroke();
    ctx.restore();
  }

  function drawLabel(x, y, text, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
    var pad = 5;
    var tw = ctx.measureText(text).width;
    var lh = 17;
    var ly = y - lh - 3;
    if (ly < 2) ly = y + 3;
    ctx.fillStyle = color;
    ctx.fillRect(x, ly, tw + pad * 2, lh);
    ctx.fillStyle = "#05060a";
    ctx.fillText(text, x + pad, ly + 12.5);
    ctx.restore();
  }

  function corrupt(text) {
    // 随机替换部分字符，制造乱码标签
    var out = "";
    for (var i = 0; i < text.length; i++) {
      out += Math.random() < 0.35
        ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        : text[i];
    }
    return out;
  }

  var lastTime = performance.now();
  var fps = 60;

  function frame(now) {
    var dt = Math.min(now - lastTime, 100);
    lastTime = now;
    fps += (1000 / Math.max(dt, 1) - fps) * 0.05;

    ctx.clearRect(0, 0, W, H);
    if (!imgReady) { requestAnimationFrame(frame); return; }

    var rect = coverRect();
    var t = now / 1000;

    for (var i = 0; i < TARGETS.length; i++) {
      var tg = TARGETS[i];
      var st = state[i];
      var color = COLORS[tg.color];

      // ---- 崩坏触发：随机进入 glitch 状态（150~450ms）----
      if (now > st.nextGlitch) {
        st.glitchUntil = now + 150 + Math.random() * 300;
        st.nextGlitch = now + 1200 + Math.random() * 4500;
      }
      var glitching = now < st.glitchUntil;

      // ---- 高频抖动：每 70~160ms 换一个抖动目标，幅度更大 ----
      if (now > st.nextJitter) {
        var amp = glitching ? 14 : 7;
        st.tox = (Math.random() - 0.5) * 2 * amp;
        st.toy = (Math.random() - 0.5) * 2 * amp;
        st.nextJitter = now + 70 + Math.random() * 90;
      }
      // 快速趋近（glitch 时几乎瞬移）
      var lerp = glitching ? 0.55 : 0.28;
      st.ox += (st.tox - st.ox) * lerp;
      st.oy += (st.toy - st.oy) * lerp;

      // glitch 时偶发整体瞬移
      if (glitching && Math.random() < 0.25) {
        st.ox += (Math.random() - 0.5) * 26;
        st.oy += (Math.random() - 0.5) * 18;
      }

      // 置信度快速波动 + glitch 时乱跳
      var conf = tg.conf + Math.sin(t * 3.2 + st.seed) * 0.02;
      if (glitching) conf = Math.max(0.05, conf + (Math.random() - 0.5) * 0.4);

      var bx = rect.dx + (tg.cx - tg.w / 2) * rect.dw + st.ox;
      var by = rect.dy + (tg.cy - tg.h / 2) * rect.dh + st.oy;
      var bw = tg.w * rect.dw;
      var bh = tg.h * rect.dh;

      // glitch 时偶发闪烁（整帧消失）
      if (glitching && Math.random() < 0.12) continue;

      var alpha = glitching ? 0.55 + Math.random() * 0.45 : 0.85;

      // ---- RGB 撕裂：glitch 时用红/青偏移各描一遍 ----
      if (glitching) {
        var split = 3 + Math.random() * 5;
        drawBox(bx - split, by, bw, bh, "#ff0044", 0.45);
        drawBox(bx + split, by + (Math.random() - 0.5) * 4, bw, bh, "#00e5ff", 0.45);
      }

      drawBox(bx, by, bw, bh, color, alpha);

      // 标签：glitch 时乱码 + 位置抖动
      var text = tg.label + " " + conf.toFixed(2);
      if (glitching) text = corrupt(text);
      drawLabel(
        bx + (glitching ? (Math.random() - 0.5) * 8 : 0),
        by,
        text,
        color,
        alpha
      );

      // 框中心小十字
      ctx.save();
      ctx.globalAlpha = 0.5 * alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      var ccx = bx + bw / 2, ccy = by + bh / 2, cr = 4;
      ctx.beginPath();
      ctx.moveTo(ccx - cr, ccy); ctx.lineTo(ccx + cr, ccy);
      ctx.moveTo(ccx, ccy - cr); ctx.lineTo(ccx, ccy + cr);
      ctx.stroke();
      ctx.restore();
    }

    // ---- 鼠标准星 ----
    if (mouse.x > -999) {
      ctx.save();
      ctx.strokeStyle = "rgba(232,230,223,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, mouse.y); ctx.lineTo(W, mouse.y);
      ctx.moveTo(mouse.x, 0); ctx.lineTo(mouse.x, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "10px 'JetBrains Mono', Consolas, monospace";
      ctx.fillStyle = "rgba(232,230,223,0.6)";
      ctx.fillText("acquiring…", mouse.x + 10, mouse.y - 8);
      ctx.restore();
    }

    // ---- HUD ----
    ctx.save();
    ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
    ctx.fillStyle = "rgba(0,255,136,0.75)";
    var hud = "SRC accolade_1901.jpg | MODEL yolov8n-face | OBJ " + TARGETS.length + " | FPS " + Math.round(fps);
    ctx.fillText(hud, 16, H - 16);

    // REC 闪烁
    if (Math.floor(t * 1.4) % 2 === 0) {
      ctx.fillStyle = "#ff3355";
      ctx.beginPath();
      ctx.arc(W - 60, 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(232,230,223,0.7)";
    ctx.fillText("REC", W - 48, 28);
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
