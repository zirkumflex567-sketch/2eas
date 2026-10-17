(() => {
  "use strict";
  const formatPrice = value => Number.isFinite(value) ? value.toFixed(2) : "—";
  const validTime = time => {
    if (Number.isSafeInteger(time) && time > 0) return time;
    if (time && Number.isInteger(time.year) && Number.isInteger(time.month) && Number.isInteger(time.day)) {
      return Date.UTC(time.year, time.month - 1, time.day) / 1000;
    }
    return null;
  };
  const mount = ({ chart, host, candleSeries, symbol = "XAUUSD", timeframe = "M15" } = {}) => {
    const panel = document.getElementById("chart-crosshair-data-window");
    if (!panel || !chart || !host || !candleSeries || typeof chart.subscribeCrosshairMove !== "function") return false;
    const value = id => panel.querySelector(`#chart-crosshair-${id}`);
    let activeSymbol = String(symbol), activeTimeframe = String(timeframe), mountedChart = chart;
    const clear = () => { for (const key of ["time", "open", "high", "low", "close"]) value(key).textContent = "—"; };
    const onCrosshair = param => {
      const bar = param?.seriesData?.get?.(candleSeries), time = validTime(param?.time);
      const ohlc = [bar?.open, bar?.high, bar?.low, bar?.close].map(Number);
      if (!time || !ohlc.every(Number.isFinite) || ohlc.some(price => price <= 0) || ohlc[1] < Math.max(ohlc[0], ohlc[2], ohlc[3]) || ohlc[2] > Math.min(ohlc[0], ohlc[1], ohlc[3])) { clear(); return; }
      value("scope").textContent = `${activeSymbol} · ${activeTimeframe}`;
      value("time").textContent = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "medium", timeStyle: "medium" }).format(new Date(time * 1000)) + " UTC";
      ["open", "high", "low", "close"].forEach((key, index) => { value(key).textContent = formatPrice(ohlc[index]); });
    };
    chart.subscribeCrosshairMove(onCrosshair);
    return Object.freeze({
      setScope(nextSymbol, nextTimeframe) {
        if (typeof nextSymbol === "string" && nextSymbol.trim()) activeSymbol = nextSymbol.trim();
        if (typeof nextTimeframe === "string" && nextTimeframe.trim()) activeTimeframe = nextTimeframe.trim();
        value("scope").textContent = `${activeSymbol} · ${activeTimeframe}`;
        clear();
      },
      destroy() { if (mountedChart) mountedChart.unsubscribeCrosshairMove(onCrosshair); mountedChart = null; clear(); }
    });
  };
  window.ChartStudioMainDataWindow = Object.freeze({ mount });
})();
