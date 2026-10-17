"use strict";

const assert = require("node:assert/strict");
const { countCandleInkPixels, isCandleInkPixel } = require("./chart_render_pixels.cjs");

assert.equal(isCandleInkPixel(38, 166, 154, 255), true, "bullish teal candles count as visible ink");
assert.equal(isCandleInkPixel(239, 83, 80, 255), true, "bearish red candles count as visible ink");
assert.equal(isCandleInkPixel(120, 126, 139, 255), false, "neutral grid and axis text do not count as candle ink");
assert.equal(isCandleInkPixel(0, 0, 0, 0), false, "transparent pixels do not count as candle ink");

const width = 12;
const height = 12;
const fixture = new Uint8ClampedArray(4 * width * height);
const put = (x, y, rgba) => fixture.set(rgba, 4 * (y * width + x));
for (let y = 2; y < 7; y += 1) put(2, y, [38, 166, 154, 255]);
for (let x = 4; x < 9; x += 1) put(x, 9, [239, 83, 80, 255]);
assert.equal(countCandleInkPixels(fixture, width, height), 5,
  "vertical candle bodies count while a horizontal price line does not");
assert.equal(countCandleInkPixels(new Uint8ClampedArray(4 * width * height), width, height), 0,
  "a blank chart canvas has no candle ink");
console.log("PASS chart render pixel probe");
