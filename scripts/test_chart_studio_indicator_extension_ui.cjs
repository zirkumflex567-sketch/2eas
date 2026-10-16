"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

(async () => {
  const server = spawn("python", ["-m", "http.server", "8872", "--bind", "127.0.0.1"],
    { cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = [];
    const posts = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/chart/v1/indicator-extensions/preview", async route => {
      assert.equal(route.request().method(), "POST");
      const body = route.request().postDataJSON();
      posts.push(body);
      assert.equal(body.account, "titan");
      assert.equal(body.symbol, "XAUUSD");
      assert.equal(body.timeframe, "M15");
      assert.equal(body.bars.length, 120);
      assert.equal(body.bars[0].time, 1700000000);
      assert.deepEqual(body.parameters, {});
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          account: "titan", symbol: "XAUUSD", timeframe: "M15",
          indicator: { id: "close-copy", version: "1.0.0", name: "Close copy" },
          source: "CALLER_SUPPLIED_BARS", canExecute: false,
          series: body.bars.map(bar => ({ time: bar.time, value: bar.close }))
        })
      });
    });
    await page.goto("http://127.0.0.1:8872/static/chart-studio-fixture.html", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__chartSmokeReady === true);
    await page.locator("#cs-beta-toggle").click();
    await page.locator(".cs-indicator-extension-panel > summary").click();
    await page.evaluate(() => {
      const chart = window.__chart;
      const add = chart.addLineSeries.bind(chart);
      const remove = chart.removeSeries.bind(chart);
      window.__extensionSeries = [];
      window.__extensionSeriesRemoved = 0;
      chart.addLineSeries = options => {
        const series = add(options);
        if (options.title?.endsWith("· Erweiterung")) window.__extensionSeries.push(series);
        return series;
      };
      chart.removeSeries = series => {
        if (window.__extensionSeries.includes(series)) window.__extensionSeriesRemoved += 1;
        return remove(series);
      };
    });
    const storageBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    const file = Buffer.from(JSON.stringify({ schemaVersion: 1, keyId: "fixture", signature: "signature", manifest: {} }));
    await page.locator("[data-extension-file]").setInputFiles({ name: "close-copy.json", mimeType: "application/json", buffer: file });
    await page.locator("[data-extension-preview]").click();
    await page.waitForFunction(() => document.querySelector("[data-extension-status]")?.textContent.includes("signiert und verifiziert"));
    assert.equal(await page.evaluate(() => window.__extensionSeries.length), 1);
    assert.equal(posts.length, 1);
    assert.match(await page.locator("[data-extension-status]").textContent(), /120 Werte.*CALLER_SUPPLIED_BARS.*nicht ausführbar.*nur aktuelle Sitzung/);
    assert.equal(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort())), storageBefore,
      "extension packages and preview output remain session-only");

    await page.evaluate(() => ChartStudioBeta.account("xau5m_m5"));
    assert.equal(await page.evaluate(() => window.__extensionSeriesRemoved), 1,
      "account switch removes the rendered extension from the price chart");
    assert.match(await page.locator("[data-extension-status]").textContent(), /Konten- oder Zeitrahmenwechsel/);
    assert.deepEqual(errors, []);
    console.log("PASS signed extension browser preview: verified-result rendering, demo account isolation, session-only state");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function waitForServer(server) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("fixture server exited before startup");
    try {
      const response = await fetch("http://127.0.0.1:8872/static/chart-studio-fixture.html");
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("fixture server startup timed out");
}
