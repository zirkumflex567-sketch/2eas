"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

async function addAlert(page, panelId, storageMode) {
  return page.evaluate(({ panelId, storage }) => {
    const panel = document.getElementById(panelId);
    const options = { panel, getContext: () => ({ account: "titan", symbol: "XAUUSD", timeframe: "M15" }) };
    if (storage === "blocked-write") options.storage = {
      getItem() { return null; },
      setItem() { throw new DOMException("Quota exceeded", "QuotaExceededError"); }
    };
    const alerts = window.ChartStudioAlerts.mount(options);
    const input = panel.querySelector('[aria-label="Preisalarm Preis"]');
    input.value = "4100.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    panel.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return {
      mounted: Boolean(alerts),
      alertCount: alerts.getState().alerts.length,
      notice: panel.querySelector(".cs-alert-storage-notice")?.textContent || "",
      status: panel.querySelector('[role="status"]')?.textContent || ""
    };
  }, { panelId, storage: storageMode });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("Storage is blocked", "SecurityError"); }
      });
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
    });
    await page.setContent('<main><div id="blocked-getter"></div><div id="blocked-write"></div></main>');
    await page.addScriptTag({ path: path.resolve("static/chart-studio-alerts.js") });

    const blockedGetter = await addAlert(page, "blocked-getter");
    assert.equal(blockedGetter.mounted, true, "A blocked localStorage getter must not prevent alerts mounting");
    assert.equal(blockedGetter.alertCount, 1, "Alerts still work in memory when browser storage is unavailable");
    assert.match(blockedGetter.notice, /nur in diesem Tab|lokaler Speicher/i, "The UI explains that persistence is unavailable");

    const blockedWrite = await addAlert(page, "blocked-write", "blocked-write");
    assert.equal(blockedWrite.alertCount, 1, "A failed persistence write must not discard the in-memory alert");
    assert.match(blockedWrite.notice, /nur in diesem Tab|lokaler Speicher/i, "Write failures remain visible after rendering the alert");
    console.log("PASS Price alerts remain usable and visibly temporary when local persistence is blocked");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
