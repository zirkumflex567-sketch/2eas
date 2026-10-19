"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const accounts = Object.freeze(["titan", "titan_m5"]);

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
    const page = await context.newPage();
    const requests = [];
    const forbidden = [];
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const account = url.searchParams.get("account");
      if (account === "blueberry" || request.method() !== "GET") {
        forbidden.push({ method: request.method(), path: url.pathname, account });
        await route.abort();
        return;
      }
      requests.push({ method: request.method(), path: url.pathname, account });
      await route.continue();
    });

    async function openDraft(account) {
      await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
      const toggle = page.locator("#cs-beta-toggle");
      if (!(await toggle.getAttribute("aria-expanded")).includes("true")) await toggle.click();
      await page.waitForFunction(() => document.querySelector("#cs-broker-positions-status")?.textContent.includes("MT5_VERIFIED"));
      const details = page.locator("details.cs-broker-read-panel");
      if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
      const button = page.locator("#cs-broker-positions tbody button[data-cmd='position-draft']").first();
      await button.waitFor({ state: "visible" });
      await button.click();
      const form = page.locator("#cs-position-stop-draft");
      await form.waitFor({ state: "visible" });
      await form.locator("[name='slPrice']").fill("1");
      return form;
    }

    await page.goto(`${base}/?account=${accounts[0]}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(account => window.ChartStudioBeta?.getState()?.account === account, accounts[0]);
    let form = await openDraft(accounts[0]);
    assert.equal(await form.isVisible(), true);
    const accountSwitch = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === accounts[1];
    });
    await page.locator(`#account-switcher [data-account="${accounts[1]}"]`).click();
    await accountSwitch;
    await page.waitForFunction(account => window.ChartStudioBeta?.getState()?.account === account, accounts[1]);
    await page.waitForFunction(() => document.querySelector("#cs-position-stop-draft")?.hidden === true);
    assert.equal(await page.locator("#cs-position-stop-draft").isVisible(), false,
      "account change must discard the prior position draft");

    form = await openDraft(accounts[1]);
    assert.equal(await form.isVisible(), true);
    const timeframeSwitch = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/api/candles" && url.searchParams.get("account") === accounts[1]
        && url.searchParams.get("tf") === "M5";
    });
    await page.locator("#tf-btn-M5").click();
    await timeframeSwitch;
    await page.waitForFunction(() => window.ChartStudioBeta?.getState()?.timeframe === "M5");
    await page.waitForFunction(() => document.querySelector("#cs-position-stop-draft")?.hidden === true);
    assert.equal(await page.locator("#cs-position-stop-draft").isVisible(), false,
      "timeframe change must discard the prior position draft");
    await page.waitForTimeout(100);

    assert.deepEqual(forbidden, [], "no mutation or Blueberry request may leave the browser");
    assert.deepEqual(errors, []);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(row => row.method === "GET" && row.account !== "blueberry"));
    console.log(JSON.stringify({
      accountDraftOpened: accounts[0],
      accountChangeDraftDiscarded: true,
      timeframeDraftOpened: accounts[1],
      timeframeChangeDraftDiscarded: true,
      apiRequests: requests.length,
      apiWrites: forbidden.filter(row => row.method !== "GET").length,
      blueberryQueried: forbidden.some(row => row.account === "blueberry"),
      browserErrors: errors,
    }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
