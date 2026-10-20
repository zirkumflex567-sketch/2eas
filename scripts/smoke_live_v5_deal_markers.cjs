"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const ACCOUNTS = [
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
  { account: "goldm15", symbol: "XAUUSD" },
];
const ALLOWLIST = new Set(ACCOUNTS.map(({ account }) => account));
const ACCOUNT_NEUTRAL_GETS = new Set(["/api/accounts", "/api/chart/v1/capabilities"]);
const FLAG_OFF = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;";

async function runAccount(browser, expected) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const apiRequests = [];
  const forbiddenRequests = [];
  const candleSnapshots = [];
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("response", async response => {
    const url = new URL(response.url());
    if (url.pathname === "/api/candles" && url.searchParams.get("account") === expected.account) {
      try { candleSnapshots.push(await response.json()); } catch (_) {}
    }
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && url.origin !== BASE_URL) {
      forbiddenRequests.push({ method: request.method(), account: url.searchParams.get("account"), origin: url.origin, path: url.pathname });
      return route.abort("blockedbyclient");
    }
    if (url.origin === BASE_URL && url.pathname === "/" && url.searchParams.has("account")) {
      const response = await route.fetch();
      const html = await response.text();
      assert.ok(html.includes(FLAG_OFF), "server keeps production v5 disabled");
      return route.fulfill({ response, body: html.replace(FLAG_OFF, FLAG_OFF.replace("false", "true")) });
    }
    if (url.origin === BASE_URL && url.pathname.startsWith("/api/")) {
      const account = url.searchParams.get("account");
      const requestInfo = { method: request.method(), account, path: url.pathname };
      if (request.method() !== "GET" || account === "blueberry" ||
          (account !== null && !ALLOWLIST.has(account)) ||
          (account === null && !ACCOUNT_NEUTRAL_GETS.has(url.pathname))) {
        forbiddenRequests.push(requestInfo);
        return route.abort("blockedbyclient");
      }
      apiRequests.push(requestInfo);
    }
    return route.continue();
  });

  try {
    await page.goto(`${BASE_URL}/?account=${encodeURIComponent(expected.account)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /XAUUSD\S* M15 Chart/.test(document.querySelector("#chart-title-text")?.textContent || ""));
    const chartSymbol = (await page.locator("#chart-title-text").textContent()).trim().split(/\s+/)[0];
    assert.match(chartSymbol, /^XAUUSD/i, `${expected.account}: the active chart is Gold`);
    const candleResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === expected.account &&
        url.searchParams.get("symbol") === chartSymbol;
    });
    let candleSnapshot = [...candleSnapshots].reverse().find(item => item.accountId === expected.account && item.symbol === chartSymbol);
    if (!candleSnapshot) {
      const response = await candleResponse;
      assert.equal(response.status(), 200, `${expected.account}: candle read`);
      candleSnapshot = await response.json();
    }
    assert.equal(candleSnapshot.accountId, expected.account);
    assert.equal(candleSnapshot.symbol, chartSymbol);
    assert.equal(candleSnapshot.timeframe, "M15");
    assert.equal(candleSnapshot.source, "MT5_VERIFIED");
    assert.equal(candleSnapshot.canExecute, false);

    await page.locator("#chart-v5-preview-btn").click();
    await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")]
      .some(canvas => canvas.width > 300 && canvas.height > 200));
    await page.locator("#cs-beta-toggle").click();
    await page.locator(".cs-broker-read-panel > summary").click();

    const tradeResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/chart/v1/trades" && url.searchParams.get("account") === expected.account;
    });
    await page.locator("#cs-broker-history-load").click();
    const response = await tradeResponse;
    assert.equal(response.status(), 200, `${expected.account}: verified history read`);
    const history = await response.json();
    assert.equal(history.account, expected.account);
    assert.equal(history.symbol, chartSymbol);
    assert.equal(history.source, "MT5_VERIFIED");
    assert.equal(history.canExecute, false);
    assert.ok(Array.isArray(history.trades));
    assert.ok(history.trades.every(row => row.account === expected.account && row.symbol === expected.symbol &&
      row.source === "MT5_VERIFIED" && row.canExecute === false));
    const eligibleHistoryTickets = history.trades.filter(row =>
      row.account === expected.account && row.symbol === chartSymbol && row.source === "MT5_VERIFIED" &&
      row.canExecute === false && row.status === "EXECUTED" && ["BUY", "SELL"].includes(row.side) &&
      ["IN", "OUT", "INOUT", "OUT_BY"].includes(row.entry) &&
      /^[1-9][0-9]{0,19}$/.test(String(row.ticket)) && Number.isSafeInteger(row.fillTime?.utcEpochMs) &&
      row.fillTime.utcEpochMs > 0 && Number.isFinite(Number(row.price)) && Number(row.price) > 0);
    const eligibleTickets = eligibleHistoryTickets.map(row => String(row.ticket)).sort();
    await page.waitForFunction(() => document.querySelector("#cs-broker-history-status")?.textContent
      .includes("Quelle MT5_VERIFIED"));

    const state = await page.evaluate(() => ({
      brokerMarkers: window.ChartStudioBeta.getState().brokerMarkers,
      preview: window.ChartStudioV5Preview.readBrokerDealMarkers(),
      previewActive: window.ChartStudioV5Preview.inspect().active,
      previewScope: window.ChartStudioV5Preview.inspect().scope,
      v4Visible: !!document.querySelector("#tv-chart")?.getClientRects().length,
    }));
    assert.equal(state.previewActive, true);
    assert.equal(state.v4Visible, true, "the v4 production chart remains visible");
    const previewTickets = state.preview.markers.map(row => row.ticket).sort();
    const betaTickets = state.brokerMarkers.map(row => row.ticket).sort();
    assert.deepEqual(betaTickets, eligibleTickets,
      "the existing Broker Panel delivers every eligible verified fill to Beta");
    assert.deepEqual(previewTickets, eligibleTickets,
      "the existing Broker Panel path delivers the same verified fills to the native preview");
    assert.equal(state.preview.plotted + state.preview.unplotted, state.brokerMarkers.length);
    const candleTimes = new Set(candleSnapshot.candles.map(row => row.time));
    assert.ok(state.preview.markers.every(row => row.plotted === candleTimes.has(row.chartTimeSeconds)),
      "fills are plotted only when their exact UTC candle timestamp is loaded");
    assert.ok(apiRequests.every(request => request.method === "GET"));
    assert.deepEqual(forbiddenRequests, [], "no write, unscoped, non-allowlisted, Blueberry, or external API attempt");
    assert.equal([...apiRequests, ...forbiddenRequests].some(request => request.account === "blueberry"), false);
    assert.deepEqual(browserErrors, []);

    return {
      account: expected.account,
      historyDeals: history.trades.length,
      eligibleDeals: eligibleTickets.length,
      acceptedMarkers: state.brokerMarkers.length,
      plotted: state.preview.plotted,
      unplotted: state.preview.unplotted,
      apiRequests: apiRequests.length,
      mutations: forbiddenRequests.filter(request => request.method !== "GET").length,
      forbiddenRequests: forbiddenRequests.length,
      blueberryRequests: [...apiRequests, ...forbiddenRequests].filter(request => request.account === "blueberry").length,
      browserErrors: browserErrors.length,
    };
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
  });
  try {
    const results = [];
    for (const account of ACCOUNTS) results.push(await runAccount(browser, account));
    const totals = {
      totalMutations: results.reduce((sum, item) => sum + item.mutations, 0),
      forbiddenRequests: results.reduce((sum, item) => sum + item.forbiddenRequests, 0),
      blueberryRequests: results.reduce((sum, item) => sum + item.blueberryRequests, 0),
    };
    assert.deepEqual(totals, { totalMutations: 0, forbiddenRequests: 0, blueberryRequests: 0 });
    console.log(JSON.stringify({ results, ...totals }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
