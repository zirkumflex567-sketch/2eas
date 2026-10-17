"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const OUTPUT_DIR = path.resolve(process.env.CHART_STUDIO_OUTPUT_DIR || "output/v5-live-acceptance");
const ACCOUNTS = [
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
];
const ALLOWLIST = new Set(ACCOUNTS.map(item => item.account));
const FLAG_OFF = "window.CHART_STUDIO_V5_PREVIEW_ENABLED = false;";

(async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
  });
  try {
    const results = [];
    for (const expected of ACCOUNTS) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const apiRequests = [];
      const apiResponses = [];
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        const url = new URL(response.url());
        if (url.pathname.startsWith("/api/")) {
          apiResponses.push({ path: url.pathname, status: response.status() });
        }
        const expectedStaleRisk = ["/api/status", "/api/chart/v1/quotes"].includes(url.pathname) &&
          response.status() === 503;
        if (url.pathname.startsWith("/api/") && response.status() >= 400 && !expectedStaleRisk) {
          errors.push(`HTTP ${response.status()} ${url.pathname}`);
        }
      });
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === BASE_URL && url.pathname === "/" && url.searchParams.has("account")) {
          const response = await route.fetch();
          const html = await response.text();
          assert.ok(html.includes(FLAG_OFF), "server must keep the production v5 flag disabled");
          await route.fulfill({ response, body: html.replace(FLAG_OFF, FLAG_OFF.replace("false", "true")) });
          return;
        }
        if (url.origin === BASE_URL && url.pathname.startsWith("/api/")) {
          const account = url.searchParams.get("account");
          if (request.method() !== "GET" || (account !== null && !ALLOWLIST.has(account))) {
            return route.abort("blockedbyclient");
          }
          apiRequests.push({ method: request.method(), account, path: url.pathname });
        }
        return route.continue();
      });

      const candleResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/candles" && url.searchParams.get("account") === expected.account;
      });
      await page.goto(`${BASE_URL}/?account=${encodeURIComponent(expected.account)}`, { waitUntil: "domcontentloaded" });
      const response = await candleResponse;
      assert.equal(response.status(), 200, `${expected.account}: MT5 candle request`);
      const snapshot = await response.json();
      assert.equal(snapshot.accountId, expected.account);
      assert.equal(snapshot.symbol, expected.symbol);
      assert.equal(snapshot.timeframe, "M15");
      assert.equal(snapshot.source, "MT5_VERIFIED");
      assert.equal(snapshot.canExecute, false);
      assert.ok(Array.isArray(snapshot.candles) && snapshot.candles.length > 0);
      await page.waitForFunction(() => document.querySelectorAll("#tv-chart canvas").length > 0);
      assert.equal(await page.evaluate(() => window.CHART_STUDIO_V5_PREVIEW_ENABLED), true,
        "only the headless acceptance response enables the optional preview");
      await page.locator("#chart-v5-preview-btn").waitFor({ state: "visible" });
      const positionResponsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/chart/v1/positions" && url.searchParams.get("account") === expected.account;
      }, { timeout: 5000 });
      await page.locator("#chart-v5-preview-btn").click();
      const positionResponse = await positionResponsePromise;
      assert.equal(positionResponse.status(), 200, `${expected.account}: MT5 position read`);
      const positions = await positionResponse.json();
      assert.equal(positions.account, expected.account);
      assert.equal(positions.symbol, expected.symbol);
      assert.equal(positions.source, "MT5_VERIFIED");
      assert.equal(positions.canExecute, false);
      assert.ok(Array.isArray(positions.positions));
      const expectedOverlayLines = positions.positions.reduce((count, row) => count + 1 +
        (Number(row.sl) > 0 ? 1 : 0) + (Number(row.tp) > 0 ? 1 : 0), 0);
      await page.waitForFunction(count =>
        document.querySelector("#chart-v5-preview-status")?.textContent.includes(`${count} verifizierte Kerzen`),
      snapshot.candles.length);
      await page.waitForFunction(count => window.ChartStudioV5Preview?.inspect()?.positionOverlayCount === count,
        expectedOverlayLines);
      await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")]
        .some(canvas => canvas.width > 300 && canvas.height > 200));
      const state = await page.evaluate(() => ({
        preview: window.ChartStudioV5Preview.inspect(),
        v4CanvasCount: document.querySelectorAll("#tv-chart canvas").length,
        v5Canvases: [...document.querySelectorAll("#chart-v5-preview-host canvas")]
          .map(canvas => ({ width: canvas.width, height: canvas.height })),
      }));
      assert.equal(state.preview.active, true);
      assert.deepEqual(state.preview.scope, {
        account: expected.account, symbol: expected.symbol, timeframe: "M15",
      });
      assert.match(state.preview.status, new RegExp(`${snapshot.candles.length} verifizierte Kerzen`));
      assert.ok(state.v4CanvasCount > 0, "the production v4 chart remains mounted");
      assert.ok(state.v5Canvases.some(canvas => canvas.width > 300 && canvas.height > 200));
      assert.ok(apiRequests.length > 0);
      assert.ok(apiRequests.every(item => item.method === "GET" &&
        (item.account === null || ALLOWLIST.has(item.account))));
      assert.deepEqual(errors, [], `${expected.account}: browser errors`);
      if (expected.account === "titan") {
        await page.locator("#chart-v5-preview-host").screenshot({ path: path.join(OUTPUT_DIR, "titan-v5-preview.png") });
      }
      results.push({
        account: expected.account,
        symbol: snapshot.symbol,
        timeframe: snapshot.timeframe,
        source: snapshot.source,
        candles: snapshot.candles.length,
        v4Mounted: true,
        v5Canvas: state.v5Canvases.find(canvas => canvas.width > 300 && canvas.height > 200),
        positionCount: positions.positions.length,
        positionOverlayLines: state.preview.positionOverlayCount,
        apiRequests: apiRequests.length,
        staleRiskResponses: apiResponses.filter(item => item.status === 503),
      });
      await page.close();
    }
    console.log(JSON.stringify({ results, mutations: 0, blueberryRequests: 0, browserErrors: 0,
      productionPreviewFlagChanged: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
