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

(async () => {
  const results = [];
  let previews = 0;
  let staleSafePreviews = 0;
  for (const account of accounts) {
    const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candles.accountId, account, `${account}: candle scope mismatch`);
    assert.equal(candles.source, "MT5_VERIFIED", `${account}: unverified candle source`);
    assert.equal(candles.canExecute, false, `${account}: executable candle response`);
    assert.equal(candles.timeframe, "M15", `${account}: unexpected timeframe`);
    assert.match(candles.symbol, /^XAUUSD(?:\.p|\.pi)?$/i, `${account}: unexpected broker symbol`);

    const symbol = candles.symbol;
    const book = await get(`/api/chart/v1/positions?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`);
    assert.equal(book.account, account, `${account}: position account mismatch`);
    assert.equal(book.symbol, symbol, `${account}: position symbol mismatch`);
    assert.equal(book.source, "MT5_VERIFIED", `${account}: unverified position source`);
    assert.equal(book.canExecute, false, `${account}: executable position response`);
    assert.ok(Array.isArray(book.positions), `${account}: position list missing`);

    const tested = [];
    for (const position of book.positions.slice(0, 4)) {
      assert.equal(position.symbol, symbol, `${account}: position symbol mismatch`);
      assert.equal(position.account, account, `${account}: position account mismatch`);
      assert.match(position.revision, /^[0-9a-f]{64}$/, `${account}: position revision missing`);
      assert.match(position.ticket, /^[1-9][0-9]{0,19}$/, `${account}: ticket invalid`);
      const candidate = {};
      if (position.sl !== null) candidate.slPrice = String(position.sl);
      else if (position.tp !== null) candidate.tpPrice = String(position.tp);
      else continue;

      const payload = {
        schemaVersion: 1,
        account,
        symbol,
        positionTicket: position.ticket,
        expectedRevision: position.revision,
        candidate,
        clientRequestId: randomUUID(),
      };
      const response = await fetch(`${base}/api/chart/v1/position/preview-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const preview = await response.json();
      if (response.status === 503) {
        assert.equal(preview.detail?.code, "QUOTE_NOT_FRESH", `${account}: unexpected preview rejection`);
        assert.equal(preview.detail?.canExecute, false, `${account}: stale quote must not be executable`);
        assert.equal(preview.detail?.canCommit, false, `${account}: stale quote must not be committable`);
        assert.deepEqual(preview.detail?.guard, { state: "UNKNOWN", source: "NONE" }, `${account}: stale quote must remain UNKNOWN`);
        staleSafePreviews += 1;
        tested.push({ side: position.side, protectiveStop: position.sl !== null ? "SL" : "TP", result: "QUOTE_NOT_FRESH_FAIL_CLOSED" });
        continue;
      }
      assert.equal(response.status, 200, `${account}: stop preview HTTP ${response.status}`);
      assert.equal(preview.account, account, `${account}: preview account mismatch`);
      assert.equal(preview.symbol, symbol, `${account}: preview symbol mismatch`);
      assert.equal(preview.positionTicket, position.ticket, `${account}: preview ticket mismatch`);
      assert.equal(preview.positionRevision, position.revision, `${account}: preview revision mismatch`);
      assert.equal(preview.canExecute, false, `${account}: preview must not be executable`);
      assert.equal(preview.canCommit, false, `${account}: preview must not be committable`);
      assert.deepEqual(preview.guard, { state: "UNKNOWN", source: "NONE" }, `${account}: guard must remain unknown`);
      assert.equal(preview.geometry.state, "VALID", `${account}: unchanged broker stop did not validate`);
      if (position.sl !== null) assert.equal(preview.brokerPreview.slPrice, String(position.sl));
      if (position.tp !== null) assert.equal(preview.brokerPreview.tpPrice, String(position.tp));
      assert.ok(preview.pnlAtSl === null || preview.pnlAtSl?.currency === position.currency, `${account}: SL PnL currency mismatch`);
      tested.push({ side: position.side, protectiveStop: position.sl !== null ? "SL" : "TP", currency: position.currency });
      previews += 1;
    }
    results.push({ account, symbol, timeframe: candles.timeframe, openPositions: book.positions.length, unchangedStopPreviews: tested });
  }

  assert.ok(previews + staleSafePreviews > 0, "No demo position had a protective level to preview");
  console.log(JSON.stringify({ results, previews, staleSafePreviews, positionMutations: 0, ordersSent: 0, protectedAccountQueried: false }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
