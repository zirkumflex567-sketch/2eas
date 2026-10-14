/* Stone/Rune theme: presentation only.
 * Reuses existing live chart, MT5 state, account handlers, and order controls.
 * Never injects fictitious quotes, candles, signals or orders.
 */
(() => {
  "use strict";
  const KEY = "two_eas_visual_theme";
  const choices = ["stone", "dark", "light"];
  let selected = "stone";
  const byId = id => document.getElementById(id);

  function rails() {
    if (byId("stone-rails")) return;
    const rail = document.createElement("div");
    rail.id = "stone-rails";
    rail.setAttribute("aria-hidden", "true");
    // Paths are decorative only. No hit-testing, no blocking of chart controls.
    const markup = '<svg viewBox="0 0 28 1000" preserveAspectRatio="none" aria-hidden="true">'
      + '<path class="track" d="M3 0V90L18 111V178L6 195V320L20 344V420L5 445V565L19 585V688L7 706V835L21 852V932L4 956V1000"/>'
      + '<path class="amber" d="M8 0V86L25 109V180L11 204V314L25 341V419L10 446V565L25 585V690L13 709V829L26 851V935L10 957V1000"/>'
      + '<path class="ember" d="M3 0V90L18 111V178L6 195V320L20 344V420L5 445V565L19 585V688L7 706V835L21 852V932L4 956V1000"/>'
      + '</svg>';
    rail.innerHTML = '<div class="left">' + markup + '</div><div class="right">' + markup + '</div>';
    document.body.append(rail);
  }

  let chartInstance = null;
  let candleSeriesInstance = null;
  let syncQueued = false;
  let cleanupChartEvents = null;

  function requestSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncPositions();
    });
  }

  function attachChart(bindings) {
    if (!bindings) return;
    if (bindings.chart) chartInstance = bindings.chart;
    if (bindings.candleSeries) candleSeriesInstance = bindings.candleSeries;
    bindChartEvents();
    requestSync();
  }

  function bindChartEvents() {
    if (cleanupChartEvents) {
      cleanupChartEvents();
      cleanupChartEvents = null;
    }
    const chartElem = byId("tv-chart");
    const cleanupFns = [];

    if (chartInstance) {
      try {
        const onRange = () => {
          requestSync();
          setTimeout(requestSync, 50);
        };
        chartInstance.timeScale().subscribeVisibleLogicalRangeChange(onRange);
        chartInstance.timeScale().subscribeVisibleTimeRangeChange(onRange);
        cleanupFns.push(() => {
          try { chartInstance.timeScale().unsubscribeVisibleLogicalRangeChange(onRange); } catch (_) {}
          try { chartInstance.timeScale().unsubscribeVisibleTimeRangeChange(onRange); } catch (_) {}
        });
      } catch (_) {}
    }

    if (chartElem) {
      let isDragging = false;
      let dragRaf = 0;

      const onDragLoop = () => {
        syncPositions();
        if (isDragging) {
          dragRaf = requestAnimationFrame(onDragLoop);
        }
      };

      const onPointerDown = () => {
        isDragging = true;
        cancelAnimationFrame(dragRaf);
        dragRaf = requestAnimationFrame(onDragLoop);
      };

      const onPointerUp = () => {
        if (isDragging) {
          isDragging = false;
          cancelAnimationFrame(dragRaf);
          requestSync();
          setTimeout(requestSync, 50);
        }
      };

      const onWheel = () => {
        requestSync();
        setTimeout(requestSync, 50);
        setTimeout(requestSync, 150);
      };

      chartElem.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      chartElem.addEventListener("wheel", onWheel, { passive: true });

      const card = chartElem.closest(".glass-card");
      if (card) {
        card.addEventListener("click", () => requestAnimationFrame(requestSync));
      }

      cleanupFns.push(() => {
        chartElem.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        chartElem.removeEventListener("wheel", onWheel);
        cancelAnimationFrame(dragRaf);
      });
    }

    cleanupChartEvents = () => {
      cleanupFns.forEach(fn => fn());
    };
  }

  function getRawProfileItems() {
    const source = byId("vp-histogram-container");
    if (!source) return [];

    const fullVP = source.__vpData || window.__currentVP;
    if (fullVP && Array.isArray(fullVP.histogram) && fullVP.histogram.length > 0) {
      return fullVP.histogram.map((b, index) => {
        const isPoc = Boolean(b.is_poc);
        const inVa = Boolean(b.in_va);
        const tone = isPoc ? "gold" : (index % 2 === 0 ? "cyan" : "amber");
        const kind = isPoc ? "poc" : (inVa ? "va" : "off");
        return {
          price: Number(b.price),
          volPct: Math.max(0, Math.min(100, Number(b.vol_pct) || 0)),
          isPoc,
          inVa,
          tone,
          kind
        };
      });
    }

    const rows = Array.from(source.children);
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const original = rows[i];
      const priceEl = original.querySelector(".stone-mini-price, .vprice, span:first-child");
      const barEl = original.querySelector(".stone-mini-fill, .vp-bar");
      if (!priceEl || !barEl) continue;

      const text = priceEl.textContent || "";
      const cleanText = text.replace(/[^0-9.-]/g, "");
      const price = parseFloat(original.dataset.price || cleanText);
      if (!Number.isFinite(price) || price <= 0) continue;

      let volPct = parseFloat(original.dataset.volPct || barEl.style.width || "0");
      if (!Number.isFinite(volPct)) volPct = 0;

      const isPoc = barEl.dataset.kind === "poc" ||
                    barEl.classList.contains("poc") ||
                    (original.dataset.poc === "true") ||
                    original.textContent.includes("POC");
      const inVa = barEl.dataset.kind === "va" || (!isPoc && volPct >= 40);
      const kind = isPoc ? "poc" : (inVa ? "va" : "off");
      const tone = barEl.dataset.tone || (isPoc ? "gold" : (i % 2 === 0 ? "cyan" : "amber"));

      items.push({
        price,
        volPct: Math.max(0, Math.min(100, volPct)),
        isPoc,
        inVa,
        tone,
        kind
      });
    }
    return items;
  }

  function renderFallbackRows(items, container) {
    const fragment = document.createDocumentFragment();
    for (const item of items.slice(0, 8)) {
      const row = document.createElement("div");
      row.className = "stone-mini-row";
      row.dataset.poc = String(item.isPoc);

      const head = document.createElement("div");
      head.className = "stone-mini-row-head";

      const priceLabel = document.createElement("span");
      priceLabel.className = "stone-mini-price";
      priceLabel.textContent = (item.isPoc ? "★ $" : "$") + item.price.toFixed(2);

      const pctLabel = document.createElement("span");
      pctLabel.className = "stone-mini-pct";
      pctLabel.textContent = item.isPoc ? "POC" : Math.round(item.volPct) + "%";

      head.append(priceLabel, pctLabel);

      const track = document.createElement("span");
      track.className = "stone-mini-track" + (item.isPoc ? " stone-mini-track--poc" : "");

      const fill = document.createElement("span");
      fill.className = "stone-mini-fill";
      fill.style.width = item.volPct + "%";
      fill.dataset.kind = item.kind;
      fill.dataset.tone = item.tone;

      track.append(fill);
      row.append(head, track);
      fragment.append(row);
    }
    container.replaceChildren(fragment);
  }

  function renderDynamicRows(accepted, container) {
    const fragment = document.createDocumentFragment();
    for (const item of accepted) {
      const row = document.createElement("div");
      row.className = "stone-mini-row";
      row.dataset.poc = String(item.isPoc);
      row.style.top = item.y + "px";
      row.title = `${item.isPoc ? "Point of Control (POC): " : "Volumenprofil: "}$${item.price.toFixed(2)} (${Math.round(item.volPct)}%)`;

      const head = document.createElement("div");
      head.className = "stone-mini-row-head";

      const priceLabel = document.createElement("span");
      priceLabel.className = "stone-mini-price";
      priceLabel.textContent = (item.isPoc ? "★ $" : "$") + item.price.toFixed(2);

      const pctLabel = document.createElement("span");
      pctLabel.className = "stone-mini-pct";
      pctLabel.textContent = item.isPoc ? "POC" : Math.round(item.volPct) + "%";

      head.append(priceLabel, pctLabel);

      const track = document.createElement("span");
      track.className = "stone-mini-track" + (item.isPoc ? " stone-mini-track--poc" : "");

      const fill = document.createElement("span");
      fill.className = "stone-mini-fill";
      fill.style.width = item.volPct + "%";
      fill.dataset.kind = item.kind;
      fill.dataset.tone = item.tone;

      track.append(fill);
      row.append(head, track);
      fragment.append(row);
    }
    container.replaceChildren(fragment);
  }

  function syncPositions() {
    const chartElem = byId("tv-chart");
    const aside = document.querySelector(".stone-side-volume");
    const barsContainer = byId("stone-mini-volume");
    if (!chartElem || !aside || !barsContainer) return;

    const series = candleSeriesInstance || chartElem.__candleSeries || window.__stoneCandleSeries;
    const items = getRawProfileItems();

    if (!items.length) {
      barsContainer.className = "stone-mini-volume stone-mini-fallback";
      barsContainer.replaceChildren();
      const waiting = document.createElement("div");
      waiting.className = "stone-mini-wait";
      waiting.textContent = "Warte auf MT5-Volumendaten";
      barsContainer.append(waiting);
      return;
    }

    let coordinatesAvailable = false;
    const chartRect = chartElem.getBoundingClientRect();
    const asideRect = aside.getBoundingClientRect();
    const offsetY = Math.round(chartRect.top - asideRect.top);
    const asideHeight = aside.clientHeight || 520;

    const candidates = [];
    if (series && typeof series.priceToCoordinate === "function") {
      for (const item of items) {
        try {
          const yCoord = series.priceToCoordinate(item.price);
          if (Number.isFinite(yCoord)) {
            coordinatesAvailable = true;
            const finalY = Math.round(yCoord + offsetY);
            if (finalY >= 38 && finalY <= asideHeight - 16) {
              candidates.push({ ...item, y: finalY });
            }
          }
        } catch (_) {}
      }
    }

    if (!coordinatesAvailable) {
      barsContainer.className = "stone-mini-volume stone-mini-fallback";
      renderFallbackRows(items, barsContainer);
      return;
    }

    barsContainer.className = "stone-mini-volume";

    candidates.sort((a, b) => {
      if (a.isPoc && !b.isPoc) return -1;
      if (!a.isPoc && b.isPoc) return 1;
      return b.volPct - a.volPct;
    });

    const MIN_GAP = 24;
    const accepted = [];
    for (const cand of candidates) {
      const collides = accepted.some(acc => Math.abs(acc.y - cand.y) < MIN_GAP);
      if (!collides) {
        accepted.push(cand);
      }
    }

    accepted.sort((a, b) => a.y - b.y);
    renderDynamicRows(accepted, barsContainer);
  }

  function constructChartLadder() {
    const chart = byId("tv-chart");
    const source = byId("vp-histogram-container");
    if (!chart || !source) return;
    const frame = chart.parentElement;
    if (!frame || frame.parentElement.classList.contains("stone-chart-stage")) return;
    const stage = document.createElement("div");
    stage.className = "stone-chart-stage";
    frame.parentNode.insertBefore(stage, frame);
    stage.append(frame);

    const aside = document.createElement("aside");
    aside.className = "stone-side-volume";
    aside.setAttribute("aria-label", "Live-Volumenprofil, synchronisiert mit der Chart-Werteskala");
    const heading = document.createElement("div");
    heading.className = "stone-volume-title";
    heading.textContent = "ᚦ  VOLUMENPROFIL";
    const bars = document.createElement("div");
    bars.id = "stone-mini-volume";
    bars.className = "stone-mini-volume";
    aside.append(heading, bars);
    stage.append(aside);

    if (chart.__chart || chart.__candleSeries) {
      attachChart({
        chart: chart.__chart,
        candleSeries: chart.__candleSeries
      });
    } else {
      bindChartEvents();
    }

    const observer = new MutationObserver(() => {
      requestSync();
    });
    observer.observe(source, { childList: true, subtree: true });

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => requestSync());
      ro.observe(chart);
      ro.observe(aside);
    }

    requestSync();
  }

  window.StoneCockpit = Object.freeze({
    attachChart,
    requestSync,
    syncPositions
  });

  function decor() {
    const brand = byId("strategy-title");
    if (brand && !document.querySelector(".stone-cockpit-crest")) {
      const crest = document.createElement("span");
      crest.className = "stone-cockpit-crest";
      crest.textContent = "ᚱ";
      crest.title = "Stone Rune Cockpit";
      crest.setAttribute("aria-hidden", "true");
      brand.parentElement.insertBefore(crest,brand);
    }
    for (const id of ["diagnose-card"]) {
      const el = byId(id);
      if (el && !el.querySelector(".stone-edge-light")) {
        const light = document.createElement("span");
        light.className = "stone-edge-light";
        light.setAttribute("aria-hidden","true");
        el.append(light);
      }
    }
  }

  // Attach only presentation classes to existing cards. Never replace chart, inputs,
  // account controls, MT5 state, journal rows, or live event handlers.
  function markAssetPanels() {
    document.querySelector("nav.glass-card")?.classList.add("stone-asset-nav");
    document.querySelector("header.glass-card")?.classList.add("stone-asset-header");
    const landmarks = [
      ["tv-chart", "chart"],
      ["vp-histogram-container", "volume"],
      ["diagnose-card", "diagnostic"],
      ["gold-details", "guard"],
      ["matrix-title", "matrix"],
      ["positions-list", "positions"],
      ["journal-list", "journal"]
    ];
    for (const [id, name] of landmarks) {
      const card = byId(id)?.closest(".glass-card");
      if (card) card.classList.add("stone-asset-panel", "stone-asset-panel--" + name);
    }
  }

  // FX is entirely decorative and kept away from the chart/controls.
  // Static CSS particles cost no background JavaScript rendering interval.
  function addAmbience() {
    const names = ["header.stone-asset-header",
      ".stone-asset-panel--chart", ".stone-asset-panel--volume",
      ".stone-asset-panel--diagnostic", ".stone-asset-panel--matrix",
      ".stone-asset-panel--positions", ".stone-asset-panel--journal"];
    names.forEach((selector, group) => {
      const host = document.querySelector(selector);
      if (!host || host.querySelector(".stone-ambience")) return;
      const layer = document.createElement("div");
      layer.className = "stone-ambience";
      layer.setAttribute("aria-hidden", "true");
      const number = group === 0 ? 4 : group <= 2 ? 6 : 3;
      for (let i = 0; i < number; i++) {
        const spark = document.createElement("i");
        spark.className = "stone-spark" + (i % 3 === 0 ? " stone-spark--amber" : "");
        // Distinct corners/edges. No particles across the center of text/data.
        const leftSide = i % 2 === 0;
        const progression = (i * 31 + group * 17) % 100;
        spark.style.setProperty("--spark-x", (leftSide ? 2 + (i % 4) * 3.4 : 98 - (i % 4) * 3.4) + "%");
        spark.style.setProperty("--spark-y", (8 + progression * .79) + "%");
        spark.style.setProperty("--spark-shift", (leftSide ? 24 + (i % 3) * 17 : -(25 + (i % 3) * 17)) + "px");
        spark.style.setProperty("--spark-delay", -(i * 1.71 + group * 1.12) + "s");
        spark.style.setProperty("--spark-duration", (4.4 + (i % 4) * 1.43) + "s");
        layer.append(spark);
      }
      for (let side = group % 2; side < 2; side += 2) {
        const vapor = document.createElement("span");
        vapor.className = "stone-vapor stone-vapor--" + (side ? "right" : "left");
        vapor.style.animationDelay = -(group * 1.9 + side * 3.3) + "s";
        layer.append(vapor);
      }
      host.append(layer);
    });
  }

  function setMode(mode) {
    if (!choices.includes(mode)) mode = "stone";
    selected = mode;
    document.body.classList.remove("theme-stone");
    // Original theme engine also keeps TradingView grid and axis colors in sync.
    if (typeof window.applyTheme === "function") {
      window.applyTheme(mode === "light" ? "light" : "dark");
    } else {
      document.body.classList.toggle("theme-light",mode==="light");
      document.body.classList.toggle("theme-dark",mode!=="light");
    }
    document.body.classList.toggle("theme-stone",mode==="stone");
    // Restart dormant chart FX on theme changes (the idle renderer has no timer).
    try { window.StoneCelebration?.applyChartSettings(); } catch (_) {}
    document.querySelectorAll(".stone-theme-dock button").forEach(button => {
      button.setAttribute("aria-pressed",String(button.dataset.mode === mode));
    });
    const themeText = byId("theme-label");
    if (themeText && mode==="stone") themeText.textContent="Klassisch";
    try { localStorage.setItem(KEY,mode); } catch (_) { /* private mode */ }
  }

  function addSwitcher() {
    const target = document.getElementById("top-nav-theme-container") || document.querySelector("header.glass-card");
    if (!target || document.querySelector(".stone-theme-dock")) return;
    const dock = document.createElement("div");
    dock.className = "stone-theme-dock";
    dock.setAttribute("role", "group");
    dock.setAttribute("aria-label","Cockpit Design wählen");
    for (const [mode, label] of [
      ["stone","ᛟ STEIN"],["dark","◈ DUNKEL"],["light","☼ HELL"]
    ]) {
      const button = document.createElement("button");
      button.type="button";
      button.dataset.mode=mode;
      button.setAttribute("aria-pressed","false");
      button.setAttribute("aria-label","Design "+(mode==="stone"?"Stein":mode==="dark"?"Dunkel":"Hell"));
      button.textContent=label;
      button.addEventListener("click",()=>setMode(mode));
      dock.append(button);
    }
    if (target.id === "top-nav-theme-container") {
      target.prepend(dock);
    } else {
      target.append(dock);
    }

    // Keep the existing old theme toggle operational outside stone mode.
    const legacyToggle = byId("theme-label")?.closest("button");
    if (legacyToggle) {
      legacyToggle.addEventListener("click", () => {
        document.body.classList.remove("theme-stone");
        selected = document.body.classList.contains("theme-light") ? "light" : "dark";
        document.querySelectorAll(".stone-theme-dock button").forEach(button =>
          button.setAttribute("aria-pressed",String(button.dataset.mode===selected)));
        try { localStorage.setItem(KEY,selected); } catch (_) {}
      });
    }
  }

  // Resizable full-screen chart container; chart instance, time range and MT5
  // handlers stay unchanged. ResizeObserver in app/preview recalculates pixels.
  function initChartExpand() {
    const button = byId("stone-chart-expand-btn");
    const panel = byId("tv-chart")?.closest(".glass-card");
    if (!button || !panel || button.dataset.expandReady === "true") return;
    button.dataset.expandReady = "true";
    let expanded = false;
    const setExpanded = value => {
      expanded = Boolean(value);
      panel.classList.toggle("stone-chart-expanded", expanded);
      document.body.classList.toggle("stone-chart-is-expanded", expanded);
      button.setAttribute("aria-pressed", String(expanded));
      button.setAttribute("aria-label", expanded ? "Chart verkleinern" : "Chart vergrößern");
      button.textContent = expanded ? "⤢ Verkleinern" : "⛶ Vergrößern";
      button.title = expanded ? "Chart in ursprüngliche Größe zurücksetzen (Esc)" : "Chart bildschirmfüllend vergrößern";
      // No series reinitialization: existing chart + zoom state are preserved.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    button.addEventListener("click", () => setExpanded(!expanded));
    document.addEventListener("keydown", event => {
      if (expanded && event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
        button.focus();
      }
    });
  }

  function boot() {
    initChartExpand();
    markAssetPanels();
    addAmbience();
    rails();
    decor();
    constructChartLadder();
    addSwitcher();
    let saved = "stone";
    try { saved = localStorage.getItem(KEY) || "stone"; } catch (_) {}
    setMode(saved);
  }
  if (document.readyState === "complete") boot();
  else window.addEventListener("load",boot,{once:true});
})();
