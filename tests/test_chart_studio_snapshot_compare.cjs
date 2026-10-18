"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectSnapshotComparison } = require("../static/chart-studio-snapshot-compare.js");

const account = "titan";
const terminalIdentityHash = "a".repeat(64);

function snapshot({ captureType, id, accountId = account, terminal = terminalIdentityHash,
  positionIdentifier = "1201", symbol = "XAUUSD", timeframe = "M15",
  asOfUtc = captureType === "ENTRY" ? "2026-10-14T10:00:00.000000Z" : "2026-10-14T11:00:00.000000Z",
  bars = [{ timeUtc: asOfUtc, open: "1", high: "2", low: "1", close: "2" }] }) {
  return {
    type: "SNAPSHOT", id, accountId, terminalIdentityHash: terminal, provenance: "RECORDED", dataRevision: 1,
    payload: {
      accountId, positionIdentifier, captureType, asOfUtc,
      chartView: { symbol, timeframe },
      marketData: { source: "MT5_COMPLETED_BARS", bars },
    },
  };
}

function pair(overrides = {}) {
  return [
    snapshot({ captureType: "ENTRY", id: "entry", ...(overrides.entry || {}) }),
    snapshot({ captureType: "EXIT", id: "exit", ...(overrides.exit || {}) }),
  ];
}

test("selects one account- and position-bound immutable ENTRY/EXIT pair", () => {
  const [entry, exit] = pair();
  assert.deepEqual(selectSnapshotComparison([entry, exit], account), { entry, exit, symbol: "XAUUSD", timeframe: "M15" });
});

test("rejects snapshots from another active account", () => {
  assert.throws(() => selectSnapshotComparison(pair({ exit: { accountId: "xau5m_m5" } }), account), /ACCOUNT_SCOPE_MISMATCH/);
});

test("rejects pairs from different positions, terminals, symbols, or timeframes", () => {
  for (const exit of [
    { positionIdentifier: "1202" },
    { terminal: "b".repeat(64) },
    { symbol: "EURUSD" },
    { timeframe: "M5" },
  ]) assert.throws(() => selectSnapshotComparison(pair({ exit }), account));
});

test("rejects repeated capture types and snapshots in reverse event-time order", () => {
  assert.throws(() => selectSnapshotComparison([snapshot({ captureType: "ENTRY", id: "a" }), snapshot({ captureType: "ENTRY", id: "b" })], account), /ENTRY_EXIT_PAIR_REQUIRED/);
  assert.throws(() => selectSnapshotComparison(pair({ entry: { asOfUtc: "2026-10-14T12:00:00.000000Z" } }), account), /EVENT_TIME_ORDER_INVALID/);
});

test("rejects missing, future-dated, or malformed frozen candle rows", () => {
  for (const bars of [null, [], [{ ...pair()[0].payload.marketData.bars[0], timeUtc: "2026-10-14T12:00:00.000000Z" }], [{ open: "NaN" }]]) {
    assert.throws(() => selectSnapshotComparison(pair({ entry: { bars } }), account));
  }
});

test("requires exactly two distinct snapshot records", () => {
  const [entry, exit] = pair();
  assert.throws(() => selectSnapshotComparison([entry], account), /TWO_SNAPSHOTS_REQUIRED/);
  assert.throws(() => selectSnapshotComparison([entry, entry], account), /DISTINCT_SNAPSHOTS_REQUIRED/);
  assert.throws(() => selectSnapshotComparison([entry, exit, entry], account), /TWO_SNAPSHOTS_REQUIRED/);
});

test("rejects unrecorded or revisionless snapshot data", () => {
  const unrecorded = pair(); unrecorded[0].provenance = "RECOMPUTED";
  assert.throws(() => selectSnapshotComparison(unrecorded, account), /RECORDED_REVISION_REQUIRED/);
  const revisionless = pair(); revisionless[1].dataRevision = 0;
  assert.throws(() => selectSnapshotComparison(revisionless, account), /RECORDED_REVISION_REQUIRED/);
});
