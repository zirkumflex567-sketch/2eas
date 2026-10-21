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
const account = process.argv[2] || "xau5m_m5";
assert.ok(accounts.has(account), `Non-demo or unknown account blocked: ${account}`);
const symbol = accounts.get(account);

function assertFreshQuote(quote) {
  assert.equal(quote.account, account);
  assert.equal(quote.symbol, symbol);
  assert.equal(quote.source, "MT5_VERIFIED");
  assert.equal(quote.canExecute, false);
  assert.equal(quote.freshness, "FRESH");
  assert.ok(Number.isFinite(Number(quote.bid)) && Number(quote.bid) > 0);
  assert.ok(Number.isFinite(Number(quote.ask)) && Number(quote.ask) >= Number(quote.bid));
  assert.ok(Number(quote.ageSeconds) <= 30);
  assert.ok(Number.isFinite(Number(quote.tickSize)) && Number(quote.tickSize) > 0);
}

function safeQuote(quote) {
  return {
    account: quote.account,
    symbol: quote.symbol,
    source: quote.source,
    canExecute: quote.canExecute,
    bid: quote.bid,
    ask: quote.ask,
    tickSize: quote.tickSize,
    quoteTimeUtcMs: quote.quoteTimeUtcMs,
    freshness: quote.freshness,
    ageSeconds: quote.ageSeconds,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const apiRequests = [];
  const browserErrors = [];
  let captureBaseline = false;
  let baselineQuote = null;
  page.on("pageerror", error => browserErrors.push(error.message));
  await context.addInitScript(() => {
    window.__priceAlertNotifications = [];
    window.__priceAlertPermissionCalls = 0;
    class ObservedNotification {
      static permission = "default";
      static async requestPermission() {
        window.__priceAlertPermissionCalls += 1;
        ObservedNotification.permission = "granted";
        return "granted";
      }
      constructor(title, options) {
      window.__priceAlertNotifications.push({ title, body: options?.body ?? "" });
      }
    }
    window.Notification = ObservedNotification;
  });
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
      if (captureBaseline && url.pathname === "/api/chart/v1/quotes" && requested === account) {
        captureBaseline = false;
        const response = await route.fetch();
        baselineQuote = await response.json();
        assertFreshQuote(baselineQuote);
        const midpoint = (Number(baselineQuote.bid) + Number(baselineQuote.ask)) / 2;
        const alerts = page.locator("#cs-beta-panel .cs-alerts");
        await alerts.locator('button[data-alert-action="delete"]').first().click();
        const addAlert = async (direction, price) => {
          await alerts.getByLabel("Preisalarm Richtung").selectOption(direction);
          await alerts.getByLabel("Preisalarm Preis").fill(String(price));
          await alerts.getByRole("button", { name: "Alarm hinzufügen" }).click();
        };
        const tickSize = Number(baselineQuote.tickSize);
        const digits = Number.isInteger(Number(baselineQuote.digits)) ? Number(baselineQuote.digits) : 8;
        await addAlert("ABOVE", Number((midpoint + tickSize).toFixed(digits)));
        await addAlert("BELOW", Number(Math.max(tickSize, midpoint - tickSize).toFixed(digits)));
        assert.equal(await alerts.locator('li button[data-alert-action="delete"]').count(), 2);
        return route.fulfill({ response });
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

    const initialQuote = await page.evaluate(async ({ account: id, symbol: currentSymbol }) => {
      const response = await fetch(`/api/chart/v1/quotes?account=${encodeURIComponent(id)}&symbol=${encodeURIComponent(currentSymbol)}`, {
        method: "GET", cache: "no-store", credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`Quote HTTP ${response.status}`);
      return response.json();
    }, { account, symbol });
    assertFreshQuote(initialQuote);
    const initialMidpoint = (Number(initialQuote.bid) + Number(initialQuote.ask)) / 2;

    await alerts.getByRole("button", { name: /Browserbenachrichtigungen/ }).click();
    await page.waitForFunction(() => document.querySelector(".cs-alerts [role=status]")?.textContent.includes("Browserbenachrichtigungen aktiviert"));

    await alerts.getByLabel("Preisalarm Richtung").selectOption("ABOVE");
    await alerts.getByLabel("Preisalarm Preis").fill(String(initialMidpoint + 1));
    captureBaseline = true;
    await alerts.getByRole("button", { name: "Alarm hinzufügen" }).click();
    await page.waitForFunction(() => document.querySelectorAll('.cs-alerts li button[data-alert-action="delete"]').length === 2, null, { timeout: 15_000 });

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const result = await page.evaluate(() => ({
        rows: [...document.querySelectorAll(".cs-alerts ul li")].map(row => row.textContent),
        status: document.querySelector(".cs-alerts [role=status]")?.textContent ?? "",
        notifications: window.__priceAlertNotifications ?? [],
      }));
      if (result.rows.some(text => text.includes("Ausgelöst"))) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const result = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".cs-alerts ul li")].map(row => row.textContent),
      status: document.querySelector(".cs-alerts [role=status]")?.textContent ?? "",
      notifications: window.__priceAlertNotifications ?? [],
      permissionCalls: window.__priceAlertPermissionCalls ?? 0,
    }));
    assert.ok(baselineQuote, "the alert monitor must establish its baseline from a real MT5 quote");
    const triggered = result.rows.filter(text => text.includes("Ausgelöst"));
    assert.ok(triggered.length >= 1, `no real quote crossed either near-midpoint alert within 60 seconds: ${JSON.stringify({ baselineQuote, result })}`);
    assert.ok(result.status.startsWith("Preisalarm:"), `crossing status not visible: ${result.status}`);
    assert.ok(result.notifications.length >= 1, "a granted, explicitly requested browser notification must accompany the live crossing");
    assert.equal(result.permissionCalls, 1, "notification permission must be requested only after the explicit user click");
    assert.equal(apiRequests.some(request => request.blocked), false);
    assert.equal(apiRequests.some(request => request.account === "blueberry"), false);
    assert.equal(apiRequests.some(request => request.method !== "GET"), false);
    assert.deepEqual(browserErrors, []);
    console.log(JSON.stringify({
      account,
      symbol,
      baselineQuote: safeQuote(baselineQuote),
      initialQuote: safeQuote(initialQuote),
      triggered,
      notificationDispatches: result.notifications.length,
      notificationTestDouble: true,
      status: result.status,
      quotePolls: apiRequests.filter(request => request.path.endsWith("/quotes") && request.account === account).length,
      apiReads: apiRequests.length,
      brokerWrites: 0,
      blueberryRequests: 0,
      browserErrors,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
