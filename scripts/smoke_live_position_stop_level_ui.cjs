"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const account = "xau5m_m5";
const previewPath = "/api/chart/v1/position/preview-stop";

async function get(path) {
  const response = await fetch(base + path, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

function ticks(value, tick, digits) {
  return (Math.round(Number(value) / Number(tick)) * Number(tick)).toFixed(Number(digits));
}

(async () => {
  const candles = await get(`/api/candles?account=${account}`);
  assert.equal(candles.source, "MT5_VERIFIED");
  assert.equal(candles.canExecute, false);
  const [book, quote, info] = await Promise.all([
    get(`/api/chart/v1/positions?account=${account}&symbol=${encodeURIComponent(candles.symbol)}`),
    get(`/api/chart/v1/quotes?account=${account}&symbol=${encodeURIComponent(candles.symbol)}`),
    get(`/api/chart/v1/symbol-info?account=${account}&symbol=${encodeURIComponent(candles.symbol)}`),
  ]);
  assert.equal(quote.freshness, "FRESH");
  assert.ok(Number(info.stopsLevel) > 0, "selected demo symbol must enforce a broker stop distance");
  const target = book.positions.find(position => typeof position.sl === "string" &&
    ((position.side === "BUY" && Number(position.sl) < Number(quote.bid)) ||
     (position.side === "SELL" && Number(position.sl) > Number(quote.ask))));
  assert.ok(target, "a protected open demo position is required");
  const candidate = target.side === "BUY"
    ? ticks(Number(quote.bid) - Number(info.tickSize), info.tickSize, info.digits)
    : ticks(Number(quote.ask) + Number(info.tickSize), info.tickSize, info.digits);
  assert.ok(target.side === "BUY" ? Number(candidate) > Number(target.sl) : Number(candidate) < Number(target.sl),
    "candidate must reduce risk while violating only the broker stop distance");

  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
    const writes = [];
    const forbidden = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      const payload = (() => { try { return JSON.parse(request.postData() || "{}"); } catch { return {}; } })();
      if (url.searchParams.get("account") === "blueberry" || payload.account === "blueberry") {
        forbidden.push("blueberry");
      }
      if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname });
    });
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const payload = (() => { try { return JSON.parse(request.postData() || "{}"); } catch { return {}; } })();
      if (url.searchParams.get("account") === "blueberry" || payload.account === "blueberry") {
        await route.abort();
        return;
      }
      if (request.method() !== "GET" && url.pathname !== previewPath) {
        forbidden.push(`${request.method()} ${url.pathname}`);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(id => window.ChartStudioBeta?.getState()?.account === id, account);
    const toggle = page.locator("#cs-beta-toggle");
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await page.waitForFunction(() => document.querySelector("#cs-broker-positions-status")?.textContent.includes("MT5_VERIFIED"));
    const details = page.locator("details.cs-broker-read-panel");
    if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
    const row = page.locator("#cs-broker-positions tbody tr").filter({ hasText: target.ticket }).first();
    await row.locator("button[data-cmd='position-draft']").click();
    const form = page.locator("#cs-position-stop-draft");
    await form.waitFor({ state: "visible" });
    await form.locator("[name='slPrice']").fill(candidate);
    const previewResponsePromise = page.waitForResponse(response => new URL(response.url()).pathname === previewPath);
    await form.locator("button[type='submit']").click();
    const previewResponse = await previewResponsePromise;
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status(), 200);
    assert.equal(preview.account, account);
    assert.equal(preview.positionTicket, target.ticket);
    assert.equal(preview.positionRevision, target.revision);
    assert.equal(preview.valid, false);
    assert.ok(preview.geometry.reasons.includes("SL_STOPS_LEVEL"), JSON.stringify(preview.geometry));
    assert.equal(preview.canCommit, false);
    assert.equal(preview.canExecute, false);
    await page.waitForFunction(() => document.querySelector("#cs-position-stop-draft-status")?.textContent
      .includes("Vorschau ungültig · SL_STOPS_LEVEL"));
    assert.equal(await page.locator("#cs-position-stop-confirm").isVisible(), false);
    assert.deepEqual(writes, [{ method: "POST", path: previewPath }]);
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);

    const readback = await get(`/api/chart/v1/positions?account=${account}&symbol=${encodeURIComponent(candles.symbol)}`);
    const unchanged = readback.positions.find(position => position.ticket === target.ticket);
    assert.equal(unchanged.revision, target.revision);
    assert.equal(unchanged.sl, target.sl);
    assert.equal(unchanged.tp, target.tp);
    console.log(JSON.stringify({
      account, symbol: candles.symbol, timeframe: "M15", ticket: target.ticket,
      side: target.side, priorSL: target.sl, rejectedCandidate: candidate,
      geometryReasons: preview.geometry.reasons,
      visibleDenial: "Vorschau ungültig · SL_STOPS_LEVEL",
      previewPosts: 1, commitPosts: 0, marketOrders: 0,
      brokerReadbackUnchanged: true, blueberryQueried: false, browserErrors: errors,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
