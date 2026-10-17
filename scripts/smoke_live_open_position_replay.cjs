"use strict";

// Read-only AT-052 acceptance: replay entry evidence while its demo position
// is still open, and prove both request and broker-position immutability.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const ACCOUNT = "titan_m5";
const SYMBOL = "XAUUSD.p";
const FORBIDDEN_ACCOUNTS = new Set(["blueberry"]);

(async () => {
  let browser;
  try {
    const before = await readOpenPositions();
    assert.ok(before.length > 0, `${ACCOUNT}: AT-052 requires a currently open demo position`);

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const apiRequests = [];
    const blockedRequests = [];
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const account = url.searchParams.get("account");
      apiRequests.push({ method: request.method(), account, path: url.pathname,
        revision: url.searchParams.get("revision") });
      if (account && FORBIDDEN_ACCOUNTS.has(account)) {
        blockedRequests.push({ reason: "FORBIDDEN_ACCOUNT", path: url.pathname });
        return route.abort("blockedbyclient");
      }
      if (request.method() !== "GET") {
        blockedRequests.push({ reason: "NON_GET", method: request.method(), path: url.pathname });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    await page.goto(`${BASE_URL}/?account=${ACCOUNT}`, { waitUntil: "domcontentloaded" });
    await page.locator(`#account-switcher [data-account="${ACCOUNT}"][aria-pressed="true"]`).waitFor();
    await page.locator("#cs-beta-toggle").click();
    const panel = page.locator("#cs-evidence-panel");
    await panel.locator(":scope > summary").click();
    await panel.locator("#cs-evidence-kind").selectOption("SNAPSHOT");
    await panel.locator("#cs-evidence-load").click();
    await page.waitForFunction(() => {
      const status = document.querySelector("#cs-evidence-status")?.textContent || "";
      return !status.includes("Aufzeichnungen werden gelesen");
    }, null, { timeout: 20000 });
    assert.match(await panel.locator("#cs-evidence-status").textContent(), /Store: INITIALIZED/);

    const rows = panel.locator("#cs-evidence-list > li");
    const rowNodes = await rows.count();
    assert.ok(rowNodes > 0, `${ACCOUNT}: no recorded snapshots returned`);
    const records = await rows.locator("pre").evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent)));
    const replayed = [];
    for (const position of before) {
      const index = records.findIndex(record => record.type === "SNAPSHOT" &&
        record.provenance === "RECORDED" && record.accountId === ACCOUNT &&
        record.payload.positionIdentifier === position.identifier && record.payload.captureType === "ENTRY");
      assert.notEqual(index, -1, `${ACCOUNT}: open position ${position.identifier} has no exact recorded entry snapshot`);
      const record = records[index];
      assert.equal(record.payload.chartView.symbol, SYMBOL, `${ACCOUNT}: snapshot symbol drifted`);
      assert.equal(record.payload.chartView.timeframe, "M15", `${ACCOUNT}: snapshot timeframe drifted`);
      assert.ok(record.payload.marketData?.bars?.length > 0, `${ACCOUNT}: snapshot has no frozen bars`);
      const lifecycle = record.payload.lifecycleEventIds?.find(event => event.type === "LIFECYCLE");
      assert.ok(lifecycle?.id && Number.isSafeInteger(lifecycle.dataRevision), `${ACCOUNT}: snapshot has no exact lifecycle reference`);

      const row = rows.nth(index);
      await row.locator("details > summary").click();
      await row.locator("canvas.cs-evidence-chart").waitFor({ state: "visible" });
      await row.locator("button.cs-evidence-snapshot-replay").click();
      await page.waitForFunction(index => {
        const row = document.querySelectorAll("#cs-evidence-list > li")[index];
        const status = row?.querySelector(".cs-evidence-snapshot-replay-status")?.textContent || "";
        return /RECORDED · \d+ eingefrorene Bars|Replay nicht verfügbar/.test(status);
      }, index, { timeout: 20000 });
      const replayStatus = await row.locator(".cs-evidence-snapshot-replay-status").textContent();
      assert.match(replayStatus, /RECORDED · \d+ eingefrorene Bars/,
        `${ACCOUNT}: recorded replay failed (${replayStatus})`);
      assert.ok(apiRequests.some(request => request.method === "GET" && request.account === ACCOUNT &&
        request.path.endsWith(`/lifecycle/${encodeURIComponent(lifecycle.id)}`) &&
        request.revision === String(lifecycle.dataRevision)),
      `${ACCOUNT}: replay did not request its exact lifecycle revision`);
      replayed.push({ position: position.identifier, snapshotId: record.id, lifecycleId: lifecycle.id,
        bars: record.payload.marketData.bars.length });
    }

    assert.deepEqual(blockedRequests, [], "the browser attempted a blocked account read or non-GET API request");
    assert.deepEqual(pageErrors, [], "browser runtime errors during open-position replay");
    const after = await readOpenPositions();
    assert.deepEqual(after, before, `${ACCOUNT}: open broker position changed during read-only replay`);
    assert.ok(apiRequests.every(request => request.method === "GET" &&
      (request.account === null || request.account === ACCOUNT)),
    `unexpected API scope/method: ${JSON.stringify(apiRequests.filter(request => request.method !== "GET" ||
      (request.account !== null && request.account !== ACCOUNT)))}`);
    console.log("PASS live read-only replay with open demo positions:", JSON.stringify({
      account: ACCOUNT, symbol: SYMBOL, openPositions: before.length, replayed,
      apiRequests: apiRequests.length, mutations: 0, browserErrors: 0,
      positionsUnchanged: true,
    }));
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function readOpenPositions() {
  const response = await fetch(`${BASE_URL}/api/chart/v1/positions?account=${ACCOUNT}&symbol=${encodeURIComponent(SYMBOL)}`);
  assert.equal(response.status, 200, `${ACCOUNT}: position read failed with HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.source, "MT5_VERIFIED", `${ACCOUNT}: position source is not MT5_VERIFIED`);
  assert.equal(payload.canExecute, false, `${ACCOUNT}: position response is unexpectedly executable`);
  assert.equal(payload.symbol, SYMBOL, `${ACCOUNT}: broker symbol mismatch`);
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
