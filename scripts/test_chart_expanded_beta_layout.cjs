"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:8867";

(async () => {
  const server = spawn("python", ["-m", "http.server", "8867", "--bind", "127.0.0.1"], {
    cwd: process.cwd(), windowsHide: true, stdio: "ignore",
  });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${origin}/static/chart-studio-fixture.html`)).ok) break;
      } catch (_) {}
      if (i === 59) throw new Error("fixture server timed out");
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1728, height: 1469 } });
    await page.route("**/api/**", route => route.abort());
    await page.goto(`${origin}/static/chart-studio-fixture.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__chartSmokeReady === true);
    await page.evaluate(() => {
      const card = document.querySelector(".glass-card");
      const frame = document.querySelector(".frame");
      const stage = document.createElement("div");
      const volume = document.createElement("aside");
      stage.className = "stone-chart-stage";
      frame.classList.add("chart-slot");
      frame.parentNode.insertBefore(stage, frame);
      stage.append(frame);
      volume.className = "stone-side-volume";
      volume.textContent = "Volume profile";
      stage.append(volume);
      card.classList.add("stone-chart-expanded");
      document.body.classList.add("stone-chart-is-expanded");
    });
    await page.locator("#cs-beta-toggle").click();

    const layout = await page.evaluate(() => {
      const panel = document.querySelector("#cs-beta-panel");
      const stage = document.querySelector(".stone-chart-stage");
      const chart = document.querySelector("#tv-chart");
      return {
        panelHeight: panel.getBoundingClientRect().height,
        panelScrollHeight: panel.scrollHeight,
        stageHeight: stage.getBoundingClientRect().height,
        chartHeight: chart.getBoundingClientRect().height,
        chartCanvases: chart.querySelectorAll("canvas").length,
      };
    });

    assert.ok(layout.panelHeight <= 540,
      `expanded Chart Studio panel should scroll within 540px; got ${layout.panelHeight}px`);
    assert.ok(layout.panelScrollHeight > layout.panelHeight,
      "the complete Chart Studio controls remain reachable by scrolling");
    assert.ok(layout.chartHeight >= 300,
      `expanded chart should retain at least 300px while Studio is open; got ${layout.chartHeight}px`);
    assert.ok(layout.chartCanvases >= 5, "the mounted live chart canvases remain present");

    console.log("PASS expanded Chart Studio keeps the chart visible and panel scrollable", JSON.stringify(layout));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
