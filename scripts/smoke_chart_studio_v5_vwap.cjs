"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const server = spawn("python", ["-m", "http.server", "8876", "--bind", "127.0.0.1"],
    { cwd: process.cwd(), windowsHide: true, stdio: "pipe" });
  let browser;
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw new Error("Fixture HTTP server crashed");
      try {
        if ((await fetch("http://127.0.0.1:8876/chart_studio_v5/fixture.html")).ok) break;
      } catch (_) { /* wait for the fixture server */ }
      if (attempt === 79) throw new Error("Fixture server unavailable");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:8876/chart_studio_v5/fixture.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__chartV5Ready === true);
    await page.addScriptTag({ path: path.resolve("static/chart-studio-beta.js") });
    await page.addScriptTag({ path: path.resolve("static/chart-studio-indicators.js") });

    const result = await page.evaluate(() => {
      const bars = [
        { time: Date.parse("2026-03-28T08:00:00Z") / 1000, open: 9, high: 12, low: 8, close: 10, tick_volume: 10 },
        { time: Date.parse("2026-03-28T09:00:00Z") / 1000, open: 19, high: 22, low: 18, close: 20, real_volume: 100, tick_volume: 999 },
        { time: Date.parse("2026-03-29T06:30:00Z") / 1000, open: 29, high: 32, low: 28, close: 30, tick_volume: 20 },
        { time: Date.parse("2026-03-29T07:15:00Z") / 1000, open: 39, high: 42, low: 38, close: 40, real_volume: 0, tick_volume: 0 },
        { time: Date.parse("2026-03-29T07:30:00Z") / 1000, open: 49, high: 52, low: 48, close: 50, real_volume: 50, tick_volume: 50 },
        { time: Date.parse("2026-03-29T07:45:00Z") / 1000, open: 59, high: 62, low: 58, close: 60, tick_volume: 10 },
      ];
      const settings = { timeZone: "Europe/Berlin", sessionStart: "09:30" };
      return {
        available: typeof ChartStudioV5.calculateSessionVwap === "function",
        actual: typeof ChartStudioV5.calculateSessionVwap === "function"
          ? ChartStudioV5.calculateSessionVwap(bars, settings) : null,
        expected: ChartStudioIndicators.math.vwap(bars, settings),
      };
    });
    assert.equal(result.available, true, "native v5 exports the session-aware VWAP calculator");
    assert.deepEqual(result.actual.points, result.expected,
      "native VWAP matches Beta across wall-clock session resets, DST, volume fallback and zero-volume bars");
    assert.equal(result.actual.volumeSource, "MIXED");
    const overlay = await page.evaluate(() => {
      const bars = [
        { time: Date.parse("2026-03-28T08:00:00Z") / 1000, open: 9, high: 12, low: 8, close: 10, tick_volume: 10 },
        { time: Date.parse("2026-03-28T09:00:00Z") / 1000, open: 19, high: 22, low: 18, close: 20, real_volume: 100, tick_volume: 999 },
        { time: Date.parse("2026-03-29T06:30:00Z") / 1000, open: 29, high: 32, low: 28, close: 30, tick_volume: 20 },
        { time: Date.parse("2026-03-29T07:15:00Z") / 1000, open: 39, high: 42, low: 38, close: 40, real_volume: 0, tick_volume: 0 },
        { time: Date.parse("2026-03-29T07:30:00Z") / 1000, open: 49, high: 52, low: 48, close: 50, real_volume: 50, tick_volume: 50 },
        { time: Date.parse("2026-03-29T07:45:00Z") / 1000, open: 59, high: 62, low: 58, close: 60, tick_volume: 10 },
      ];
      const host = document.createElement("div"); host.style.cssText = "width:800px;height:420px;position:fixed;left:-2000px;top:0"; document.body.append(host);
      const engine = ChartStudioV5.createStudioV5(host, "vwap-account", { symbol: "XAUUSD", timeframe: "M15" });
      engine.setCandles(bars);
      const added = engine.addSessionVwap({ id: "session-vwap", color: "#55d7ee", timeZone: "Europe/Berlin", sessionStart: "09:30" });
      const initial = engine.inspect();
      const lastTime = bars[bars.length - 1].time;
      const initialReadout = engine.readDataWindow(lastTime).indicators.find(item => item.id === "session-vwap");
      const forming = { ...bars[bars.length - 1], high: 64, close: 63, tick_volume: 30 };
      engine.updateLast(forming);
      const formingState = engine.inspect();
      const formingExpected = ChartStudioIndicators.math.vwap([...bars.slice(0, -1), forming], { timeZone: "Europe/Berlin", sessionStart: "09:30" });
      const appended = { time: lastTime + 900, open: 69, high: 72, low: 68, close: 70, real_volume: 5, tick_volume: 500 };
      engine.updateLast(appended);
      const appendedState = engine.inspect();
      const appendedExpected = ChartStudioIndicators.math.vwap([...bars.slice(0, -1), forming, appended], { timeZone: "Europe/Berlin", sessionStart: "09:30" });
      const beforeRejectedUpdate = engine.inspect();
      let invalidRejected = false;
      try { engine.updateSessionVwap("session-vwap", { timeZone: "Invalid/Timezone" }); } catch (_) { invalidRejected = true; }
      const afterRejectedUpdate = engine.inspect();
      const changed = engine.updateSessionVwap("session-vwap", { sessionStart: "08:00" });
      const changedOptions = engine.sessionVwapOptions("session-vwap");
      const accountCleared = (engine.changeAccount("another-demo"), engine.inspect().sessionVwapCount === 0);
      engine.destroy(); host.remove();
      const limitHost = document.createElement("div"); limitHost.style.cssText = "width:800px;height:420px;position:fixed;left:-2000px;top:0"; document.body.append(limitHost);
      const limited = ChartStudioV5.createStudioV5(limitHost, "vwap-limit", { symbol: "XAUUSD", timeframe: "M15" });
      limited.setCandles(bars);
      for (let index = 0; index < 20; index += 1) limited.addAverage({ id: `limit-${index}`, color: "#ffffff" }, []);
      let capRejected = false; try { limited.addSessionVwap({ id: "limited-vwap", color: "#55d7ee" }); } catch (_) { capRejected = true; }
      limited.removeAverage("limit-19");
      const acceptedAfterRemoval = !!limited.addSessionVwap({ id: "limited-vwap", color: "#55d7ee" });
      const limitCount = limited.inspect().sessionVwapCount;
      const removed = limited.removeSessionVwap("limited-vwap");
      const cleared = limited.inspect().sessionVwapCount === 0;
      limited.destroy(); limitHost.remove();
      const persistenceHost = document.createElement("div"); persistenceHost.style.cssText = "width:800px;height:420px;position:fixed;left:-2000px;top:0"; document.body.append(persistenceHost);
      const persistScope = { symbol: "XAUUSD", timeframe: "M15" };
      let persisted = ChartStudioV5.createStudioV5(persistenceHost, "vwap-persist-account", persistScope);
      persisted.setCandles(bars);
      persisted.addSessionVwap({ id: "persisted-vwap", color: "#55d7ee", timeZone: "Europe/Berlin", sessionStart: "09:30", title: "London VWAP" });
      const savedRaw = localStorage.getItem("2eas.chartstudio.v5.drawings:v5:vwap-persist-account:XAUUSD:M15");
      const saved = savedRaw ? JSON.parse(savedRaw) : null;
      persisted.destroy();
      persisted = ChartStudioV5.createStudioV5(persistenceHost, "vwap-persist-account", persistScope);
      persisted.setCandles(bars);
      const restoredOptions = persisted.sessionVwapOptions("persisted-vwap");
      const restoredCount = persisted.inspect().sessionVwapCount;
      const otherAccount = ChartStudioV5.createStudioV5(persistenceHost, "different-vwap-account", persistScope);
      otherAccount.setCandles(bars);
      const otherAccountCount = otherAccount.inspect().sessionVwapCount;
      const migrationAccount = "vwap-schema-migration", oldKey = `2eas.chartstudio.v5.drawings:v4:${migrationAccount}:XAUUSD:M15`, newKey = `2eas.chartstudio.v5.drawings:v5:${migrationAccount}:XAUUSD:M15`;
      const oldSnapshot = { ...saved, schemaVersion: 3, account: migrationAccount }; delete oldSnapshot.sessionVwaps;
      const oldSnapshotRaw = JSON.stringify(oldSnapshot); localStorage.setItem(oldKey, oldSnapshotRaw);
      const migration = ChartStudioV5.createStudioV5(persistenceHost, migrationAccount, persistScope);
      migration.setCandles(bars);
      const migratedSnapshotRaw = localStorage.getItem(newKey), preservedOldSnapshot = localStorage.getItem(oldKey) === oldSnapshotRaw;
      const migratedSchemaVersion = migratedSnapshotRaw ? JSON.parse(migratedSnapshotRaw).schemaVersion : null;
      const migrationStatus = migration.inspect().persistenceStatus, migrationError = migration.inspect().persistenceError;
      migration.destroy(); otherAccount.destroy(); persisted.destroy(); persistenceHost.remove();
      return { added, initialCount: initial.sessionVwapCount, initialSource: initial.sessionVwapSeries[0]?.volumeSource,
        initialReadout, formingCount: formingState.sessionVwapCount, formingPoints: formingState.sessionVwapSeries[0]?.points,
        formingExpected, appendedCount: appendedState.sessionVwapCount, appendedPoints: appendedState.sessionVwapSeries[0]?.points, appendedExpected,
        invalidRejected, atomicInvalid: JSON.stringify(beforeRejectedUpdate.sessionVwapSeries) === JSON.stringify(afterRejectedUpdate.sessionVwapSeries),
        changed: !!changed, changedOptions, accountCleared, capRejected, acceptedAfterRemoval, limitCount, removed, cleared,
        savedSchemaVersion: saved?.schemaVersion, savedVwaps: saved?.sessionVwaps, restoredOptions, restoredCount, otherAccountCount,
        migratedSchemaVersion, preservedOldSnapshot, migrationStatus, migrationError };
    });
    assert.equal(overlay.initialCount, 1, "session VWAP creates one native line");
    assert.equal(overlay.initialSource, "MIXED");
    assert.equal(overlay.initialReadout.state, "AVAILABLE", "native VWAP appears in the candle data window");
    assert.match(overlay.initialReadout.title, /Real\/tick-volume mix/);
    assert.equal(overlay.formingCount, 1, "forming-bar updates do not duplicate the VWAP line");
    assert.deepEqual(overlay.formingPoints, overlay.formingExpected, "forming-bar changes replace the latest VWAP value");
    assert.equal(overlay.appendedCount, 1, "new bars do not duplicate the VWAP line");
    assert.deepEqual(overlay.appendedPoints, overlay.appendedExpected, "new bars continue the session VWAP correctly");
    assert.equal(overlay.invalidRejected, true);
    assert.equal(overlay.atomicInvalid, true, "invalid session update preserves the existing VWAP");
    assert.equal(overlay.changedOptions.sessionStart, "08:00");
    assert.equal(overlay.accountCleared, true, "account switches clear account-scoped overlays");
    assert.equal(overlay.capRejected, true, "VWAP counts against the shared 20-indicator cap");
    assert.equal(overlay.acceptedAfterRemoval, true);
    assert.equal(overlay.limitCount, 1);
    assert.equal(overlay.removed, true);
    assert.equal(overlay.cleared, true);
    assert.equal(overlay.savedSchemaVersion, 4, "VWAP profile storage advances to schema v4");
    assert.deepEqual(overlay.savedVwaps, [{ id: "persisted-vwap", color: "#55d7ee", title: "London VWAP", visible: true, timeZone: "Europe/Berlin", sessionStart: "09:30" }]);
    assert.deepEqual(overlay.restoredOptions, overlay.savedVwaps[0], "native v5 session VWAP survives scoped reload");
    assert.equal(overlay.restoredCount, 1);
    assert.equal(overlay.otherAccountCount, 0, "VWAP settings do not cross account scope");
    assert.equal(overlay.migratedSchemaVersion, 4, "prior v4-key schema-v3 snapshots migrate to the new key");
    assert.equal(overlay.preservedOldSnapshot, true, "migration leaves the rollback snapshot untouched");
    assert.deepEqual(errors, [], "native v5 VWAP smoke has no browser errors");
    console.log("PASS native v5 session VWAP calculation:", JSON.stringify({
      points: result.actual.points.length, volumeSource: result.actual.volumeSource,
      overlay: { formingPoints: overlay.formingPoints.length, capRejected: overlay.capRejected,
        invalidUpdateAtomic: overlay.atomicInvalid, accountClear: overlay.accountCleared }, browserErrors: 0,
    }));
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) server.kill();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
