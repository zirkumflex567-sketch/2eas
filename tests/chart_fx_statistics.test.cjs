"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { maxValue, minValue } = require("../scripts/chart_fx_statistics.cjs");

test("maxValue summarizes large frame samples without argument spreading", () => {
  const values = new Float64Array(250_000).fill(16.7);
  values[123_456] = 33.3;

  assert.equal(maxValue(values), 33.3);
});

test("maxValue returns null for an empty sample", () => {
  assert.equal(maxValue([]), null);
});

test("minValue summarizes large frame samples without argument spreading", () => {
  const values = new Float64Array(250_000).fill(16.7);
  values[123_456] = 1.2;

  assert.equal(minValue(values), 1.2);
});

test("minValue returns null for an empty sample", () => {
  assert.equal(minValue([]), null);
});
