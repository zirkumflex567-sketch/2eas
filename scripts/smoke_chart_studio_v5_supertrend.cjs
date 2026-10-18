"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:8873/chart_studio_v5/fixture.html";

(async () => {
  const server = spawn("python", ["-m", "http.server", "8873", "--bind", "127.0.0.1"], {
    cwd: process.cwd(), windowsHide: true, stdio: "ignore",
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw Error("Fixture server exited");
      try { if ((await fetch(base)).ok) break; } catch (_) { /* retry startup */ }
      if (attempt === 79) throw Error("Fixture server did not start");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [], writes = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.method() !== "GET") writes.push(request.method() + " " + request.url()); });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.addScriptTag({ path: path.resolve("chart_studio_v5/node_modules/lightweight-charts/dist/lightweight-charts.standalone.development.js") });
    await page.addScriptTag({ path: path.resolve("static/chart-studio-beta.js") });
    await page.addScriptTag({ path: path.resolve("static/chart-studio-averages.js") });
    await page.addScriptTag({ path: path.resolve("static/chart-studio-indicators.js") });
    const result = await page.evaluate(() => {
      const host = document.createElement("div");
      host.style.cssText = "width:800px;height:500px";
      document.body.append(host);
      const bars = Array.from({ length: 90 }, (_, i) => {
        const close = 2100 + Math.sin(i / 4) * 8 + i * 0.17;
        return { time: 1713000000 + i * 900, open: close - 0.4, high: close + 1.1 + (i % 4) * 0.2,
          low: close - 1.2 - (i % 3) * 0.15, close };
      });
      const engine = ChartStudioV5.createStudioV5(host, "supertrend-parity", { symbol: "XAUUSD", timeframe: "M15" });
      engine.setCandles(bars);
      const apiAvailable = typeof engine.addSupertrend === "function" && typeof engine.updateSupertrend === "function" && typeof engine.removeSupertrend === "function";
      if (!apiAvailable) { engine.destroy(); host.remove(); return { apiAvailable }; }
      engine.addSupertrend({ id: "supertrend-10", period: 10, multiplier: 3, color: "#41d89a" });
      const reference = ChartStudioIndicators.calculate("supertrend", bars, { period: 10, multiplier: 3 }).supertrend;
      const matches = (rows, expected) => rows.every(bar => {
        const actual = engine.readDataWindow(bar.time).indicators.find(item => item.id === "supertrend-10");
        const wanted = expected.find(item => item.time === bar.time);
        return wanted ? actual?.state === "AVAILABLE" && Math.abs(actual.value - wanted.value) < 1e-8 && actual.direction === wanted.trend : actual?.state !== "AVAILABLE";
      });
      const initialMatches = matches(bars, reference);
      const options = engine.supertrendOptions("supertrend-10");
      const updatedOptions = engine.updateSupertrend("supertrend-10", { period: 14, multiplier: 2.5, color: "#a78bfa" });
      const updatedMatches = matches(bars, ChartStudioIndicators.calculate("supertrend", bars, { period: 14, multiplier: 2.5 }).supertrend);
      engine.updateSupertrend("supertrend-10", { visible: false });
      const visibilityUpdateWorked = engine.supertrendOptions("supertrend-10").visible === false;
      engine.updateSupertrend("supertrend-10", { visible: true });
      let invalidMultiplierRejected = false;
      try { engine.updateSupertrend("supertrend-10", { multiplier: 2.55 }); } catch (_) { invalidMultiplierRejected = true; }
      const rejectedUpdatePreservedOptions = JSON.stringify(engine.supertrendOptions("supertrend-10")) === JSON.stringify(updatedOptions);
      let identityPatchRejected = false;
      try { engine.updateSupertrend("supertrend-10", { id: "renamed" }); } catch (_) { identityPatchRejected = true; }
      const rejectedIdentityPreservedOptions = JSON.stringify(engine.supertrendOptions("supertrend-10")) === JSON.stringify(updatedOptions);
      const last = { ...bars.at(-1), close: bars.at(-1).close + 5, high: bars.at(-1).high + 5 };
      engine.updateLast(last);
      const changed = [...bars.slice(0, -1), last];
      const formingMatches = matches(changed, ChartStudioIndicators.calculate("supertrend", changed, { period: 14, multiplier: 2.5 }).supertrend);
      const repeated = { ...last, close: last.close - 2, low: last.low - 2 };
      engine.updateLast(repeated);
      const repeatedBars = [...bars.slice(0, -1), repeated];
      const repeatedMatches = matches(repeatedBars, ChartStudioIndicators.calculate("supertrend", repeatedBars, { period: 14, multiplier: 2.5 }).supertrend);
      const appended = { ...repeated, time: repeated.time + 900, open: repeated.close, close: repeated.close + 1,
        high: repeated.close + 1.4, low: repeated.close - 0.5 };
      engine.updateLast(appended);
      const appendedBars = [...repeatedBars, appended];
      const appendedMatches = matches(appendedBars, ChartStudioIndicators.calculate("supertrend", appendedBars, { period: 14, multiplier: 2.5 }).supertrend);
      const replacement = bars.map(bar => ({ ...bar, open: bar.open + 30, high: bar.high + 30, low: bar.low + 30, close: bar.close + 30 }));
      engine.setCandles(replacement);
      const replacementMatches = matches(replacement, ChartStudioIndicators.calculate("supertrend", replacement, { period: 14, multiplier: 2.5 }).supertrend);
      const persisted = JSON.parse(localStorage.getItem("2eas.chartstudio.v5.drawings:v5:supertrend-parity:XAUUSD:M15") || "null");
      const persistedOptions = persisted?.supertrends?.find(item => item.id === "supertrend-10");
      const restoredHost = document.createElement("div"); restoredHost.style.cssText = "width:800px;height:500px"; document.body.append(restoredHost);
      const restored = ChartStudioV5.createStudioV5(restoredHost, "supertrend-parity", { symbol: "XAUUSD", timeframe: "M15" });
      restored.setCandles(replacement);
      const restoredOptions = restored.supertrendOptions("supertrend-10");
      const restoredPersistenceStatus = restored.inspect().persistenceStatus;
      restored.destroy(); restoredHost.remove();
      const badVersionHost = document.createElement("div"); badVersionHost.style.cssText = "width:800px;height:500px"; document.body.append(badVersionHost);
      const badVersionSeed = ChartStudioV5.createStudioV5(badVersionHost, "supertrend-bad-version", { symbol: "XAUUSD", timeframe: "M15" });
      badVersionSeed.setCandles(bars); badVersionSeed.addSupertrend({ id: "versioned-supertrend", period: 10, multiplier: 3, color: "#41d89a" });
      const snapshotKey = "2eas.chartstudio.v5.drawings:v5:supertrend-bad-version:XAUUSD:M15";
      const wrongVersionSnapshot = JSON.parse(localStorage.getItem(snapshotKey)); wrongVersionSnapshot.schemaVersion = 2;
      localStorage.setItem(snapshotKey, JSON.stringify(wrongVersionSnapshot)); badVersionSeed.destroy(); badVersionHost.remove();
      const badVersionReloadHost = document.createElement("div"); badVersionReloadHost.style.cssText = "width:800px;height:500px"; document.body.append(badVersionReloadHost);
      const badVersionReload = ChartStudioV5.createStudioV5(badVersionReloadHost, "supertrend-bad-version", { symbol: "XAUUSD", timeframe: "M15" });
      badVersionReload.setCandles(bars); const badVersionStatus = badVersionReload.inspect().persistenceStatus;
      const wrongVersionPreserved = JSON.parse(localStorage.getItem(snapshotKey)).schemaVersion === 2;
      badVersionReload.destroy(); badVersionReloadHost.remove();
      const conflictHost = document.createElement("div"); conflictHost.style.cssText = "width:800px;height:500px"; document.body.append(conflictHost);
      const conflictSeed = ChartStudioV5.createStudioV5(conflictHost, "supertrend-conflict", { symbol: "XAUUSD", timeframe: "M15" });
      conflictSeed.setCandles(bars); conflictSeed.addSupertrend({ id: "conflict-supertrend", period: 10, multiplier: 3, color: "#41d89a" });
      conflictSeed.destroy(); conflictHost.remove();
      const conflictReloadHost = document.createElement("div"); conflictReloadHost.style.cssText = "width:800px;height:500px"; document.body.append(conflictReloadHost);
      const conflictReload = ChartStudioV5.createStudioV5(conflictReloadHost, "supertrend-conflict", { symbol: "XAUUSD", timeframe: "M15" });
      conflictReload.addSupertrend({ id: "conflict-supertrend", period: 10, multiplier: 3, color: "#a78bfa" });
      conflictReload.setCandles(bars); const conflictStatus = conflictReload.inspect().persistenceStatus;
      const conflictCount = conflictReload.inspect().supertrendCount;
      const conflictOptions = conflictReload.supertrendOptions("conflict-supertrend");
      conflictReload.destroy(); conflictReloadHost.remove();
      const manyHost = document.createElement("div"); manyHost.style.cssText = "width:800px;height:500px"; document.body.append(manyHost);
      const manySeed = ChartStudioV5.createStudioV5(manyHost, "supertrend-many", { symbol: "XAUUSD", timeframe: "M15" });
      manySeed.setCandles(bars);
      for (let i = 0; i < 9; i++) manySeed.addSupertrend({ id: `supertrend-${i}`, period: 10, multiplier: 3, color: "#41d89a" });
      manySeed.destroy(); manyHost.remove();
      const manyReloadHost = document.createElement("div"); manyReloadHost.style.cssText = "width:800px;height:500px"; document.body.append(manyReloadHost);
      const manyReload = ChartStudioV5.createStudioV5(manyReloadHost, "supertrend-many", { symbol: "XAUUSD", timeframe: "M15" });
      manyReload.setCandles(bars); const manyRestoreStatus = manyReload.inspect().persistenceStatus, manyRestoreCount = manyReload.inspect().supertrendCount;
      manyReload.destroy(); manyReloadHost.remove();
      const flatBars = Array.from({ length: 24 }, (_, i) => ({ time: 1715000000 + i * 900, open: 100, high: 102, low: 98, close: 100 }));
      const flatHost = document.createElement("div"); flatHost.style.cssText = "width:800px;height:500px"; document.body.append(flatHost);
      const flatEngine = ChartStudioV5.createStudioV5(flatHost, "supertrend-flat"); flatEngine.setCandles(flatBars);
      flatEngine.addSupertrend({ id: "flat-supertrend", period: 10, multiplier: 3, color: "#41d89a" });
      const flatReadouts = flatBars.slice(9).map(bar => flatEngine.readDataWindow(bar.time).indicators.find(item => item.id === "flat-supertrend"));
      const flatMarketStable = flatReadouts.every(item => item?.direction === "DOWN" && item.value === 112);
      flatEngine.destroy(); flatHost.remove();
      const largeBars = Array.from({ length: 5000 }, (_, i) => { const close = 2000 + Math.sin(i / 7) * 10 + i * 0.01;
        return { time: 1700000000 + i * 900, open: close - 0.2, high: close + 1, low: close - 1, close }; });
      const largeHost = document.createElement("div"); largeHost.style.cssText = "width:800px;height:500px"; document.body.append(largeHost);
      const largeEngine = ChartStudioV5.createStudioV5(largeHost, "supertrend-perf"); largeEngine.setCandles(largeBars);
      largeEngine.addSupertrend({ id: "large-supertrend", period: 10, multiplier: 3, color: "#41d89a" });
      const start = performance.now();
      for (let i = 0; i < 25; i++) { const lastBar = largeBars[largeBars.length - 1]; largeEngine.updateLast({ ...lastBar, close: lastBar.close + (i % 2 ? 0.01 : -0.01) }); }
      const updateAverageMs = (performance.now() - start) / 25;
      largeEngine.destroy(); largeHost.remove();
      let invalidRejected = false;
      try { engine.addSupertrend({ id: "bad-supertrend", period: 1, multiplier: 3, color: "#fff" }); } catch (_) { invalidRejected = true; }
      const countBeforeRemoval = engine.inspect().supertrendCount;
      const removed = engine.removeSupertrend("supertrend-10");
      const readoutRemoved = !engine.readDataWindow(replacement.at(-1).time).indicators.some(item => item.id === "supertrend-10");
      const countAfterRemoval = engine.inspect().supertrendCount;
      engine.addSupertrend({ id: "supertrend-scope", period: 10, multiplier: 3, color: "#41d89a" });
      engine.changeAccount("supertrend-other-account");
      const accountResetCount = engine.inspect().supertrendCount;
      engine.destroy(); host.remove();
      return { apiAvailable, initialMatches, options, updatedOptions, updatedMatches, visibilityUpdateWorked, invalidMultiplierRejected, rejectedUpdatePreservedOptions, identityPatchRejected, rejectedIdentityPreservedOptions, formingMatches, repeatedMatches, appendedMatches, invalidRejected,
        replacementMatches, persistedOptions, restoredOptions, restoredPersistenceStatus, badVersionStatus, wrongVersionPreserved, conflictStatus, conflictCount, conflictOptions, manyRestoreStatus, manyRestoreCount, flatMarketStable, updateAverageMs, countBeforeRemoval, removed, readoutRemoved, countAfterRemoval, accountResetCount };
    });
    assert.equal(result.apiAvailable, true, "native v5 must expose a Supertrend overlay");
    assert.equal(result.initialMatches, true, "native v5 closed-bar values and directions must match the Beta Supertrend");
    assert.deepEqual(result.options, { id: "supertrend-10", period: 10, multiplier: 3, color: "#41d89a", visible: true });
    assert.deepEqual(result.updatedOptions, { id: "supertrend-10", period: 14, multiplier: 2.5, color: "#a78bfa", visible: true });
    assert.equal(result.updatedMatches, true, "parameter changes must rebuild the Supertrend series");
    assert.equal(result.visibilityUpdateWorked, true, "the overlay visibility can be changed without rebuilding its identity");
    assert.equal(result.invalidMultiplierRejected, true, "fractional multipliers must obey the 0.1 step");
    assert.equal(result.rejectedUpdatePreservedOptions, true, "rejected settings must leave the last valid indicator intact");
    assert.equal(result.identityPatchRejected, true, "an update cannot change indicator identity through an untyped input");
    assert.equal(result.rejectedIdentityPreservedOptions, true, "a rejected identity patch leaves the prior indicator intact");
    assert.equal(result.formingMatches, true, "forming-bar replacement must recompute Supertrend without stale values");
    assert.equal(result.repeatedMatches, true, "repeated updates of one forming bar must not double-advance ATR state");
    assert.equal(result.appendedMatches, true, "the next closed bar must continue Supertrend state exactly once");
    assert.equal(result.replacementMatches, true, "replacing candle history must rebuild Supertrend values");
    assert.deepEqual(result.persistedOptions, { id: "supertrend-10", period: 14, multiplier: 2.5, color: "#a78bfa", visible: true }, "scoped snapshots must store Supertrend settings");
    assert.deepEqual(result.restoredOptions, result.persistedOptions, "scoped snapshots must restore Supertrend settings after reload");
    assert.equal(result.restoredPersistenceStatus, "READY");
    assert.equal(result.badVersionStatus, "UNAVAILABLE", "v2 snapshots must not silently accept v3 Supertrend fields");
    assert.equal(result.wrongVersionPreserved, true, "unsupported snapshot versions must not be rewritten with settings lost");
    assert.equal(result.conflictStatus, "CONFLICT", "an existing Supertrend must block conflicting snapshot hydration atomically");
    assert.equal(result.conflictCount, 1);
    assert.equal(result.conflictOptions?.color, "#a78bfa", "conflict handling must preserve the already-present overlay");
    assert.equal(result.manyRestoreStatus, "READY", "all runtime-allowed Supertrend instances must survive reload");
    assert.equal(result.manyRestoreCount, 9);
    assert.equal(result.flatMarketStable, true, "a flat market retains the initial downtrend upper band");
    assert.ok(result.updateAverageMs < 100, `forming-bar updates on 5,000 candles must be incremental (avg ${result.updateAverageMs.toFixed(2)} ms)`);
    assert.equal(result.invalidRejected, true, "Supertrend settings must enforce the shared period and color contract");
    assert.equal(result.countBeforeRemoval, 1);
    assert.equal(result.removed, true);
    assert.equal(result.readoutRemoved, true);
    assert.equal(result.countAfterRemoval, 0);
    assert.equal(result.accountResetCount, 0, "account changes must clear the prior account's Supertrend series");
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], "native v5 Supertrend smoke must not call any write endpoint");
    console.log(`PASS: v5 Supertrend matches Beta, persists settings, updates incrementally on 5,000 bars (${result.updateAverageMs.toFixed(2)} ms avg), and uses no write request`);
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
