/*
 * STONE CHART FX · Mythic Occasional Accents
 *
 * Decoration only: never changes EMA/candle data, broker state, chart markers,
 * scale options, trading signals, or orders. All effects use live series coords.
 *
 * Mostly dormant, with occasional short EMA sparks, candle flickers and rare
 * left-to-right energy sweeps. There is deliberately NO always-on EMA halo.
 */
(() => {
  "use strict";

  let instance = null;
  let animationTimer = null; // event wake-up timeout, not perpetual polling
  let frameTimer = null;
  const motionPreference = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const PALETTE = [
    { r: 74, g: 227, b: 255 },  // EMA20
    { r: 255, g: 176, b: 85 },  // EMA50
    { r: 190, g: 133, b: 255 }  // EMA200
  ];

  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const random = (low, high) => low + Math.random() * (high - low);
  const rgba = (c, a) =>
    "rgba(" + c.r + "," + c.g + "," + c.b + "," + clamp(a, 0, 1).toFixed(3) + ")";

  function enabled() {
    return !!instance && instance.effectsEnabled !== false && document.body.classList.contains("theme-stone")
      && !document.hidden && !motionPreference.matches;
  }

  function hideNativeGlow(state) {
    // Existing paired native glow series from V4 remain in the live chart, but
    // must NEVER keep illuminating the full-length EMAs between events.
    for (const group of (state.glowSeries || [])) {
      for (const series of (group || [])) {
        try { series.applyOptions({ color: "rgba(0,0,0,0)" }); }
        catch (_) { /* Overlay FX must not break chart operations. */ }
      }
    }
  }

  function prepareSize(state) {
    const host = state.host.getBoundingClientRect();
    let width, height, left;
    try {
      const timeScale = state.chart.timeScale();
      const plotWidth = Number(timeScale.width());
      const timeAxisHeight = Number(timeScale.height());
      const leftScaleWidth = Number(state.chart.priceScale("left").width());
      const rightScaleWidth = Number(state.chart.priceScale("right").width());
      width = Math.round(plotWidth);
      height = Math.round(host.height - timeAxisHeight);
      left = Math.round(leftScaleWidth);
      if (![plotWidth, timeAxisHeight, leftScaleWidth, rightScaleWidth, host.width, host.height].every(Number.isFinite) ||
          plotWidth < 20 || timeAxisHeight < 0 || leftScaleWidth < 0 || rightScaleWidth < 0 ||
          left + width + rightScaleWidth > host.width + 1) return false;
    } catch (_) { return false; }
    if (width < 20 || height < 20) return false;

    const top = 0;
    const cv = state.canvas;
    cv.style.setProperty("left", left + "px", "important");
    cv.style.setProperty("top", top + "px", "important");
    cv.style.setProperty("width", width + "px", "important");
    cv.style.setProperty("height", height + "px", "important");

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    if (cv.width !== pixelWidth || cv.height !== pixelHeight) {
      cv.width = pixelWidth; cv.height = pixelHeight;
    }
    state.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    state.width = width;
    state.height = height;
    return true;
  }

  function getX(state, time) {
    try { return state.chart.timeScale().timeToCoordinate(time); }
    catch (_) { return null; }
  }
  function getY(series, price) {
    try { return series.priceToCoordinate(price); }
    catch (_) { return null; }
  }

  function visibleEmaPoints(state, index) {
    const series = state.emaSeries[index];
    if (!series) return [];
    const points = state.emaData[index] || [];
    const visible = [];
    for (const point of points) {
      if (!point || !Number.isFinite(point.value)) continue;
      const x = getX(state, point.time);
      const y = getY(series, point.value);
      if (Number.isFinite(x) && Number.isFinite(y) &&
          x >= -30 && x <= state.width + 30 &&
          y >= -35 && y <= state.height + 35) {
        visible.push({ x, y });
      }
    }
    return visible;
  }

  function visibleCandles(state) {
    return state.candles.filter(candle => {
      const x = getX(state, candle.time);
      return Number.isFinite(x) && x >= 6 && x <= state.width - 6;
    });
  }

  function scheduleNext(state, now, initial = false) {
    // Quiet intervals are essential. No periodic "breathing" glow.
    state.nextEffectAt = now + (initial ? random(2400, 6200) : random(4700, 12000));
  }

  function spawnEffect(state, now) {
    const candles = visibleCandles(state);
    const eligible = [0, 1, 2].map(i => ({index: i, pts: visibleEmaPoints(state, i)}))
      .filter(item => item.pts.length >= 8);
    if (!candles.length && !eligible.length) return;

    const roll = Math.random();
    let effect;
    if (roll < 0.38 && candles.length) {
      const candidates = candles.slice(-Math.min(candles.length, 65));
      const candle = candidates[Math.floor(Math.random() * candidates.length)];
      effect = {
        kind: "candle", candle, at: now, until: now + random(650, 1350),
        power: random(.64, 1.0)
      };
    } else if (eligible.length) {
      const picked = eligible[Math.floor(Math.random() * eligible.length)];
      if (roll < .83) {
        const p = picked.pts[Math.floor(random(0, picked.pts.length))];
        effect = {
          kind: "ema-pulse", emaIndex: picked.index, timeX: p.x,
          radiusPx: random(42, 120), at: now, until: now + random(700, 1600),
          power: random(.64, 1.0)
        };
      } else if (picked.pts.length >= 16) {
        effect = {
          kind: "ema-sweep", emaIndex: picked.index,
          at: now, until: now + random(2300, 3300), power: random(.60, .90),
          widthPx: random(85, 165)
        };
      }
    }
    if (effect) state.effects = [effect]; // never stack ambient effects
  }

  function drawEmaPath(ctx, points, left, right) {
    // Clip each segment to the traveling window, so sweeps move smoothly even
    // at wide candle spacing and still line up with the real EMA.
    let drawn = false;
    ctx.beginPath();
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const dx = b.x - a.x;
      if (!Number.isFinite(dx) || dx <= 0 || b.x < left || a.x > right) continue;
      const t0 = clamp((left - a.x) / dx, 0, 1);
      const t1 = clamp((right - a.x) / dx, 0, 1);
      if (t1 <= t0) continue;
      const x0 = a.x + dx*t0, y0 = a.y + (b.y-a.y)*t0;
      const x1 = a.x + dx*t1, y1 = a.y + (b.y-a.y)*t1;
      ctx.moveTo(x0,y0);
      ctx.lineTo(x1,y1);
      drawn = true;
    }
    return drawn;
  }

  function drawEmaEffect(state, effect, now) {
    const pts = visibleEmaPoints(state, effect.emaIndex);
    if (pts.length < 2) return;
    const duration = effect.until - effect.at;
    const progress = clamp((now - effect.at) / duration, 0, 1);
    const fade = Math.pow(Math.sin(Math.PI * progress), .8);
    // Small irregular flicker within a single event. No rapid strobes.
    const flicker = .83 + .17 * Math.sin(progress * 6 * Math.PI + effect.emaIndex);
    const strength = effect.power * fade * flicker;
    if (strength < .03) return;

    let center, radius;
    if (effect.kind === "ema-sweep") {
      // A small illuminated segment literally travels left → right.
      center = -effect.widthPx + (state.width + 2*effect.widthPx) * progress;
      radius = effect.widthPx / 2;
    } else {
      // Anchor the pulse to a candle-era point; reproject on resize/zoom.
      const anchor = pts.reduce((nearest, p) =>
        Math.abs(p.x - effect.timeX) < Math.abs(nearest.x - effect.timeX) ? p : nearest, pts[0]);
      center = anchor.x;
      radius = effect.radiusPx * (.85 + .15*fade);
    }

    const ctx = state.ctx, tone = PALETTE[effect.emaIndex];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = rgba(tone, .95);

    const passes = [
      { width: 17, alpha: .12*strength, blur: 32 },
      { width: 8, alpha: .32*strength, blur: 19 },
      { width: 2.4, alpha: .70*strength, blur: 7 }
    ];
    for (const pass of passes) {
      if (!drawEmaPath(ctx, pts, center-radius, center+radius)) continue;
      ctx.lineWidth = pass.width;
      ctx.strokeStyle = rgba(tone, pass.alpha);
      ctx.shadowBlur = pass.blur;
      ctx.stroke();
    }

    // Tiny, brief star at the sweep tip (pure decoration; not an entry point).
    if (effect.kind === "ema-sweep" && strength > .25) {
      const tipX = center + radius;
      const last = pts.reduce((a,p) => Math.abs(p.x-tipX)<Math.abs(a.x-tipX)?p:a,pts[0]);
      if (Math.abs(last.x-tipX) < 28) {
        const r = 2 + 4*strength;
        ctx.beginPath();
        ctx.moveTo(last.x-r, last.y); ctx.lineTo(last.x+r,last.y);
        ctx.moveTo(last.x,last.y-r); ctx.lineTo(last.x,last.y+r);
        ctx.strokeStyle = rgba(tone,.75*strength);
        ctx.lineWidth = 1;
        ctx.shadowBlur = 13;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCandleEffect(state, effect, now) {
    const c = effect.candle;
    if (!c || !state.candleSeries) return;
    const x = getX(state, c.time);
    const top = getY(state.candleSeries, c.high);
    const bottom = getY(state.candleSeries, c.low);
    const bodyTop = getY(state.candleSeries, Math.max(c.open, c.close));
    const bodyBottom = getY(state.candleSeries, Math.min(c.open, c.close));
    if (![x,top,bottom,bodyTop,bodyBottom].every(Number.isFinite) ||
        x < 0 || x > state.width) return;
    const t = clamp((now-effect.at)/(effect.until-effect.at),0,1);
    const alpha = Math.sin(Math.PI*t)*effect.power*(.82+.18*Math.sin(6*Math.PI*t));
    if (alpha < .02) return;
    const tint = c.close >= c.open
      ? {r:67,g:255,b:194} : {r:255,g:161,b:100};
    const ctx = state.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(tint,.53*alpha);
    ctx.shadowColor = rgba(tint,.98);
    ctx.shadowBlur = 12 + 21*alpha;
    ctx.lineWidth = 2.3;
    ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke();
    // Candle bodies change width with zoom; the glow hugs the position without
    // changing the underlying OHLC rectangle.
    let barSpacing = 7;
    try {
      const options = state.chart.timeScale().options();
      if (Number.isFinite(options?.barSpacing)) barSpacing = options.barSpacing;
    } catch (_) {}
    const halfWidth = clamp(barSpacing, 4, 14)*.34;
    ctx.strokeStyle = rgba(tint,.42*alpha);
    ctx.lineWidth = 3 + 4*alpha;
    ctx.strokeRect(x-halfWidth, bodyTop, halfWidth*2, Math.max(2,bodyBottom-bodyTop));
    if (alpha > .3) {
      const starY = c.close >= c.open ? top : bottom;
      const size = 3 + 6*alpha;
      ctx.beginPath();
      ctx.moveTo(x-size,starY);ctx.lineTo(x+size,starY);
      ctx.moveTo(x,starY-size);ctx.lineTo(x,starY+size);
      ctx.strokeStyle=rgba(tint,.75*alpha);
      ctx.lineWidth=1.2;
      ctx.shadowBlur=17;
      ctx.stroke();
    }
    ctx.restore();
  }

  function armNextFrame(state, now) {
    if (animationTimer !== null) clearTimeout(animationTimer);
    if (!enabled()) return;
    // Sleep until next irregular effect, repaint during bursts at <=20 fps.
    const delay = state.effects.length ? 50 : Math.max(100, state.nextEffectAt - now);
    animationTimer = setTimeout(() => {
      animationTimer = null;
      frameTimer = requestAnimationFrame(() => {
        frameTimer = null;
        render();
      });
    }, delay);
  }

  function render() {
    const state = instance;
    if (!state) return;
    const active = enabled();
    state.canvas.hidden = !active;
    if (!active) {
      if (animationTimer !== null) {
        clearTimeout(animationTimer);
        animationTimer = null;
      }
      if (!state.wasInactive) {
        state.wasInactive = true;
        state.effects = [];
        state.nextEffectAt = 0;
        state.ctx.clearRect(0,0,state.width,state.height);
      }
      return;
    }
    if (!prepareSize(state)) return;
    const now = performance.now();
    if (state.wasInactive) {
      state.wasInactive = false;
      scheduleNext(state, now, true);
    }
    const ctx = state.ctx;
    ctx.clearRect(0,0,state.width,state.height);

    state.effects = state.effects.filter(effect => now < effect.until);
    if (state.ambientEnabled !== false && !state.effects.length && now >= state.nextEffectAt) {
      spawnEffect(state,now);
      scheduleNext(state,now);
    }
    for (const effect of state.effects) {
      if (effect.kind === "candle") drawCandleEffect(state,effect,now);
      else drawEmaEffect(state,effect,now);
    }
    armNextFrame(state, now);
  }

  function configure(options = {}) {
    const state = instance;
    if (!state) return;
    state.effectsEnabled = options.enabled !== false;
    state.ambientEnabled = options.ambient !== false;
    if (!state.effectsEnabled) {
      state.effects = [];
      state.ctx.clearRect(0,0,state.width,state.height);
    }
    render();
  }

  function trigger(kind, level = 3) {
    const state = instance;
    if (!state || !enabled() || !prepareSize(state)) return false;
    const now = performance.now();
    const strength = clamp(Number(level) || 3, 1, 5);
    const isProfit = kind === "profit";
    const count = isProfit ? 22 + strength * 4 : 10 + strength * 3;
    const duration = isProfit ? 5200 + strength * 650 : 2300 + strength * 360;
    const candles = visibleCandles(state);
    const validEma = [0,1,2].filter(i => visibleEmaPoints(state,i).length > 9);
    if (!candles.length && !validEma.length) return false;
    state.effects = []; // a confirmed event takes priority over idle accents
    for (let i=0; i<count; i++) {
      const start = now + random(0, duration * .83);
      const roll = Math.random();
      if (roll < .40 && candles.length) {
        const c = candles[Math.floor(random(0, candles.length))];
        state.effects.push({
          kind:"candle", candle:c, at:start, until:start+random(430,990),
          power:Math.min(1.65,random(.85,1.1)+strength*.12)
        });
      } else if (validEma.length) {
        const emaIndex = validEma[Math.floor(random(0,validEma.length))];
        if (roll > .87) {
          state.effects.push({
            kind:"ema-sweep",emaIndex,at:start,until:start+random(900,1600),
            power:Math.min(1.6,random(.85,1.2)+strength*.1),widthPx:random(48,135)
          });
        } else {
          const pts=visibleEmaPoints(state,emaIndex);
          state.effects.push({
            kind:"ema-pulse",emaIndex,timeX:pts[Math.floor(random(0,pts.length))].x,
            radiusPx:random(22,90),at:start,until:start+random(430,1050),
            power:Math.min(1.65,random(.85,1.2)+strength*.1)
          });
        }
      }
    }
    // No idle animation interrupts this finite, irregular burst.
    state.nextEffectAt = now + duration + random(4600,10000);
    render();
    return true;
  }

  function stop() {
    if (animationTimer !== null) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
    if (frameTimer !== null) {
      cancelAnimationFrame(frameTimer);
      frameTimer = null;
    }
    if (!instance) return;
    const state = instance;
    document.removeEventListener("visibilitychange", state.visibilityHandler);
    motionPreference.removeEventListener?.("change", state.visibilityHandler);
    if (state.observer) state.observer.disconnect();
    if (state.rangeHandler) {
      try { state.chart.timeScale().unsubscribeVisibleLogicalRangeChange(state.rangeHandler); }
      catch (_) {}
    }
    hideNativeGlow(state);
    state.canvas.remove();
    instance = null;
  }

  function attach({ chart, host, candleSeries, emaSeries, glowSeries = [] }) {
    if (!chart || !host || !candleSeries || !Array.isArray(emaSeries)) return;
    if (instance && instance.chart === chart && instance.host === host) return;
    stop();
    const canvas = document.createElement("canvas");
    canvas.className = "stone-chart-fx";
    canvas.setAttribute("aria-hidden","true");
    canvas.style.pointerEvents = "none";
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }

    instance = {
      chart,host,candleSeries,emaSeries,glowSeries,canvas,ctx,
      width:0,height:0,candles:[],emaData:[[],[],[]],
      context:null,effects:[],nextEffectAt:0,wasInactive:true,
      effectsEnabled:true,ambientEnabled:true,
      observer:null,rangeHandler:null
    };
    hideNativeGlow(instance); // no persistent glow from old paired native lines
    if (typeof ResizeObserver !== "undefined") {
      instance.observer = new ResizeObserver(render);
      instance.observer.observe(host);
    }
    instance.rangeHandler = render;
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(render); }
    catch (_) { instance.rangeHandler = null; }
    instance.visibilityHandler = render;
    document.addEventListener("visibilitychange", render);
    motionPreference.addEventListener?.("change", render);
    render();
  }

  function update({ candles, emas, context = "" }) {
    const state = instance;
    if (!state || !Array.isArray(candles) || !candles.length) return;
    if (context !== state.context) {
      state.context = context;
      state.effects = [];
      state.nextEffectAt = 0;
      state.wasInactive = true;
      // The next event must be newly chosen for the switched account/period.
    }
    state.candles = candles.slice(-550);
    if (Array.isArray(emas)) {
      state.emaData = emas.map(points => Array.isArray(points) ? points.slice(-550) : []);
    }
    render();
  }

  window.StoneChartFX = Object.freeze({ attach, update, trigger, configure, reset: stop });
})();
