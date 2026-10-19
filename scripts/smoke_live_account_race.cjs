"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { classifyLiveDemoRequest } = require("./live_demo_scope_guard.cjs");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const baseUrl = new URL(base);
const basePath = baseUrl.pathname.replace(/\/$/, "");
const allowedAccounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const demoSymbols = {
  titan: "XAUUSD", xau5m_m5: "XAUUSD.p", titan_m5: "XAUUSD.p", xau5m_500: "XAUUSD.p", goldm15: "XAUUSD",
};
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : allowedAccounts;
assert.ok(accounts.includes("titan") && accounts.length >= 2
  && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must include titan and only configured non-Blueberry demo aliases");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const apiRequests = [];
    const blockedApiRequests = [];
    const browserErrors = [];
    let heldTitanReady;
    let releaseTitan;
    const titanReady = new Promise(resolve => { heldTitanReady = resolve; });
    const titanGate = new Promise(resolve => { releaseTitan = resolve; });
    let heldTitanRequest = false;
    let heldTitanStatusReady;
    let releaseTitanStatus;
    const titanStatusReady = new Promise(resolve => { heldTitanStatusReady = resolve; });
    const titanStatusGate = new Promise(resolve => { releaseTitanStatus = resolve; });
    let heldTitanStatusRequest = false;
    let currentAccountResponse;
    let holdTitanM5Request = false;
    let heldTitanM5Ready;
    let releaseTitanM5;
    const titanM5Ready = new Promise(resolve => { heldTitanM5Ready = resolve; });
    const titanM5Gate = new Promise(resolve => { releaseTitanM5 = resolve; });

    page.on("pageerror", error => browserErrors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== baseUrl.origin) return;
      const scope = classifyLiveDemoRequest({ url, method: request.method(), basePath, allowedAccounts: accounts });
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(`${basePath}/api/`)) return;
      const account = url.searchParams.get("account");
      apiRequests.push({ account, path: pathname.slice(basePath.length), method: request.method() });
      if (!scope.allowed) blockedApiRequests.push({ path: pathname.slice(basePath.length), account, reason: scope.reason });
    });

    await page.addInitScript(() => { window.__mainCandleSeriesCaptures = []; });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === baseUrl.origin) {
        const scope = classifyLiveDemoRequest({ url, method: route.request().method(), basePath, allowedAccounts: accounts });
        if (!scope.allowed) {
          blockedApiRequests.push({ path: url.pathname, account: url.searchParams.get("account"), reason: scope.reason });
          await route.abort("blockedbyclient");
          return;
        }
        if (scope.kind === "global_read" && scope.endpoint === "/api/accounts") {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            default: accounts[0],
            accounts: accounts.map(id => ({ id, name: id, login: "Demo", server: "Demo", symbol: demoSymbols[id],
              timeframe: "M15", is_demo: true, challenge_protection: false, capacity: 3 })),
          }) });
          return;
        }
        if (scope.kind === "global_read" && scope.endpoint === "/api/chart/v1/capabilities") {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
            accountScopes: accounts, symbols: Object.values(demoSymbols),
            timeframes: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"], features: { encryptedDeviceSync: false },
          }) });
          return;
        }
        if (scope.endpoint === "/api/candles" && scope.account === "titan" && !heldTitanRequest) {
          heldTitanRequest = true;
          const response = await route.fetch();
          const body = await response.body();
          heldTitanReady({ route, response, body });
          await titanGate;
          await route.fulfill({ response, body });
          return;
        }
        if (scope.endpoint === "/api/status" && scope.account === "titan" && !heldTitanStatusRequest) {
          heldTitanStatusRequest = true;
          const response = await route.fetch();
          const body = await response.body();
          heldTitanStatusReady({ route, response, body });
          await titanStatusGate;
          await route.fulfill({ response, body });
          return;
        }
        if (scope.endpoint === "/api/candles" && scope.account === "titan" && holdTitanM5Request
          && url.searchParams.get("tf") === "M5") {
          holdTitanM5Request = false;
          const response = await route.fetch();
          const body = await response.body();
          heldTitanM5Ready({ route, response, body });
          await titanM5Gate;
          await route.fulfill({ response, body });
          return;
        }
      }
      await route.continue();
    });
    await page.route("**/static/lightweight-charts.js", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const hook = `;(()=>{const api=window.LightweightCharts,createChart=api.createChart,wrappedCreate=(...args)=>{const chart=createChart.apply(api,args),add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=function(...seriesArgs){const series=add(...seriesArgs),setData=series.setData.bind(series);series.setData=function(rows){const data=Array.isArray(rows)?rows.map(row=>({time:row.time,open:row.open,high:row.high,low:row.low,close:row.close})):[];const active=document.querySelector('#account-switcher [aria-pressed="true"]')?.dataset.account||null;const timeframe=document.querySelector('[id^="tf-btn-"].bg-blue-600')?.id.replace('tf-btn-','')||null;window.__mainCandleSeriesCaptures.push({active,timeframe,data});return setData(rows)};return series};return chart};window.LightweightCharts={...api,createChart:wrappedCreate,__mainCandleCaptureInstalled:true}})();`;
      await route.fulfill({ response, body: source + hook });
    });

    await page.goto(`${base}/?account=titan`, { waitUntil: "domcontentloaded" });
    const held = await titanReady;
    assert.equal(held.response.status(), 200, "delayed Titan response was read successfully");
    const heldStatus = await titanStatusReady;
    assert.equal(heldStatus.response.status(), 200, "delayed Titan position snapshot was read successfully");
    const staleTitanStatus = JSON.parse(heldStatus.body.toString("utf8"));
    assert.equal(staleTitanStatus.account?.id, "titan");
    assert.ok(Array.isArray(staleTitanStatus.positions));

    const currentAccount = accounts.find(account => account !== "titan");
    const currentCandle = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === currentAccount;
    });
    const currentStatus = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `${basePath}/api/status` && url.searchParams.get("account") === currentAccount;
    });
    await page.locator(`#account-switcher [data-account="${currentAccount}"]`).click();
    await page.locator(`#account-switcher [data-account="${currentAccount}"][aria-pressed="true"]`).waitFor();
    currentAccountResponse = await currentCandle;
    assert.equal(currentAccountResponse.status(), 200, `current ${currentAccount} response loaded while the prior account was delayed`);
    const currentStatusResponse = await currentStatus;
    assert.equal(currentStatusResponse.status(), 200, `current ${currentAccount} positions loaded while the prior account was delayed`);
    const verifiedCurrentStatus = await currentStatusResponse.json();
    assert.equal(verifiedCurrentStatus.account?.id, currentAccount);
    assert.ok(Array.isArray(verifiedCurrentStatus.positions));
    const expectedTickets = verifiedCurrentStatus.positions.map(position => String(position.ticket)).sort();
    await page.waitForFunction(expected => {
      const visible = [...document.querySelectorAll("#positions-list [data-position-ticket]")]
        .map(row => row.dataset.positionTicket).sort();
      return JSON.stringify(visible) === JSON.stringify(expected);
    }, expectedTickets);
    const verified = await currentAccountResponse.json();
    assert.equal(verified.accountId, currentAccount);
    assert.equal(verified.source, "MT5_VERIFIED");
    assert.equal(verified.canExecute, false);
    await page.waitForFunction(account => window.__mainCandleSeriesCaptures.some(item => item.active === account && item.data.length > 0), currentAccount);

    releaseTitanStatus();
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
    const displayedTickets = await page.locator("#positions-list [data-position-ticket]").evaluateAll(rows => rows.map(row => row.dataset.positionTicket).sort());
    assert.deepEqual(displayedTickets, expectedTickets,
      `late Titan positions must not replace the active ${currentAccount} broker positions`);
    assert.equal(state.account, currentAccount, "late Titan positions must not change active chart account");

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

    // Deliver an older timeframe response only after the newer selection has rendered.
    const titanAccountResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `${basePath}/api/candles` && url.searchParams.get("account") === "titan"
        && url.searchParams.get("count") === "1001";
    });
    await page.locator('#account-switcher [data-account="titan"]').click();
    await titanAccountResponse;
    let titanState = await page.evaluate(() => window.ChartStudioBeta.getState());
    if (titanState.timeframe !== "M15") {
      const m15Response = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === `${basePath}/api/candles` && url.searchParams.get("account") === "titan"
          && url.searchParams.get("tf") === "M15" && url.searchParams.get("count") === "1001";
      });
      await page.locator("#tf-btn-M15").click();
      await m15Response;
    }
    holdTitanM5Request = true;
    const delayedM5 = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `${basePath}/api/candles` && url.searchParams.get("account") === "titan"
        && url.searchParams.get("tf") === "M5" && url.searchParams.get("count") === "1001";
    });
    await page.locator("#tf-btn-M5").click();
    const heldM5 = await titanM5Ready;
    assert.equal(heldM5.response.status(), 200, "older Titan/M5 response is held after retrieval");
    const heldM5Data = JSON.parse(heldM5.body.toString("utf8"));
    assert.equal(heldM5Data.accountId, "titan");
    assert.equal(heldM5Data.timeframe, "M5");
    const freshM15ResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `${basePath}/api/candles` && url.searchParams.get("account") === "titan"
        && url.searchParams.get("tf") === "M15" && url.searchParams.get("count") === "1001";
    });
    await page.locator("#tf-btn-M15").click();
    const freshM15Response = await freshM15ResponsePromise;
    assert.equal(freshM15Response.status(), 200);
    const freshM15 = await freshM15Response.json();
    assert.equal(freshM15.accountId, "titan");
    assert.equal(freshM15.timeframe, "M15");
    await page.waitForFunction(() => {
      const state = window.ChartStudioBeta.getState();
      return state.account === "titan" && state.timeframe === "M15"
        && window.__mainCandleSeriesCaptures.some(item => item.active === "titan"
          && item.timeframe === "M15" && item.data.length === 1001);
    });
    releaseTitanM5();
    const oldM5Response = await delayedM5;
    assert.equal(oldM5Response.status(), 200);
    await page.waitForTimeout(300);
    titanState = await page.evaluate(() => ({
      state: window.ChartStudioBeta.getState(),
      selectedTimeframe: document.querySelector('[id^="tf-btn-"].bg-blue-600')?.id.replace("tf-btn-", ""),
      capture: [...window.__mainCandleSeriesCaptures].reverse().find(item => item.active === "titan"
        && item.timeframe === "M15" && item.data.length === 1001)?.data,
    }));
    assert.equal(titanState.state.account, "titan");
    assert.equal(titanState.state.timeframe, "M15", "late M5 data must not roll active state back");
    assert.equal(titanState.selectedTimeframe, "M15");
    const expectedM15 = freshM15.candles.map(row => ({
      time: row.time, open: row.open, high: row.high, low: row.low, close: row.close,
    })).sort((a, b) => Number(a.time) - Number(b.time));
    assert.deepEqual([...titanState.capture].sort((a, b) => Number(a.time) - Number(b.time)), expectedM15,
      "late Titan/M5 data must not overwrite the newer Titan/M15 series");

    assert.deepEqual(browserErrors, []);
    assert.deepEqual(blockedApiRequests, [], "no mutation or out-of-scope API request left the browser");
    assert.ok(apiRequests.length > 0);
    assert.ok(apiRequests.every(row => row.method === "GET" && (row.account === null || accounts.includes(row.account))));
    const verifiedAccounts = [...new Set(apiRequests.map(row => row.account).filter(account => accounts.includes(account)))].sort();
    assert.deepEqual(verifiedAccounts, [...accounts].sort(), "rapid scope cycles exercised every authorized demo alias");
    console.log(JSON.stringify({
      delayedAccount: "titan", activeAccount: state.account, symbol: verified.symbol,
      verifiedBars: expected.length, apiRequests: apiRequests.length,
      verifiedScopeCycles: completedCycles, verifiedAccounts, delayedTimeframeRace: "Titan M5 behind Titan M15",
      heldTitanPositionRows: staleTitanStatus.positions.length,
      currentPositionRows: expectedTickets.length,
      brokerWrites: 0, protectedAccountQueried: false, browserErrors,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
