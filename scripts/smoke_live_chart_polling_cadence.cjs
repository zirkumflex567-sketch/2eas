"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowedAccounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowedAccounts];
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)), "CHART_STUDIO_ACCOUNTS must exclude Blueberry and unknown aliases");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForQuietChartPoll = async page => {
  let last = await page.evaluate(() => lastCandlePollAt);
  let quietSince = Date.now();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await delay(100);
    const state = await page.evaluate(() => ({ last: lastCandlePollAt, busy: Boolean(candlesBusy) }));
    if (state.last !== last || state.busy) {
      last = state.last;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= 1200) {
      return state.last;
    }
  }
  throw new Error("chart never reached a quiet, settled candle-poll state");
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const reads = [];
  const results = [];
  const failures = [];
  const mutations = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    const account = url.searchParams.get("account");
    assert.notEqual(account, "blueberry", "protected account request");
    if (account) assert.ok(accounts.includes(account), `unexpected account alias ${account}`);
    if (request.method() !== "GET") mutations.push({ method: request.method(), path: url.pathname });
    if (url.pathname === "/api/candles") reads.push({ account, count: url.searchParams.get("count"), at: Date.now() });
  });
  page.on("pageerror", error => failures.push(error.message));
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.pathname === "/api/candles" && response.status() >= 400) {
      failures.push(`${url.searchParams.get("account")}: candle HTTP ${response.status()}`);
    }
  });

  const countFor = account => reads.filter(item => item.account === account).length;
  const waitForNextPoll = async (account, sinceAt, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const item = reads.find(read => read.account === account && read.count === "150" && read.at > sinceAt);
      if (item) return item;
      await delay(100);
    }
    throw new Error(`${account}: no scheduled M15 poll arrived within ${timeoutMs}ms`);
  };

  try {
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      const initial = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/candles" && url.searchParams.get("account") === account;
      }, { timeout: 30000 });
      if (index === 0) await page.goto(`${base}/?account=${account}`, { waitUntil: "domcontentloaded" });
      else {
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
      }
      const response = await initial;
      assert.equal(response.status(), 200, `${account}: initial candle read failed`);
      await page.waitForFunction(id => activeAccount === id && candleHistory.latest?.accountId === id, account, { timeout: 30000 });
      await waitForQuietChartPoll(page);
      const pollStart = await page.evaluate(() => lastCandlePollAt);
      const timeframe = await page.evaluate(() => activeTimeframe);
      const intervalMs = await page.evaluate(() => getCandlePollIntervalMs(activeTimeframe));
      assert.equal(timeframe, "M15", `${account}: active timeframe is not the user-confirmed M15`);
      const baseline = countFor(account);
      assert.ok(baseline >= 1, `${account}: missing initial chart GET`);

      const earlyCheckAt = pollStart + Math.max(1000, intervalMs - 1500);
      await delay(Math.max(0, earlyCheckAt - Date.now()));
      assert.equal(countFor(account), baseline, `${account}: poll fired before cadence (${timeframe}, ${intervalMs}ms, ${JSON.stringify(reads.filter(read => read.account === account))})`);
      const poll = await waitForNextPoll(account, earlyCheckAt);
      const elapsedMs = poll.at - pollStart;
      assert.ok(elapsedMs >= intervalMs - 1500, `${account}: poll was too early (${elapsedMs}ms; ${timeframe})`);
      assert.ok(elapsedMs <= 25000, `${account}: poll was too late (${elapsedMs}ms)`);
      results.push({ account, timeframe, intervalMs, initialGets: baseline, scheduledPollElapsedMs: elapsedMs });
    }

    assert.deepEqual(mutations, []);
    assert.deepEqual(failures, []);
    console.log(JSON.stringify({ results, candleGets: reads.length, mutations, failures, blueberryQueried: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
