"use strict";

const assert = require("node:assert/strict");
const { countCandleInkPixels, isCandleInkPixel } = require("./chart_render_pixels.cjs");

assert.equal(isCandleInkPixel(38, 166, 154, 255), true, "bullish teal candles count as visible ink");
assert.equal(isCandleInkPixel(239, 83, 80, 255), true, "bearish red candles count as visible ink");
assert.equal(isCandleInkPixel(120, 126, 139, 255), false, "neutral grid and axis text do not count as candle ink");
assert.equal(isCandleInkPixel(0, 0, 0, 0), false, "transparent pixels do not count as candle ink");

const fixture = Uint8ClampedArray.from([
  38, 166, 154, 255,
  239, 83, 80, 255,
  120, 126, 139, 255,
  0, 0, 0, 0,
]);
assert.equal(countCandleInkPixels(fixture), 2, "only bullish and bearish candle pixels are counted");
assert.equal(countCandleInkPixels(new Uint8ClampedArray(4 * 16)), 0, "a blank chart canvas has no candle ink");
console.log("PASS chart render pixel probe");
