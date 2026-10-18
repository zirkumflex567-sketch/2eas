"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOptions, createLoadPlan } = require("../scripts/aud01_load_plan.cjs");

test("repeated plan includes one serial read cycle per interval within the duration", () => {
  assert.deepEqual(createLoadPlan({ durationSeconds: 180, intervalSeconds: 60 }), {
    mode: "repeated",
    durationSeconds: 180,
    intervalSeconds: 60,
    cycles: 3,
    requestsPerCycle: 4,
    maxRequests: 12,
  });
});

test("repeated plan rejects intervals below the safe floor and durations above the cap", () => {
  assert.throws(() => createLoadPlan({ durationSeconds: 120, intervalSeconds: 59 }), /at least 60/);
  assert.throws(() => createLoadPlan({ durationSeconds: 841, intervalSeconds: 60 }), /at most 840/);
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
