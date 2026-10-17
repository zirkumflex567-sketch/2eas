"use strict";

// AT-029 live acceptance for visual-only Chart-FX demo buttons.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const ACCOUNTS = ["titan", "xau5m_m5", "titan_m5", "xau5m_500"];
const SYMBOLS = { titan: "XAUUSD", xau5m_m5: "XAUUSD.p", titan_m5: "XAUUSD.p", xau5m_500: "XAUUSD.p" };
const FORBIDDEN = new Set(["blueberry"]);

(async () => {
  let browser;
  try {
    const before = await readPositions();
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const requests = [];
    const blocked = [];
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const account = url.searchParams.get("account");
      requests.push({ method: request.method(), account, path: url.pathname });
      if ((account && FORBIDDEN.has(account)) || request.method() !== "GET") {
        blocked.push({ method: request.method(), account, path: url.pathname });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    const first = ACCOUNTS[0];
    await page.goto(`${BASE_URL}/?account=${first}`, { waitUntil: "domcontentloaded" });
    await page.locator(`#account-switcher [data-account="${first}"][aria-pressed="true"]`).waitFor();
    const fxToggle = page.locator("#stone-fx-toggle");
    await fxToggle.waitFor({ state: "visible", timeout: 15000 });
    const soundToggle = page.locator("#stone-sound-toggle");
    if ((await soundToggle.textContent()).includes("Sound: AN")) await soundToggle.click();
    await fxToggle.click();
    const panel = page.locator("#stone-fx-panel");
    await panel.waitFor({ state: "visible" });

    const results = [];
    for (let index = 0; index < ACCOUNTS.length; index++) {
      const account = ACCOUNTS[index];
      if (FORBIDDEN.has(account)) throw new Error("Protected account entered the demo allowlist");
      if (index > 0) {
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
      }
      const effects = [
        { mode: "mystic", test: "trade", expected: /Demo: Trade-Impuls gestartet\./ },
        { mode: "ritual", test: "profit", expected: /Demo: Gewinn-Eskalation gestartet\./ },
        { mode: "chaos", test: "chaos", expected: /Demo: Chaos \/ Stop-Loss Test mit Sound & Effekten\./ },
      ];
      for (const effect of effects) {
        await panel.locator(`[data-fx-mode="${effect.mode}"]`).click();
        await panel.locator(`[data-fx-test="${effect.test}"]`).click();
        await page.waitForFunction(expected => {
          const text = document.querySelector("#stone-fx-info")?.textContent || "";
          return new RegExp(expected).test(text);
        }, effect.expected.source, { timeout: 5000 });
        const status = await panel.locator("#stone-fx-info").textContent();
        assert.match(status, effect.expected, `${account}: FX demo did not complete`);
      }
      results.push({ account, symbol: SYMBOLS[account], tests: effects.map(effect => effect.test) });
    }

    assert.deepEqual(blocked, [], "a non-GET or protected-account API request was blocked");
    assert.deepEqual(pageErrors, [], "browser errors during visual-FX acceptance");
    assert.ok(requests.every(request => request.method === "GET" &&
      (request.account === null || ACCOUNTS.includes(request.account))),
    `unexpected API request scope: ${JSON.stringify(requests.filter(request => request.method !== "GET" ||
      (request.account !== null && !ACCOUNTS.includes(request.account))))}`);
    const after = await readPositions();
    assert.deepEqual(after, before, "MT5 open positions or SL/TP changed during visual-only FX tests");
    console.log("PASS live Chart-FX demo buttons remain read-only:", JSON.stringify({
      results, apiRequests: requests.length, mutations: 0, browserErrors: 0, positionsUnchanged: true,
    }));
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function readPositions() {
  const result = [];
  for (const account of ACCOUNTS) {
    const symbol = SYMBOLS[account];
    const response = await fetch(`${BASE_URL}/api/chart/v1/positions?account=${account}&symbol=${encodeURIComponent(symbol)}`);
    assert.equal(response.status, 200, `${account}: position read failed`);
    const payload = await response.json();
    assert.equal(payload.source, "MT5_VERIFIED", `${account}: position read was not broker-verified`);
    assert.equal(payload.canExecute, false, `${account}: position data is unexpectedly executable`);
    result.push({ account, symbol, positions: (payload.positions || []).map(position => ({
      ticket: position.ticket,
      identifier: position.identifier,
      side: position.side,
      volume: position.volume,
      priceOpen: position.priceOpen,
      sl: position.sl,
      tp: position.tp,
      revision: position.revision,
    })).sort((left, right) => left.ticket.localeCompare(right.ticket)) });
  }
  return result;
}
