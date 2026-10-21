"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { classifyLiveDemoRequest } = require("./live_demo_scope_guard.cjs");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const baseUrl = new URL(base);
assert.equal(baseUrl.protocol, "http:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname));
assert.ok([8050, 8056].includes(Number(baseUrl.port)));
const basePath = baseUrl.pathname.replace(/\/$/, "");
const allowedAccounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const demoSymbols = { titan: "XAUUSD", xau5m_m5: "XAUUSD.p", titan_m5: "XAUUSD.p", xau5m_500: "XAUUSD.p", goldm15: "XAUUSD" };
const accounts = Object.freeze([
  ["xau5m_m5", "XAUUSD.p"],
  ["titan_m5", "XAUUSD.p"],
  ["titan", "XAUUSD"],
  ["xau5m_500", "XAUUSD.p"],
  ["goldm15", "XAUUSD"],
]);
const previewPath = "/api/chart/v1/position/preview-stop";

function classifyRequest(request, url) {
  const scopedUrl = new URL(url);
  if (request.method() === "POST" && scopedUrl.pathname === `${basePath}${previewPath}`) {
    try {
      const payloadAccount = request.postDataJSON()?.account;
      if (typeof payloadAccount === "string" && allowedAccounts.includes(payloadAccount)) {
        return { allowed: true, kind: "demo_preview", account: payloadAccount };
      }
    } catch (_) {}
    return { allowed: false, reason: "account_scope" };
  }
  if (!scopedUrl.searchParams.has("account") && request.method() !== "GET") {
    try {
      const payloadAccount = request.postDataJSON()?.account;
      if (typeof payloadAccount === "string") scopedUrl.searchParams.set("account", payloadAccount);
    } catch (_) {}
  }
  return classifyLiveDemoRequest({ url: scopedUrl, method: request.method(), basePath, allowedAccounts });
}

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
  const apiRequests = [];
  const blockedApiRequests = [];
  const failedApiRequests = [];
  let completed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    const previews = [];
    page.on("pageerror", error => violations.push(`pageerror: ${error.message}`));
    page.on("requestfailed", request => {
      const url = new URL(request.url());
      if (url.origin === baseUrl.origin && url.pathname.startsWith(`${basePath}/api/`)) {
        failedApiRequests.push({ path: url.pathname, method: request.method(), error: request.failure()?.errorText || "unknown" });
      }
    });
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== baseUrl.origin || !url.pathname.startsWith(`${basePath}/api/`)) return;
      const account = url.searchParams.get("account") ?? (() => {
        try { return JSON.parse(request.postData() || "{}").account ?? null; } catch (_) { return null; }
      })();
      const scope = classifyRequest(request, url);
      apiRequests.push({ path: url.pathname, method: request.method(), account, scope: scope.kind || scope.reason });
      if (!scope.allowed) violations.push(`out-of-scope API request: ${request.method()} ${url.pathname} (${scope.reason})`);
      if (request.method() !== "GET" && url.pathname !== previewPath) {
        violations.push(`unexpected non-preview API method ${request.method()} ${url.pathname}`);
      }
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseUrl.origin) return route.continue();
      const scope = classifyRequest(route.request(), url);
      if (!scope.allowed) {
        blockedApiRequests.push({ path: url.pathname, method: route.request().method(), reason: scope.reason });
        return route.abort("blockedbyclient");
      }
      if (scope.kind === "global_read" && scope.endpoint === "/api/accounts") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          default: accounts[0][0],
          accounts: allowedAccounts.map(id => ({ id, name: id, login: "Demo", server: "Demo", symbol: demoSymbols[id], timeframe: "M15", is_demo: true, challenge_protection: false, capacity: 3 })),
        }) });
      }
      if (scope.kind === "global_read" && scope.endpoint === "/api/chart/v1/capabilities") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          accountScopes: allowedAccounts, symbols: ["XAUUSD", "XAUUSD.p"],
          timeframes: ["M1", "M5", "M15", "M30", "H1", "H4", "D1"], features: { encryptedDeviceSync: false },
        }) });
      }
      return route.continue();
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
      const submit = page.locator("#cs-position-stop-draft button[type='submit']");
      assert.equal(await submit.isEnabled(), true, `preview submit must be enabled: ${await page.locator("#cs-position-stop-draft-status").textContent()}`);
      await submit.click();
      let request, response;
      try { [request, response] = await Promise.all([previewRequest, previewResponse]); }
      catch (error) { throw new Error(`${error.message}; API=${JSON.stringify(apiRequests)}; blocked=${JSON.stringify(blockedApiRequests)}; failed=${JSON.stringify(failedApiRequests)}`); }
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
    assert.equal(blockedApiRequests.length, 0, "the live UI flow must not attempt out-of-scope API requests");
    const invalidApiRequests = apiRequests.filter(item =>
      (item.account == null || allowedAccounts.includes(item.account)) &&
      (item.method === "GET" || item.path === previewPath && item.method === "POST"));
    assert.ok(apiRequests.length > 0 && invalidApiRequests.length === apiRequests.length,
      `unexpected API scope or method: ${JSON.stringify(apiRequests.filter(item => !invalidApiRequests.includes(item)))}`);
    assert.equal(completed, true, "No authorized demo position with an existing stop was available for UI acceptance");
    assert.ok(previews.length >= 1);
    console.log(JSON.stringify({ results, readOnlyPreviewPosts: previews.length, apiRequests: apiRequests.length,
      blockedApiRequests: blockedApiRequests.length, positionMutations: 0, ordersSent: 0, blueberryQueried: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
