"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500"]);
const scopedPaths = new Set([
  "/api/status",
  "/api/candles",
  "/api/chart/v1/portfolio",
  "/api/journal_summary",
]);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const savedConflict = accounts[(index + 1) % accounts.length];
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const requests = [];
      const blocked = [];
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(({ saved }) => {
        localStorage.setItem("gold_dashboard_account", saved);
        localStorage.setItem("two_eas_journal_filter", saved);
      }, { saved: savedConflict });
      await page.route("**/api/**", async route => {
        const request = route.request();
        const url = new URL(request.url());
        const requestedAccount = url.searchParams.get("account");
        const forbidden = request.method() !== "GET"
          || requestedAccount === "blueberry"
          || (scopedPaths.has(url.pathname) && requestedAccount !== account);
        if (forbidden) {
          blocked.push({ path: url.pathname, account: requestedAccount, method: request.method() });
          await route.abort();
          return;
        }
        requests.push({ path: url.pathname, account: requestedAccount, method: request.method() });
        await route.continue();
      });

      try {
        await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded" });
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor({ timeout: 10000 });
        await page.waitForFunction(() => document.querySelector("#tv-chart")?.__candleSeries?.data?.().length >= 150, { timeout: 15000 });
        await page.waitForFunction(() => journalBusyMode === null && journalLoadedMode !== null, { timeout: 10000 });

        const state = await page.evaluate(() => ({
          activeAccount,
          journalFilter,
          selectedButton: document.querySelector('#account-switcher [aria-pressed="true"]')?.dataset.account || null,
          renderedBars: document.querySelector("#tv-chart")?.__candleSeries?.data?.().length || 0,
        }));
        assert.equal(state.activeAccount, account, `${account}: URL account must win over saved account`);
        assert.equal(state.journalFilter, account, `${account}: initial journal scope must follow URL account`);
        assert.equal(state.selectedButton, account, `${account}: selected account tab mismatch`);
        assert.equal(state.renderedBars, 1001, `${account}: rendered candle history is incomplete`);
        assert.deepEqual(blocked, [], `${account}: forbidden or cross-account request was blocked`);
        assert.deepEqual(errors, [], `${account}: browser errors`);
        const scoped = requests.filter(request => scopedPaths.has(request.path));
        assert.ok(scoped.length >= scopedPaths.size, `${account}: startup reads missing: ${JSON.stringify(scoped)}`);
        assert.ok(scoped.every(request => request.account === account && request.method === "GET"), `${account}: startup reads escaped URL scope`);
        results.push({ account, savedConflict, state, scopedStartupReads: scoped.length, apiRequests: requests.length });
      } finally {
        await context.close();
      }
    }
    console.log(JSON.stringify({ results, blockedRequests: 0, browserErrors: 0, brokerWrites: 0, blueberryRequests: 0 }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
