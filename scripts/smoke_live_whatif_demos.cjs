"use strict";

const assert = require("node:assert/strict");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowedAccounts = Object.freeze([
  "titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15",
]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowedAccounts];
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only approved non-Blueberry demo aliases");

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
      const stress = preview.portfolioStress;
      assert.equal(stress?.source, "HISTORICAL_ALIGNED_H1_SHOCKS", `${account} ${geometry.side}: historical portfolio stress source missing`);
      assert.equal(stress.account, account, `${account} ${geometry.side}: portfolio stress account mismatch`);
      assert.equal(stress.scenarioSymbol, symbol, `${account} ${geometry.side}: portfolio stress symbol mismatch`);
      assert.equal(stress.canExecute, false, `${account} ${geometry.side}: portfolio stress must remain read-only`);
      assert.ok(["AVAILABLE", "UNAVAILABLE"].includes(stress.state), `${account} ${geometry.side}: portfolio stress has no explicit state`);
      if (stress.state === "AVAILABLE") {
        const parseUtc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
        const start = parseUtc(stress.sampleStartUtc);
        const end = parseUtc(stress.sampleEndUtc);
        const asOf = parseUtc(stress.asOfUtc);
        assert.equal(stress.currency, preview.pnlAtSl.currency, `${account} ${geometry.side}: stress currency differs from broker preview`);
        assert.ok(Number.isInteger(stress.sampleCount) && stress.sampleCount >= 60 && stress.sampleCount <= 256, `${account} ${geometry.side}: invalid aligned-shock sample count`);
        assert.ok(start !== null && end !== null && asOf !== null && start <= end && end <= asOf, `${account} ${geometry.side}: invalid historical stress time scope`);
        assert.ok([stress.pnl?.p05, stress.pnl?.p50, stress.pnl?.p95].every(Number.isFinite) && stress.pnl.p05 <= stress.pnl.p50 && stress.pnl.p50 <= stress.pnl.p95, `${account} ${geometry.side}: invalid portfolio P/L quantiles`);
        assert.ok([stress.loss?.p50, stress.loss?.p95, stress.loss?.worst].every(Number.isFinite) && stress.loss.p50 >= 0 && stress.loss.p50 <= stress.loss.p95 && stress.loss.p95 <= stress.loss.worst, `${account} ${geometry.side}: invalid portfolio loss quantiles`);
        assert.ok(Array.isArray(stress.portfolioSymbols) && stress.portfolioSymbols.length <= 12 && stress.portfolioSymbols.every(item => typeof item === "string"), `${account} ${geometry.side}: invalid portfolio symbol scope`);
      } else {
        assert.match(stress.reason || "", /^[A-Z][A-Z0-9_]{0,63}$/, `${account} ${geometry.side}: unavailable stress reason missing`);
      }
      previews.push({
        side: preview.side,
        canExecute: preview.canExecute,
        mode: preview.mode,
        brokerSizedLots: preview.positionSizing.volumeLots,
        marginCurrency: preview.margin.currency,
        portfolioStress: stress.state,
        stressSamples: stress.sampleCount || 0,
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
