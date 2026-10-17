"use strict";

function isCandleInkPixel(red, green, blue, alpha) {
  return candleInkKind(red, green, blue, alpha) !== null;
}

function candleInkKind(red, green, blue, alpha) {
  if (alpha < 192) return null;
  if (green - red >= 45 && green - blue >= 8) return "bullish";
  if (red - green >= 65 && red - blue >= 45) return "bearish";
  return null;
}

function countCandleInkPixels(rgba, width, height) {
  if (!ArrayBuffer.isView(rgba) || !Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1 || rgba.length !== width * height * 4) {
    throw new TypeError("RGBA pixels must match positive canvas width and height");
  }
  let count = 0;
  for (let x = 0; x < width; x += 1) {
    let previousKind = null;
    let runLength = 0;
    for (let y = 0; y <= height; y += 1) {
      const offset = 4 * (y * width + x);
      const kind = y < height ? candleInkKind(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]) : null;
      if (kind && kind === previousKind) {
        runLength += 1;
      } else {
        if (runLength >= 3) count += runLength;
        previousKind = kind;
        runLength = kind ? 1 : 0;
      }
    }
  }
  return count;
}

module.exports = { countCandleInkPixels, isCandleInkPixel };
