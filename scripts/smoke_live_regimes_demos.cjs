"use strict";

const assert = require("node:assert/strict");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowedAccounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const timeframes = Object.freeze(["M5", "M15", "H1", "H4", "D1"]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowedAccounts];
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only approved non-Blueberry demo aliases");

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

(async () => {
  const results = [];
  for (const account of accounts) {
    const candles = await get(`/api/candles?account=${encodeURIComponent(account)}&tf=M15&count=1`);
    assert.equal(candles.accountId, account, `${account}: symbol bootstrap scope mismatch`);
    assert.equal(candles.source, "MT5_VERIFIED", `${account}: symbol bootstrap is not verified MT5 data`);
    assert.equal(candles.canExecute, false, `${account}: symbol bootstrap unexpectedly executable`);

    for (const timeframe of timeframes) {
      const snapshot = await get(`/api/chart/v1/regimes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(candles.symbol)}&timeframe=${timeframe}`);
      assert.equal(snapshot.account, account, `${account}/${timeframe}: account scope mismatch`);
      assert.equal(snapshot.source, "MT5_VERIFIED", `${account}/${timeframe}: source is not verified MT5`);
      assert.equal(snapshot.canExecute, false, `${account}/${timeframe}: snapshot unexpectedly executable`);
      assert.equal(snapshot.frame?.symbol, candles.symbol, `${account}/${timeframe}: symbol scope mismatch`);
      assert.equal(snapshot.frame?.timeframe, timeframe, `${account}: timeframe scope mismatch`);
      assert.equal(snapshot.revision, "market-regime-v1", `${account}/${timeframe}: unexpected model revision`);
      assert.ok(Number.isInteger(snapshot.barCount) && snapshot.barCount > 0 && snapshot.barCount <= 500,
        `${account}/${timeframe}: invalid closed-bar count`);
      assert.ok(Number.isFinite(Date.parse(snapshot.asOfUtc)), `${account}/${timeframe}: invalid UTC cutoff`);
      assert.ok(Number.isFinite(Date.parse(snapshot.sourceTimeUtc)) &&
        Date.parse(snapshot.sourceTimeUtc) <= Date.parse(snapshot.asOfUtc),
      `${account}/${timeframe}: source bar is missing or after the snapshot cutoff`);
      assert.ok(Array.isArray(snapshot.qualityFlags), `${account}/${timeframe}: missing data-quality flags`);

      results.push({
        account,
        symbol: snapshot.frame.symbol,
        timeframe,
        model: snapshot.revision,
        barCount: snapshot.barCount,
        asOfUtc: snapshot.asOfUtc,
        sourceTimeUtc: snapshot.sourceTimeUtc,
        trend: snapshot.regimeTags?.trend,
        volatility: snapshot.regimeTags?.volatility,
        structure20: snapshot.features?.structure20,
        qualityFlags: snapshot.qualityFlags,
        canExecute: snapshot.canExecute,
      });
    }
  }

  console.log(JSON.stringify({
    results,
    getRequests: accounts.length * (timeframes.length + 1),
    mutations: 0,
    blueberryQueried: false,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
