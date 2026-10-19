"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const url = new URL(base);
assert.equal(url.protocol, "http:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname));
assert.ok([8050, 8056].includes(Number(url.port)));
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const previewPath = "/api/chart/v1/position/preview-stop";
const commitPath = "/api/chart/v1/position/commit-stop";
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".dashboard-env.json"), "utf8"));
const roles = JSON.parse(config.DASHBOARD_PROXY_USERS || "{}");
const user = Object.keys(roles).filter(name => roles[name] === "trade").sort()[0];
assert.ok(user && typeof config.DASHBOARD_PROXY_SECRET === "string" && config.DASHBOARD_PROXY_SECRET.length >= 32);
const identity = { "X-Dashboard-Proxy-Secret": config.DASHBOARD_PROXY_SECRET, "X-Dashboard-User": user };

async function request(pathname, { method = "GET", payload, headers = identity } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: { ...headers, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  return { response, body };
}

function price(value) {
  const scaled = Math.round(Number(value) * 1e8);
  assert.ok(Number.isSafeInteger(scaled), `unsafe price ${value}`);
  return scaled;
}

function riskReducingCandidates(position, info) {
  if (typeof position.sl !== "string") return null;
  const tick = price(info.tickSize);
  if (!Number.isSafeInteger(tick) || tick <= 0) return null;
  const old = price(position.sl);
  const direction = position.side === "BUY" ? 1 : position.side === "SELL" ? -1 : 0;
  if (!direction) return null;
  return [1, 2].map(count => ((old + direction * tick * count) / 1e8).toFixed(Number(info.digits)));
}

(async () => {
  const session = await request("/api/control_session", {
    headers: { ...identity, Origin: base },
  });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.control_enabled, true);
  const setCookie = session.response.headers.getSetCookie?.()[0] || session.response.headers.get("set-cookie");
  assert.ok(setCookie, "trade session cookie missing");
  const commitHeaders = {
    ...identity,
    Origin: base,
    Cookie: setCookie.split(";")[0],
    "X-Dashboard-CSRF": session.body.csrf_token,
  };

  let target = null;
  const skipped = [];
  for (const account of accounts) {
    const candlesResult = await request(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candlesResult.response.status, 200);
    const candles = candlesResult.body;
    assert.equal(candles.accountId, account);
    assert.equal(candles.source, "MT5_VERIFIED");
    assert.equal(candles.canExecute, false);
    const symbol = candles.symbol;
    const [bookResult, quoteResult, infoResult] = await Promise.all([
      request(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      request(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      request(`/api/chart/v1/symbol-info?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
    ]);
    assert.equal(bookResult.response.status, 200);
    assert.equal(bookResult.body.account, account);
    assert.equal(bookResult.body.source, "MT5_VERIFIED");
    if (quoteResult.body.freshness !== "FRESH") { skipped.push({ account, reason: "STALE_QUOTE" }); continue; }
    for (const position of bookResult.body.positions) {
      const candidates = riskReducingCandidates(position, infoResult.body);
      if (!candidates) continue;
      const payloads = candidates.map(candidate => ({
        schemaVersion: 1,
        account,
        symbol,
        positionTicket: position.ticket,
        expectedRevision: position.revision,
        candidate: { slPrice: candidate },
        clientRequestId: randomUUID(),
      }));
      const previews = [];
      for (const payload of payloads) {
        const result = await request(previewPath, { method: "POST", payload,
          headers: { ...identity, Origin: base } });
        if (result.response.status !== 200 || result.body.valid !== true ||
            result.body.geometry?.state !== "VALID" || result.body.guard?.state !== "ALLOW" ||
            result.body.canCommit !== true || result.body.canExecute !== false) {
          previews.length = 0;
          break;
        }
        previews.push(result.body);
      }
      if (previews.length === 2) {
        target = { account, symbol, position, candidates, previews };
        break;
      }
    }
    if (target) break;
    skipped.push({ account, reason: "NO_POSITION_WITH_TWO_VALID_TIGHTENED_STOPS" });
  }
  assert.ok(target, "No demo position supports two fresh, risk-reducing stop previews");
  assert.notEqual(target.account, "blueberry");

  const commitPayload = preview => ({
    schemaVersion: 1,
    account: target.account,
    symbol: target.symbol,
    positionTicket: target.position.ticket,
    expectedRevision: target.position.revision,
    previewId: preview.previewId,
    userConfirmed: true,
    idempotencyKey: randomUUID(),
  });
  const first = await request(commitPath, {
    method: "POST", payload: commitPayload(target.previews[0]), headers: commitHeaders,
  });
  assert.equal(first.response.status, 200, `first risk-reducing stop update failed: ${JSON.stringify(first.body)}`);
  assert.equal(first.body.status, "SAVED");
  assert.equal(first.body.verified, true);
  assert.equal(first.body.slPrice, target.candidates[0]);
  assert.notEqual(first.body.positionRevision, target.position.revision);

  const stale = await request(commitPath, {
    method: "POST", payload: commitPayload(target.previews[1]), headers: commitHeaders,
  });
  assert.equal(stale.response.status, 409, `stale revision was not rejected: ${JSON.stringify(stale.body)}`);
  assert.equal(stale.body.detail?.code, "POSITION_CHANGED");
  assert.equal(stale.body.detail?.canExecute, false);
  assert.equal(stale.body.detail?.canCommit, false);

  const readbackResult = await request(`/api/chart/v1/positions?account=${encodeURIComponent(target.account)}&symbol=${encodeURIComponent(target.symbol)}`);
  assert.equal(readbackResult.response.status, 200);
  const readback = readbackResult.body.positions.find(row => row.ticket === target.position.ticket);
  assert.ok(readback);
  assert.equal(readback.sl, target.candidates[0]);
  assert.equal(readback.tp, target.position.tp);
  assert.equal(readback.revision, first.body.positionRevision);
  console.log(JSON.stringify({
    account: target.account,
    symbol: target.symbol,
    timeframe: "M15",
    ticket: target.position.ticket,
    side: target.position.side,
    originalSL: target.position.sl,
    committedRiskReducingSL: readback.sl,
    rejectedStaleProposalSL: target.candidates[1],
    staleStatus: stale.response.status,
    staleCode: stale.body.detail.code,
    finalReadbackVerified: true,
    positionCommits: 1,
    staleCommitRejectedBeforeBrokerWrite: true,
    marketOrders: 0,
    blueberryQueried: false,
    skipped,
  }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exit(1); });
