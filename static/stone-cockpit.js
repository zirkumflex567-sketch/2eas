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
    aside.setAttribute("aria-label", "Live-Volumenprofil, gespiegelt aus Tages- oder Wochenansicht");
    const heading = document.createElement("div");
    heading.className = "stone-volume-title";
    heading.textContent = "ᚦ  VOLUMENPROFIL";
    const bars = document.createElement("div");
    bars.id = "stone-mini-volume";
    bars.className = "stone-mini-volume";
    aside.append(heading,bars);
    stage.append(aside);

    let queued = false;
    const render = () => {
      queued = false;
      const rows = Array.from(source.children);
      bars.replaceChildren();
      if (!rows.length) {
        const waiting = document.createElement("div");
        waiting.className = "stone-mini-wait";
        waiting.textContent = "Warte auf MT5-Volumendaten";
        bars.append(waiting);
        return;
      }
      for (const original of rows) {
        const price = original.querySelector("span");
        const originalBar = original.querySelector(".vp-bar");
        if (!price || !originalBar) continue;
        const row = document.createElement("div");
        row.className = "stone-mini-row";
        const priceLabel = document.createElement("span");
        priceLabel.className = "stone-mini-price";
        priceLabel.textContent = price.textContent;
        const track = document.createElement("span");
        track.className = "stone-mini-track";
        const fill = document.createElement("span");
        fill.className = "stone-mini-fill";
        fill.style.width = originalBar.style.width || "0%";
        fill.dataset.kind = originalBar.dataset.kind || (originalBar.classList.contains("poc") ? "poc" : "va");
        fill.dataset.tone = originalBar.dataset.tone || (fill.dataset.kind === "poc" ? "gold" : "cyan");
        track.append(fill);
        row.append(priceLabel, track);
        bars.append(row);
      }
    };
    const observer = new MutationObserver(() => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(render);
      }
    });
    observer.observe(source, {childList:true, subtree:true});
    render();
  }

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
    document.querySelectorAll(".stone-theme-dock button").forEach(button => {
      button.setAttribute("aria-pressed",String(button.dataset.mode === mode));
    });
    const themeText = byId("theme-label");
    if (themeText && mode==="stone") themeText.textContent="Klassisch";
    try { localStorage.setItem(KEY,mode); } catch (_) { /* private mode */ }
  }

  function addSwitcher() {
    const header = document.querySelector("header.glass-card");
    if (!header || document.querySelector(".stone-theme-dock")) return;
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
    header.append(dock);

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
