"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const parsedBase = new URL(base);
assert.equal(parsedBase.protocol, "http:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedBase.hostname));
assert.ok([8050, 8056].includes(Number(parsedBase.port)));
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const previewPath = "/api/chart/v1/position/preview-stop";
const commitPath = "/api/chart/v1/position/commit-stop";
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".dashboard-env.json"), "utf8"));
const users = JSON.parse(config.DASHBOARD_PROXY_USERS || "{}");
const user = Object.keys(users).filter(name => users[name] === "trade").sort()[0];
assert.ok(typeof config.DASHBOARD_PROXY_SECRET === "string" && config.DASHBOARD_PROXY_SECRET.length >= 32);
assert.ok(user, "A configured trade-role dashboard identity is required");

function scaled(value) {
  const n = Math.round(Number(value) * 1e8);
  assert.ok(Number.isSafeInteger(n), `unsafe price value: ${value}`);
  return n;
}
function floorTick(value, tick) { return Math.floor(scaled(value) / scaled(tick)) * scaled(tick) / 1e8; }
function ceilTick(value, tick) { return Math.ceil(scaled(value) / scaled(tick)) * scaled(tick) / 1e8; }
function candidateFor(position, quote, info) {
  if (typeof position.sl !== "string") return null;
  const tick = Number(info.tickSize);
  const point = Number(info.point);
  const gap = (Number(info.stopsLevel) + Number(info.freezeLevel) + 3) * point;
  if (![tick, point, gap].every(Number.isFinite) || tick <= 0 || gap <= 0) return null;
  const old = Number(position.sl);
  const moved = position.side === "BUY"
    ? Math.min(old + tick, floorTick(Number(quote.bid) - gap, tick))
    : Math.max(old - tick, ceilTick(Number(quote.ask) + gap, tick));
  if ((position.side === "BUY" && moved <= old) || (position.side === "SELL" && moved >= old)) return null;
  return moved.toFixed(Number(info.digits));
}

