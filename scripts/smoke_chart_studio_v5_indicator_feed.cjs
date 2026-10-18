"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", request => requests.push({ url: request.url(), method: request.method() }));
    await page.setContent("<!doctype html><html lang=\"de\"><body></body></html>");
    await page.addScriptTag({ path: path.resolve("static/chart-studio-v5-indicator-feed.js") });
    const result = await page.evaluate(() => {
      const calls = [];
      const entries = new Map();
      const engine = {
        addTransientMovingAverage: options => { calls.push({ method: "add", options }); entries.set(options.id, { ...options }); },
        removeAverage: id => { calls.push({ method: "remove", id }); return entries.delete(id); },
        movingAverageOptions: id => entries.get(id) || null,
      };
      const scope = { account: "titan", symbol: "XAUUSD", timeframe: "M15" };
      const bridge = ChartStudioV5IndicatorFeed.create(engine, scope);
      const configs = [
        { id: "trend-ema", type: "EMA", period: 21, source: "close", color: "#68dfff", lineWidth: 2, visible: true, label: "Trend EMA", displayShift: 0 },
        { id: "slow-rma", type: "RMA", period: 50, source: "hlc3", color: "#f5c66d", lineWidth: 1, visible: false, label: "RMA hidden", displayShift: -2 },
      ];
      const snapshot = configs => ({ account: "titan", symbol: "XAUUSD", timeframe: "M15", source: "CHART_STUDIO_LOCAL", canExecute: false, configs });
      const firstToken = bridge.beginRead();
      const first = bridge.update(snapshot(configs), firstToken);
      const afterFirst = calls.slice();
      const unchanged = bridge.update(snapshot(configs), bridge.beginRead());
      const afterUnchanged = calls.slice();
      const changedConfigs = configs.map(row => row.id === "trend-ema" ? { ...row, period: 34, displayShift: 1 } : row);
      const changed = bridge.update(snapshot(changedConfigs), bridge.beginRead());
      const afterChanged = calls.slice();
      const removed = bridge.update(snapshot([changedConfigs[0]]), bridge.beginRead());
      const duplicate = bridge.update(snapshot([changedConfigs[0], { ...changedConfigs[0] }]), bridge.beginRead());
      const wrongScope = bridge.update({ ...snapshot(changedConfigs), account: "xau5m_m5" }, bridge.beginRead());
      const wrongSource = bridge.update({ ...snapshot(changedConfigs), source: "UNVERIFIED" }, bridge.beginRead());
      const invalid = bridge.update(snapshot([{ ...changedConfigs[0], period: 0 }]), bridge.beginRead());
      const validAgain = bridge.update(snapshot(configs), bridge.beginRead());
      const staleToken = bridge.beginRead();
      const currentToken = bridge.beginRead();
      const currentUpdate = bridge.update(snapshot(configs), currentToken);
      const stale = bridge.update(snapshot(configs), staleToken);
      const nextScope = bridge.setScope({ account: "titan_m5", symbol: "XAUUSD.p", timeframe: "M15" });
      const afterScope = bridge.inspect();
      const finalSnapshot = { account: "titan_m5", symbol: "XAUUSD.p", timeframe: "M15", source: "CHART_STUDIO_LOCAL", canExecute: false, configs: [] };
      const acceptedEmpty = bridge.update(finalSnapshot, bridge.beginRead());
      return { calls, afterFirst, afterUnchanged, afterChanged, first, unchanged, changed, removed, duplicate, wrongScope, wrongSource, invalid, validAgain,
        stale, nextScope, afterScope, currentUpdate, acceptedEmpty, final: bridge.inspect(), remaining: [...entries.keys()] };
    });
    assert.deepEqual(result.first, { applied: true, count: 2 });
    assert.equal(result.afterFirst.length, 2);
    assert.deepEqual(result.afterFirst.map(call => call.options.id), ["preview-ma-trend-ema", "preview-ma-slow-rma"]);
    assert.equal(result.afterFirst[0].options.period, 21);
    assert.equal(result.afterFirst[0].options.title, "Trend EMA");
    assert.equal(result.afterFirst[1].options.displayShift, -2);
    assert.deepEqual(result.unchanged, { applied: true, count: 2 });
    assert.equal(result.afterUnchanged.length, result.afterFirst.length, "unchanged configuration does not rebuild renderer series");
    assert.deepEqual(result.changed, { applied: true, count: 2 });
    assert.equal(result.afterChanged.filter(call => call.method === "add" && call.options.id === "preview-ma-trend-ema").at(-1).options.period, 34);
    assert.deepEqual(result.removed, { applied: true, count: 1 });
    assert.deepEqual(result.duplicate, { applied: false, reason: "INVALID_CONFIGS" });
    assert.deepEqual(result.wrongScope, { applied: false, reason: "SCOPE_MISMATCH" });
    assert.deepEqual(result.wrongSource, { applied: false, reason: "UNVERIFIED_SOURCE" });
    assert.deepEqual(result.invalid, { applied: false, reason: "INVALID_CONFIGS" });
    assert.deepEqual(result.validAgain, { applied: true, count: 2 });
    assert.deepEqual(result.currentUpdate, { applied: true, count: 2 });
    assert.deepEqual(result.stale, { applied: false, reason: "STALE_REQUEST" });
    assert.equal(result.nextScope, 2);
    assert.deepEqual(result.afterScope.scope, { account: "titan_m5", symbol: "XAUUSD.p", timeframe: "M15" });
    assert.equal(result.afterScope.count, 0);
    assert.deepEqual(result.acceptedEmpty, { applied: true, count: 0 });
    assert.deepEqual(result.remaining, []);
    assert.deepEqual(result.final, { scope: { account: "titan_m5", symbol: "XAUUSD.p", timeframe: "M15" }, generation: 2, status: "READY", count: 0 });
    assert.deepEqual(requests, [], "indicator sync is local-only and never fetches broker or mutation APIs");
    console.log("PASS v5 preview synchronizes exact scoped custom moving-average settings without requests");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
