"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowed = Object.freeze([
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
  { account: "goldm15", symbol: "XAUUSD" },
]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : allowed.map(item => item.account);
assert.ok(accounts.length > 0 && accounts.every(account => allowed.some(item => item.account === account)),
  "CHART_STUDIO_ACCOUNTS must contain only explicitly authorized non-Blueberry demos");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
  });
  const results = [];
  const mutations = [];
  const protectedRequests = [];
  const browserErrors = [];
  let apiReads = 0;
  try {
    for (const account of accounts) {
      const expected = allowed.find(item => item.account === account);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.on("pageerror", error => browserErrors.push({ account, message: error.message }));
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === new URL(base).origin && url.pathname.startsWith("/api/")) {
          const requestedAccount = url.searchParams.get("account");
          if (request.method() !== "GET") {
            mutations.push({ account, method: request.method(), path: url.pathname });
            return route.abort("blockedbyclient");
          }
          if (requestedAccount === "blueberry") {
            protectedRequests.push({ account, path: url.pathname });
            return route.abort("blockedbyclient");
          }
          apiReads += 1;
        }
        return route.continue();
      });

      try {
        const mainCandles = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === "/api/candles" && url.searchParams.get("account") === account &&
            url.searchParams.get("tf") === "M15";
        }, { timeout: 20000 });
        await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded" });
        const mainFeed = await mainCandles;
        assert.equal(mainFeed.status(), 200, `${account}: main M15 feed`);
        const main = await mainFeed.json();
        assert.equal(main.accountId, account);
        assert.equal(main.symbol, expected.symbol);
        assert.equal(main.timeframe, "M15");
        assert.equal(main.source, "MT5_VERIFIED");
        assert.equal(main.canExecute, false);

        await page.locator("#chart-multi-toggle").click();
        const workspace = page.locator("#chart-multi-workspace");
        await workspace.locator(".cs-multi-pane").nth(1).waitFor();
        assert.equal(await workspace.locator(".cs-multi-pane").count(), 2);
        const frames = ["M15", "M5"];
        const paneResults = [];
        for (let index = 0; index < frames.length; index++) {
          const pane = workspace.locator(".cs-multi-pane").nth(index);
          await pane.locator("[data-symbol]").fill(expected.symbol);
          await pane.locator("[data-tf]").selectOption(frames[index]);
          const candleResponse = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === "/api/candles" && url.searchParams.get("account") === account &&
              url.searchParams.get("symbol") === expected.symbol && url.searchParams.get("tf") === frames[index] &&
              url.searchParams.get("count") === "300";
          }, { timeout: 20000 });
          await pane.locator("[data-load]").click();
          const response = await candleResponse;
          assert.equal(response.status(), 200, `${account}/${frames[index]} candle request`);
          const feed = await response.json();
          assert.equal(feed.accountId, account);
          assert.equal(feed.symbol, expected.symbol);
          assert.equal(feed.timeframe, frames[index]);
          assert.equal(feed.source, "MT5_VERIFIED");
          assert.equal(feed.canExecute, false);
          assert.ok(Array.isArray(feed.candles) && feed.candles.length > 0);
          await page.waitForFunction(({ index, count }) => {
            const label = document.querySelectorAll("#chart-multi-workspace .cs-multi-pane [data-pane-state]")[index];
            return label?.textContent.includes(`${count} MT5-Kerzen`);
          }, { index, count: feed.candles.length }, { timeout: 15000 });
          const paneGeometry = await pane.locator(".cs-multi-plot canvas").evaluateAll(nodes =>
            nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
          assert.ok(paneGeometry.some(rect => rect.width > 100 && rect.height > 100),
            `${account}/${frames[index]} chart canvas must be visible`);
          paneResults.push({ timeframe: frames[index], verifiedBars: feed.candles.length, canvasCount: paneGeometry.length });
        }
        await workspace.locator("[data-link-time]").check();
        await workspace.locator("[data-link-crosshair]").check();
        assert.deepEqual(await workspace.locator("[data-link-time]").isChecked(), true);
        assert.deepEqual(await workspace.locator("[data-link-crosshair]").isChecked(), true);
        results.push({ account, symbol: expected.symbol, panes: paneResults,
          linkedTime: true, linkedCrosshair: true, primaryFeedBars: main.candles.length });
      } finally {
        await context.close();
      }
    }
    assert.deepEqual(mutations, [], "live multi-chart is GET-only");
    assert.deepEqual(protectedRequests, [], "Blueberry must not be queried");
    assert.deepEqual(browserErrors, [], "multi-chart browser errors");
    console.log(JSON.stringify({ results, apiReads, mutations, protectedRequests, browserErrors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
