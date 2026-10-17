"use strict";

function isCandleInkPixel(red, green, blue, alpha) {
  if (alpha < 192) return false;
  const teal = green - red >= 45 && green - blue >= 8;
  const redCandle = red - green >= 65 && red - blue >= 45;
  return teal || redCandle;
}

function countCandleInkPixels(rgba) {
  if (!ArrayBuffer.isView(rgba) || rgba.byteLength % 4 !== 0) {
    throw new TypeError("RGBA pixels must be a typed array with four bytes per pixel");
  }
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (isCandleInkPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) count += 1;
  }
  return count;
}

module.exports = { countCandleInkPixels, isCandleInkPixel };
