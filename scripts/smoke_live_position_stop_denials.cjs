"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const baseUrl = new URL(base);
assert.equal(baseUrl.protocol, "http:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname));
assert.ok([8050, 8056].includes(Number(baseUrl.port)));
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".dashboard-env.json"), "utf8"));
const users = JSON.parse(config.DASHBOARD_PROXY_USERS || "{}");
const user = Object.keys(users).filter(name => users[name] === "trade").sort()[0];
assert.ok(user && typeof config.DASHBOARD_PROXY_SECRET === "string");
const identityHeaders = {
  "X-Dashboard-Proxy-Secret": config.DASHBOARD_PROXY_SECRET,
  "X-Dashboard-User": user,
};
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const previewPath = "/api/chart/v1/position/preview-stop";
const commitPath = "/api/chart/v1/position/commit-stop";

function scale(value) {
  const result = Math.round(Number(value) * 1e8);
  assert.ok(Number.isSafeInteger(result), `unsafe price ${value}`);
  return result;
}
function floorTick(value, tick) { return Math.floor(scale(value) / scale(tick)) * scale(tick) / 1e8; }
function ceilTick(value, tick) { return Math.ceil(scale(value) / scale(tick)) * scale(tick) / 1e8; }
function riskIncreasingCandidate(position, quote, info) {
  if (typeof position.sl !== "string") return null;
  const tick = Number(info.tickSize), point = Number(info.point);
  const gap = (Number(info.stopsLevel) + Number(info.freezeLevel) + 3) * point;
  if (![tick, point, gap].every(Number.isFinite) || tick <= 0 || gap <= 0) return null;
  const old = Number(position.sl);
  const value = position.side === "BUY"
    ? Math.min(old - tick, floorTick(Number(quote.bid) - gap, tick))
    : Math.max(old + tick, ceilTick(Number(quote.ask) + gap, tick));
  if ((position.side === "BUY" && value >= old) || (position.side === "SELL" && value <= old)) return null;
  return value.toFixed(Number(info.digits));
}

