"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeResources, selectCacheHeaders, measurementContextOptions, isSafeMeasurementRequest } =
  require("../scripts/deployed_asset_measurement_helpers.cjs");

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

test("deployed measurement disables scripts, origin-scopes auth, and rejects cross-origin requests", () => {
  const options = measurementContextOptions(390, {
    username: "viewer", password: "private", origin: "https://dashboard.example.test",
  });
  assert.equal(options.javaScriptEnabled, false);
  assert.equal(options.deviceScaleFactor, 2);
  assert.deepEqual(options.httpCredentials, {
    username: "viewer", password: "private", origin: "https://dashboard.example.test",
  });
  assert.equal(options.extraHTTPHeaders, undefined);
  assert.equal(isSafeMeasurementRequest("GET", "/stt/static/app.js"), true);
  assert.equal(isSafeMeasurementRequest("HEAD", "/stt/static/app.js"), true);
  assert.equal(isSafeMeasurementRequest("GET", "/stt/api/accounts"), false);
  assert.equal(isSafeMeasurementRequest("POST", "/stt/static/app.js"), false);
  assert.equal(isSafeMeasurementRequest("GET", "https://dashboard.example.test/stt/static/app.js", "https://dashboard.example.test"), true);
  assert.equal(isSafeMeasurementRequest("GET", "https://other.example.test/stt/static/app.js", "https://dashboard.example.test"), false);
});

test("cache exchange summary distinguishes full cold responses from conditional warm revalidation", () => {
  const { summarizeCacheExchanges } = require("../scripts/deployed_asset_measurement_helpers.cjs");
  assert.deepEqual(summarizeCacheExchanges([
    { phase: "cold", kind: "request", ifNoneMatch: false },
    { phase: "cold", kind: "response", status: 200 },
    { phase: "warm", kind: "request", ifNoneMatch: true },
    { phase: "warm", kind: "response", status: 304 },
  ]), {
    cold: { requests: 1, conditionalRequests: 0, responses200: 1, responses304: 0 },
    warm: { requests: 1, conditionalRequests: 1, responses200: 0, responses304: 1 },
  });
});
