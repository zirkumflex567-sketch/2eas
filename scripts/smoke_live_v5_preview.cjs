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
  { account: "goldm15", symbol: "XAUUSD" },
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
      await page.waitForFunction(count =>
        document.querySelector("#tv-chart")?.__candleSeries?.data?.().length === count,
      snapshot.candles.length);
      await page.waitForFunction(count => window.ChartStudioV5Preview?.inspect()?.positionOverlayCount === count,
        expectedOverlayLines);
      const positionOverlay = await page.evaluate(() => window.ChartStudioV5Preview.readPositions());
      const expectedZones = positions.positions.reduce((count, row) => count +
        (Number(row.sl) > 0 ? 1 : 0) + (Number(row.tp) > 0 ? 1 : 0), 0);
      const marginModes = { 0: "NETTING", 1: "EXCHANGE", 2: "HEDGING" };
      assert.equal(positionOverlay.positionCount, positions.positions.length,
        `${expected.account}: native v5 readback retains each broker position as a separate ticket`);
      assert.equal(positionOverlay.zoneCount, expectedZones,
        `${expected.account}: native v5 exposes exactly the broker-provided SL/TP zones`);
      assert.equal(positionOverlay.currency, positions.currency);
      assert.equal(positionOverlay.marginMode, marginModes[positions.marginMode]);
      for (const source of positions.positions) {
        const rendered = positionOverlay.positions.find(row => row.ticket === source.ticket);
        assert.ok(rendered, `${expected.account}: position ${source.ticket} is present in native v5 readback`);
        assert.equal(rendered.side, source.side);
        assert.equal(rendered.volume, Number(source.volume));
        assert.equal(rendered.entryPrice, Number(source.priceOpen));
        assert.equal(rendered.stopLoss, source.sl === null ? null : Number(source.sl));
        assert.equal(rendered.takeProfit, source.tp === null ? null : Number(source.tp));
        assert.equal(rendered.currency, source.currency);
        assert.equal(rendered.profit, Number(source.profit));
        assert.equal(rendered.swap, Number(source.swap));
        assert.match(rendered.label, new RegExp(`${source.side} ${Number(source.volume).toFixed(2)}L #${source.ticket}`));
        assert.match(rendered.label, new RegExp(`P/L ${Number(source.profit).toFixed(2)} ${source.currency} · Swap ${Number(source.swap).toFixed(2)} ${source.currency}`));
        if (source.usdConversion?.state === "AVAILABLE") {
          assert.equal(rendered.usdProfit, Number(source.usdConversion.amountsUsd.profit));
          assert.equal(rendered.usdSwap, Number(source.usdConversion.amountsUsd.swap));
          assert.match(rendered.label, new RegExp(`USD P/L ${Number(source.usdConversion.amountsUsd.profit).toFixed(2)} · Swap ${Number(source.usdConversion.amountsUsd.swap).toFixed(2)}`));
        } else {
          assert.equal(rendered.usdProfit, null);
          assert.equal(rendered.usdSwap, null);
          assert.doesNotMatch(rendered.label, /USD P\/L/,
            `${expected.account}: no USD value may appear without a verified conversion`);
        }
      }
      await page.waitForFunction(() => [...document.querySelectorAll("#chart-v5-preview-host canvas")]
        .some(canvas => canvas.width > 300 && canvas.height > 200));
      await page.locator("#chart-v5-ellipse-btn").click();
      const drawingCanvas = await page.locator("#chart-v5-preview-host canvas").evaluateAll(canvases => {
        const canvas = canvases.find(item => item.width > 300 && item.height > 200);
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      assert.ok(drawingCanvas, `${expected.account}: native v5 drawing canvas is measurable`);
      await page.mouse.click(drawingCanvas.x + drawingCanvas.width * 0.4,
        drawingCanvas.y + drawingCanvas.height * 0.4);
      await page.mouse.click(drawingCanvas.x + drawingCanvas.width * 0.6,
        drawingCanvas.y + drawingCanvas.height * 0.6);
      const ellipse = await page.waitForFunction(scope => {
        const key = `2eas.chartstudio.v5.drawings:v5:${encodeURIComponent(scope.account)}:${encodeURIComponent(scope.symbol)}:M15`;
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const layout = JSON.parse(raw);
        const row = layout.drawings?.find(item => item.kind === "ELLIPSE");
        return row ? { kind: row.kind, options: row.options } : null;
      }, expected, { timeout: 5000 }).then(handle => handle.jsonValue());
      assert.equal(ellipse.kind, "ELLIPSE", `${expected.account}: live verified bars accept a native ellipse`);
      assert.ok(Number.isSafeInteger(ellipse.options.startTime) && ellipse.options.startTime > 0);
      assert.ok(Number.isSafeInteger(ellipse.options.endTime) && ellipse.options.endTime > ellipse.options.startTime);
      assert.ok(Number.isFinite(ellipse.options.startPrice) && ellipse.options.startPrice > 0);
      assert.ok(Number.isFinite(ellipse.options.endPrice) && ellipse.options.endPrice > 0);
      const state = await page.evaluate(() => ({
        preview: window.ChartStudioV5Preview.inspect(),
        v4CanvasCount: document.querySelectorAll("#tv-chart canvas").length,
        v4CandleCount: document.querySelector("#tv-chart")?.__candleSeries?.data?.().length ?? 0,
        v5Canvases: [...document.querySelectorAll("#chart-v5-preview-host canvas")]
          .map(canvas => ({ width: canvas.width, height: canvas.height })),
      }));
      assert.equal(state.preview.active, true);
      assert.deepEqual(state.preview.scope, {
        account: expected.account, symbol: expected.symbol, timeframe: "M15",
      });
      assert.match(state.preview.status, new RegExp(`${snapshot.candles.length} verifizierte Kerzen`));
      assert.ok(state.v4CanvasCount > 0, "the production v4 chart remains mounted");
      assert.equal(state.v4CandleCount, snapshot.candles.length,
        `${expected.account}: the production v4 chart must contain the verified candle feed`);
      assert.ok(state.v5Canvases.some(canvas => canvas.width > 300 && canvas.height > 200));
      assert.ok(apiRequests.length > 0);
      assert.ok(apiRequests.every(item => item.method === "GET" &&
        (item.account === null || ALLOWLIST.has(item.account))));
      assert.deepEqual(errors, [], `${expected.account}: browser errors`);
      if (expected.account === "titan") {
        await page.locator("#tv-chart").screenshot({ path: path.join(OUTPUT_DIR, "titan-v4-main.png") });
        await page.locator("#chart-v5-preview-host").screenshot({ path: path.join(OUTPUT_DIR, "titan-v5-preview.png") });
      }
      results.push({
        account: expected.account,
        symbol: snapshot.symbol,
        timeframe: snapshot.timeframe,
        source: snapshot.source,
        candles: snapshot.candles.length,
        v4Mounted: true,
        v4CandleCount: state.v4CandleCount,
        v5Canvas: state.v5Canvases.find(canvas => canvas.width > 300 && canvas.height > 200),
        positionCount: positions.positions.length,
        positionOverlayLines: state.preview.positionOverlayCount,
        ellipse: { kind: ellipse.kind, startTime: ellipse.options.startTime, endTime: ellipse.options.endTime },
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
