"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const accounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500"];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      assert.equal(request.method(), "GET", `unexpected API mutation ${request.method()} ${url.pathname}`);
      const account = url.searchParams.get("account");
      assert.notEqual(account, "blueberry", "protected account request");
      if (["/api/candles", "/api/status", "/api/positions", "/api/quotes"].includes(url.pathname)) {
        assert.ok(account, `account-scoped request lacks an explicit account: ${url.pathname}`);
      }
      requests.push({ path: url.pathname, account });
    });

    await page.addInitScript(() => {
      window.__chartExpectedAccount = new URL(location.href).searchParams.get("account");
      window.__mainCandleSeriesCaptures = [];
    });
    await page.route("**/static/lightweight-charts.js", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const hook = `;(()=>{const api=window.LightweightCharts,createChart=api.createChart,wrappedCreate=(...args)=>{const chart=createChart.apply(api,args),add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=function(...seriesArgs){const series=add(...seriesArgs),setData=series.setData.bind(series);series.setData=function(rows){const data=Array.isArray(rows)?rows.map(row=>({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close})):[];window.__mainCandleSeriesCaptures.push({account:window.__chartExpectedAccount,data});return setData(rows)};return series};return chart};window.LightweightCharts={...api,createChart:wrappedCreate,__mainCandleCaptureInstalled:true}})();`;
      await route.fulfill({ response, body: source + hook });
    });

    const results = [];
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      let candleResponse;
      if (index === 0) {
        candleResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles"
            && url.searchParams.get("account") === account
            && url.searchParams.get("count") === "1001";
        });
        await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
      } else {
        await page.evaluate(id => { window.__chartExpectedAccount = id; }, account);
        candleResponse = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles"
            && url.searchParams.get("account") === account
            && url.searchParams.get("count") === "1001";
        });
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
      }

      const response = await candleResponse;
      assert.ok(response.ok(), `${account} candle request returned ${response.status()}`);
      const api = await response.json();
      assert.equal(api.accountId, account);
      assert.equal(api.source, "MT5_VERIFIED");
      assert.equal(api.canExecute, false);
      assert.ok(Number.isSafeInteger(api.snapshotAsOfUtc) && api.snapshotAsOfUtc > 0, `${account} candle response includes a verified snapshot as-of`);
      assert.equal(api.candles.length, 1001, `${account} chart history contains the requested 1001 candles`);
      await page.waitForFunction(id => window.__mainCandleSeriesCaptures.some(item => item.account === id && item.data.length > 0), account).catch(async error => {
        const debug = await page.evaluate(() => ({
          lightweightCharts: typeof window.LightweightCharts,
          capturedFlag: window.LightweightCharts?.__mainCandleCaptureInstalled === true,
          chartFactory: typeof window.LightweightCharts?.createChart,
          captures: window.__mainCandleSeriesCaptures,
          chartCanvasCount: document.querySelectorAll("#tv-chart canvas").length,
        }));
        throw new Error(`${error.message}; chart capture debug=${JSON.stringify(debug)}`);
      });
      const rendered = await page.evaluate(id => [...window.__mainCandleSeriesCaptures].reverse().find(item => item.account === id)?.data, account);
      assert.equal(rendered.length, api.candles.length, `${account} rendered series has the verified candle count`);
      for (let i = 0; i < rendered.length; i += 1) {
        const bar = rendered[i];
        assert.ok(Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close), `${account} candle ${i} has finite OHLC`);
        assert.ok(bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close), `${account} candle ${i} has valid OHLC bounds`);
        if (i) assert.ok(Number(bar.time) > Number(rendered[i - 1].time), `${account} candles are strictly time ordered`);
      }
      const apiLast = [...api.candles].sort((a, b) => Number(a.time) - Number(b.time)).at(-1);
      assert.equal(rendered.at(-1).time, apiLast.time, `${account} renderer receives the newest verified candle`);
      assert.equal(rendered.at(-1).close, apiLast.close, `${account} rendered close equals the broker feed`);
      let preview = "NOT_RUN";
      if (index === 0) {
        const previewEnabled = await page.evaluate(() => window.CHART_STUDIO_V5_PREVIEW_ENABLED === true);
        const previewButton = page.locator("#chart-v5-preview-btn");
        if (previewEnabled) {
          await previewButton.waitFor({state:"visible"});
          await previewButton.click();
          await page.waitForFunction(() => document.querySelector("#chart-v5-preview-status")?.textContent.includes("1001 verifizierte Kerzen"));
          await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas => canvas.width > 300 && canvas.height > 200));
          await page.locator("#chart-v5-auto-fib-btn").click();
          const fib = await page.evaluate(() => window.ChartStudioV5Preview.readAutoFibonacci());
          assert.equal(fib.result.source, "MT5_VERIFIED");
          assert.equal(fib.asOf.timeUtc, api.snapshotAsOfUtc);
          assert.equal(fib.result.timeframe, api.timeframe);
          assert.equal(fib.series.length, 7);
          assert.ok(fib.series.every(line => line.visible === true));
          await page.locator("#chart-v5-auto-fib-btn").click();
          assert.equal(await page.evaluate(() => window.ChartStudioV5Preview.readAutoFibonacci()), null);
          preview = "PASSED";
        } else {
          assert.equal(await previewButton.isHidden(), true, "the gated native-v5 preview remains unavailable while disabled");
          preview = "GATED_OFF";
        }
      }
      results.push({ account, symbol: api.symbol, timeframe: api.timeframe, renderedBars: rendered.length, latestClose: rendered.at(-1).close, nativeV5AutoFibonacciPreview: preview });
    }

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ results, apiRequests: requests.length, mutations: 0, browserErrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