async function get(pathname) {
  const response = await fetch(base + pathname, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  assert.equal(response.ok, true, `${pathname}: HTTP ${response.status}`);
  return body;
}

(async () => {
  let browser;
  const outcomes = [];
  try {
    const target = await (async () => {
      for (const account of accounts) {
        const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
        assert.equal(candles.accountId, account);
        assert.equal(candles.source, "MT5_VERIFIED");
        assert.equal(candles.timeframe, "M15");
        assert.equal(candles.canExecute, false);
        const symbol = candles.symbol;
        const [book, quote, info] = await Promise.all([
          get(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
          get(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
          get(`/api/chart/v1/symbol-info?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
        ]);
        assert.equal(book.account, account);
        assert.equal(book.symbol, symbol);
        assert.equal(book.source, "MT5_VERIFIED");
        assert.equal(book.canExecute, false);
        if (quote.freshness !== "FRESH") { outcomes.push({ account, result: "SKIP_STALE_QUOTE" }); continue; }
        for (const position of book.positions) {
          const candidate = candidateFor(position, quote, info);
          if (candidate) return { account, symbol, position, candidate };
        }
        outcomes.push({ account, result: "SKIP_NO_RISK_REDUCING_SL_CANDIDATE" });
      }
      return null;
    })();
    assert.ok(target, "No non-Blueberry demo has an open position with a valid tighter-SL candidate");
    assert.ok(accounts.includes(target.account));
    assert.notEqual(target.account, "blueberry");

    browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1500 },
      extraHTTPHeaders: {
        "X-Dashboard-Proxy-Secret": config.DASHBOARD_PROXY_SECRET,
        "X-Dashboard-User": user,
      },
    });
    const page = await context.newPage();
    const apiWrites = [];
    const commitBodies = [];
    const commitResponses = [];
    const violations = [];
    page.on("pageerror", error => violations.push(`pageerror: ${error.message}`));
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) return;
      let payload = {};
      try { payload = JSON.parse(request.postData() || "{}"); } catch (_) {}
      const scopedAccount = url.searchParams.get("account") || payload.account;
      if (scopedAccount === "blueberry") violations.push("Blueberry request observed");
      if (request.method() !== "GET") {
        apiWrites.push({ method: request.method(), path: url.pathname });
        if (![previewPath, commitPath].includes(url.pathname)) violations.push(`unexpected write ${request.method()} ${url.pathname}`);
        if (url.pathname === commitPath) commitBodies.push(payload);
      }
    });
    page.on("response", async response => {
      if (new URL(response.url()).pathname === commitPath) {
        try { commitResponses.push({ status: response.status(), body: await response.json() }); }
        catch (error) { violations.push(`commit response unreadable: ${error.message}`); }
      }
    });

    await page.goto(`${base}/?account=${encodeURIComponent(target.account)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(id => window.ChartStudioBeta?.getState()?.account === id, target.account);
    await page.locator("#cs-beta-toggle").click();
    await page.waitForFunction(() => document.querySelector("#cs-broker-positions-status")?.textContent.includes("MT5_VERIFIED"));
    const details = page.locator("details.cs-broker-read-panel");
    if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
    const row = page.locator("#cs-broker-positions tbody tr").filter({ hasText: target.position.ticket }).first();
    await row.locator("button[data-cmd='position-draft']").click();
    await page.locator("#cs-position-stop-draft").waitFor({ state: "visible" });
    const sl = page.locator("#cs-position-stop-draft [name='slPrice']");
    await sl.fill(target.candidate);
    const previewWait = page.waitForResponse(response => new URL(response.url()).pathname === previewPath);
    await page.locator("#cs-position-stop-draft button[type='submit']").click();
    const previewResponse = await previewWait;
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status(), 200, `preview rejected: ${JSON.stringify(preview)}`);
    assert.equal(preview.account, target.account);
    assert.equal(preview.symbol, target.symbol);
    assert.equal(preview.positionTicket, target.position.ticket);
    assert.equal(preview.positionRevision, target.position.revision);
    assert.equal(preview.valid, true);
    assert.equal(preview.geometry.state, "VALID");
    assert.equal(preview.guard.state, "ALLOW");
    assert.equal(preview.guard.source, "NON_CHALLENGE_DEMO_POLICY");
    assert.equal(preview.canCommit, true);
    assert.equal(preview.canExecute, false);
    assert.equal(preview.brokerPreview.slPrice, target.candidate);
    assert.equal(commitBodies.length, 0, "preview alone must never commit");
    assert.equal(await page.locator("#cs-position-stop-confirm").isVisible(), true);
    const confirmButton = page.locator("#cs-position-stop-confirm-button");
    assert.equal(await confirmButton.isDisabled(), true, "confirmation checkbox is required");
    await page.locator("#cs-position-stop-confirm-check").check();
    assert.equal(await confirmButton.isDisabled(), false);
    const commitWait = page.waitForResponse(response => new URL(response.url()).pathname === commitPath);
    await confirmButton.click();
    const commitResponse = await commitWait;
    const committed = await commitResponse.json();
    assert.equal(commitResponse.status(), 200, `commit returned HTTP ${commitResponse.status()}`);
    assert.equal(committed.status, "SAVED");
    assert.equal(committed.verified, true);
    assert.equal(committed.slPrice, target.candidate);
    assert.match(committed.positionRevision, /^[0-9a-f]{64}$/);
    assert.equal(commitBodies.length, 1, "exactly one commit request is permitted");
    assert.equal(commitBodies[0].account, target.account);
    assert.equal(commitBodies[0].symbol, target.symbol);
    assert.equal(commitBodies[0].positionTicket, target.position.ticket);
    assert.equal(commitBodies[0].expectedRevision, target.position.revision);
    assert.equal(commitBodies[0].previewId, preview.previewId);
    assert.equal(commitBodies[0].userConfirmed, true);
    assert.match(commitBodies[0].idempotencyKey, /^[0-9a-f-]{36}$/);
    assert.equal(commitResponses.length, 1);
    assert.deepEqual(violations, []);

    const book = await get(`/api/chart/v1/positions?account=${encodeURIComponent(target.account)}&symbol=${encodeURIComponent(target.symbol)}`);
    const readback = book.positions.find(position => position.ticket === target.position.ticket);
    assert.ok(readback);
    assert.equal(readback.sl, committed.slPrice);
    assert.equal(readback.tp, committed.tpPrice);
    assert.equal(readback.revision, committed.positionRevision);
    assert.notEqual(readback.revision, target.position.revision);
    assert.equal(apiWrites.filter(write => write.path === previewPath).length, 1);
    assert.equal(apiWrites.filter(write => write.path === commitPath).length, 1);
    console.log(JSON.stringify({
      outcomes,
      accepted: { account: target.account, symbol: target.symbol, timeframe: "M15", ticket: target.position.ticket,
        side: target.position.side, priorSL: target.position.sl, brokerReadbackSL: readback.sl,
        brokerReadbackTP: readback.tp, revisionVerified: true },
      previewPosts: 1, commitPosts: 1, marketOrdersSent: 0, blueberryQueried: false,
    }, null, 2));
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
