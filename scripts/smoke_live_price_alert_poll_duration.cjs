"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056";
const accounts = new Map([
  ["titan", "XAUUSD"],
  ["xau5m_m5", "XAUUSD.p"],
  ["titan_m5", "XAUUSD.p"],
  ["xau5m_500", "XAUUSD.p"],
  ["goldm15", "XAUUSD"],
]);
const requestedAccounts = process.argv.slice(2);
const selectedAccounts = requestedAccounts.length ? requestedAccounts : [...accounts.keys()];
assert.ok(selectedAccounts.length > 0 && selectedAccounts.every(account => accounts.has(account)),
  "Only the five configured non-Blueberry demo aliases are allowed");

function assertFreshQuote(quote, account, symbol) {
  assert.equal(quote.account, account);
  assert.equal(quote.symbol, symbol);
  assert.equal(quote.source, "MT5_VERIFIED");
  assert.equal(quote.canExecute, false);
  assert.equal(quote.freshness, "FRESH");
  assert.ok(Number(quote.ageSeconds) <= 30);
  assert.ok(Number(quote.ask) >= Number(quote.bid) && Number(quote.bid) > 0);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const account of selectedAccounts) {
      const symbol = accounts.get(account);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const apiRequests = [];
      const browserErrors = [];
      page.on("pageerror", error => browserErrors.push(error.message));
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === new URL(base).origin && url.pathname.startsWith("/api/")) {
          const record = {
            method: request.method(),
            path: url.pathname,
            account: url.searchParams.get("account"),
            atMs: Date.now(),
          };
          apiRequests.push(record);
          if (record.method !== "GET" || record.account === "blueberry") {
            record.blocked = true;
            return route.abort("blockedbyclient");
          }
        }
        return route.continue();
      });

      try {
        await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded" });
        await page.locator(".cs-beta-toggle").click();
        await page.locator("#cs-beta-panel").waitFor({ state: "visible", timeout: 15_000 });
        const alerts = page.locator("#cs-beta-panel .cs-alerts");
        await alerts.waitFor({ state: "attached", timeout: 20_000 });
        await alerts.locator("> summary").click();

        const quote = await page.evaluate(async ({ account: id, currentSymbol }) => {
          const response = await fetch(`/api/chart/v1/quotes?account=${encodeURIComponent(id)}&symbol=${encodeURIComponent(currentSymbol)}`, {
            method: "GET", cache: "no-store", credentials: "same-origin",
          });
          if (!response.ok) throw new Error(`Quote HTTP ${response.status}`);
          return response.json();
        }, { account, currentSymbol: symbol });
        assertFreshQuote(quote, account, symbol);

        await alerts.getByLabel("Preisalarm Richtung").selectOption("ABOVE");
        await alerts.getByLabel("Preisalarm Preis").fill(String(Number(quote.ask) + 1000));
        const monitoringStartedAt = Date.now();
        await alerts.getByRole("button", { name: "Alarm hinzufügen" }).click();
        await page.waitForFunction(({ account: id, symbol: currentSymbol }) => {
          const row = document.querySelector("#cs-beta-panel .cs-alerts ul li");
          const status = document.querySelector("#cs-beta-panel .cs-alerts [role=status]")?.textContent ?? "";
          return row?.textContent.includes("· Aktiv") && !row.textContent.includes("Ausgelöst") &&
            status.startsWith(`Überwacht · ${id} · ${currentSymbol}`);
        }, { account, symbol }, { timeout: 15_000 });

        await page.waitForTimeout(60_000);
        const result = await page.evaluate(() => ({
          row: document.querySelector("#cs-beta-panel .cs-alerts ul li")?.textContent ?? "",
          status: document.querySelector("#cs-beta-panel .cs-alerts [role=status]")?.textContent ?? "",
        }));
        const quoteRequests = apiRequests.filter(request => request.path.endsWith("/quotes") && request.account === account);
        const monitored = quoteRequests.filter(request => request.atMs >= monitoringStartedAt);
        const intervalsMs = monitored.slice(1).map((request, index) => request.atMs - monitored[index].atMs);
        assert.ok(monitored.length >= 11, `${account}: expected at least 11 live quote polls in 60 seconds, got ${monitored.length}`);
        assert.ok(intervalsMs.length >= 10, `${account}: too few measured poll intervals`);
        assert.ok(intervalsMs.every(interval => interval >= 4500 && interval <= 7500),
          `${account}: poll interval outside 4.5–7.5 seconds: ${intervalsMs.join(",")}`);
        assert.ok(result.row.includes("· Aktiv") && !result.row.includes("Ausgelöst"),
          `${account}: distant control alert should stay armed: ${result.row}`);
        assert.ok(result.status.startsWith(`Überwacht · ${account} · ${symbol}`), `${account}: alert stopped monitoring: ${result.status}`);
        assert.deepEqual(browserErrors, [], `${account}: browser errors`);
        assert.equal(apiRequests.some(request => request.blocked), false, `${account}: blocked API request`);
        assert.equal(apiRequests.some(request => request.method !== "GET"), false, `${account}: non-GET API request`);
        assert.equal(apiRequests.some(request => request.account === "blueberry"), false, `${account}: Blueberry request`);

        results.push({
          account, symbol, durationSeconds: 60, freshness: quote.freshness,
          monitoredPolls: monitored.length,
          pollIntervalMs: { min: Math.min(...intervalsMs), median: intervalsMs.toSorted((a, b) => a - b)[Math.floor(intervalsMs.length / 2)], max: Math.max(...intervalsMs) },
          status: result.status,
          apiReads: apiRequests.length,
          brokerWrites: 0,
          blueberryRequests: 0,
          browserErrors,
        });
      } finally {
        await context.close();
      }
    }
    assert.equal(results.length, selectedAccounts.length);
    console.log(JSON.stringify({ results, apiMethods: ["GET"], mutations: 0, blueberryRequests: 0 }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
