"use strict";

function extractLoadedCssImageUrls(styleValues, baseUrl, loadedUrls) {
  const base = new URL(baseUrl);
  const loaded = loadedUrls instanceof Set ? loadedUrls : new Set(loadedUrls);
  const found = new Set();
  const pattern = /url\(\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|((?:\\.|[^)])*))\s*\)/gi;
  for (const styleValue of styleValues) {
    if (typeof styleValue !== "string") continue;
    for (const match of styleValue.matchAll(pattern)) {
      const raw = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(.)/g, "$1").trim();
      if (!raw || /^(?:data|blob):/i.test(raw)) continue;
      let url;
      try { url = new URL(raw, base); } catch (_) { continue; }
      if (url.origin !== base.origin || !loaded.has(url.href)) continue;
      found.add(url.href);
    }
  }
  return [...found].sort();
}

function estimateRgbaSurfaceBytes(dimensions) {
  if (!dimensions || !Number.isSafeInteger(dimensions.width) ||
      !Number.isSafeInteger(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) return null;
  const pixels = dimensions.width * dimensions.height;
  if (!Number.isSafeInteger(pixels) || pixels > Math.floor(Number.MAX_SAFE_INTEGER / 4)) return null;
  return pixels * 4;
}

module.exports = { extractLoadedCssImageUrls, estimateRgbaSurfaceBytes };
