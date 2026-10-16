"use strict";

const assert = require("node:assert/strict");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500"]);

async function requestJson(path, options) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(20000), cache: "no-store", ...options });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function alignToTick(value, tick, digits, direction) {
  const scale = 1e8;
  const units = Math.round(Number(value) * scale);
  const tickUnits = Math.round(Number(tick) * scale);
  assert.ok(Number.isSafeInteger(units) && Number.isSafeInteger(tickUnits) && tickUnits > 0, "invalid price grid");
  const steps = direction === "UP" ? Math.ceil(units / tickUnits) : Math.floor(units / tickUnits);
  return Number((steps * tickUnits / scale).toFixed(digits));
}

async function preview(account, request) {
  return requestJson(`/api/chart/v1/scenarios/preview?account=${encodeURIComponent(account)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, feesPerLot: 0, slippageTicks: 0, ...request }),
  });
}

function verifySizing(account, response, expectedMode, currency, budget, percent, symbolInfo) {
  assert.equal(response.account, account);
  assert.equal(response.symbol, symbolInfo.symbol);
  assert.equal(response.serverVerified, true);
  assert.equal(response.canExecute, false);
  assert.equal(response.positionSizing.mode, expectedMode);
  assert.equal(response.positionSizing.currency, currency);
  assert.equal(response.margin.currency, currency);
  assert.ok(Number.isFinite(Number(response.margin.amount)) && Number(response.margin.amount) >= 0);
  assert.equal(response.netEstimate.pnlAtSl.currency, currency);
  assert.equal(response.netEstimate.pnlAtTp.currency, currency);
  assert.ok(Number(response.netEstimate.pnlAtSl.amount) < 0, `${account}: stop PnL must be a loss`);
  assert.ok(Number(response.netEstimate.pnlAtTp.amount) > 0, `${account}: target PnL must be a gain`);

  const sizing = response.positionSizing;
  const lots = Number(sizing.volumeLots);
  const min = Number(symbolInfo.volumeMin);
  const max = Number(symbolInfo.volumeMax);
  const step = Number(symbolInfo.volumeStep);
  const effectiveBudget = percent === null
    ? Number(budget)
    : Number(sizing.equityBasis) * Number(sizing.riskPercent) / 100;
  assert.ok(Number.isFinite(lots) && lots >= min - 1e-10 && lots <= max + 1e-10, `${account}: lots outside broker limits`);
  assert.ok(Math.abs(lots / step - Math.round(lots / step)) < 1e-7, `${account}: volume is off broker step`);
  assert.ok(Number(sizing.estimatedTotalStopRisk) <= effectiveBudget + 0.02, `${account}: calculated risk exceeded budget`);
  assert.ok(Number(sizing.unusedRiskBudget) >= -0.02, `${account}: negative unused risk budget`);
  if (percent !== null) {
    assert.equal(Number(sizing.riskPercent), percent);
    assert.ok(Number.isFinite(Number(sizing.equityBasis)) && Number(sizing.equityBasis) > 0,
      `${account}: the equity snapshot used by this preview must be reported`);
    assert.ok(Math.abs(Number(sizing.riskBudget) - Number(sizing.equityBasis) * Number(sizing.riskPercent) / 100) < 1e-7,
      `${account}: risk budget must derive from the equity basis returned with this preview`);
  } else {
    assert.equal(Number(sizing.riskBudget).toFixed(2), Number(budget).toFixed(2));
    assert.equal(sizing.riskPercent, null);
  }
  return { mode: sizing.mode, lots, riskBudget: sizing.riskBudget, estimatedRisk: sizing.estimatedTotalStopRisk, margin: response.margin.amount };
}

(async () => {
  const results = [];
  let previewRequests = 0;
  for (const account of accounts) {
    const candles = await requestJson(`/api/candles?account=${encodeURIComponent(account)}`);
    assert.equal(candles.accountId, account);
    assert.equal(candles.source, "MT5_VERIFIED");
    assert.equal(candles.timeframe, "M15");
    assert.equal(candles.canExecute, false);
    assert.match(candles.symbol, /^XAUUSD(?:\.p|\.pi)?$/i);
    const symbol = candles.symbol;

    const [quote, info, portfolio] = await Promise.all([
      requestJson(`/api/chart/v1/quotes?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      requestJson(`/api/chart/v1/symbol-info?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}`),
      requestJson(`/api/chart/v1/portfolio?account=${encodeURIComponent(account)}&scenarioSymbol=${encodeURIComponent(symbol)}`),
    ]);
    for (const item of [quote, info, portfolio]) {
      assert.equal(item.account, account);
      assert.equal(item.source, "MT5_VERIFIED");
      assert.equal(item.canExecute, false);
    }
    assert.equal(quote.symbol, symbol);
    assert.equal(info.symbol, symbol);
    assert.equal(quote.freshness, "FRESH");
    assert.equal(portfolio.margin?.currency, "USD");
    const equity = Number(portfolio.margin?.equity);
    assert.ok(Number.isFinite(equity) && equity > 0, `${account}: verified equity unavailable`);
    const digits = Number(info.digits);
    const tick = Number(info.tickSize);
    const point = Number(info.point);
    const gap = alignToTick(Math.max(0.5, (Number(info.stopsLevel) + Number(info.freezeLevel) + 3) * point), tick, digits, "UP");
    assert.ok(gap > 0);

    const sides = [];
    for (const side of ["BUY", "SELL"]) {
      const entry = alignToTick(side === "BUY" ? quote.ask : quote.bid, tick, digits, "UP");
      const sl = alignToTick(side === "BUY" ? entry - gap : entry + gap, tick, digits, side === "BUY" ? "DOWN" : "UP");
      const tp = alignToTick(side === "BUY" ? entry + 2 * gap : entry - 2 * gap, tick, digits, side === "BUY" ? "UP" : "DOWN");
      const geometry = { symbol, side, entryPrice: entry, slPrice: sl, tpPrice: tp };

      const minimumLot = await preview(account, { ...geometry, volumeLots: Number(info.volumeMin) });
      previewRequests += 1;
      assert.equal(minimumLot.positionSizing.mode, "FIXED_LOTS");
      assert.equal(minimumLot.canExecute, false);
      assert.equal(minimumLot.serverVerified, true);
      const minRisk = Math.abs(Number(minimumLot.netEstimate.pnlAtSl.amount));
      assert.ok(Number.isFinite(minRisk) && minRisk > 0, `${account}/${side}: minimum-lot risk unavailable`);

      const riskBudget = Math.max(1, Number((minRisk * 3).toFixed(2)));
      const budgetResult = await preview(account, { ...geometry, riskBudget });
      previewRequests += 1;
      const budgetSizing = verifySizing(account, budgetResult, "RISK_BUDGET", "USD", riskBudget, null, info);

      const riskPercent = Math.min(1, Number((100 * minRisk * 1.5 / equity).toFixed(4)));
      assert.ok(riskPercent > 0 && riskPercent <= 1);
      const expectedPercentBudget = equity * riskPercent / 100;
      const percentResult = await preview(account, { ...geometry, riskPercent });
      previewRequests += 1;
      const percentSizing = verifySizing(account, percentResult, "EQUITY_PERCENT", "USD", expectedPercentBudget, riskPercent, info);
      sides.push({ side, minimumLotRisk: minRisk, riskBudget: budgetSizing, equityPercent: percentSizing });
    }
    results.push({ account, symbol, quoteFreshness: quote.freshness, equity, currency: portfolio.margin.currency, sides });
  }

  assert.equal(previewRequests, accounts.length * 2 * 3);
  console.log(JSON.stringify({ results, brokerCalculationPreviews: previewRequests, ordersSent: 0, positionMutations: 0, protectedAccountQueried: false }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
