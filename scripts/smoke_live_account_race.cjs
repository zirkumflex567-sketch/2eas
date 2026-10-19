"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const allowedAccounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : ["titan", "xau5m_m5", "titan_m5", "xau5m_500"];
assert.ok(accounts.includes("titan") && accounts.length >= 2
  && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must include titan and only configured non-Blueberry demo aliases");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const apiRequests = [];
    const browserErrors = [];
    let heldTitanReady;
    let releaseTitan;
    const titanReady = new Promise(resolve => { heldTitanReady = resolve; });
    const titanGate = new Promise(resolve => { releaseTitan = resolve; });
    let heldTitanRequest = false;
    let currentAccountResponse;

    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      const account = url.searchParams.get("account");
      assert.notEqual(account, "blueberry", "protected account requests are forbidden");
      assert.equal(request.method(), "GET", `unexpected API mutation ${request.method()} ${url.pathname}`);
      apiRequests.push({ account, path: url.pathname, method: request.method() });
    });

    await page.addInitScript(() => { window.__mainCandleSeriesCaptures = []; });
    await page.route("**/static/lightweight-charts.js", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const hook = `;(()=>{const api=window.LightweightCharts,createChart=api.createChart,wrappedCreate=(...args)=>{const chart=createChart.apply(api,args),add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=function(...seriesArgs){const series=add(...seriesArgs),setData=series.setData.bind(series);series.setData=function(rows){const data=Array.isArray(rows)?rows.map(row=>({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close})):[];const active=document.querySelector('#account-switcher [aria-pressed="true"]')?.dataset.account||null;const timeframe=document.querySelector('[id^="tf-btn-"].bg-blue-600')?.id.replace('tf-btn-','')||null;window.__mainCandleSeriesCaptures.push({active,timeframe,data});return setData(rows)};return series};return chart};window.LightweightCharts={...api,createChart:wrappedCreate,__mainCandleCaptureInstalled:true}})();`;
      await route.fulfill({ response, body: source + hook });
    });
    await page.route("**/api/candles?*", async route => {
      const url = new URL(route.request().url());
      const account = url.searchParams.get("account");
      if (account === "titan" && !heldTitanRequest) {
        heldTitanRequest = true;
        const response = await route.fetch();
        const body = await response.body();
        heldTitanReady({ route, response, body });
        await titanGate;
        await route.fulfill({ response, body });
        return;
      }
      await route.continue();
    });

    await page.goto(`${base}/?account=titan`, { waitUntil: "domcontentloaded" });
    const held = await titanReady;
    assert.equal(held.response.status(), 200, "delayed Titan response was read successfully");

    const currentAccount = accounts.find(account => account !== "titan");
    const currentCandle = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === currentAccount;
    });
    await page.locator(`#account-switcher [data-account="${currentAccount}"]`).click();
    await page.locator(`#account-switcher [data-account="${currentAccount}"][aria-pressed="true"]`).waitFor();
    currentAccountResponse = await currentCandle;
    assert.equal(currentAccountResponse.status(), 200, `current ${currentAccount} response loaded while the prior account was delayed`);
    const verified = await currentAccountResponse.json();
    assert.equal(verified.accountId, currentAccount);
    assert.equal(verified.source, "MT5_VERIFIED");
    assert.equal(verified.canExecute, false);
    await page.waitForFunction(account => window.__mainCandleSeriesCaptures.some(item => item.active === account && item.data.length > 0), currentAccount);

    releaseTitan();
    await page.waitForTimeout(500);
    const state = await page.evaluate(() => ({
      account: window.ChartStudioBeta?.getState?.().account,
      selectedAccount: document.querySelector('#account-switcher [aria-pressed="true"]')?.dataset.account,
      captures: window.__mainCandleSeriesCaptures,
    }));
    assert.equal(state.account, currentAccount, "late old-account data must not change the current chart account");
    assert.equal(state.selectedAccount, currentAccount);
    const activeCaptures = state.captures.filter(item => item.active === currentAccount && item.data.length > 0);
    assert.ok(activeCaptures.length > 0, "current account chart data was rendered");
    const latest = activeCaptures.at(-1).data;
    const expected = verified.candles.map(row => ({
      time: row.time, open: row.open, high: row.high, low: row.low, close: row.close,
    })).sort((a, b) => Number(a.time) - Number(b.time));
    const actual = [...latest].sort((a, b) => Number(a.time) - Number(b.time));
    assert.deepEqual(actual, expected, `late Titan data must never overwrite the active ${currentAccount} chart series`);

    const aliases = accounts;
    const timeframes = ["M5", "M15"];
    let completedCycles = 0;
    for (let index = 0; index < 20; index += 1) {
      const account = aliases[index % aliases.length];
      const timeframe = timeframes[index % timeframes.length];
      const state = await page.evaluate(() => window.ChartStudioBeta.getState());
      let accountResponse = null;
      if (state.account !== account) {
        const responsePromise = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account
            && url.searchParams.get("count") === "1001";
        });
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        accountResponse = await responsePromise;
        assert.equal(accountResponse.status(), 200, `${account}: account-switch candle response`);
        assert.equal((await accountResponse.json()).accountId, account);
      }
      const afterAccount = await page.evaluate(() => window.ChartStudioBeta.getState());
      let finalResponse = accountResponse;
      if (afterAccount.timeframe !== timeframe) {
        const responsePromise = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account
            && url.searchParams.get("tf") === timeframe && url.searchParams.get("count") === "1001";
        });
        await page.locator(`#tf-btn-${timeframe}`).click();
        finalResponse = await responsePromise;
        assert.equal(finalResponse.status(), 200, `${account}/${timeframe}: timeframe candle response`);
      }
      assert.ok(finalResponse, `${account}/${timeframe}: a scoped candle response was observed`);
      const data = await finalResponse.json();
      assert.equal(data.accountId, account);
      assert.equal(data.timeframe, timeframe);
      await page.waitForFunction(({ account, timeframe }) => {
        const state = window.ChartStudioBeta.getState();
        return state.account === account && state.timeframe === timeframe
          && window.__mainCandleSeriesCaptures.some(item => item.active === account
            && item.timeframe === timeframe && item.data.length === 1001);
      }, { account, timeframe });
      const lastActiveSeries = await page.evaluate(({ account, timeframe }) => {
        const state = window.ChartStudioBeta.getState();
        const item = [...window.__mainCandleSeriesCaptures].reverse().find(row => row.active === account
          && row.timeframe === timeframe && row.data.length === 1001);
        return { state, data: item?.data || null };
      }, { account, timeframe });
      assert.equal(lastActiveSeries.state.account, account);
      assert.equal(lastActiveSeries.state.timeframe, timeframe);
      const expectedRows = data.candles.map(row => ({ time: row.time, open: row.open, high: row.high, low: row.low, close: row.close }))
        .sort((a, b) => Number(a.time) - Number(b.time));
      const actualRows = [...lastActiveSeries.data].sort((a, b) => Number(a.time) - Number(b.time));
      assert.deepEqual(actualRows, expectedRows, `${account}/${timeframe}: active renderer must match its own verified API scope`);
      completedCycles += 1;
    }

    assert.deepEqual(browserErrors, []);
    assert.ok(apiRequests.length > 0);
    assert.ok(apiRequests.every(row => row.method === "GET" && row.account !== "blueberry"));
    console.log(JSON.stringify({
      delayedAccount: "titan", activeAccount: state.account, symbol: verified.symbol,
      verifiedBars: expected.length, apiRequests: apiRequests.length,
      verifiedScopeCycles: completedCycles,
      brokerWrites: 0, protectedAccountQueried: false, browserErrors,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
