"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOptions, createLoadPlan, demoAccounts, waitUntilWindowEnds } = require("../scripts/aud01_load_plan.cjs");

test("AUD-01 scopes traces to every current non-Blueberry demo exactly once", () => {
  assert.deepEqual(demoAccounts, [
    { account: "titan", symbol: "XAUUSD" },
    { account: "xau5m_m5", symbol: "XAUUSD.p" },
    { account: "titan_m5", symbol: "XAUUSD.p" },
    { account: "xau5m_500", symbol: "XAUUSD.p" },
    { account: "goldm15", symbol: "XAUUSD" },
  ]);
  assert.equal(new Set(demoAccounts.map(({ account }) => account)).size, demoAccounts.length);
  assert.equal(demoAccounts.some(({ account }) => account === "blueberry"), false);
});

test("repeated plan includes one serial read cycle per interval within the duration", () => {
  assert.deepEqual(createLoadPlan({ durationSeconds: 180, intervalSeconds: 60 }), {
    mode: "repeated",
    durationSeconds: 180,
    intervalSeconds: 60,
    cycles: 3,
    requestsPerCycle: 5,
    maxRequests: 15,
  });
});

test("repeated plan rejects intervals below the safe floor and durations above the cap", () => {
  assert.throws(() => createLoadPlan({ durationSeconds: 120, intervalSeconds: 59 }), /at least 60/);
  assert.throws(() => createLoadPlan({ durationSeconds: 841, intervalSeconds: 60 }), /at most 840/);
});

test("repeated measurement waits until its full wall-clock duration before final process sampling", async () => {
  const startedAt = 10_000;
  let now = startedAt + 5_000;
  const waited = [];
  await waitUntilWindowEnds(startedAt, 60, {
    now: () => now,
    wait: async milliseconds => {
      waited.push(milliseconds);
      now += milliseconds;
    },
  });
  assert.deepEqual(waited, [55_000]);
  assert.equal(now, startedAt + 60_000);
});

test("CLI accepts only bounded positive integer settings", () => {
  assert.deepEqual(parseOptions(["--repeat-seconds=120", "--interval-seconds=60"]), {
    durationSeconds: 120,
    intervalSeconds: 60,
  });
  assert.throws(() => parseOptions(["--repeat-seconds=120", "--repeat-seconds=180"]), /specified once/);
  assert.throws(() => parseOptions(["--repeat-seconds=Infinity"]), /positive integer/);
  assert.throws(() => parseOptions(["--something-else"]), /Unknown option/);
  assert.throws(() => parseOptions(["--interval-seconds=60"]), /requires --repeat-seconds/);
});

test("omitting repeat options preserves the existing one-shot mode", () => {
  assert.deepEqual(parseOptions([]), { durationSeconds: null, intervalSeconds: 60 });
});
