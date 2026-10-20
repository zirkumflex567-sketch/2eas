"use strict";

// Read-only AT-052 acceptance across the four authorized demo aliases. Replay
// each currently open position only when an exact recorded entry is available.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const ACCOUNTS = Object.freeze([
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
]);
const FORBIDDEN_ACCOUNTS = new Set(["blueberry"]);

(async () => {
  const brokerState = new Map();
  for (const scope of ACCOUNTS) brokerState.set(scope.account, await readOpenPositions(scope));
  const activeScopes = ACCOUNTS.filter(scope => brokerState.get(scope.account).length > 0);
  assert.ok(activeScopes.length > 0, "AT-052 requires a currently open position on an authorized demo");

  let browser;
  const results = [];
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
    });
    for (const scope of activeScopes) {
      const { account, symbol } = scope;
      const before = brokerState.get(account);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const apiRequests = [];
      const blockedRequests = [];
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.route("**/api/**", async route => {
        const request = route.request();
        const url = new URL(request.url());
        const requestAccount = url.searchParams.get("account");
        apiRequests.push({ method: request.method(), account: requestAccount, path: url.pathname,
          revision: url.searchParams.get("revision") });
        if (requestAccount && FORBIDDEN_ACCOUNTS.has(requestAccount)) {
          blockedRequests.push({ reason: "FORBIDDEN_ACCOUNT", path: url.pathname });
          return route.abort("blockedbyclient");
        }
        if (request.method() !== "GET") {
          blockedRequests.push({ reason: "NON_GET", method: request.method(), path: url.pathname });
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });

      try {
        await page.goto(`${BASE_URL}/?account=${account}`, { waitUntil: "domcontentloaded" });
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
        await page.locator("#cs-beta-toggle").click();
        const panel = page.locator("#cs-evidence-panel");
        await panel.locator(":scope > summary").click();
        await panel.locator("#cs-evidence-kind").selectOption("SNAPSHOT");
        await panel.locator("#cs-evidence-load").click();
        await page.waitForFunction(() => {
          const status = document.querySelector("#cs-evidence-status")?.textContent || "";
          return !status.includes("Aufzeichnungen werden gelesen");
        }, null, { timeout: 45000 });
        assert.match(await panel.locator("#cs-evidence-status").textContent(), /Store: INITIALIZED/);

        const rows = panel.locator("#cs-evidence-list > li");
        const rowNodes = await rows.count();
        assert.ok(rowNodes > 0, `${account}: no recorded snapshots returned`);
        const records = await rows.locator("pre").evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent)));
        const replayed = [];
        for (const position of before) {
          const index = records.findIndex(record => record.type === "SNAPSHOT" &&
            record.provenance === "RECORDED" && record.accountId === account &&
            record.payload.positionIdentifier === position.identifier && record.payload.captureType === "ENTRY");
          assert.notEqual(index, -1, `${account}: open position ${position.identifier} has no exact recorded entry snapshot`);
          const record = records[index];
          assert.equal(record.payload.chartView.symbol, symbol, `${account}: snapshot symbol drifted`);
          assert.equal(record.payload.chartView.timeframe, "M15", `${account}: snapshot timeframe drifted`);
          assert.ok(record.payload.marketData?.bars?.length > 0, `${account}: snapshot has no frozen bars`);
          const lifecycle = record.payload.lifecycleEventIds?.find(event => event.type === "LIFECYCLE");
          assert.ok(lifecycle?.id && Number.isSafeInteger(lifecycle.dataRevision), `${account}: snapshot has no exact lifecycle reference`);

          const row = rows.nth(index);
          await row.locator("details > summary").click();
          await row.locator("canvas.cs-evidence-chart").waitFor({ state: "visible" });
          await row.locator("button.cs-evidence-snapshot-replay").click();
          await page.waitForFunction(index => {
            const row = document.querySelectorAll("#cs-evidence-list > li")[index];
            const status = row?.querySelector(".cs-evidence-snapshot-replay-status")?.textContent || "";
            return /RECORDED · \d+ eingefrorene Bars|Replay nicht verfügbar/.test(status);
          }, index, { timeout: 45000 });
          const replayStatus = await row.locator(".cs-evidence-snapshot-replay-status").textContent();
          assert.match(replayStatus, /RECORDED · \d+ eingefrorene Bars/,
            `${account}: recorded replay failed (${replayStatus})`);
          assert.ok(apiRequests.some(request => request.method === "GET" && request.account === account &&
            request.path.endsWith(`/lifecycle/${encodeURIComponent(lifecycle.id)}`) &&
            request.revision === String(lifecycle.dataRevision)),
          `${account}: replay did not request its exact lifecycle revision`);
          replayed.push({ position: position.identifier, snapshotId: record.id, lifecycleId: lifecycle.id,
            bars: record.payload.marketData.bars.length });
        }

        assert.deepEqual(blockedRequests, [], `${account}: browser attempted a blocked account read or non-GET request`);
        assert.deepEqual(pageErrors, [], `${account}: browser runtime errors during open-position replay`);
        assert.ok(apiRequests.every(request => request.method === "GET" &&
          (request.account === null || request.account === account)),
        `${account}: unexpected API scope/method: ${JSON.stringify(apiRequests.filter(request => request.method !== "GET" ||
          (request.account !== null && request.account !== account)))}`);
        const after = await readOpenPositions(scope);
        assert.deepEqual(after, before, `${account}: open broker position changed during read-only replay`);
        results.push({ account, symbol, openPositions: before.length, replayed, apiRequests: apiRequests.length,
          mutations: 0, browserErrors: 0, positionsUnchanged: true });
      } finally {
        await page.close();
      }
    }
    console.log("PASS four-demo AT-052 preflight and live read-only replay:", JSON.stringify({
      accounts: ACCOUNTS.map(scope => ({ account: scope.account, symbol: scope.symbol,
        openPositions: brokerState.get(scope.account).length })),
      results,
      noPositionReplay: ACCOUNTS.filter(scope => brokerState.get(scope.account).length === 0).map(scope => scope.account),
      blueberryQueried: false,
    }));
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function readOpenPositions({ account, symbol }) {
  const response = await fetch(`${BASE_URL}/api/chart/v1/positions?account=${account}&symbol=${encodeURIComponent(symbol)}`);
  assert.equal(response.status, 200, `${account}: position read failed with HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.source, "MT5_VERIFIED", `${account}: position source is not MT5_VERIFIED`);
  assert.equal(payload.canExecute, false, `${account}: position response is unexpectedly executable`);
  assert.equal(payload.symbol, symbol, `${account}: broker symbol mismatch`);
  return (payload.positions || []).map(position => ({
    ticket: position.ticket,
    identifier: position.identifier,
    symbol: position.symbol,
    side: position.side,
    volume: position.volume,
    priceOpen: position.priceOpen,
    sl: position.sl,
    tp: position.tp,
    revision: position.revision,
  })).sort((left, right) => left.ticket.localeCompare(right.ticket));
}
