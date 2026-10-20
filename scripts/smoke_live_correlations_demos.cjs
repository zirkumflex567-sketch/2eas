"use strict";

const assert = require("node:assert/strict");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowed = Object.freeze([
  { account: "titan", gold: "XAUUSD" },
  { account: "xau5m_m5", gold: "XAUUSD.p" },
  { account: "titan_m5", gold: "XAUUSD.p" },
  { account: "xau5m_500", gold: "XAUUSD.p" },
  { account: "goldm15", gold: "XAUUSD" },
]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : allowed.map(item => item.account);
assert.ok(accounts.length > 0 && accounts.every(account => allowed.some(item => item.account === account)),
  "CHART_STUDIO_ACCOUNTS must contain only the five authorized non-Blueberry demo aliases");

async function get(path, account) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${account}: GET ${path} returned HTTP ${response.status}`);
  return body;
}

async function main() {
  const results = [];
  let reads = 0;
  for (const account of accounts) {
    const expected = allowed.find(item => item.account === account);
    const suffix = expected.gold.endsWith(".p") ? ".p" : "";
    const desiredFxSymbol = `EURUSD${suffix}`;
    const catalog = await get(`/api/chart/v1/symbols?account=${encodeURIComponent(account)}&q=EURUSD&limit=20`, account);
    reads += 1;
    assert.equal(catalog.account, account);
    assert.equal(catalog.source, "MT5_VERIFIED");
    assert.equal(catalog.canExecute, false);
    assert.ok(Array.isArray(catalog.symbols));
    const fx = catalog.symbols.find(row => row.symbol === desiredFxSymbol);
    assert.ok(fx, `${account}: expected non-Gold symbol ${desiredFxSymbol} is not in its verified catalog`);

    const portfolio = await get(`/api/chart/v1/portfolio?account=${encodeURIComponent(account)}&scenarioSymbol=${encodeURIComponent(fx.symbol)}`, account);
    reads += 1;
    assert.equal(portfolio.account, account);
    assert.equal(portfolio.source, "MT5_VERIFIED");
    assert.equal(portfolio.canExecute, false);
    assert.ok(Number.isSafeInteger(portfolio.positionCount) && portfolio.positionCount >= 0);
    const correlation = portfolio.correlation;
    assert.equal(correlation.scenarioSymbol, fx.symbol);
    assert.ok(Array.isArray(correlation.symbols) && correlation.symbols.includes(fx.symbol));

    let pairCount = 0;
    let maxObservations = 0;
    if (correlation.state === "AVAILABLE") {
      assert.equal(correlation.timeframe, "H1");
      assert.equal(correlation.source, "MT5_COMPLETED_BARS");
      assert.ok(Array.isArray(correlation.pairs) && correlation.pairs.length > 0);
      for (const pair of correlation.pairs) {
        assert.ok(Array.isArray(pair.symbols) && pair.symbols.length === 2);
        assert.ok(pair.symbols.includes(fx.symbol));
        assert.ok(Number.isFinite(Number(pair.coefficient)) && Math.abs(Number(pair.coefficient)) <= 1);
        assert.ok(Number.isSafeInteger(pair.observations) && pair.observations >= 60);
        pairCount += 1;
        maxObservations = Math.max(maxObservations, pair.observations);
      }
    } else {
      assert.equal(correlation.state, "UNAVAILABLE");
      assert.equal(correlation.reason, "NO_SYMBOL_PAIRS",
        `${account}: correlation failure must remain explicit, got ${correlation.reason}`);
      assert.equal(portfolio.positionCount, 0, `${account}: positions exist but correlation returned no symbol pair`);
    }
    results.push({ account, fxSymbol: fx.symbol, positionCount: portfolio.positionCount,
      correlationState: correlation.state, reason: correlation.reason || null,
      pairCount, maxObservations });
  }

  assert.ok(results.some(row => row.correlationState === "AVAILABLE"),
    "At least one live demo with open Gold positions must prove aligned completed-H1 correlations");
  assert.equal(results.some(row => row.account === "blueberry"), false);
  console.log(JSON.stringify({ results, apiReads: reads, methods: ["GET"], brokerWrites: 0,
    blueberryQueried: false, fabricatedCorrelationValues: false }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
