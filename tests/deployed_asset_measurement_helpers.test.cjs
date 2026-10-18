"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeResources, selectCacheHeaders } = require("../scripts/deployed_asset_measurement_helpers.cjs");

test("resource summary counts compressed browser transfers and cached reloads, excluding blocked APIs", () => {
  assert.deepEqual(summarizeResources([
    { path: "/stt/static/app.js", transfer: 120, encoded: 80, decoded: 80 },
    { path: "/stt/static/app.css", transfer: 0, encoded: 60, decoded: 120 },
    { path: "/stt/api/accounts", transfer: 200, encoded: 200, decoded: 200 },
  ]), {
    requests: 2,
    transferBytes: 120,
    encodedBytes: 140,
    decodedBytes: 200,
    cachedRequests: 1,
  });
});

test("resource summary recognizes revalidated cache entries transferred as headers only", () => {
  assert.deepEqual(summarizeResources([
    { path: "/stt/static/app.js", transfer: 300, encoded: 1000, decoded: 4000 },
  ]), {
    requests: 1,
    transferBytes: 300,
    encodedBytes: 1000,
    decodedBytes: 4000,
    cachedRequests: 1,
  });
});

test("header summary returns only requested static paths and safe cache fields", () => {
  assert.deepEqual(selectCacheHeaders([
    { path: "/stt/", status: 401, cacheControl: "no-store" },
    { path: "/stt/", status: 200, cacheControl: "no-store", etag: null, contentEncoding: "gzip", age: null,
      expires: null, lastModified: null, vary: "Accept-Encoding" },
    { path: "/stt/static/app.js", status: 200, cacheControl: null, etag: "W/\"abc\"", contentEncoding: null, age: null,
      expires: null, lastModified: "Sun, 18 Oct 2026 00:00:00 GMT", vary: "Accept-Encoding" },
    { path: "/stt/api/runtime", status: 200, cacheControl: "no-store", etag: null, contentEncoding: null, age: null },
  ], ["/stt/", "/stt/static/app.js"]), [
    { path: "/stt/", status: 200, cacheControl: "no-store", etag: null, contentEncoding: "gzip", age: null,
      expires: null, lastModified: null, vary: "Accept-Encoding" },
    { path: "/stt/static/app.js", status: 200, cacheControl: null, etag: "W/\"abc\"", contentEncoding: null, age: null,
      expires: null, lastModified: "Sun, 18 Oct 2026 00:00:00 GMT", vary: "Accept-Encoding" },
  ]);
});
