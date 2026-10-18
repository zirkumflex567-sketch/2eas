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
const PREVIEW_OFF = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;";

async function runAccount(browser, expected) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  const apiRequests = [];
  const rejectedRequests = [];
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));

  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && url.origin !== BASE_URL) {
      rejectedRequests.push({ method: request.method(), account: url.searchParams.get("account"), path: url.pathname, origin: url.origin });
      return route.abort("blockedbyclient");
    }
    if (url.origin === BASE_URL && url.pathname === "/" && url.searchParams.has("account")) {
      const response = await route.fetch();
      const html = await response.text();
      assert.ok(html.includes(PREVIEW_OFF), "production must keep the v5 preview disabled");
      await route.fulfill({ response, body: html.replace(PREVIEW_OFF, PREVIEW_OFF.replace("false", "true")) });
      return;
    }
    if (url.origin === BASE_URL && url.pathname.startsWith("/api/")) {
      const account = url.searchParams.get("account");
      const neutral = account === null && ACCOUNT_NEUTRAL_GETS.has(url.pathname);
      if (request.method() !== "GET" || (account !== null && !ALLOWLIST.has(account)) || (!neutral && account === null)) {
        rejectedRequests.push({ method: request.method(), account, path: url.pathname });
        return route.abort("blockedbyclient");
      }
      apiRequests.push({ method: request.method(), account, path: url.pathname });
    }
    return route.continue();
  });

  try {
    const candleResponsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === expected.account &&
        url.searchParams.get("symbol") === expected.symbol;
    });
    await page.goto(`${BASE_URL}/?account=${encodeURIComponent(expected.account)}`, { waitUntil: "domcontentloaded" });
    const candleResponse = await candleResponsePromise;
    assert.equal(candleResponse.status(), 200, `${expected.account}: verified candle feed`);
    const feed = await candleResponse.json();
    assert.equal(feed.accountId, expected.account);
    assert.equal(feed.symbol, expected.symbol);
    assert.equal(feed.timeframe, "M15");
    assert.equal(feed.source, "MT5_VERIFIED");
    assert.equal(feed.canExecute, false);
    assert.ok(Array.isArray(feed.candles) && feed.candles.length >= 150);
    await page.locator("#tv-chart canvas").first().waitFor({ state: "visible" });

    await page.locator("#chart-v5-preview-btn").click();
    await page.waitForFunction(count => window.ChartStudioV5Preview?.inspect().active === true &&
      [...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas => canvas.width > 300 && canvas.height > 200) &&
      document.querySelector("#tv-chart")?.__candleSeries?.data?.().length === count, feed.candles.length);
    await page.evaluate(() => {
      window.__liveRiskRewardEvent = null;
      document.querySelector("#chart-v5-preview-host").addEventListener(
        "chartstudio-v5-drawing-state", event => { window.__liveRiskRewardEvent = event.detail; });
    });
    await page.locator("#chart-v5-preview-host").scrollIntoViewIfNeeded();
    const plot = await page.locator("#chart-v5-preview-host canvas").first().boundingBox();
    assert.ok(plot && plot.width > 400 && plot.height > 300, `${expected.account}: live v5 price plot is interactive`);

    const placements = [];
    for (const direction of ["LONG", "SHORT"]) {
      await page.evaluate(() => { window.__liveRiskRewardEvent = null; });
      await page.locator("#chart-v5-risk-reward-btn").click();
      const anchors = direction === "LONG"
        ? [[0.26, 0.5], [0.44, 0.78], [0.70, 0.20]] // entry, stop below, target above
        : [[0.26, 0.5], [0.44, 0.20], [0.70, 0.78]]; // entry, stop above, target below
      for (const [x, y] of anchors) {
        await page.mouse.click(plot.x + plot.width * x, plot.y + plot.height * y);
      }
      await page.waitForFunction(() => window.__liveRiskRewardEvent?.phase === "CREATED" &&
        window.__liveRiskRewardEvent?.kind === "RISK_REWARD", null, { timeout: 7000 }).catch(async error => {
        const state = await page.evaluate(() => ({ event: window.__liveRiskRewardEvent,
          status: document.querySelector("#chart-v5-drawing-status")?.textContent,
          tool: window.ChartStudioV5Preview.inspect().drawingTool,
          drawings: window.ChartStudioV5Preview.inspect().nativeDrawingCount }));
        throw new Error(`${error.message}; ${expected.account} risk/reward state=${JSON.stringify(state)}`);
      });
      const drawing = await page.evaluate(() => window.ChartStudioV5Preview.readDrawing(window.__liveRiskRewardEvent.id));
      assert.ok(drawing?.id, `${expected.account}: ${direction} drawing persisted in the active chart scope`);
      for (const field of ["entryPrice", "stopPrice", "targetPrice", "riskRewardRatio"]) {
        assert.ok(Number.isFinite(drawing[field]), `${expected.account}: ${direction} ${field} is numeric`);
      }
      assert.ok(drawing.riskRewardRatio > 0, `${expected.account}: ${direction} has a derived positive ratio`);
      assert.ok(Math.abs(drawing.riskRewardRatio -
        Math.abs(drawing.targetPrice - drawing.entryPrice) / Math.abs(drawing.entryPrice - drawing.stopPrice)) < 1e-10,
      `${expected.account}: ${direction} ratio is recomputed from its three price anchors`);
      if (direction === "LONG") {
        assert.ok(drawing.stopPrice < drawing.entryPrice && drawing.entryPrice < drawing.targetPrice,
          `${expected.account}: long stop < entry < target`);
      } else {
        assert.ok(drawing.targetPrice < drawing.entryPrice && drawing.entryPrice < drawing.stopPrice,
          `${expected.account}: short target < entry < stop`);
      }
      assert.equal(await page.evaluate(() => window.ChartStudioV5Preview.inspect().nativeDrawingCount), placements.length + 1,
        `${expected.account}: each placement is stored exactly once`);
      placements.push({ direction, drawing });
    }

    const portable = await page.evaluate(() => JSON.parse(window.ChartStudioV5Preview.exportLayout()));
    const portableRiskRewards = portable.drawings.filter(row => row.kind === "RISK_REWARD");
    assert.equal(portableRiskRewards.length, 2, `${expected.account}: both drawings survive portable export`);
    assert.ok(portableRiskRewards.every(row => !Object.hasOwn(row.options, "riskRewardRatio")),
      `${expected.account}: import/export cannot override the ratio derived from prices`);
    assert.equal(await page.locator("#tv-chart").isVisible(), true, `${expected.account}: production v4 chart remains mounted`);
    assert.ok(apiRequests.length > 0 && apiRequests.every(item => item.method === "GET"));
    assert.deepEqual(rejectedRequests, [], `${expected.account}: no write, Blueberry, or other-account request`);
    assert.deepEqual(browserErrors, [], `${expected.account}: no browser errors`);
    return { account: expected.account, symbol: expected.symbol, timeframe: feed.timeframe,
      verifiedBars: feed.candles.length,
      directions: placements.map(item => ({ direction: item.direction, entry: item.drawing.entryPrice,
        stop: item.drawing.stopPrice, target: item.drawing.targetPrice, ratio: item.drawing.riskRewardRatio })),
      portableDrawings: portableRiskRewards.length, v4Mounted: true,
      apiRequests: apiRequests.length, rejectedRequests: rejectedRequests.length, browserErrors: browserErrors.length };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  try {
    const results = [];
    for (const account of ACCOUNTS) results.push(await runAccount(browser, account));
    console.log(JSON.stringify({ results, apiRequests: results.reduce((sum, row) => sum + row.apiRequests, 0),
      mutations: 0, blueberryRequests: 0, browserErrors: 0, productionPreviewFlagChanged: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
