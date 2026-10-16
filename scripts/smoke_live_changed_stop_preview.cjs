"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500"]);

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

function floorToTick(price, tick) {
  const scale = 1e8;
  const p = Math.round(Number(price) * scale);
  const t = Math.round(Number(tick) * scale);
  assert.ok(Number.isSafeInteger(p) && Number.isSafeInteger(t) && t > 0, "unsafe tick arithmetic");
  return (Math.floor(p / t) * t) / scale;
}

function ceilToTick(price, tick) {
  const scale = 1e8;
  const p = Math.round(Number(price) * scale);
  const t = Math.round(Number(tick) * scale);
  assert.ok(Number.isSafeInteger(p) && Number.isSafeInteger(t) && t > 0, "unsafe tick arithmetic");
  return (Math.ceil(p / t) * t) / scale;
}

function priceText(value, digits) {
  return value.toFixed(digits);
}

async function preview(account, symbol, position, candidate) {
  let response;
  let body;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = {
      schemaVersion: 1,
      account,
      symbol,
      positionTicket: position.ticket,
      expectedRevision: position.revision,
      candidate,
      clientRequestId: randomUUID(),
    };
    response = await fetch(`${base}/api/chart/v1/position/preview-stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    body = await response.json();
    const transientQuote = response.status === 503 && body?.detail?.code === "QUOTE_NOT_FRESH";
    const transientLimit = response.status === 429 && body?.detail?.code === "RATE_LIMITED";
    if ((transientQuote && attempt < 2) || (transientLimit && attempt < 4)) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = transientLimit && Number.isFinite(retryAfter)
        ? Math.min(2000, Math.max(500, retryAfter * 1000))
        : 750;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }
    break;
  }
  assert.equal(response.ok, true, `${account}/${position.ticket}: preview HTTP ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.account, account);
  assert.equal(body.symbol, symbol);
  assert.equal(body.positionTicket, position.ticket);
  assert.equal(body.positionRevision, position.revision);
  assert.equal(body.canExecute, false);
  assert.equal(body.canCommit, false);
  assert.deepEqual(body.guard, { state: "UNKNOWN", source: "NONE" });
  return body;
}

(async () => {
  const results = [];
  let validPreviews = 0;
  let rejectedGeometryPreviews = 0;
  for (const account of accounts) {
    const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candles.accountId, account);
    assert.equal(candles.source, "MT5_VERIFIED");
    assert.equal(candles.timeframe, "M15");
    assert.equal(candles.canExecute, false);
    assert.match(candles.symbol, /^XAUUSD(?:\.p|\.pi)?$/i);

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
    assert.equal(quote.account, account);
    assert.equal(quote.symbol, symbol);
    assert.equal(quote.source, "MT5_VERIFIED");
    assert.equal(quote.freshness, "FRESH");
    assert.equal(info.account, account);
    assert.equal(info.symbol, symbol);
    assert.equal(info.source, "MT5_VERIFIED");

    const digits = Number(info.digits);
    const point = Number(info.point);
    const tick = Number(info.tickSize);
    const minGap = Math.max((Number(info.stopsLevel) + Number(info.freezeLevel) + 3) * point, 1);
    assert.ok(Number.isInteger(digits) && digits >= 0 && digits <= 10);
    assert.ok(Number.isFinite(minGap) && minGap > 0);
    const checked = [];
    const testedPositions = book.positions.slice(0, 4);
    for (const position of testedPositions) {
      assert.equal(position.account, account);
      assert.equal(position.symbol, symbol);
      assert.match(position.ticket, /^[1-9][0-9]{0,19}$/);
      assert.match(position.revision, /^[0-9a-f]{64}$/);
      assert.notEqual(position.sl, null, `${account}/${position.ticket}: changed-SL acceptance requires an existing SL`);

      const reference = Number(position.side === "BUY" ? quote.bid : quote.ask);
      const moved = position.side === "BUY"
        ? floorToTick(reference - minGap, tick)
        : ceilToTick(reference + minGap, tick);
      const candidatePrice = priceText(moved, digits);
      assert.notEqual(candidatePrice, String(position.sl), `${account}/${position.ticket}: candidate did not change SL`);

      const valid = await preview(account, symbol, position, { slPrice: candidatePrice });
      assert.equal(valid.valid, true, `${account}/${position.ticket}: valid moved SL rejected: ${valid.geometry.reasons}`);
      assert.equal(valid.geometry.state, "VALID");
      assert.equal(valid.brokerPreview.slPrice, candidatePrice);
      assert.equal(valid.pnlAtSl?.currency, position.currency);
      validPreviews += 1;

      const wrongSide = position.side === "BUY"
        ? ceilToTick(Number(quote.ask) + minGap, tick)
        : floorToTick(Number(quote.bid) - minGap, tick);
      const invalid = await preview(account, symbol, position, { slPrice: priceText(wrongSide, digits) });
      assert.equal(invalid.valid, false, `${account}/${position.ticket}: wrong-side SL was accepted`);
      assert.ok(invalid.geometry.reasons.includes("SL_WRONG_SIDE"), `${account}/${position.ticket}: missing wrong-side reason`);
      assert.equal(invalid.geometry.state, "INVALID");
      rejectedGeometryPreviews += 1;

      checked.push({
        ticket: position.ticket,
        side: position.side,
        priorSL: String(position.sl),
        hypotheticalSL: candidatePrice,
        changedPreview: valid.geometry.state,
        wrongSidePreview: invalid.geometry.reasons,
      });
    }
    const readback = await get(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`);
    assert.equal(readback.account, account);
    assert.equal(readback.symbol, symbol);
    assert.equal(readback.source, "MT5_VERIFIED");
    for (const prior of testedPositions) {
      const current = readback.positions.find(position => position.ticket === prior.ticket);
      assert.ok(current, `${account}/${prior.ticket}: position disappeared during preview-only acceptance`);
      assert.equal(current.revision, prior.revision, `${account}/${prior.ticket}: position revision changed`);
      assert.equal(current.sl, prior.sl, `${account}/${prior.ticket}: broker SL changed`);
      assert.equal(current.tp, prior.tp, `${account}/${prior.ticket}: broker TP changed`);
    }
    results.push({ account, symbol, timeframe: candles.timeframe, quoteFreshness: quote.freshness, readbackStable: true, positions: checked });
  }

  assert.ok(validPreviews > 0, "No existing demo SL could be tested with a changed candidate");
  console.log(JSON.stringify({
    results,
    validChangedStopPreviews: validPreviews,
    rejectedWrongSidePreviews: rejectedGeometryPreviews,
    positionMutations: 0,
    ordersSent: 0,
    protectedAccountQueried: false,
    commitRouteCalled: false,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
