"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { countCandleInkPixels } = require("./chart_render_pixels.cjs");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const accounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const baseUrl = new URL(base);
const basePath = baseUrl.pathname.replace(/\/$/, "");
const PREVIEW_FLAG_OFF = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;";
const PREVIEW_FLAG_ON = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = true;";

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    const blockedApiRequests = [];
    const levelSnapshots = new Map();
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      const account = url.searchParams.get("account");
      requests.push({ path: url.pathname, account });
    });
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin !== baseUrl.origin || url.pathname !== `${basePath}/api/candles` || url.searchParams.get("count") !== "150") return;
      void response.json().then(snapshot => {
        if (snapshot?.source !== "MT5_VERIFIED" || typeof snapshot.accountId !== "string") return;
        const versions = levelSnapshots.get(snapshot.accountId) || [];
        versions.push(snapshot);
        levelSnapshots.set(snapshot.accountId, versions.slice(-16));
      }).catch(() => {});
    });

    await page.addInitScript(() => {
      window.__chartExpectedAccount = new URL(location.href).searchParams.get("account");
      window.__mainCandleSeriesCaptures = [];
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl.origin && url.pathname.startsWith(`${basePath}/api/`)) {
        const account = url.searchParams.get("account");
        if (route.request().method() !== "GET" || account === "blueberry") {
          blockedApiRequests.push({path:url.pathname,method:route.request().method(),account});
          await route.abort("blockedbyclient");
          return;
        }
        if (["/api/candles", "/api/status", "/api/positions", "/api/quotes"].includes(url.pathname)) {
          assert.ok(account, `account-scoped request lacks an explicit account: ${url.pathname}`);
        }
      }
      if (url.origin === baseUrl.origin && url.pathname === `${basePath}/` && url.searchParams.has("account")) {
        const response = await route.fetch();
        const html = await response.text();
        assert.ok(html.includes(PREVIEW_FLAG_OFF), "the server must keep the production v5 preview disabled");
        await route.fulfill({ response, body: html.replace(PREVIEW_FLAG_OFF, PREVIEW_FLAG_ON) });
        return;
      }
      if (url.origin === baseUrl.origin && url.pathname === `${basePath}/static/lightweight-charts.js`) {
        const response = await route.fetch();
        const source = await response.text();
        const hook = `;(()=>{const api=window.LightweightCharts,createChart=api.createChart,wrappedCreate=(...args)=>{const chart=createChart.apply(api,args),add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=function(...seriesArgs){const series=add(...seriesArgs),setData=series.setData.bind(series);series.setData=function(rows){const data=Array.isArray(rows)?rows.map(row=>({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close})):[];window.__mainCandleSeriesCaptures.push({account:window.__chartExpectedAccount,data});return setData(rows)};return series};return chart};window.LightweightCharts={...api,createChart:wrappedCreate,__mainCandleCaptureInstalled:true}})();`;
        await route.fulfill({ response, body: source + hook });
        return;
      }
      await route.continue();
    });

    const results = [];
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      let candleResponse;
      const waitForCandleResponse = id => page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/candles"
          && url.searchParams.get("account") === id
          && url.searchParams.get("count") === "1001";
      }, {timeout:15000}).then(response => ({response}), error => ({error}));
      if (index === 0) {
        candleResponse = waitForCandleResponse(account);
        await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
      } else {
        await page.evaluate(id => { window.__chartExpectedAccount = id; }, account);
        candleResponse = waitForCandleResponse(account);
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
      }

      const responseResult = await candleResponse;
      if (responseResult.error) {
        const state = await page.evaluate(() => ({
          activeAccount: typeof activeAccount === "string" ? activeAccount : null,
          selectedTabs: [...document.querySelectorAll("#account-switcher [aria-pressed='true']")].map(tab => tab.dataset.account),
          connection: document.querySelector("#account-connection")?.textContent?.trim() || null,
        }));
        console.error(JSON.stringify({ waitingFor: account, state, accountRequests: requests.slice(-20), blockedApiRequests }, null, 2));
        throw responseResult.error;
      }
      const response = responseResult.response;
      assert.ok(response.ok(), `${account} candle request returned ${response.status()}`);
      const api = await response.json();
      levelSnapshots.set(account, [...(levelSnapshots.get(account) || []), api]);
      assert.equal(api.accountId, account);
      assert.equal(api.source, "MT5_VERIFIED");
      assert.equal(api.canExecute, false);
      assert.deepEqual(Object.keys(api.sr_levels).sort(), ["daily_high","daily_low","daily_poc","daily_vah","daily_val","weekly_high","weekly_low","weekly_poc","weekly_vah","weekly_val"].sort(),
        `${account} broker candle response includes all ten daily/weekly price and volume-profile levels`);
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
      await page.waitForTimeout(1500);
      const canvasPixels = await page.evaluate(() => [...document.querySelectorAll("#tv-chart canvas")]
        .filter(canvas => canvas.width >= 300 && canvas.height >= 200)
        .map(canvas => {
          const rgba = canvas.getContext("2d", { willReadFrequently: true })
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let binary = "";
          for (let offset = 0; offset < rgba.length; offset += 0x8000) {
            binary += String.fromCharCode(...rgba.subarray(offset, offset + 0x8000));
          }
          return { width: canvas.width, height: canvas.height, rgbaBase64: btoa(binary) };
        }));
      const candleInkPixels = canvasPixels.map(canvas =>
        countCandleInkPixels(Buffer.from(canvas.rgbaBase64, "base64"), canvas.width, canvas.height));
      const visibleCandlePixels = Math.max(0, ...candleInkPixels);
      assert.ok(visibleCandlePixels >= 40,
        `${account} canvas has verified candle data but no visible bullish/bearish candle paint (${visibleCandlePixels}px across ${canvasPixels.length} plot canvases)`);
      assert.equal(await page.locator("#chart-crosshair-data-window").isVisible(), true,
        `${account} main chart keeps its read-only OHLC data window visible outside Chart Studio Beta`);
      assert.equal(await page.locator("#chart-crosshair-scope").textContent(), `${api.symbol} · ${api.timeframe}`);
      await page.locator("#tv-chart").scrollIntoViewIfNeeded();
      const chartBox = await page.locator("#tv-chart").boundingBox();
      assert.ok(chartBox, `${account} chart has a visible browser rectangle`);
      // The draggable price-level legend occupies the plot's lower-right area.
      // Probe an unobstructed candle so the real chart crosshair can emit its readout.
      await page.mouse.move(chartBox.x + chartBox.width * 0.2, chartBox.y + chartBox.height / 2);
      await page.waitForFunction(() => /^\d+(?:\.\d+)?$/.test(document.querySelector("#chart-crosshair-close")?.textContent || ""));
      assert.match(await page.locator("#chart-crosshair-time").textContent(), /UTC$/,
        `${account} production data window labels its candle time as UTC`);
      for (const period of [20, 50, 200]) {
        await page.waitForFunction(id => /^\d+(?:\.\d+)?$/.test(document.querySelector(id)?.textContent || ""), `#chart-crosshair-ema${period}`);
      }
      let preview = "NOT_RUN";
      if (index === 0) {
        const previewEnabled = await page.evaluate(() => window.CHART_STUDIO_V5_PREVIEW_ENABLED === true);
        assert.equal(previewEnabled, true, "headless live acceptance enables the gated v5 preview only in its response copy");
        await page.locator("#chart-v5-preview-btn").waitFor({state:"visible"});
        await page.locator("#chart-v5-preview-btn").click();
      }
      await page.waitForFunction(count => document.querySelector("#chart-v5-preview-status")?.textContent.includes(`${count} verifizierte Kerzen`), 1001);
      await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")]
        .some(canvas => canvas.width > 300 && canvas.height > 200));
      await page.waitForFunction(() => {
        const status = document.querySelector("#chart-v5-position-status")?.textContent || "";
        return /\d+ MT5-Positionen · read-only|Positionen nur für freigegebene Demokonten|Positionen nicht verfügbar/.test(status);
      }, null, {timeout:5000}).catch(async error => {
        const state = await page.evaluate(() => ({status:document.querySelector("#chart-v5-position-status")?.textContent || null,
          preview:window.ChartStudioV5Preview?.inspect?.() || null,activeAccount:typeof activeAccount==="string"?activeAccount:null}));
        throw new Error(`${error.message}; v5 position state=${JSON.stringify(state)}`);
      });
      const positionStatus = (await page.locator("#chart-v5-position-status").textContent()).trim();
      assert.match(positionStatus, /^\d+ MT5-Positionen · read-only$/,
        `${account} native v5 position preview must read this verified demo scope, got: ${positionStatus}`);
      const marketLevels = await page.evaluate(() => window.ChartStudioV5Preview.readMarketLevels());
      assert.equal(marketLevels.source, "MT5_VERIFIED", `${account} native v5 levels retain broker-feed provenance`);
      // The API cutoff is Unix-second precision, so separate responses within
      // the same second can share an as-of value. The preview uses the latest
      // response; compare its readback with the latest captured response at
      // that cutoff rather than an older candle request from the same second.
      const matchingLevelsSnapshot = levelSnapshots.get(account)?.findLast(snapshot => snapshot.snapshotAsOfUtc === marketLevels.asOfUtc);
      assert.ok(matchingLevelsSnapshot, `${account} native v5 levels match an exact broker candle snapshot cutoff`);
      for (const [key, value] of Object.entries(matchingLevelsSnapshot.sr_levels)) {
        const renderedLevel = marketLevels.levels[key];
        assert.equal(renderedLevel?.price ?? null, Number.isFinite(value) && value > 0 ? value : null,
          `${account} ${key} axis overlay uses the exact feed value`);
      }
      const accountLevelPreference = await page.evaluate(id => {
        const visibility = window.DashboardChartLevelVisibility;
        const original = visibility.read(id).daily_poc;
        const accepted = visibility.set(id, "daily_poc", !original);
        window.ChartStudioV5Preview.syncMarketLevels();
        const changed = visibility.read(id).daily_poc;
        visibility.set(id, "daily_poc", original);
        window.ChartStudioV5Preview.syncMarketLevels();
        return {accepted, changed, restored:visibility.read(id).daily_poc};
      }, account);
      assert.deepEqual(accountLevelPreference, {accepted:true,changed:!accountLevelPreference.restored,restored:accountLevelPreference.restored},
        `${account} accepts an isolated browser preference for the chart-level toggle`);
      await page.locator("#chart-v5-auto-fib-btn").click();
      const fib = await page.evaluate(() => window.ChartStudioV5Preview.readAutoFibonacci());
      assert.ok(fib?.result, `${account} returns an explicit Auto-Fibonacci state`);
      assert.equal(fib.result.source, "MT5_VERIFIED");
      assert.equal(fib.asOf.account, account);
      assert.equal(fib.asOf.symbol, api.symbol);
      assert.equal(fib.asOf.timeframe, api.timeframe);
      assert.equal(fib.asOf.timeUtc, marketLevels.asOfUtc,
        `${account}: Auto-Fibonacci and native levels use the same latest verified broker snapshot`);
      assert.equal(fib.result.timeframe, api.timeframe);
      assert.equal(fib.series.length, 7);
      let fibStatus="PASSED";
      if(fib.result.available){
        assert.ok(fib.series.every(line => line.visible === true && line.points.length > 0), `${account}: an available Auto-Fibonacci result has seven rendered lines`);
      }else{
        assert.equal(fib.result.reason,"NO_POST_CONFIRMATION_CANDLES",`${account}: no line is claimed when the verified feed has no post-confirmation candles`);
        assert.ok(fib.series.every(line=>line.points.length===0));
        fibStatus="UNAVAILABLE_NO_POST_CONFIRMATION_CANDLES";
      }
      await page.locator("#chart-v5-auto-fib-btn").click();
      assert.equal(await page.evaluate(() => window.ChartStudioV5Preview.readAutoFibonacci()), null);
      preview = "PASSED";
      results.push({ account, symbol: api.symbol, timeframe: api.timeframe, renderedBars: rendered.length,
        visibleCandlePixels, latestClose: rendered.at(-1).close, nativeV5MarketLevels: marketLevels.count, nativeV5AutoFibonacciPreview: preview,
        autoFibDirection: fib.result.direction, autoFibLevels: fib.series.length, autoFibStatus:fibStatus, v5PositionStatus:positionStatus });
    }

    assert.deepEqual(errors, []);
    assert.deepEqual(blockedApiRequests, [], "no mutation or Blueberry-scoped request attempted to leave the browser");
    const positionAccounts = [...new Set(requests.filter(request => request.path === "/api/chart/v1/positions").map(request => request.account))].sort();
    assert.deepEqual(positionAccounts, [...accounts].sort(), "native v5 position previews read each authorized demo account with an explicit scope");
    console.log(JSON.stringify({ results, positionAccounts, apiRequests: requests.length, mutations: 0, blockedApiRequests, browserErrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
