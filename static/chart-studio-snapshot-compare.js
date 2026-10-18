(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChartStudioSnapshotCompare = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

  function fail(code) { throw new Error(code); }

  function parseTime(value) {
    if (typeof value !== "string" || !TIMESTAMP.test(value)) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }

  function validBars(record) {
    const market = record?.payload?.marketData;
    if (market?.source !== "MT5_COMPLETED_BARS" || !Array.isArray(market.bars) ||
        market.bars.length < 1 || market.bars.length > 150) return false;
    const asOf = parseTime(record.payload.asOfUtc);
    if (asOf === null) return false;
    let previous = -Infinity;
    for (const bar of market.bars) {
      if (!bar || typeof bar !== "object") return false;
      const time = parseTime(bar.timeUtc);
      const values = [bar.open, bar.high, bar.low, bar.close];
      if (time === null || time <= previous || time > asOf ||
          !values.every(value => typeof value === "string" && DECIMAL.test(value) && Number.isFinite(Number(value)))) return false;
      const [open, high, low, close] = values.map(Number);
      if (low > high || open < low || open > high || close < low || close > high) return false;
      previous = time;
    }
    return true;
  }

  function selectSnapshotComparison(records, activeAccount) {
    if (!Array.isArray(records) || records.length !== 2) fail("TWO_SNAPSHOTS_REQUIRED");
    const [first, second] = records;
    if (!first || !second || first.id === second.id) fail("DISTINCT_SNAPSHOTS_REQUIRED");
    if (records.some(record => record.type !== "SNAPSHOT")) fail("SNAPSHOT_RECORD_REQUIRED");
    if (records.some(record => record.provenance !== "RECORDED" || !Number.isSafeInteger(record.dataRevision) || record.dataRevision < 1)) fail("RECORDED_REVISION_REQUIRED");
    if (records.some(record => record.accountId !== activeAccount || record.payload?.accountId !== activeAccount)) fail("ACCOUNT_SCOPE_MISMATCH");
    if (records.some(record => typeof record.terminalIdentityHash !== "string" || !/^[0-9a-f]{64}$/.test(record.terminalIdentityHash)) ||
        first.terminalIdentityHash !== second.terminalIdentityHash) fail("TERMINAL_SCOPE_MISMATCH");

    const entryRows = records.filter(record => record.payload?.captureType === "ENTRY");
    const exitRows = records.filter(record => record.payload?.captureType === "EXIT");
    if (entryRows.length !== 1 || exitRows.length !== 1) fail("ENTRY_EXIT_PAIR_REQUIRED");
    const entry = entryRows[0], exit = exitRows[0], before = entry.payload, after = exit.payload;
    if (before.positionIdentifier !== after.positionIdentifier ||
        typeof before.positionIdentifier !== "string" || !/^[1-9][0-9]{0,19}$/.test(before.positionIdentifier)) fail("POSITION_SCOPE_MISMATCH");
    if (before.chartView?.symbol !== after.chartView?.symbol ||
        before.chartView?.timeframe !== after.chartView?.timeframe ||
        typeof before.chartView?.symbol !== "string" || typeof before.chartView?.timeframe !== "string") fail("CHART_SCOPE_MISMATCH");
    const entryTime = parseTime(before.asOfUtc), exitTime = parseTime(after.asOfUtc);
    if (entryTime === null || exitTime === null || entryTime > exitTime) fail("EVENT_TIME_ORDER_INVALID");
    if (!validBars(entry) || !validBars(exit)) fail("FROZEN_MARKET_DATA_UNAVAILABLE");
    return { entry, exit, symbol: before.chartView.symbol, timeframe: before.chartView.timeframe };
  }

  return { selectSnapshotComparison };
});
