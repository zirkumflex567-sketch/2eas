"use strict";

const assert = require("node:assert/strict");
const { classifyLiveDemoRequest } = require("../scripts/live_demo_scope_guard.cjs");

const aliases = ["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"];
const request = (path, method = "GET") => classifyLiveDemoRequest({
  url: `http://127.0.0.1:8056${path}`,
  method,
  basePath: "",
  allowedAccounts: aliases,
});

assert.equal(request("/api/candles?account=titan").allowed, true);
assert.equal(request("/api/chart/v1/positions?account=goldm15").allowed, true);
assert.equal(request("/api/candles?account=blueberry").allowed, false);
assert.equal(request("/%61pi/candles?account=blueberry").allowed, false);
assert.equal(request("/api%2Fcandles?account=blueberry").allowed, false);
assert.equal(request("/%61pi/accounts").allowed, true);
assert.equal(request("/%61pi/accounts?account=titan").allowed, false);
assert.equal(request("/api/candles?account=unknown").allowed, false);
assert.equal(request("/api/candles?account=titan&account=goldm15").allowed, false);
assert.equal(request("/api/candles").allowed, false);
assert.equal(request("/api/status?light=true").allowed, false);
assert.equal(request("/api/positions").allowed, false);
assert.equal(request("/api/candles?account=titan", "POST").allowed, false);
assert.equal(request("/api/accounts").allowed, true);
assert.equal(request("/api/accounts?account=titan").allowed, false);
assert.equal(request("/api/runtime").allowed, true);
assert.equal(request("/api/chart/v1/capabilities").allowed, true);
assert.equal(request("/api/chart/v1/capabilities?account=titan").allowed, false);
assert.equal(request("/api/control_session").allowed, false);
assert.equal(request("/static/chart.js").allowed, true);
assert.equal(classifyLiveDemoRequest({
  url: "https://example.test/stt/api/candles?account=titan",
  method: "GET",
  basePath: "/stt",
  allowedAccounts: aliases,
}).allowed, true);
assert.equal(classifyLiveDemoRequest({
  url: "https://example.test/stt/api/accounts",
  method: "GET",
  basePath: "/stt",
  allowedAccounts: aliases,
}).allowed, true);
assert.equal(classifyLiveDemoRequest({
  url: "https://example.test/%73tt/api/candles?account=blueberry",
  method: "GET",
  basePath: "/%73tt",
  allowedAccounts: aliases,
}).allowed, false);

console.log("live demo scope guard: 24 cases passed");
