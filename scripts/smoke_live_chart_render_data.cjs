"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { countCandleInkPixels } = require("./chart_render_pixels.cjs");
const { classifyLiveDemoRequest } = require("./live_demo_scope_guard.cjs");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const allowedAccounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const demoSymbols = {
  titan: "XAUUSD",
  xau5m_m5: "XAUUSD.p",
  titan_m5: "XAUUSD.p",
  xau5m_500: "XAUUSD.p",
  goldm15: "XAUUSD",
};
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : allowedAccounts;
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only configured non-Blueberry demo aliases");
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
      if (url.origin !== baseUrl.origin || url.pathname !== `${basePath}/api/candles`) return;
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
      if (url.origin === baseUrl.origin) {
        const account = url.searchParams.get("account");
        const scope = classifyLiveDemoRequest({url,method:route.request().method(),basePath,allowedAccounts:accounts});
        if (!scope.allowed) {
          blockedApiRequests.push({path:url.pathname,method:route.request().method(),account,reason:scope.reason});
          await route.abort("blockedbyclient");
          return;
        }
        if (scope.kind === "global_read" && scope.endpoint === "/api/accounts") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              default: accounts[0],
              // Keep the browser harness completely independent of the global
              // account list, which includes protected Blueberry metadata.
              accounts: accounts.map(id => ({
                id, name: id, login: "Demo", server: "Demo", symbol: demoSymbols[id], timeframe: "M15",
                is_demo: true, challenge_protection: false, capacity: 3,
              })),
            }),
          });
          return;
        }
        if (scope.kind === "global_read" && scope.endpoint === "/api/chart/v1/capabilities") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              accountScopes: accounts,
              symbols: ["XAUUSD", "XAUUSD.p"],
              timeframes: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"],
              features: { encryptedDeviceSync: false },
            }),
          });
          return;
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
      }, {timeout:45000}).then(response => ({response}), error => ({error}));
      if (index === 0) {
        candleResponse = waitForCandleResponse(account);
        await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
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
      assert.equal(typeof api.page?.hasMore, "boolean", `${account} initial chart response declares whether older verified candles exist`);
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
      await page.waitForFunction(() => {
        const status=document.querySelector("#chart-v5-preview-status")?.textContent||"";
        const match=status.match(/^(\d+) verifizierte Kerzen/);
        return match&&Number(match[1])>=1001;
      })
        .catch(async error => {
          const state = await page.evaluate(() => ({
            activeAccount:typeof activeAccount==="string"?activeAccount:null,
            previewStatus:document.querySelector("#chart-v5-preview-status")?.textContent||null,
            preview:window.ChartStudioV5Preview?.inspect?.()||null,
            positionStatus:document.querySelector("#chart-v5-position-status")?.textContent||null,
            candleCount:document.querySelector("#tv-chart")?.__candleSeries?.data?.().length||0,
          }));
          throw new Error(`${error.message}; v5 preview status diagnostic=${JSON.stringify({account,state,requests:requests.slice(-15)})}`);
        });
      await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")]
        .some(canvas => canvas.width > 300 && canvas.height > 200));
      await page.waitForFunction(() => {
        const status = document.querySelector("#chart-v5-position-status")?.textContent || "";
        return /\d+ MT5-Positionen · read-only|Positionen nur für freigegebene Demokonten|Positionen nicht verfügbar/.test(status);
      // The production read is explicitly bounded at 20 seconds because the
      // shared MT5 session lock can queue a response; leave room for UI paint.
      }, null, {timeout:25000}).catch(async error => {
        const state = await page.evaluate(() => ({status:document.querySelector("#chart-v5-position-status")?.textContent || null,
          preview:window.ChartStudioV5Preview?.inspect?.() || null,activeAccount:typeof activeAccount==="string"?activeAccount:null}));
        throw new Error(`${error.message}; v5 position state=${JSON.stringify(state)}`);
      });
      const positionStatus = (await page.locator("#chart-v5-position-status").textContent()).trim();
      assert.match(positionStatus, /^\d+ MT5-Positionen · read-only$/,
        `${account} native v5 position preview must read this verified demo scope, got: ${positionStatus}`);
      const marketLevels = await page.evaluate(() => window.ChartStudioV5Preview.readMarketLevels());
      assert.equal(marketLevels.source, "MT5_VERIFIED", `${account} native v5 levels retain broker-feed provenance`);
      // The API cutoff is Unix-second precision, and response JSON bodies can
      // finish parsing out of order. Match the overlay to the exact captured
      // feed payload at that cutoff rather than whichever response callback
      // happened to append last.
      const matchingLevelsSnapshot = levelSnapshots.get(account)?.findLast(snapshot =>
        snapshot.snapshotAsOfUtc === marketLevels.asOfUtc
          && Object.entries(snapshot.sr_levels).every(([key, value]) => {
            const expected = Number.isFinite(value) && value > 0 ? value : null;
            return (marketLevels.levels[key]?.price ?? null) === expected;
          }));
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
      const fibState = await page.evaluate(() => ({
        fibonacci: window.ChartStudioV5Preview.readAutoFibonacci(),
        marketLevels: window.ChartStudioV5Preview.readMarketLevels(),
      }));
      const fib = fibState.fibonacci;
      assert.ok(fib?.result, `${account} returns an explicit Auto-Fibonacci state`);
      assert.equal(fib.result.source, "MT5_VERIFIED");
      assert.equal(fib.asOf.account, account);
      assert.equal(fib.asOf.symbol, api.symbol);
      assert.equal(fib.asOf.timeframe, api.timeframe);
      assert.equal(fibState.marketLevels.source, "MT5_VERIFIED");
      assert.equal(fib.asOf.timeUtc, fibState.marketLevels.asOfUtc,
        `${account}: Auto-Fibonacci and native levels share the same current in-memory snapshot`);
      let fibonacciSnapshot = null;
      const snapshotDeadline = Date.now() + 5000;
      while (Date.now() < snapshotDeadline) {
        fibonacciSnapshot = levelSnapshots.get(account)?.findLast(snapshot => snapshot.snapshotAsOfUtc === fib.asOf.timeUtc) || null;
        if (fibonacciSnapshot) break;
        await page.waitForTimeout(25);
      }
      assert.ok(fibonacciSnapshot,
        `${account}: Auto-Fibonacci cutoff matches a captured MT5 candle response`);
      assert.equal(fibonacciSnapshot.accountId, account);
      assert.equal(fibonacciSnapshot.symbol, api.symbol);
      assert.equal(fibonacciSnapshot.timeframe, api.timeframe);
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
      await page.waitForFunction(() => document.querySelector("#chart-v5-auto-fib-btn")?.getAttribute("aria-pressed") === "false");
      assert.equal(await page.evaluate(() => window.ChartStudioV5Preview.readAutoFibonacci()), null);
      const mainHistory = await page.evaluate(() => {
        const chart = document.querySelector("#tv-chart")?.__chart;
        const series = document.querySelector("#tv-chart")?.__candleSeries;
        const data = series?.data?.() || [];
        return {oldest:Number(data[0]?.time),count:data.length,
          hasMore:typeof candleHistory==="object"?candleHistory.hasMore:null,
          loading:typeof candleHistory==="object"?candleHistory.loading:null,
          chartAvailable:!!chart};
      });
      assert.ok(mainHistory.chartAvailable && Number.isSafeInteger(mainHistory.oldest) && mainHistory.count > 0,
        `${account} main chart exposes its current history cursor`);
      const olderHistory = {available:mainHistory.hasMore === true,loaded:0};
      if (olderHistory.available) {
        if (mainHistory.loading) {
          await page.waitForFunction(() => typeof candleHistory==="object" && candleHistory.loading===false,
            null,{timeout:15000});
        }
        const stableMainHistory = await page.evaluate(() => {
          const data=document.querySelector("#tv-chart")?.__candleSeries?.data?.()||[];
          return {oldest:Number(data[0]?.time),count:data.length};
        });
        const oldestInitial = stableMainHistory.oldest;
        const olderResponsePromise = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account
            && url.searchParams.get("count") === "150" && Number(url.searchParams.get("before")) === oldestInitial;
        }, {timeout:30000});
        await page.evaluate(() => {
          const chart = document.querySelector("#tv-chart")?.__chart;
          if (!chart) throw new Error("main chart instance unavailable for history pagination");
          chart.timeScale().setVisibleLogicalRange({from:0,to:80});
        });
        const olderResponse = await olderResponsePromise.catch(async error => {
          const diagnostic = await page.evaluate(() => {
            const chart = document.querySelector("#tv-chart")?.__chart;
            const series = document.querySelector("#tv-chart")?.__candleSeries;
            return {visibleRange:chart?.timeScale?.().getVisibleLogicalRange?.()||null,
              renderedCount:series?.data?.().length||0,
              historyHasMore:typeof candleHistory==="object"?candleHistory.hasMore:null,
              historyLoading:typeof candleHistory==="object"?candleHistory.loading:null,
              historyScope:typeof candleHistory==="object"?candleHistory.scope:null};
          });
          throw new Error(`${error.message}; older-history diagnostic=${JSON.stringify({account,oldestInitial,stableMainHistory,diagnostic,requests:requests.slice(-10),blockedApiRequests})}`);
        });
        assert.ok(olderResponse.ok(), `${account} older-candle request returned ${olderResponse.status()}`);
        const olderPage = await olderResponse.json();
        assert.equal(olderPage.accountId, account, `${account} older candles retain the active account`);
        assert.equal(olderPage.symbol, api.symbol, `${account} older candles retain the active symbol`);
        assert.equal(olderPage.timeframe, api.timeframe, `${account} older candles retain the active timeframe`);
        assert.equal(olderPage.source, "MT5_VERIFIED");
        assert.equal(olderPage.canExecute, false);
        assert.ok(olderPage.candles.length > 0 && olderPage.candles.length <= 150,
          `${account} older-candle page is nonempty and bounded`);
        assert.ok(olderPage.candles.every(row => Number(row.time) < oldestInitial),
          `${account} historical page ends strictly before its exclusive cursor`);
        olderHistory.loaded = olderPage.candles.length;
        await page.waitForFunction(({account,oldestInitial}) => {
          const rendered = [...(window.__mainCandleSeriesCaptures || [])].reverse()
            .find(item => item.account === account)?.data;
          return Array.isArray(rendered) && rendered.length > 1001
            && Number(rendered[0]?.time) < oldestInitial;
        }, {account,oldestInitial}, {timeout:15000});
        const paginated = await page.evaluate(id => [...window.__mainCandleSeriesCaptures].reverse()
          .find(item => item.account === id)?.data, account);
        assert.equal(paginated.length, stableMainHistory.count + olderPage.candles.length,
          `${account} the production chart retains its current bars and adds one older page`);
        assert.ok(paginated.every((bar,index) => index === 0 || Number(bar.time) > Number(paginated[index - 1].time)),
          `${account} paginated chart remains strictly time ordered without duplicate candles`);
      }
      preview = "PASSED";
      results.push({ account, symbol: api.symbol, timeframe: api.timeframe, renderedBars: rendered.length,
        visibleCandlePixels, latestClose: rendered.at(-1).close, nativeV5MarketLevels: marketLevels.count, nativeV5AutoFibonacciPreview: preview,
        autoFibDirection: fib.result.direction, autoFibLevels: fib.series.length, autoFibStatus:fibStatus, v5PositionStatus:positionStatus,
        olderHistoryAvailable:olderHistory.available,olderBarsLoaded:olderHistory.loaded });
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
