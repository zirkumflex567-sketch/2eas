"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { classifyLiveDemoRequest } = require("./live_demo_scope_guard.cjs");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const baseUrl = new URL(base);
const basePath = baseUrl.pathname.replace(/\/$/, "");
const demos = Object.freeze([
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
  { account: "goldm15", symbol: "XAUUSD" },
]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : demos.map(item => item.account);
assert.ok(accounts.length > 0 && accounts.every(account => demos.some(item => item.account === account)),
  "CHART_STUDIO_ACCOUNTS must contain only the five authorized non-Blueberry demo aliases");

function stopText(value) { return value == null || value === "" || Number(value) === 0 ? "Nicht gesetzt" : String(value); }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const requests = [], blocked = [], writes = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== baseUrl.origin || !decodeURIComponent(url.pathname).startsWith(`${basePath}/api/`)) return;
      const scope = classifyLiveDemoRequest({ url, method: request.method(), basePath, allowedAccounts: accounts });
      requests.push({ method: request.method(), path: url.pathname.slice(basePath.length), account: url.searchParams.get("account") });
      if (!scope.allowed) blocked.push({ path: url.pathname, account: url.searchParams.get("account"), reason: scope.reason });
      if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname });
    });
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== baseUrl.origin) return route.continue();
      const path = decodeURIComponent(url.pathname);
      if (!path.startsWith(`${basePath}/api/`)) return route.continue();
      const scope = classifyLiveDemoRequest({ url, method: request.method(), basePath, allowedAccounts: accounts });
      if (!scope.allowed) { blocked.push({ path, account: url.searchParams.get("account"), reason: scope.reason }); return route.abort("blockedbyclient"); }
      if (scope.kind === "global_read" && scope.endpoint === "/api/accounts") {
        const selected = demos.filter(item => accounts.includes(item.account));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          default: selected[0].account,
          accounts: selected.map(item => ({ id: item.account, name: item.account, login: "Demo", server: "Demo",
            symbol: item.symbol, timeframe: "M15", is_demo: true, challenge_protection: false, capacity: 3 })),
        }) });
      }
      if (scope.kind === "global_read" && scope.endpoint === "/api/chart/v1/capabilities") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          accountScopes: accounts, symbols: ["XAUUSD", "XAUUSD.p"], timeframes: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"],
        }) });
      }
      return route.continue();
    });

    for (const account of accounts) {
      const demo = demos.find(item => item.account === account);
      await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(expected => window.ChartStudioBeta?.getState?.().account === expected, account, { timeout: 15000 });
      const beta = page.locator("#cs-beta-toggle");
      if (await beta.getAttribute("aria-expanded") !== "true") await beta.click();
      const details = page.locator("details.cs-broker-read-panel");
      await details.waitFor({ state: "visible" });
      if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
      const symbol = page.locator("#cs-broker-symbol");
      await page.waitForFunction(expected => [...document.querySelectorAll("#cs-broker-symbol option")]
        .some(option => option.value === expected && option.dataset.verified === "true"), demo.symbol, { timeout: 20000 });
      if (await symbol.inputValue() !== demo.symbol) await symbol.selectOption(demo.symbol);

      const book = await page.evaluate(async ({ accountId, symbolName }) => {
        const response = await fetch(`/api/chart/v1/positions?account=${encodeURIComponent(accountId)}&symbol=${encodeURIComponent(symbolName)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || body.account !== accountId || body.symbol !== symbolName || body.source !== "MT5_VERIFIED" || body.canExecute !== false) {
          throw Error(`${accountId}: position/order snapshot is not verified`);
        }
        return body;
      }, { accountId: account, symbolName: demo.symbol });
      await page.waitForFunction(({ accountId, symbolName, positions, orders }) => {
        const status = document.querySelector("#cs-broker-positions-status")?.textContent || "";
        const current = window.ChartStudioBeta?.getState?.();
        return current?.account === accountId && current?.symbol === symbolName &&
          status.includes(`Quelle MT5_VERIFIED · ${positions} Position(en), ${orders} Pending Order(s) · Nur lesen`);
      }, { accountId: account, symbolName: demo.symbol, positions: book.positions.length, orders: book.orders.length }, { timeout: 30000 });

      const tables = await page.evaluate(() => ({
        positions: [...document.querySelectorAll("#cs-broker-positions tbody tr")].map(row => [...row.cells].slice(0, 9).map(cell => cell.textContent.trim())),
        orders: [...document.querySelectorAll("#cs-broker-orders tbody tr")].map(row => [...row.cells].map(cell => cell.textContent.trim())),
        positionHeaders: [...document.querySelectorAll("#cs-broker-positions thead th")].map(cell => cell.textContent.trim()),
        orderHeaders: [...document.querySelectorAll("#cs-broker-orders thead th")].map(cell => cell.textContent.trim()),
        verifiedPositions: window.ChartStudioBeta.getState().verifiedPositions,
      }));
      const expectedPositions = tables.verifiedPositions.map(position => [position.ticket, position.type, position.volume, position.priceOpen,
        stopText(position.sl), stopText(position.tp), position.profit, position.swap, position.currency]);
      assert.deepEqual(tables.verifiedPositions.map(position => [position.ticket, position.revision]).sort(),
        book.positions.map(position => [position.ticket, position.revision]).sort(),
        `${account}: UI positions must retain ticket/revision identity from the MT5 snapshot`);
      const expectedOrders = book.orders.map(order => [order.ticket, order.type, order.volumeCurrent, order.priceOpen,
        order.priceStoplimit, stopText(order.sl), stopText(order.tp)]);
      assert.deepEqual(tables.positions, expectedPositions, `${account}: open-position UI must match the verified MT5 snapshot`);
      assert.deepEqual(tables.orders, expectedOrders, `${account}: pending-order UI must match the verified MT5 snapshot`);
      assert.deepEqual(tables.positionHeaders.slice(0, 9), ["Ticket", "Seite", "Lots", "Einstieg", "SL", "TP", "P/L (MT5)", "Swap (MT5)", "Währung"]);
      assert.deepEqual(tables.orderHeaders, ["Ticket", "Typ", "Lots", "Preis", "Stop-Limit", "SL", "TP"]);
      results.push({ account, symbol: demo.symbol, positions: book.positions.length, pendingOrders: book.orders.length,
        source: book.source, canExecute: book.canExecute, positionRowsMatch: true, orderRowsMatch: true });
    }
    assert.deepEqual(writes, [], "broker tables are read-only");
    assert.deepEqual(blocked, [], "no API request escaped the five-demo allowlist");
    assert.deepEqual(errors, [], "no browser errors");
    console.log(JSON.stringify({ results, apiRequests: requests.length, writes: writes.length, blockedRequests: blocked.length,
      browserErrors: errors.length, protectedAccountQueried: false }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
