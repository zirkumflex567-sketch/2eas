"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractLoadedCssImageUrls,
  estimateRgbaSurfaceBytes,
} = require("../scripts/dashboard_asset_measurement_helpers.cjs");

test("CSS image scanner keeps only already-loaded local CSS image resources", () => {
  const loaded = new Set([
    "http://127.0.0.1:8000/assets/panel.webp",
    "http://127.0.0.1:8000/assets/crest.png",
  ]);
  const urls = extractLoadedCssImageUrls([
    'linear-gradient(#000, #111), url("/assets/panel.webp")',
    "url('/assets/panel.webp'), url(../assets/crest.png)",
    "url(data:image/svg+xml,%3Csvg%3E)",
    "url(https://unmeasured.example/remote.png)",
  ], "http://127.0.0.1:8000/dashboard/", loaded);

  assert.deepEqual(urls, [
    "http://127.0.0.1:8000/assets/crest.png",
    "http://127.0.0.1:8000/assets/panel.webp",
  ]);
});

test("decoded image surface estimate validates dimensions and uses RGBA bytes", () => {
  assert.equal(estimateRgbaSurfaceBytes({ width: 128, height: 64 }), 32768);
  assert.equal(estimateRgbaSurfaceBytes({ width: 1, height: 1 }), 4);
  for (const dimensions of [null, {}, { width: 0, height: 10 },
    { width: -1, height: 4 }, { width: 1.5, height: 2 },
    { width: Number.MAX_SAFE_INTEGER, height: 2 }]) {
    assert.equal(estimateRgbaSurfaceBytes(dimensions), null);
  }
});
