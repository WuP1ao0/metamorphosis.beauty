/* metamorphosis.beauty — vision.sys v0.4
 * 静态油画《The Accolade》+ YOLO 风格识别框覆盖层（温和版，无扫描线）
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
    { cx: 0.405, cy: 0.300, w: 0.100, h: 0.062, label: "face", conf: 0.98, color: "green" },     // 女王面部
    { cx: 0.525, cy: 0.550, w: 0.095, h: 0.065, label: "face", conf: 0.95, color: "cyan" },      // 骑士头部
    { cx: 0.748, cy: 0.315, w: 0.082, h: 0.062, label: "face", conf: 0.91, color: "yellow" },    // 白须老者
    { cx: 0.893, cy: 0.375, w: 0.075, h: 0.058, label: "face", conf: 0.87, color: "magenta" },   // 粉衣青年
    { cx: 0.958, cy: 0.322, w: 0.062, h: 0.058, label: "face", conf: 0.81, color: "red" }        // 右侧侧脸
  ];

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

  // 每个框的运行时状态：轻微抖动 / 置信度波动
  var state = TARGETS.map(function (t, i) {
    return {
      ox: 0, oy: 0, tox: 0, toy: 0,
      seed: i * 137.31,
      nextJitter: 0
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

      // ---- 轻微抖动：每 280~640ms 换一个抖动目标 ----
      if (now > st.nextJitter) {
        st.tox = (Math.random() - 0.5) * 4;
        st.toy = (Math.random() - 0.5) * 4;
        st.nextJitter = now + 280 + Math.random() * 360;
      }
      st.ox += (st.tox - st.ox) * 0.12;
      st.oy += (st.toy - st.oy) * 0.12;

      // 置信度轻微波动
      var conf = tg.conf + Math.sin(t * 0.9 + st.seed) * 0.012;

      var bx = rect.dx + (tg.cx - tg.w / 2) * rect.dw + st.ox;
      var by = rect.dy + (tg.cy - tg.h / 2) * rect.dh + st.oy;
      var bw = tg.w * rect.dw;
      var bh = tg.h * rect.dh;

      var alpha = 0.85;

      drawBox(bx, by, bw, bh, color, alpha);
      drawLabel(bx, by, tg.label + " " + conf.toFixed(2), color, alpha);

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

    // ---- HUD（移动端隐藏，避免拥挤）----
    if (W > 640) {
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
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
