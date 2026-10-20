"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze([
  ["xau5m_m5", "XAUUSD.p"],
  ["titan_m5", "XAUUSD.p"],
  ["titan", "XAUUSD"],
  ["xau5m_500", "XAUUSD.p"],
  ["goldm15", "XAUUSD"],
]);
const previewPath = "/api/chart/v1/position/preview-stop";

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

async function positionWithStop(account, symbol) {
  const book = await get(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`);
  assert.equal(book.account, account);
  assert.equal(book.symbol, symbol);
  assert.equal(book.source, "MT5_VERIFIED");
  assert.equal(book.canExecute, false);
  const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
  const bars = candles.candles || candles.bars || [];
  const low = Math.min(...bars.slice(-250).map(row => Number(row.low)).filter(Number.isFinite));
  const high = Math.max(...bars.slice(-250).map(row => Number(row.high)).filter(Number.isFinite));
  const position = book.positions.find(row => typeof row.sl === "string" && Number(row.sl) >= low && Number(row.sl) <= high);
  if (!position) return null;
  assert.match(position.ticket, /^[1-9][0-9]{0,19}$/);
  assert.match(position.revision, /^[0-9a-f]{64}$/);
  assert.ok(["BUY", "SELL"].includes(position.side));
  return position;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const violations = [];
  let completed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    const previews = [];
    page.on("pageerror", error => violations.push(`pageerror: ${error.message}`));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      const account = url.searchParams.get("account") || (() => {
        try { return JSON.parse(request.postData() || "{}").account; } catch (_) { return null; }
      })();
      if (account === "blueberry") violations.push("protected account was queried");
      if (request.method() !== "GET" && url.pathname !== previewPath) {
        violations.push(`unexpected non-preview API method ${request.method()} ${url.pathname}`);
      }
    });
    page.on("response", response => {
      if (new URL(response.url()).pathname !== previewPath) return;
      response.json().then(body => previews.push({ status: response.status(), body })).catch(error => violations.push(`preview JSON: ${error.message}`));
    });
    await page.route("**/static/lightweight-charts.js", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const hook = `;(()=>{const api=window.LightweightCharts,createChart=api.createChart,wrappedCreate=(...args)=>{const chart=createChart.apply(api,args),add=chart.addCandlestickSeries.bind(chart);chart.addCandlestickSeries=function(...seriesArgs){const series=add(...seriesArgs);window.__liveStopChartSeries=series;return series};window.__liveStopChart=chart;return chart};window.LightweightCharts={...api,createChart:wrappedCreate}})();`;
      await route.fulfill({ response, body: source + hook });
    });

    for (const [account, symbol] of accounts) {
      const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
      assert.equal(candles.accountId, account);
      assert.equal(candles.symbol, symbol);
      assert.equal(candles.source, "MT5_VERIFIED");
      assert.equal(candles.canExecute, false);
      const position = await positionWithStop(account, symbol);
      if (!position) {
        results.push({ account, symbol, result: "NO_OPEN_POSITION_WITH_SL" });
        continue;
      }

      await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded" });
      await page.locator("#tv-chart canvas").first().waitFor({ state: "visible" });
      await page.waitForFunction(id => window.ChartStudioBeta?.getState()?.account === id, account);
      await page.locator("#cs-beta-toggle").click();
      await page.waitForFunction(() => document.querySelector("#cs-broker-positions-status")?.textContent.includes("MT5_VERIFIED"));
      const brokerDetails = page.locator("details.cs-broker-read-panel");
      if (!(await brokerDetails.evaluate(element => element.open))) await brokerDetails.locator("summary").click();
      const row = page.locator("#cs-broker-positions tbody tr").filter({ hasText: position.ticket }).first();
      await row.locator("button[data-cmd='position-draft']").click();
      await page.locator("#cs-position-stop-draft").waitFor({ state: "visible" });
      const initialDraft = await page.evaluate(() => window.ChartStudioBeta.getState().positionDraft);
      assert.equal(initialDraft.account, account);
      assert.equal(initialDraft.symbol, symbol);
      assert.equal(initialDraft.ticket, position.ticket);
      assert.equal(initialDraft.revision, position.revision);
      assert.equal(String(initialDraft.slPrice), String(position.sl));

      await page.evaluate(() => {
        window.__liveStopPointerEvents = [];
        for (const type of ["pointerdown", "pointermove", "pointerup"]) document.addEventListener(type, event => {
          window.__liveStopPointerEvents.push({ type, x: event.clientX, y: event.clientY, target: event.target?.tagName, id: event.target?.id, classes: String(event.target?.className || "").slice(0, 80) });
        }, true);
      });
      await page.locator("#cs-position-stop-draft button[data-cmd='drag']").click();
      await page.locator("#tv-chart").scrollIntoViewIfNeeded();
      const drag = await page.evaluate(({ side, sl }) => {
        const series = window.__liveStopChartSeries;
        const canvas = document.querySelector("#tv-chart canvas.cs-beta-canvas");
        if (!series || !canvas) throw new Error("Live chart coordinate bridge unavailable");
        const rect = canvas.getBoundingClientRect();
        const tick = Number(window.ChartStudioBeta.getState().positionDraft.tickSize);
        const digits = Number(window.ChartStudioBeta.getState().positionDraft.digits);
        const target = Number((Number(sl) + (side === "BUY" ? -1 : 1) * Math.max(1, 3 * tick)).toFixed(digits));
        const startY = series.priceToCoordinate(Number(sl));
        const endY = series.priceToCoordinate(target);
        if (![startY, endY].every(Number.isFinite)) throw new Error("Stop handle is outside chart price coordinates");
        return { bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, start: { x: rect.left + rect.width * .2, y: rect.top + startY }, end: { x: rect.left + rect.width * .2, y: rect.top + endY } };
      }, { side: position.side, sl: position.sl });
      assert.ok(drag.start.x >= drag.bounds.left && drag.start.x <= drag.bounds.right && drag.start.y >= drag.bounds.top && drag.start.y <= drag.bounds.bottom, `verified stop handle must be inside chart canvas: ${JSON.stringify(drag)}`);
      assert.ok(drag.end.x >= drag.bounds.left && drag.end.x <= drag.bounds.right && drag.end.y >= drag.bounds.top && drag.end.y <= drag.bounds.bottom, `stop draft target must be inside chart canvas: ${JSON.stringify(drag)}`);
      await page.mouse.move(drag.start.x, drag.start.y);
      await page.mouse.down();
      await page.mouse.move(drag.end.x, drag.end.y, { steps: 6 });
      await page.mouse.up();
      const slInput = page.locator("#cs-position-stop-draft [name='slPrice']");
      await page.waitForTimeout(250);
      const dragReadback = await page.evaluate(() => ({
        value: document.querySelector("#cs-position-stop-draft [name='slPrice']")?.value,
        draft: window.ChartStudioBeta?.getState()?.positionDraft,
        tool: window.ChartStudioBeta?.getState()?.tool,
        status: document.querySelector("#cs-beta-message")?.textContent,
        pointerEvents: window.__liveStopPointerEvents,
        chartRect: (()=>{const r=document.querySelector("#tv-chart")?.getBoundingClientRect();return r&&[r.x,r.y,r.width,r.height]})(),
        canvasRect: (()=>{const r=document.querySelector("#tv-chart canvas.cs-beta-canvas")?.getBoundingClientRect();return r&&[r.x,r.y,r.width,r.height]})(),
      }));
      const candidateSl = await slInput.inputValue();
      assert.notEqual(candidateSl, String(position.sl), `chart drag must change the displayed SL draft: ${JSON.stringify({ drag, dragReadback })}`);
      assert.match(await page.locator("#cs-position-stop-draft-status").textContent(), /Entwurf geändert/);

      const previewRequest = page.waitForRequest(request => new URL(request.url()).pathname === previewPath);
      const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === previewPath);
      await page.locator("#cs-position-stop-draft button[type='submit']").click();
      const [request, response] = await Promise.all([previewRequest, previewResponse]);
      const payload = request.postDataJSON();
      const preview = await response.json();
      assert.equal(payload.account, account);
      assert.equal(payload.symbol, symbol);
      assert.equal(payload.positionTicket, position.ticket);
      assert.equal(payload.expectedRevision, position.revision);
      assert.equal(payload.candidate.slPrice, candidateSl);
      if (response.status() === 503) {
        assert.equal(preview.detail?.code, "QUOTE_NOT_FRESH");
        assert.equal(preview.detail?.canExecute, false);
        assert.equal(preview.detail?.canCommit, false);
        assert.deepEqual(preview.detail?.guard, { state: "UNKNOWN", source: "NONE" });
      } else {
        assert.equal(response.status(), 200);
        assert.equal(preview.account, account);
        assert.equal(preview.symbol, symbol);
        assert.equal(preview.positionTicket, position.ticket);
        assert.equal(preview.positionRevision, position.revision);
        assert.equal(preview.brokerPreview.slPrice, candidateSl);
        assert.equal(preview.canExecute, false);
        assert.equal(preview.canCommit, false, "draft/drag acceptance never commits");
        assert.ok((preview.guard?.state === "UNKNOWN" && preview.guard?.source === "NONE") ||
          (preview.guard?.state === "BLOCK" && preview.guard?.source === "NON_CHALLENGE_DEMO_POLICY"));
        assert.equal(preview.geometry.state, "VALID");
        await page.waitForFunction(() => /Guard (UNKNOWN|BLOCK).*keine Änderung möglich/.test(document.querySelector("#cs-position-stop-draft-status")?.textContent || ""));
      }

      const readback = await get(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`);
      const unchanged = readback.positions.find(row => row.ticket === position.ticket);
      assert.ok(unchanged);
      assert.equal(unchanged.revision, position.revision);
      assert.equal(unchanged.sl, position.sl);
      assert.equal(unchanged.tp, position.tp);
      results.push({ account, symbol, result: response.status() === 503 ? "LIVE_UI_DRAG_STALE_PREVIEW_FAIL_CLOSED" : "LIVE_UI_DRAG_PREVIEW_VALID", side: position.side, stopChangedInDraft: true, readbackUnchanged: true });
      completed = true;
      break;
    }

    assert.equal(violations.length, 0, violations.join("; "));
    assert.equal(completed, true, "No authorized demo position with an existing stop was available for UI acceptance");
    assert.ok(previews.length >= 1);
    console.log(JSON.stringify({ results, readOnlyPreviewPosts: previews.length, positionMutations: 0, ordersSent: 0, protectedAccountQueried: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
