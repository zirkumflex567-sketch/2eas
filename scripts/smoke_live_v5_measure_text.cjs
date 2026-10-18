"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const ACCOUNTS = [
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
];
const ALLOWLIST = new Set(ACCOUNTS.map(({ account }) => account));
const ACCOUNT_NEUTRAL_GETS = new Set(["/api/accounts", "/api/chart/v1/capabilities"]);
const FLAG_OFF = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;";

async function runAccount(browser, expected) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
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
      assert.ok(html.includes(FLAG_OFF), "the production v5 preview flag must stay disabled");
      await route.fulfill({ response, body: html.replace(FLAG_OFF, FLAG_OFF.replace("false", "true")) });
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
    const candles = await candleResponse.json();
    assert.equal(candles.accountId, expected.account);
    assert.equal(candles.symbol, expected.symbol);
    assert.equal(candles.timeframe, "M15");
    assert.equal(candles.source, "MT5_VERIFIED");
    assert.equal(candles.canExecute, false);
    assert.ok(Array.isArray(candles.candles) && candles.candles.length >= 150);
    await page.locator("#tv-chart canvas").first().waitFor({ state: "visible" });

    await page.locator("#chart-v5-preview-btn").click();
    await page.waitForFunction(count => window.ChartStudioV5Preview?.inspect().active === true &&
      [...document.querySelectorAll("#chart-v5-preview-host canvas")].some(canvas => canvas.width > 300 && canvas.height > 200) &&
      document.querySelector("#tv-chart")?.__candleSeries?.data?.().length === count, candles.candles.length);
    await page.evaluate(() => document.querySelector("#chart-v5-preview-host").addEventListener(
      "chartstudio-v5-drawing-state", event => { window.__liveV5DrawingEvent = event.detail; }));
    const chart = await page.locator("#chart-v5-preview-host").boundingBox();
    assert.ok(chart && chart.width > 500 && chart.height > 250, `${expected.account}: v5 plot host rendered`);

    await page.locator("#chart-v5-measure-btn").click();
    const plot = await page.locator("#chart-v5-preview-host canvas").first().boundingBox();
    assert.ok(plot && plot.width > 400 && plot.height > 300, `${expected.account}: native v5 price plot is hittable`);
    await page.mouse.click(plot.x + plot.width * 0.25, plot.y + plot.height * 0.3);
    await page.mouse.click(plot.x + plot.width * 0.55, plot.y + plot.height * 0.7);
    await page.waitForFunction(() => window.__liveV5DrawingEvent?.phase === "CREATED" &&
      window.__liveV5DrawingEvent?.kind === "MEASURE", null, { timeout: 5000 }).catch(async error => {
      const state = await page.evaluate(() => ({ event: window.__liveV5DrawingEvent,
        status: document.querySelector("#chart-v5-drawing-status")?.textContent,
        inspection: window.ChartStudioV5Preview.inspect(),
        host: document.querySelector("#chart-v5-preview-host")?.getBoundingClientRect().toJSON(),
        canvases: [...document.querySelectorAll("#chart-v5-preview-host canvas")].map(canvas => canvas.getBoundingClientRect().toJSON()),
      }));
      throw new Error(`${error.message}; measurement state=${JSON.stringify(state)}`);
    });
    const measurement = await page.evaluate(() => ({
      event: window.__liveV5DrawingEvent,
      drawing: window.ChartStudioV5Preview.readDrawing(window.__liveV5DrawingEvent?.id),
      count: window.ChartStudioV5Preview.inspect().nativeDrawingCount,
    }));
    assert.ok(measurement.drawing?.id);
    assert.notEqual(measurement.drawing.startTime, measurement.drawing.endTime);
    assert.ok(Number.isFinite(measurement.drawing.startPrice) && Number.isFinite(measurement.drawing.endPrice));
    assert.equal(measurement.count, 1);

    await page.locator("#chart-v5-text-input").fill("Live demo note");
    await page.locator("#chart-v5-text-btn").click();
    await page.mouse.click(plot.x + plot.width * 0.4, plot.y + plot.height * 0.45);
    await page.waitForFunction(() => window.__liveV5DrawingEvent?.phase === "CREATED" &&
      window.__liveV5DrawingEvent?.kind === "TEXT", null, { timeout: 5000 });
    const annotation = await page.evaluate(() => ({
      event: window.__liveV5DrawingEvent,
      drawing: window.ChartStudioV5Preview.readDrawing(window.__liveV5DrawingEvent?.id),
      count: window.ChartStudioV5Preview.inspect().nativeDrawingCount,
      v4Visible: !!document.querySelector("#tv-chart")?.getClientRects().length,
    }));
    assert.ok(annotation.drawing?.id);
    assert.equal(annotation.drawing.text, "Live demo note");
    assert.equal(annotation.count, 2);
    assert.equal(annotation.v4Visible, true, "the production v4 chart remains mounted");
    assert.deepEqual(rejectedRequests, [], `${expected.account}: no mutation, Blueberry, or other-account request`);
    assert.ok(apiRequests.length > 0);
    assert.ok(apiRequests.every(item => item.method === "GET"));
    assert.deepEqual(browserErrors, [], `${expected.account}: no browser errors`);
    return {
      account: expected.account,
      symbol: expected.symbol,
      candles: candles.candles.length,
      source: candles.source,
      measurement: { startTime: measurement.drawing.startTime, endTime: measurement.drawing.endTime },
      annotation: annotation.drawing.text,
      v4Mounted: annotation.v4Visible,
      apiRequests: apiRequests.length,
      rejectedRequests: rejectedRequests.length,
      browserErrors: browserErrors.length,
    };
  } finally {
    await context.close();
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
    console.log(JSON.stringify({ results, mutations: 0, blueberryRequests: 0, browserErrors: 0,
      productionPreviewFlagChanged: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
