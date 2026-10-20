"use strict";

const assert = require("node:assert/strict");

const base = new URL(process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056");
assert.equal(base.protocol, "http:", "footprint acceptance is restricted to local HTTP");
assert.equal(base.hostname, "127.0.0.1", "footprint acceptance must use the local main runtime");
assert.ok([8050, 8056].includes(Number(base.port)), "unexpected dashboard port");
assert.ok(base.pathname === "/" || base.pathname === "", "unexpected dashboard path");

const symbols = Object.freeze({
  titan: "XAUUSD",
  xau5m_m5: "XAUUSD.p",
  titan_m5: "XAUUSD.p",
  xau5m_500: "XAUUSD.p",
  goldm15: "XAUUSD",
});
const allowed = Object.freeze(Object.keys(symbols));
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowed];
assert.ok(accounts.length > 0 && accounts.every(account => allowed.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only the five authorized non-Blueberry demo aliases");

async function readFootprint(account) {
  const symbol = symbols[account];
  const url = new URL("/api/chart/v1/footprint", base);
  url.searchParams.set("account", account);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("timeframe", "M15");
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  assert.equal(data.account, account, `${account}: response account mismatch`);
  assert.equal(data.symbol, symbol, `${account}: response symbol mismatch`);
  assert.equal(data.timeframe, "M15", `${account}: response timeframe mismatch`);
  assert.equal(data.source, "MT5_VERIFIED", `${account}: footprint is not sourced from verified MT5 data`);
  assert.equal(data.canExecute, false, `${account}: read-only footprint must never be executable`);

  if (data.status === "AVAILABLE") {
    assert.ok(Number.isSafeInteger(data.executionCount) && data.executionCount > 0,
      `${account}: AVAILABLE requires verified executions`);
    assert.ok(Array.isArray(data.levels) && data.levels.length > 0,
      `${account}: AVAILABLE requires aggregated levels`);
    for (const level of data.levels) {
      assert.match(level.price, /^\d+(?:\.\d+)?$/, `${account}: malformed price`);
      assert.match(level.buyVolume, /^\d+(?:\.\d+)?$/, `${account}: malformed buy volume`);
      assert.match(level.sellVolume, /^\d+(?:\.\d+)?$/, `${account}: malformed sell volume`);
      assert.ok(Number.isSafeInteger(level.trades) && level.trades > 0,
        `${account}: malformed execution count`);
    }
  } else {
    assert.equal(data.status, "UNAVAILABLE", `${account}: unknown footprint status`);
    assert.match(data.reason, /^[A-Z0-9_]+$/, `${account}: unavailable reason must be explicit`);
    assert.deepEqual(data.levels, [], `${account}: unavailable data must not expose proxy levels`);
    assert.equal(data.executionCount, 0, `${account}: unavailable data cannot claim executions`);
  }

  return {
    account,
    symbol,
    status: data.status,
    reason: data.status === "UNAVAILABLE" ? data.reason : null,
    executionCount: data.executionCount,
    tickCount: data.tickCount,
    barOpenUtc: data.barOpenUtc,
    method: "GET",
  };
}

(async () => {
  const results = [];
  for (const account of accounts) results.push(await readFootprint(account));
  assert.equal(results.length, accounts.length);
  console.log(JSON.stringify({
    accounts,
    results,
    reads: results.length,
    mutations: 0,
    blueberryQueried: false,
    rawTicksPrinted: false,
  }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
