"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { parseConfig } = require("./chart_fx_measure_config.cjs");

const valid = parseConfig({
  AUD04_PHASES: "mystic-idle",
  AUD04_DURATION_SECONDS: "1800",
  AUD04_OUT: "output/aud04-mystic-30m.json",
});
assert.deepEqual(valid, {
  account: "titan",
  durationSeconds: 1800,
  output: path.resolve("output/aud04-mystic-30m.json"),
  phases: [{ name: "mystic-idle", mode: "mystic" }],
});
assert.throws(() => parseConfig({ AUD04_PHASES: "blueberry" }), /invalid AUD04_PHASES/);
assert.throws(() => parseConfig({ AUD04_OUT: "../outside.json" }), /AUD04_OUT must stay under output/);
assert.throws(() => parseConfig({ AUD04_DURATION_SECONDS: "0" }), /AUD04_DURATION_SECONDS must be 60–3600/);

console.log("PASS AUD-04 runner config: selectable phases, bounded durations, output containment");
