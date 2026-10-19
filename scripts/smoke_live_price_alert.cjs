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
for (const account of selectedAccounts) assert.ok(accounts.has(account), `Non-demo or unknown account blocked: ${account}`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const account of selectedAccounts) {
      const symbol = accounts.get(account);
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      const apiRequests = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === new URL(base).origin && url.pathname.startsWith("/api/")) {
          const requested = url.searchParams.get("account");
          const record = { method: request.method(), path: url.pathname, account: requested };
          apiRequests.push(record);
          if (request.method() !== "GET" || requested === "blueberry") {
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
        await page.locator("#cs-beta-panel .cs-alerts").waitFor({ state: "attached", timeout: 20_000 });
        await page.locator("#cs-beta-panel .cs-alerts > summary").click();
        const quote = await page.evaluate(async ({ account: id, symbol: currentSymbol }) => {
          const response = await fetch(`/api/chart/v1/quotes?account=${encodeURIComponent(id)}&symbol=${encodeURIComponent(currentSymbol)}`, {
            method: "GET", cache: "no-store", credentials: "same-origin",
          });
          if (!response.ok) throw new Error(`Quote HTTP ${response.status}`);
          return response.json();
        }, { account, symbol });
        assert.equal(quote.account, account);
        assert.equal(quote.symbol, symbol);
        assert.equal(quote.source, "MT5_VERIFIED");
        assert.equal(quote.canExecute, false);
        assert.equal(quote.freshness, "FRESH");
        const midpoint = (Number(quote.bid) + Number(quote.ask)) / 2;
        assert.ok(Number.isFinite(midpoint) && midpoint > 0);
        const alerts = page.locator("#cs-beta-panel .cs-alerts");
        await alerts.getByLabel("Preisalarm Richtung").selectOption("ABOVE");
        await alerts.getByLabel("Preisalarm Preis").fill(String(midpoint + 10));
        await alerts.getByRole("button", { name: "Alarm hinzufügen" }).click();
        await page.waitForFunction(({ account: id, symbol: currentSymbol }) => {
          const row = document.querySelector("#cs-beta-panel .cs-alerts ul li");
          return document.querySelector("#chart-title-text")?.textContent.includes(currentSymbol) &&
            row?.textContent.includes("· Aktiv") && !row.textContent.includes("Ausgelöst") &&
            document.querySelector("#cs-beta-panel .cs-alerts [role=status]")?.textContent.startsWith("Überwacht · "+id+" · "+currentSymbol);
        }, { account, symbol }, { timeout: 15_000 }).catch(async error => {
          const debug = await page.evaluate(() => ({
            title: document.querySelector("#chart-title-text")?.textContent,
            row: document.querySelector("#cs-beta-panel .cs-alerts ul li")?.textContent,
            status: document.querySelector("#cs-beta-panel .cs-alerts [role=status]")?.textContent,
            alertState: window.ChartStudioBeta?.getState?.()?.alerts?.getState?.() ?? null,
          }));
          throw new Error(`${error.message}; initialQuote=${JSON.stringify(quote)}; state=${JSON.stringify(debug)}`);
        });
        const pollDeadline = Date.now() + 15_000;
        while (apiRequests.filter(request => request.path.endsWith("/quotes") && request.account === account).length < 3 && Date.now() < pollDeadline) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const state = await page.evaluate(() => ({
          row: document.querySelector("#cs-beta-panel .cs-alerts ul li")?.textContent,
          status: document.querySelector("#cs-beta-panel .cs-alerts [role=status]")?.textContent,
        }));
        assert.ok(state.row.includes("· Aktiv") && !state.row.includes("Ausgelöst"), "the first live quote must establish a baseline without retroactive firing");
        assert.ok(state.status.startsWith("Überwacht ·"));
        assert.ok(apiRequests.some(request => request.path.endsWith("/quotes") && request.account === account));
        assert.equal(apiRequests.some(request => request.blocked), false);
        assert.equal(errors.length, 0, errors.join("; "));
        results.push({ account, symbol, freshness: quote.freshness, midpoint, status: state.status, quotePolls: apiRequests.filter(request => request.path.endsWith("/quotes") && request.account === account).length });
      } finally {
        await context.close();
      }
    }
    console.log(JSON.stringify({ results, brokerWrites: 0, blueberryRequests: 0, browserErrors: [] }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