async function request(pathname, { method = "GET", payload, headers = identityHeaders } = {}) {
  const response = await fetch(base + pathname, {
    method, headers: { ...headers, ...(payload ? { "Content-Type": "application/json" } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  return { response, body };
}

(async () => {
  let target = null;
  for (const account of accounts) {
    const { response: candleResponse, body: candles } = await request(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candleResponse.status, 200);
    assert.equal(candles.accountId, account);
    assert.equal(candles.source, "MT5_VERIFIED");
    const symbol = candles.symbol;
    const [bookResult, quoteResult, infoResult] = await Promise.all([
      request(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      request(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      request(`/api/chart/v1/symbol-info?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
    ]);
    assert.equal(bookResult.response.status, 200);
    assert.equal(bookResult.body.account, account);
    assert.equal(bookResult.body.symbol, symbol);
    if (quoteResult.body.freshness !== "FRESH") continue;
    for (const position of bookResult.body.positions) {
      const candidate = riskIncreasingCandidate(position, quoteResult.body, infoResult.body);
      if (candidate) { target = { account, symbol, position, quote: quoteResult.body,
        info: infoResult.body, candidate }; break; }
    }
    if (target) break;
  }
  assert.ok(target, "No demo position had a fresh, geometrically possible risk-increasing SL candidate");
  assert.notEqual(target.account, "blueberry");

  const previewPayload = {
    schemaVersion: 1,
    account: target.account,
    symbol: target.symbol,
    positionTicket: target.position.ticket,
    expectedRevision: target.position.revision,
    candidate: { slPrice: target.candidate },
    clientRequestId: randomUUID(),
  };
  const wrongTicketPayload = { ...previewPayload,
    positionTicket: "99999999999999999999", clientRequestId: randomUUID() };
  const wrongTicket = await request(previewPath, { method: "POST", payload: wrongTicketPayload });
  assert.equal(wrongTicket.response.status, 404);
  assert.equal(wrongTicket.body.detail?.code, "POSITION_NOT_FOUND");
  const wrongSymbolPayload = { ...previewPayload,
    symbol: "UNRELATED_SYMBOL", clientRequestId: randomUUID() };
  const wrongSymbol = await request(previewPath, { method: "POST", payload: wrongSymbolPayload });
  assert.equal(wrongSymbol.response.ok, false,
    `unrelated symbol should fail closed: HTTP ${wrongSymbol.response.status}`);

  const previewResult = await request(previewPath, { method: "POST", payload: previewPayload });
  assert.equal(previewResult.response.status, 200, `preview unavailable: ${JSON.stringify(previewResult.body)}`);
  const preview = previewResult.body;
  assert.equal(preview.account, target.account);
  assert.equal(preview.positionTicket, target.position.ticket);
  assert.equal(preview.positionRevision, target.position.revision);
  assert.equal(preview.valid, true, `candidate geometry was not valid: ${preview.geometry?.reasons}`);
  assert.equal(preview.geometry.state, "VALID");
  assert.equal(preview.canExecute, false);
  assert.equal(preview.canCommit, false);
  assert.deepEqual(preview.guard, { state: "BLOCK", source: "NON_CHALLENGE_DEMO_POLICY" });

  const commitPayload = {
    schemaVersion: 1, account: target.account, symbol: target.symbol,
    positionTicket: target.position.ticket, expectedRevision: target.position.revision,
    previewId: preview.previewId, userConfirmed: true, idempotencyKey: randomUUID(),
  };
  const noIdentity = await request(commitPath, {
    method: "POST", payload: commitPayload,
    headers: { Origin: base },
  });
  assert.equal(noIdentity.response.status, 403);

  const sessionResult = await request("/api/control_session", {
    headers: { ...identityHeaders, Origin: base },
  });
  assert.equal(sessionResult.response.status, 200);
  assert.equal(sessionResult.body.control_enabled, true);
  const cookieHeader = sessionResult.response.headers.getSetCookie?.()[0] ||
    sessionResult.response.headers.get("set-cookie");
  assert.ok(cookieHeader, "control session cookie missing");
  const cookie = cookieHeader.split(";")[0];
  const hardLock = await request(commitPath, {
    method: "POST", payload: commitPayload,
    headers: { ...identityHeaders, Origin: base, Cookie: cookie,
      "X-Dashboard-CSRF": sessionResult.body.csrf_token },
  });
  assert.equal(hardLock.response.status, 403);
  assert.equal(hardLock.body.detail?.code, "GUARD_BLOCKED");
  assert.equal(hardLock.body.detail?.canExecute, false);
  assert.equal(hardLock.body.detail?.canCommit, false);

  const readbackResult = await request(`/api/chart/v1/positions?account=${encodeURIComponent(target.account)}&symbol=${encodeURIComponent(target.symbol)}`);
  assert.equal(readbackResult.response.status, 200);
  const readback = readbackResult.body.positions.find(row => row.ticket === target.position.ticket);
  assert.ok(readback);
  assert.equal(readback.revision, target.position.revision);
  assert.equal(readback.sl, target.position.sl);
  assert.equal(readback.tp, target.position.tp);
  console.log(JSON.stringify({
    account: target.account, symbol: target.symbol, ticket: target.position.ticket,
    validRiskIncreasingCandidate: target.candidate,
    previewGuard: preview.guard,
    wrongTicketDenied: wrongTicket.body.detail.code,
    wrongSymbolDenied: wrongSymbol.response.status,
    noIdentityDenied: noIdentity.response.status,
    tradeRoleHardLockDenied: hardLock.body.detail.code,
    brokerReadbackUnchanged: true,
    positionMutations: 0, marketOrders: 0, blueberryQueried: false,
  }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exit(1); });
