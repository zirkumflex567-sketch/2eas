"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/+$/, "");
const allowedAccounts = Object.freeze(["titan", "xau5m_m5", "titan_m5", "xau5m_500", "goldm15"]);
const accounts = process.env.CHART_STUDIO_ACCOUNTS
  ? process.env.CHART_STUDIO_ACCOUNTS.split(",").map(value => value.trim()).filter(Boolean)
  : [...allowedAccounts];
assert.ok(accounts.length > 0 && accounts.every(account => allowedAccounts.includes(account)),
  "CHART_STUDIO_ACCOUNTS must contain only approved non-Blueberry demo aliases");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
  const results = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const writes = [], errors = [];
    page.on("request", request => {
      if (!/[?&]account=(?:titan|xau5m_m5|titan_m5|xau5m_500|goldm15)(?:&|$)/.test(request.url()) &&
          request.url().includes("/api/") && !/\/api\/(?:chart\/v1\/capabilities|accounts)(?:\?|$)/.test(request.url())) {
        errors.push(`API request outside demo allowlist: ${request.url()}`);
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && request.url().includes("/api/")) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });
    page.on("pageerror", error => errors.push(error.message));

    for (const account of accounts) {
      await page.goto(`${base}/?account=${encodeURIComponent(account)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(expected => window.ChartStudioBeta?.getState?.().account === expected, account, { timeout: 15000 });
      const catalog = await page.evaluate(async accountId => {
        const response = await fetch(`/api/chart/v1/symbols?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || body.account !== accountId || body.source !== "MT5_VERIFIED" || body.canExecute !== false) {
          throw Error(`${accountId}: broker symbol catalog is not verified`);
        }
        const symbols = Array.isArray(body.symbols) ? body.symbols.map(row => row.symbol) : [];
        return symbols.find(symbol => /^EURUSD(?:\.p)?$/i.test(symbol));
      }, account);
      assert.ok(catalog, `${account}: no verified EURUSD variant`);

      await page.waitForFunction(symbol => {
        const select = document.querySelector("#cs-broker-symbol");
        return [...(select?.options || [])].some(option => option.value === symbol && option.dataset.verified === "true");
      }, catalog, { timeout: 30000 });

      assert.equal(await page.evaluate(symbol => window.ChartStudioBeta.symbol(symbol), catalog), true,
        `${account}: chart refused the broker-verified symbol`);
      try {
        await page.waitForFunction(({ accountId, symbol }) => {
          const state = window.ChartStudioBeta?.getState?.();
          return state?.account === accountId && state?.symbol === symbol && state?.portfolio?.correlation?.scenarioSymbol === symbol;
        }, { accountId: account, symbol: catalog }, { timeout: 30000 });
      } catch (error) {
        const observed = await page.evaluate(() => {
          const state = window.ChartStudioBeta?.getState?.();
          return state && {
            account: state.account,
            symbol: state.symbol,
            correlationSymbol: state.portfolio?.correlation?.scenarioSymbol || null,
            portfolioLoading: document.querySelector("#cs-portfolio-summary")?.innerText || "",
          };
        });
        throw Error(`${account}: portfolio did not settle for ${catalog}; observed ${JSON.stringify(observed)} (${error.message})`);
      }

      const rendered = await page.evaluate(() => ({
        state: window.ChartStudioBeta.getState().portfolio.correlation.state,
        reason: window.ChartStudioBeta.getState().portfolio.correlation.reason || null,
        positions: window.ChartStudioBeta.getState().portfolio.positionCount,
        text: document.querySelector("#cs-portfolio-summary")?.innerText || "",
        impact: document.querySelector("#cs-scenario-portfolio-impact")?.innerText || "",
      }));
      assert.match(rendered.text, new RegExp(`What-if ${catalog.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),
        `${account}: portfolio panel does not show selected What-if symbol`);
      if (rendered.state === "AVAILABLE") {
        assert.match(rendered.text, /H1-Korrelationen .*deskriptiv, kein Hedge-Kredit/,
          `${account}: available correlation lacks descriptive/no-hedge-credit label`);
        assert.match(rendered.text, /EURUSD(?:\.p)? ↔ XAUUSD(?:\.p)? -?\d(?:\.\d+)? · n=\d+/i,
          `${account}: correlation pair/observations are not rendered`);
      } else {
        assert.equal(rendered.state, "UNAVAILABLE", `${account}: correlation state is not explicit`);
        assert.match(rendered.text, /Korrelation zu What-if .* UNAVAILABLE · NO_SYMBOL_PAIRS/,
          `${account}: unavailable state/reason is not visible`);
      }
      results.push({ account, symbol: catalog, positions: rendered.positions, correlation: rendered.state,
        renderedPair: rendered.state === "AVAILABLE" });
    }
    assert.deepEqual(writes, [], "Live correlation chart interaction must not make API writes");
    assert.deepEqual(errors, [], "No browser errors or requests outside the five demo aliases");
    if (accounts.length === allowedAccounts.length) {
      assert.ok(results.some(result => result.correlation === "AVAILABLE"),
        "The complete five-demo run must render at least one live pair");
    }
    console.log(JSON.stringify({ results, browserErrors: errors.length, apiWrites: writes.length, protectedAccountQueried: false }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
