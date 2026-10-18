"use strict";

const assert = require("node:assert/strict");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze([
  "titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15",
]);

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

(async () => {
  const results = [];
  for (const account of accounts) {
    const candles = await get(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candles.accountId, account, `${account}: candle account mismatch`);
    assert.equal(candles.source, "MT5_VERIFIED", `${account}: candle source is not verified MT5`);
    assert.equal(candles.canExecute, false, `${account}: candles unexpectedly executable`);
    assert.equal(candles.timeframe, "M15", `${account}: unexpected timeframe`);
    assert.match(candles.symbol, /^XAUUSD(?:\.p|\.pi)?$/i, `${account}: unexpected chart symbol`);
    assert.ok(Array.isArray(candles.candles) && candles.candles.length > 0, `${account}: no verified candles`);

    const symbol = candles.symbol;
    const quote = await get(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`);
    assert.equal(quote.account, account, `${account}: quote account mismatch`);
    assert.equal(quote.symbol, symbol, `${account}: quote symbol mismatch`);
    assert.equal(quote.source, "MT5_VERIFIED", `${account}: quote source is not verified MT5`);
    assert.equal(quote.canExecute, false, `${account}: quote unexpectedly executable`);
    assert.ok(Number.isFinite(Number(quote.bid)) && Number.isFinite(Number(quote.ask)) && Number(quote.ask) >= Number(quote.bid), `${account}: invalid bid/ask`);

    const portfolio = await get(`/api/chart/v1/portfolio?account=${encodeURIComponent(account)}&scenarioSymbol=${encodeURIComponent(symbol)}`);
    assert.equal(portfolio.account, account, `${account}: portfolio account mismatch`);
    assert.equal(portfolio.source, "MT5_VERIFIED", `${account}: portfolio source is not verified MT5`);
    assert.equal(portfolio.canExecute, false, `${account}: portfolio unexpectedly executable`);
    assert.equal(portfolio.correlation?.scenarioSymbol, symbol, `${account}: correlation scenario symbol mismatch`);
    assert.ok(["AVAILABLE", "UNAVAILABLE"].includes(portfolio.stopRisk?.state), `${account}: missing explicit stop-risk state`);
    assert.ok(["AVAILABLE", "UNAVAILABLE"].includes(portfolio.correlation?.state), `${account}: missing explicit correlation state`);

    const scenarios = [
      { side: "BUY", entryPrice: Number(quote.ask), slPrice: Number(quote.ask) - 2, tpPrice: Number(quote.ask) + 4 },
      { side: "SELL", entryPrice: Number(quote.bid), slPrice: Number(quote.bid) + 2, tpPrice: Number(quote.bid) - 4 },
    ];
    const previews = [];
    for (const geometry of scenarios) {
      const response = await fetch(`${base}/api/chart/v1/scenarios/preview?account=${encodeURIComponent(account)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, symbol, volumeLots: 0.01, feesPerLot: 0, slippageTicks: 0, ...geometry }),
        signal: AbortSignal.timeout(15000),
      });
      const preview = await response.json();
      assert.equal(response.ok, true, `${account} ${geometry.side}: broker calculation preview HTTP ${response.status}`);
      assert.equal(preview.account, account, `${account} ${geometry.side}: preview account mismatch`);
      assert.equal(preview.symbol, symbol, `${account} ${geometry.side}: preview symbol mismatch`);
      assert.equal(preview.side, geometry.side, `${account}: preview side mismatch`);
      assert.equal(preview.mode, "READ_ONLY_DRAFT", `${account} ${geometry.side}: preview is not a read-only draft`);
      assert.equal(preview.canExecute, false, `${account} ${geometry.side}: preview must remain non-executable`);
      assert.ok(Number.isFinite(Number(preview.positionSizing?.volumeLots)) && Number(preview.positionSizing.volumeLots) > 0, `${account} ${geometry.side}: broker sizing missing`);
      assert.ok(Number.isFinite(Number(preview.margin?.amount)) && Number(preview.margin.amount) > 0, `${account} ${geometry.side}: broker margin calculation missing`);
      assert.ok(Number(preview.pnlAtSl?.amount) < 0 && Number(preview.pnlAtTp?.amount) > 0, `${account} ${geometry.side}: broker SL/TP profit signs invalid`);
      previews.push({
        side: preview.side,
        canExecute: preview.canExecute,
        mode: preview.mode,
        brokerSizedLots: preview.positionSizing.volumeLots,
        marginCurrency: preview.margin.currency,
        guard: preview.dailyDrawdownProjection?.eaGuard?.state || "UNKNOWN",
      });
    }

    results.push({
      account,
      symbol,
      timeframe: candles.timeframe,
      verifiedBars: candles.candles.length,
      quoteFreshness: quote.freshness,
      positionCount: portfolio.positionCount,
      stopRisk: portfolio.stopRisk.state,
      correlation: portfolio.correlation.state,
      scenarios: previews,
    });
  }

  assert.deepEqual(results.map(item => item.account), accounts);
  console.log(JSON.stringify({ results, brokerWrites: 0, protectedAccountQueried: false }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
