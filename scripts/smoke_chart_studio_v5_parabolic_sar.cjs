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
      const host = document.createElement("div"); host.style.cssText = "width:800px;height:500px"; document.body.append(host);
      const bars = Array.from({ length: 90 }, (_, i) => {
        const close = i < 46 ? 2100 + i * .7 : 2132 - (i - 46) * .85;
        return { time: 1713000000 + i * 900, open: close - .3, high: close + 1 + (i % 4) * .1,
          low: close - 1.1 - (i % 3) * .1, close };
      });
      const engine = ChartStudioV5.createStudioV5(host, "sar-parity", { symbol: "XAUUSD", timeframe: "M15" });
      engine.setCandles(bars);
      const apiAvailable = ["addParabolicSar", "updateParabolicSar", "removeParabolicSar", "parabolicSarOptions"].every(key => typeof engine[key] === "function");
      if (!apiAvailable) { engine.destroy(); host.remove(); return { apiAvailable }; }
      engine.addParabolicSar({ id: "sar-1", step: .02, maxStep: .2, color: "#41d89a" });
      const reference = input => ChartStudioIndicators.calculate("sar", input, { step: .02, maxStep: .2 }).sar;
      const matches = (input, expected) => input.every(bar => {
        const actual = engine.readDataWindow(bar.time).indicators.find(item => item.id === "sar-1");
        const wanted = expected.find(item => item.time === bar.time);
        return wanted ? actual?.state === "AVAILABLE" && Math.abs(actual.value - wanted.value) < 1e-8 && actual.direction === wanted.trend
          : actual?.state !== "AVAILABLE";
      });
      const initialMatches = matches(bars, reference(bars));
      const initialOptions = engine.parabolicSarOptions("sar-1");
      const updated = engine.updateParabolicSar("sar-1", { step: .03, maxStep: .3, color: "#a78bfa" });
      const updatedMatches = bars.every(bar => {
        const actual = engine.readDataWindow(bar.time).indicators.find(item => item.id === "sar-1");
        const wanted = ChartStudioIndicators.calculate("sar", bars, { step: .03, maxStep: .3 }).sar.find(item => item.time === bar.time);
        return wanted ? actual?.state === "AVAILABLE" && Math.abs(actual.value - wanted.value) < 1e-8 && actual.direction === wanted.trend : actual?.state !== "AVAILABLE";
      });
      let invalidRejected = false;
      try { engine.updateParabolicSar("sar-1", { step: .04, maxStep: .03 }); } catch (_) { invalidRejected = true; }
      const rejectedUpdatePreservedOptions = JSON.stringify(engine.parabolicSarOptions("sar-1")) === JSON.stringify(updated);
      const forming = { ...bars.at(-1), close: bars.at(-1).close - 4, low: bars.at(-1).low - 4 };
      engine.updateLast(forming);
      const formingBars = [...bars.slice(0, -1), forming], formingMatches = matches(formingBars, ChartStudioIndicators.calculate("sar", formingBars, { step: .03, maxStep: .3 }).sar);
      const repeat = { ...forming, close: forming.close + 2, high: forming.high + 2 };
      engine.updateLast(repeat);
      const repeatedBars = [...bars.slice(0, -1), repeat], repeatedMatches = matches(repeatedBars, ChartStudioIndicators.calculate("sar", repeatedBars, { step: .03, maxStep: .3 }).sar);
      const appended = { ...repeat, time: repeat.time + 900, open: repeat.close, close: repeat.close + .4, high: repeat.close + 1, low: repeat.close - .8 };
      engine.updateLast(appended);
      const appendedBars = [...repeatedBars, appended], appendedMatches = matches(appendedBars, ChartStudioIndicators.calculate("sar", appendedBars, { step: .03, maxStep: .3 }).sar);
      const replacement = bars.map(bar => ({ ...bar, open: bar.open + 25, high: bar.high + 25, low: bar.low + 25, close: bar.close + 25 }));
      engine.setCandles(replacement);
      const replacementMatches = matches(replacement, ChartStudioIndicators.calculate("sar", replacement, { step: .03, maxStep: .3 }).sar);
      let duplicateRejected = false;
      try { engine.addAverage({ id: "sar-1", color: "#ffffff" }, []); } catch (_) { duplicateRejected = true; }
      const beforeRemove = engine.inspect().parabolicSarCount, removed = engine.removeParabolicSar("sar-1");
      const readoutRemoved = !engine.readDataWindow(replacement.at(-1).time).indicators.some(item => item.id === "sar-1");
      engine.addParabolicSar({ id: "sar-reset", step: .02, maxStep: .2, color: "#41d89a" });
      engine.changeAccount("other-sar-account");
      const accountResetCount = engine.inspect().parabolicSarCount;
      engine.destroy(); host.remove();
      const limitHost = document.createElement("div"); limitHost.style.cssText = "width:800px;height:500px"; document.body.append(limitHost);
      const limitEngine = ChartStudioV5.createStudioV5(limitHost, "sar-instance-limit"); limitEngine.setCandles(bars);
      for (let i = 0; i < 19; i++) limitEngine.addAverage({ id: `average-${i}`, color: "#ffffff" }, []);
      limitEngine.addParabolicSar({ id: "sar-final-slot", step: .02, maxStep: .2, color: "#41d89a" });
      let sharedLimitRejected = false;
      try { limitEngine.addParabolicSar({ id: "sar-over-limit", step: .02, maxStep: .2, color: "#41d89a" }); } catch (_) { sharedLimitRejected = true; }
      limitEngine.destroy(); limitHost.remove();
      return { apiAvailable, initialMatches, initialOptions, updated, updatedMatches, invalidRejected, rejectedUpdatePreservedOptions,
        formingMatches, repeatedMatches, appendedMatches, replacementMatches, beforeRemove, removed, readoutRemoved, accountResetCount,
        duplicateRejected, sharedLimitRejected };
    });
    assert.equal(result.apiAvailable, true, "native v5 must expose Parabolic SAR overlay operations");
    assert.equal(result.initialMatches, true, "closed-bar values and directions must match Beta SAR");
    assert.deepEqual(result.initialOptions, { id: "sar-1", step: .02, maxStep: .2, color: "#41d89a", visible: true });
    assert.deepEqual(result.updated, { id: "sar-1", step: .03, maxStep: .3, color: "#a78bfa", visible: true });
    assert.equal(result.updatedMatches, true, "AF setting changes must rebuild the SAR series");
    assert.equal(result.invalidRejected, true, "maximum AF below step must be rejected");
    assert.equal(result.rejectedUpdatePreservedOptions, true, "invalid settings must be atomic");
    assert.equal(result.formingMatches, true, "forming-bar replacement must use its pre-bar checkpoint");
    assert.equal(result.repeatedMatches, true, "repeated same-bar updates must not advance AF twice");
    assert.equal(result.appendedMatches, true, "a new closed bar must continue state exactly once");
    assert.equal(result.replacementMatches, true, "history replacement must rebuild SAR");
    assert.equal(result.beforeRemove, 1);
    assert.equal(result.removed, true);
    assert.equal(result.readoutRemoved, true);
    assert.equal(result.accountResetCount, 0, "account changes must clear prior account SAR state");
    assert.equal(result.duplicateRejected, true, "SAR ids must share the chart's global object identity namespace");
    assert.equal(result.sharedLimitRejected, true, "SAR counts toward the shared 20-indicator limit");
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], "native v5 SAR must not issue write requests");
    console.log("PASS: native v5 Parabolic SAR matches Beta, handles same-bar state, and remains read-only");
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
