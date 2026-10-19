"use strict";

const assert = require("node:assert/strict");
const Templates = require("../static/chart-studio-v5-indicator-templates.js");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const scope = { account: "titan_m5", symbol: "XAUUSD.p", timeframe: "M15" };
const snapshot = () => ({
  indicators: { rsi: { enabled: true, period: 14 } },
  movingAverages: [{ id: "ma1", type: "EMA", period: 20 }],
  oscillatorInstances: [{ id: "osc1", kind: "macd", fast: 12, slow: 26, signal: 9 }],
});

function create(storage = new MemoryStorage(), selectedScope = scope) {
  return Templates.createStore({ storage, scope: selectedScope });
}

function run(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.stack || error}`); process.exitCode = 1; }
}

run("indicator templates are saved and retrieved as isolated copies", () => {
  const storage = new MemoryStorage(), store = create(storage);
  const saved = store.save("Momentum set", snapshot());
  assert.equal(saved.name, "Momentum set");
  assert.equal(store.list().length, 1);
  assert.deepEqual(store.list()[0], { id: saved.id, name: "Momentum set" });
  const loaded = store.get(saved.id);
  loaded.snapshot.indicators.rsi.period = 99;
  assert.equal(store.get(saved.id).snapshot.indicators.rsi.period, 14);
  const otherAccount = create(storage, { ...scope, account: "goldm15" });
  assert.deepEqual(otherAccount.list(), []);
});

run("indicator template names are unique case-insensitively and CRUD stays bounded", () => {
  const store = create();
  const first = store.save("Trend", snapshot());
  assert.throws(() => store.save(" trend ", snapshot()), /NAME_EXISTS/);
  store.rename(first.id, "Trend v2");
  assert.equal(store.get(first.id).name, "Trend v2");
  const copy = store.copy(first.id, "Trend copy");
  assert.notEqual(copy.id, first.id);
  assert.deepEqual(copy.snapshot, first.snapshot);
  store.remove(first.id);
  assert.equal(store.list().length, 1);
  for (let index = 0; index < 19; index++) store.save(`Set ${index}`, snapshot());
  assert.equal(store.list().length, 20);
  assert.throws(() => store.save("Twenty first", snapshot()), /LIMIT/);
});

run("invalid or oversized snapshots are rejected without changing saved templates", () => {
  const store = create();
  store.save("Existing", snapshot());
  assert.throws(() => store.save("Invalid", { ...snapshot(), execute: true }), /INVALID_SNAPSHOT/);
  assert.throws(() => store.save("Large", { indicators: { note: "x".repeat(600_000) }, movingAverages: [], oscillatorInstances: [] }), /LIMIT/);
  assert.equal(store.list().length, 1);
});

run("loading a template rolls back the previous configuration when application fails", () => {
  const store = create();
  const saved = store.save("Momentum", snapshot());
  const before = { indicators: { rsi: { enabled: false, period: 14 } }, movingAverages: [], oscillatorInstances: [] };
  let current = JSON.parse(JSON.stringify(before)), attempts = 0;
  assert.throws(() => store.apply(saved.id, {
    current,
    apply(next) { attempts++; if (attempts === 1) { current = next; return false; } current = next; return true; },
  }), /APPLY_FAILED/);
  assert.deepEqual(current, before);
  assert.equal(attempts, 2);
});

run("template store rejects invalid scopes and corrupted storage", () => {
  assert.throws(() => create(new MemoryStorage(), { ...scope, timeframe: "M2" }), /INVALID_SCOPE/);
  const storage = new MemoryStorage(), store = create(storage), key = store.storageKey();
  storage.setItem(key, JSON.stringify({ schemaVersion: 1, account: scope.account, symbol: scope.symbol, timeframe: scope.timeframe, templates: [{ id: "bad", name: "X", snapshot: snapshot() }] }));
  assert.throws(() => store.list(), /INVALID_STORE/);
});
