"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const baseUrl = new URL(base);
const basePath = baseUrl.pathname.replace(/\/$/, "");
const allowedAccounts = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : allowedAccounts;
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only configured non-Blueberry demo aliases");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let apiReads = 0;
  const mutations = [];
  const protectedRequests = [];
  const browserErrors = [];
  try {
    for (const account of accounts) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.on("pageerror", error => browserErrors.push({ account, error: error.message }));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === baseUrl.origin && url.pathname.startsWith(`${basePath}/api/`)) {
          const requestedAccount = url.searchParams.get("account");
          if (route.request().method() !== "GET") {
            mutations.push({ account, path: url.pathname, method: route.request().method() });
            await route.abort("blockedbyclient");
            return;
          }
          if (requestedAccount === "blueberry") {
            protectedRequests.push({ account, path: url.pathname });
            await route.abort("blockedbyclient");
            return;
          }
          apiReads += 1;
        }
        await route.continue();
      });
      const candleResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === baseUrl.origin && url.pathname === `${basePath}/api/candles`
          && url.searchParams.get("account") === account && url.searchParams.get("count") === "1001";
      }, { timeout: 20000 });
      await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
      const response = await candleResponse;
      assert.equal(response.status(), 200, `${account} MT5 candle request`);
      const feed = await response.json();
      assert.equal(feed.source, "MT5_VERIFIED", `${account} feed provenance`);
      assert.equal(feed.accountId, account, `${account} candle scope`);
      assert.equal(feed.timeframe, "M15", `${account} timeframe`);
      await page.locator("#cs-beta-toggle").click();
      await page.locator(".cs-replay summary").click();
      await page.waitForFunction(expected => window.ChartStudioReplay?.inspect()?.sourceBars === expected,
        feed.candles.length, { timeout: 15000 });
      const replayStartUtc = Math.floor(Date.now() / 1000);
      await page.locator(".cs-replay-actions button").nth(0).click();
      const state = await page.evaluate(() => window.ChartStudioReplay.inspect());
      const expectedClosed = feed.candles.filter(candle => Number(candle.time) + 900 <= replayStartUtc).length;
      assert.equal(state.account, account);
      assert.equal(state.sourceBars, feed.candles.length);
      assert.equal(state.active, true);
      assert.equal(state.mode, "LIVE_CANDLES");
      assert.equal(state.snapshotBars, expectedClosed,
        `${account} live replay contains only M15 bars that were closed at the frozen as-of time`);
      assert.equal(state.visibleBars, 1, `${account} replay starts at its first eligible candle`);
      assert.ok(state.lastVisibleTime <= replayStartUtc - 900,
        `${account} replay must not start on a forming or future candle`);
      results.push({ account, bars: state.sourceBars, replayBars: state.snapshotBars,
        asOfUtc: new Date(replayStartUtc * 1000).toISOString() });
      await page.close();
    }
    assert.deepEqual(mutations, [], "live replay must not call mutating API routes");
    assert.deepEqual(protectedRequests, [], "Blueberry must not be queried");
    assert.deepEqual(browserErrors, []);
    console.log(JSON.stringify({ results, apiReads, mutations, protectedRequests, browserErrors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
