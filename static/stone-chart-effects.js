/*
 * STONE CHART FX (presentation only).
 * Light halo overlay drawn from the exact Lightweight Charts series coordinates.
 * Does not create prices, signals, series, orders or intercept chart interaction.
 */
(() => {
  "use strict";
  let instance = null;
  const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : {matches:false};
  const PALETTE = [
    {r:74,g:227,b:255}, // EMA20 cyan
    {r:255,g:176,b:85}, // EMA50 amber
    {r:190,g:133,b:255} // EMA200 violet
  ];
  let animationTimer = null;

  function enabled() {
    return !!instance && document.body.classList.contains("theme-stone")
      && !document.hidden && !reducedMotion.matches;
  }
  function rgba(color, opacity) {
    return "rgba(" + color.r + "," + color.g + "," + color.b + "," + opacity.toFixed(3) + ")";
  }
  function prepareSize(state) {
    const rect = state.host.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width < 20 || height < 20) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    if (state.canvas.width !== pw || state.canvas.height !== ph) {
      state.canvas.width = pw;
      state.canvas.height = ph;
    }
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.width = width;
    state.height = height;
    return true;
  }
  function getX(state, time) {
    try { return state.chart.timeScale().timeToCoordinate(time); }
    catch (_) { return null; }
  }
  function getY(series, value) {
    try { return series.priceToCoordinate(value); }
    catch (_) { return null; }
  }
  function drawEma(state, index, now) {
    const data = state.emaData[index] || [];
    const series = state.emaSeries[index];
    if (!series || data.length < 2) return;
    const color = PALETTE[index];
    const ctx = state.ctx;
    const period = 5700;
    const phase = (now % period) / period * Math.PI * 2 - index * (2 * Math.PI / 3);
    const intensity = 0.33 + 0.67 * Math.pow(Math.max(0, Math.cos(phase)), 4);
    let started = false, seen = 0;
    ctx.beginPath();
    // Thin, translucent line matches the original EMA path; halo rotates between colors.
    for (const point of data) {
      if (!point || !Number.isFinite(point.value)) { started = false; continue; }
      const x = getX(state, point.time), y = getY(series, point.value);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { started = false; continue; }
      if (x < -25 || x > state.width + 25 || y < -25 || y > state.height + 25) {
        started = false; continue;
      }
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      seen++;
    }
    if (seen < 2) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(color, 0.18 + 0.33 * intensity);
    ctx.lineWidth = 2.5 + 0.8 * intensity;
    ctx.shadowColor = rgba(color, .96);
    ctx.shadowBlur = 5 + 11 * intensity;
    ctx.stroke();
    ctx.restore();
  }
  function drawCandleHalo(state, candle, strength, kind) {
    if (!candle || !state.candleSeries) return;
    const x = getX(state, candle.time);
    const yHigh = getY(state.candleSeries, candle.high);
    const yLow = getY(state.candleSeries, candle.low);
    if (![x, yHigh, yLow].every(Number.isFinite) || x < -20 || x > state.width + 20) return;
    const isUp = candle.close >= candle.open;
    const color = kind === "ambient"
      ? (isUp ? {r:63,g:255,b:195} : {r:255,g:177,b:89})
      : kind === "signal-up" ? {r:49,g:255,b:182}
      : kind === "signal-down" ? {r:255,g:99,b:91}
      : {r:108,g:225,b:255};
    const ctx = state.ctx;
    const yTop = Math.min(yHigh, yLow), h = Math.abs(yLow - yHigh);
    ctx.save();
    ctx.strokeStyle = rgba(color, .60 * strength);
    ctx.lineWidth = kind === "ambient" ? 1.3 : 2.2;
    ctx.shadowColor = rgba(color, .85);
    ctx.shadowBlur = kind === "ambient" ? 8 : 17;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yTop + h);
    ctx.stroke();
    const bodyTop = getY(state.candleSeries, Math.max(candle.open, candle.close));
    const bodyBottom = getY(state.candleSeries, Math.min(candle.open, candle.close));
    if (Number.isFinite(bodyTop) && Number.isFinite(bodyBottom)) {
      ctx.strokeRect(x - 4.5, Math.min(bodyTop, bodyBottom) - 1, 9, Math.max(3, Math.abs(bodyBottom - bodyTop) + 2));
    }
    ctx.restore();
  }
  function render() {
    const state = instance;
    if (!state) return;
    const active = enabled();
    state.canvas.hidden = !active;
    if (!active || !prepareSize(state)) return;
    const now = performance.now(), ctx = state.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    PALETTE.forEach((_, i) => drawEma(state, i, now));
    if (state.flash && now < state.flash.until) {
      const fade = Math.max(0, (state.flash.until - now) / 1950);
      drawCandleHalo(state, state.flash.candle, fade, state.flash.kind);
    }
    // Deliberately decorative, low-frequency accent (NOT a setup/entry marker).
    const candles = state.candles;
    if (candles.length > 15) {
      const slot = Math.floor(now / 9200);
      const within = now % 9200;
      if (within < 1150) {
        const index = Math.max(0, candles.length - 7 - ((slot * 13) % Math.min(45, candles.length - 9)));
        const glow = Math.sin(Math.PI * (within / 1150)) * .40;
        drawCandleHalo(state, candles[index], glow, "ambient");
      }
    }
  }
  function stop() {
    if (animationTimer !== null) { clearInterval(animationTimer); animationTimer = null; }
    if (!instance) return;
    const state = instance;
    if (state.observer) state.observer.disconnect();
    if (state.rangeHandler) {
      try { state.chart.timeScale().unsubscribeVisibleLogicalRangeChange(state.rangeHandler); } catch (_) {}
    }
    if (state.canvas) state.canvas.remove();
    instance = null;
  }
  function attach({chart, host, candleSeries, emaSeries}) {
    if (!chart || !host || !candleSeries || !Array.isArray(emaSeries)) return;
    if (instance && instance.chart === chart && instance.host === host) return;
    stop();
    const canvas = document.createElement("canvas");
    canvas.className = "stone-chart-fx";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.pointerEvents = "none";
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }
    instance = {
      chart, host, candleSeries, emaSeries, canvas, ctx,
      width:0, height:0, emaData:[[],[],[]], candles:[],
      context:null, seeded:false, knownSignals:new Set(), flash:null,
      observer:null, rangeHandler:null
    };
    if (typeof ResizeObserver !== "undefined") {
      instance.observer = new ResizeObserver(render);
      instance.observer.observe(host);
    }
    instance.rangeHandler = render;
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(render); }
    catch (_) { instance.rangeHandler = null; }
    animationTimer = setInterval(render, 120);
    render();
  }
  function update({candles, emas, markers = [], newBar = false, context = ""}) {
    const state = instance;
    if (!state || !Array.isArray(candles) || !candles.length) return;
    const changed = context !== state.context;
    if (changed) {
      state.context = context; state.seeded = false; state.knownSignals.clear(); state.flash = null;
    }
    state.candles = candles.slice(-550);
    if (Array.isArray(emas)) state.emaData = emas.map(data => Array.isArray(data) ? data.slice(-550) : []);
    const recent = new Set(state.candles.slice(-3).map(c => String(c.time)));
    const currentKeys = new Set();
    let fresh = null;
    for (const m of (Array.isArray(markers) ? markers : [])) {
      if (!m || !recent.has(String(m.time))) continue;
      const key = String(m.time) + "|" + String(m.position) + "|" + String(m.text) + "|" + String(m.shape);
      currentKeys.add(key);
      if (state.seeded && !state.knownSignals.has(key)) fresh = m;
    }
    state.knownSignals = currentKeys;
    if (state.seeded && fresh) {
      const candle = state.candles.find(c => String(c.time) === String(fresh.time));
      const lower = String(fresh.position || "").toLowerCase();
      state.flash = {
        candle: candle || state.candles[state.candles.length - 1],
        kind: lower === "belowbar" ? "signal-up" : lower === "abovebar" ? "signal-down" : "new",
        until: performance.now() + 1950
      };
    } else if (state.seeded && newBar) {
      state.flash = {candle: state.candles[state.candles.length - 1], kind:"new", until:performance.now() + 1550};
    }
    state.seeded = true;
    render();
  }
  window.StoneChartFX = Object.freeze({attach, update, reset: stop});
})();
