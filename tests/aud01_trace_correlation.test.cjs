"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { rememberSnapshot, correlateSamples } = require("../scripts/aud01_trace_correlation.cjs");

test("correlates samples from snapshots captured before the bounded ring evicts them", () => {
  const snapshots = new Map();
  const sample = { account: "titan", traceId: "trace-1", route: "/api/candles" };
  rememberSnapshot(snapshots, "titan", [
    { requestId: "trace-1", account: "titan", httpMethod: "GET", route: "/api/candles" },
  ]);

  const currentRing = [{ requestId: "trace-new", account: "titan", httpMethod: "GET", route: "/api/candles" }];
  rememberSnapshot(snapshots, "titan", currentRing);

  assert.deepEqual(correlateSamples([sample], snapshots), [
    { requestId: "trace-1", account: "titan", httpMethod: "GET", route: "/api/candles" },
  ]);
});

test("rejects a trace snapshot with the wrong account", () => {
  const snapshots = new Map();
  const sample = { account: "titan", traceId: "trace-1", route: "/api/candles" };
  assert.throws(() => rememberSnapshot(snapshots, "titan", [
    { requestId: "trace-1", account: "goldm15", httpMethod: "GET", route: "/api/candles" },
  ]), /trace account mismatch/);
});

test("rejects a trace with the wrong route", () => {
  const snapshots = new Map();
  const sample = { account: "titan", traceId: "trace-1", route: "/api/candles" };
  rememberSnapshot(snapshots, "titan", [
    { requestId: "trace-1", account: "titan", httpMethod: "GET", route: "/api/status" },
  ]);

  assert.throws(() => correlateSamples([sample], snapshots));
});
