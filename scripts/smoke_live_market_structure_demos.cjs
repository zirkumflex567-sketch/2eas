"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowedAccounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowedAccounts];
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only approved non-Blueberry demo aliases");

const window = {};
vm.runInNewContext(fs.readFileSync("static/chart-studio-market-structure.js", "utf8"), {
  window, Date, Intl, Number, Math, Set, Map, JSON, Object, Array, String, RegExp,
});
const core = window.ChartStudioMarketStructure.core;

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}`);
  return body;
}

function epoch(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric / 1000 : numeric;
  return Date.parse(value) / 1000;
}

(async () => {
  const results = [];
  for (const account of accounts) {
    const candles = await get(`/api/candles?account=${encodeURIComponent(account)}&tf=M15&count=1000`);
    assert.equal(candles.accountId, account, `${account}: candle scope mismatch`);
    assert.equal(candles.source, "MT5_VERIFIED", `${account}: candles are not verified MT5 data`);
    assert.equal(candles.canExecute, false, `${account}: candles unexpectedly executable`);
    assert.equal(candles.timeframe, "M15", `${account}: unexpected timeframe`);
    assert.match(candles.symbol, /^XAUUSD(?:\.p|\.pi)?$/i, `${account}: unexpected symbol`);
    assert.ok(Array.isArray(candles.candles) && candles.candles.length > 0, `${account}: no candles`);

    const quote = await get(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(candles.symbol)}`);
    assert.equal(quote.account, account, `${account}: quote scope mismatch`);
    assert.equal(quote.symbol, candles.symbol, `${account}: quote symbol mismatch`);
    assert.equal(quote.source, "MT5_VERIFIED", `${account}: quote is not verified MT5 data`);
    assert.equal(quote.canExecute, false, `${account}: quote unexpectedly executable`);
    const asOfUtc = epoch(quote.quoteTimeUtcMs ?? quote.quoteTimeUtc);
    assert.ok(Number.isFinite(asOfUtc), `${account}: invalid verified quote time`);

    const model = core.analyze(candles.candles, {
      asOfUtc,
      timeframeSeconds: 900,
      sessions: core.PRESETS,
      openingRangeMinutes: 60,
      volumeZones: true,
      swingStrength: 3,
      atrPeriod: 14,
      equalAtrMultiplier: 0.15,
      tickSize: 0.01,
    });
    assert.ok(model.bars > 0, `${account}: no closed bars at verified quote cutoff`);
    assert.ok(model.sessions.length > 0, `${account}: session windows missing`);
    assert.ok(model.sessions.every(session => ["COMPLETE", "PARTIAL", "OPEN", "UNKNOWN"].includes(session.coverage)),
      `${account}: invalid session coverage state`);
    assert.ok(model.sweeps.every(sweep => sweep.evidenceType === "STRUCTURE_LIQUIDITY_HYPOTHESIS"),
      `${account}: sweep classification must remain a hypothesis`);

    results.push({
      account,
      symbol: candles.symbol,
      timeframe: candles.timeframe,
      quoteFreshness: quote.freshness,
      quoteAgeSeconds: quote.ageSeconds,
      verifiedSourceBars: candles.candles.length,
      closedBars: model.bars,
      sessionWindows: model.sessions.length,
      sessionCoverage: model.sessions.reduce((counts, session) => {
        counts[session.coverage] = (counts[session.coverage] || 0) + 1;
        return counts;
      }, {}),
      previousDayCoverage: model.previous?.previousDay?.coverage || "UNKNOWN",
      previousWeekCoverage: model.previous?.previousWeek?.coverage || "UNKNOWN",
      pivots: model.pivots.length,
      equalLevels: model.equalLevels.length,
      liquidityHypotheses: model.sweeps.length,
      volumeZones: model.volumeZones.status,
      volumeSource: model.volumeZones.source,
      canExecute: false,
    });
  }

  assert.deepEqual(results.map(item => item.account), accounts);
  console.log(JSON.stringify({ results, getRequests: accounts.length * 2, mutations: 0, blueberryQueried: false }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
