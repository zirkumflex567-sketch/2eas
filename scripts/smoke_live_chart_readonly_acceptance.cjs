"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const accounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const outputDir = path.resolve(process.env.CHART_STUDIO_OUTPUT_DIR || "output");
fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1728, height: 1200 } });
    const failures = [];
    const mutations = [];
    const requests = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      const account = url.searchParams.get("account");
      assert.notEqual(account, "blueberry", "protected account request");
      if (request.method() !== "GET") mutations.push({ method: request.method(), path: url.pathname });
      requests.push({ method: request.method(), account, path: url.pathname });
    });
    page.on("pageerror", error => failures.push(error.message));
    page.on("response", response => {
      if (!response.url().includes("/api/")) return;
      if (response.status() >= 400 && !response.url().includes("/api/status?")) {
        failures.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });

    const results = [];
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      if (index === 0) {
        const candle = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account;
        });
        await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
        const response = await candle;
        assert.ok(response.ok(), `${account} candle HTTP ${response.status()}`);
      } else {
        const candle = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account;
        });
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
        const response = await candle;
        assert.ok(response.ok(), `${account} candle HTTP ${response.status()}`);
      }

      const candles = await page.evaluate(async id => {
        const response = await fetch(`/api/candles?account=${encodeURIComponent(id)}`);
        return { ok: response.ok, body: await response.json() };
      }, account);
      assert.ok(candles.ok, `${account} candle read failed`);
      assert.equal(candles.body.accountId, account);
      assert.equal(candles.body.source, "MT5_VERIFIED");
      assert.equal(candles.body.canExecute, false);
      assert.equal(candles.body.candles.length, 150);
      await page.waitForFunction(() => {
        const status = document.querySelector("#chart-load-status")?.textContent?.trim();
        const series = document.querySelector("#tv-chart")?.__candleSeries;
        const canvas = document.querySelector("#tv-chart canvas");
        return status === "" && typeof series?.data === "function" && series.data().length >= 150 &&
          canvas && canvas.width > 300 && canvas.height > 300;
      }, null, { timeout: 30000 });
      await page.waitForFunction(() => /^(LIVE|STALE|OFFLINE)/.test(document.querySelector("#account-connection")?.textContent || ""));
      const statusText = (await page.locator("#account-connection").innerText()).trim();
      assert.ok(!statusText.includes("[object Object]"), `${account} displayed an unformatted status error`);
      await page.waitForFunction(() => {
        const canvas = document.querySelector("#tv-chart canvas");
        return canvas && canvas.width > 300 && canvas.height > 300;
      });
      const canvas = await page.locator("#tv-chart canvas").evaluateAll(items =>
        items.map(item => ({ width: item.width, height: item.height }))
      );
      assert.ok(canvas.some(item => item.width > 300 && item.height > 300));
      const pixels = await page.locator("#tv-chart canvas").first().evaluate(item => {
        const context = item.getContext("2d");
        if (!context) return { opaqueSamples: 0, distinctColors: 0 };
        const data = context.getImageData(0, 0, item.width, item.height).data;
        let opaqueSamples = 0;
        const colors = new Set();
        for (let offset = 0; offset < data.length; offset += 4 * 8) {
          if (data[offset + 3] === 0) continue;
          opaqueSamples += 1;
          colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
        }
        return { opaqueSamples, distinctColors: colors.size };
      });
      assert.ok(pixels.opaqueSamples > 100 && pixels.distinctColors > 10, `${account} chart canvas has no rendered price data`);
      results.push({ account, symbol: candles.body.symbol, timeframe: candles.body.timeframe, bars: candles.body.candles.length, status: statusText, chartCanvasPixels: pixels });
      if (index === 0) {
        await page.locator("#tv-chart").screenshot({ path: path.join(outputDir, "chart-main-titan-canvas.png") });
        await page.screenshot({ path: path.join(outputDir, "chart-main-titan-current.png"), fullPage: true });
      }
    }

    assert.deepEqual(mutations, []);
    assert.deepEqual(failures, []);
    console.log(JSON.stringify({ results, status503AllowedAsStaleRisk: true, requestCount: requests.length, mutations, failures }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
