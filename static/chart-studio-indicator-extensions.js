(function (root) {
  "use strict";
  const accounts = new Set(["titan", "xau5m_m5", "titan_m5", "xau5m_500"]);
  const symbolPattern = /^XAUUSD(?:\.p|\.pi)?$/i;
  const maxPackageChars = 64 * 1024;

  function mount({ panel, chart, getContext, getCandles }) {
    if (!panel || !chart || typeof getContext !== "function" || typeof getCandles !== "function") return null;
    const section = document.createElement("details");
    section.className = "cs-indicator-extension-panel";
    section.innerHTML = '<summary>Signierte Indikator-Erweiterung · Vorschau</summary>' +
      '<label>Datei <input type="file" accept=".json,application/json" data-extension-file></label>' +
      '<button type="button" data-extension-preview>Signatur prüfen und Vorschau berechnen</button>' +
      '<p role="status" aria-live="polite" data-extension-status>Keine Erweiterung geladen · es wird kein Paket gespeichert oder ausgeführt.</p>';
    const anchor = panel.querySelector("#cs-evidence-panel") || panel.firstElementChild;
    if (anchor) anchor.insertAdjacentElement("afterend", section);
    else panel.prepend(section);
    const fileInput = section.querySelector("[data-extension-file]");
    const previewButton = section.querySelector("[data-extension-preview]");
    const status = section.querySelector("[data-extension-status]");
    let packageText = "";
    let series = null;
    let generation = 0;

    const removeSeries = () => {
      if (series) {
        try { chart.removeSeries(series); } catch (_) { /* chart may already be disposed */ }
        series = null;
      }
    };
    const invalidateScope = () => {
      generation += 1;
      removeSeries();
      status.textContent = "Konten- oder Zeitrahmenwechsel · Vorschau gelöscht; erneut berechnen.";
    };

    fileInput.addEventListener("change", async () => {
      packageText = "";
      removeSeries();
      const file = fileInput.files?.[0];
      if (!file) {
        status.textContent = "Keine Datei ausgewählt.";
        return;
      }
      if (file.size > maxPackageChars) {
        fileInput.value = "";
        status.textContent = "Paket zu groß · maximal 64 KiB.";
        return;
      }
      try {
        packageText = await file.text();
        if (packageText.length > maxPackageChars) throw new Error("PACKAGE_LIMIT");
        JSON.parse(packageText);
        status.textContent = "Paket gelesen · noch nicht verifiziert.";
      } catch (_) {
        packageText = "";
        status.textContent = "Ungültige JSON-Datei · es wurde nichts importiert.";
      }
    });

    previewButton.addEventListener("click", async () => {
      generation += 1;
      const requestGeneration = generation;
      removeSeries();
      if (!packageText) {
        status.textContent = "Zuerst eine JSON-Paketdatei auswählen.";
        return;
      }
      const context = getContext();
      const contextKey = context && `${context.account}|${context.symbol}|${context.timeframe}`;
      const bars = getCandles();
      if (!context || !accounts.has(context.account) || !symbolPattern.test(context.symbol) ||
          !/^(M1|M5|M15|M30|H1|H4|D1)$/.test(context.timeframe) ||
          !Array.isArray(bars) || bars.length < 1 || bars.length > 10000) {
        status.textContent = "Kein unterstützter Demo-Chart mit geladenen Kerzen verfügbar.";
        return;
      }
      status.textContent = "Signatur wird geprüft und Vorschau berechnet …";
      try {
        const prefix = root.location.pathname.startsWith("/stt") ? "/stt" : "";
        const response = await fetch(prefix + "/api/chart/v1/indicator-extensions/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            ...context,
            package: packageText,
            parameters: {},
            bars: bars.map(bar => ({ time: Number(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
          })
        });
        const data = await response.json();
        if (generation !== requestGeneration) return;
        const current = getContext();
        if (!current || `${current.account}|${current.symbol}|${current.timeframe}` !== contextKey) {
          status.textContent = "Chart-Scope geändert · verspätetes Ergebnis verworfen.";
          return;
        }
        if (!response.ok) {
          const code = data?.detail?.code || "PREVIEW_UNAVAILABLE";
          status.textContent = code === "TRUST_STORE_UNAVAILABLE"
            ? "Import gesperrt · der Server hat noch keine vertrauenswürdigen Herausgeber-Schlüssel."
            : "Paket abgelehnt · " + code;
          return;
        }
        if (data.source !== "CALLER_SUPPLIED_BARS" || data.canExecute !== false ||
            data.account !== context.account || data.symbol !== context.symbol || data.timeframe !== context.timeframe ||
            !Array.isArray(data.series) || data.series.length !== bars.length ||
            !data.series.every((point, index) => point.time === Number(bars[index].time) &&
              (point.value === null || (typeof point.value === "number" && Number.isFinite(point.value))))) {
          status.textContent = "Unerwartetes API-Ergebnis · Vorschau verworfen.";
          return;
        }
        const points = data.series.filter(point => Number.isSafeInteger(point.time) &&
          (point.value === null || (typeof point.value === "number" && Number.isFinite(point.value))))
          .filter(point => point.value !== null).map(point => ({ time: point.time, value: point.value }));
        if (!points.length) {
          status.textContent = "Signatur gültig · noch keine berechenbaren Werte (Warm-up).";
          return;
        }
        series = chart.addLineSeries({
          title: data.indicator.name + " · Erweiterung",
          color: "#f3c56a", lineWidth: 2, lastValueVisible: false, priceLineVisible: false
        });
        series.setData(points);
        status.textContent = `${data.indicator.name} · signiert und verifiziert · ${points.length} Werte · ${context.timeframe} · ${data.source} · nicht ausführbar · nur aktuelle Sitzung.`;
      } catch (_) {
        if (generation === requestGeneration) status.textContent = "Vorschau fehlgeschlagen · Chartdaten oder Serverantwort nicht verfügbar.";
      }
    });

    return { clear: invalidateScope, refresh: invalidateScope };
  }

  root.ChartStudioIndicatorExtensions = { mount };
})(window);
