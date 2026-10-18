"use strict";

// Read-only live acceptance for recorded trade snapshots. Never defaults to
// the protected Blueberry challenge account and never submits API mutations.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE_URL = (process.env.CHART_STUDIO_BASE_URL || "http://127.0.0.1:8056").replace(/\/$/, "");
const DEMO_ACCOUNTS = ["titan", "xau5m_m5", "titan_m5", "xau5m_500"];
const forbiddenAccounts = new Set(["blueberry"]);

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const apiRequests = [];
    const mtfReads = [];
    const mutations = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.includes("/api/")) return;
      const account = url.searchParams.get("account");
      apiRequests.push({ method: request.method(), account, path: url.pathname, revision: url.searchParams.get("revision") });
      if (url.pathname === "/api/candles") mtfReads.push({ method: request.method(), account, symbol: url.searchParams.get("symbol"), timeframe: url.searchParams.get("tf"), before: url.searchParams.get("before") });
      if (request.method() !== "GET") mutations.push({ method: request.method(), path: url.pathname });
      if (account && forbiddenAccounts.has(account)) {
        mutations.push({ method: "FORBIDDEN_ACCOUNT_READ", path: url.pathname });
      }
    });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    // The first navigation is always explicitly demo-scoped; do not load the
    // app's default account before selecting a permitted demo.
    await page.goto(`${BASE_URL}/?account=${DEMO_ACCOUNTS[0]}`, { waitUntil: "domcontentloaded" });
    await page.locator(`#account-switcher [data-account="${DEMO_ACCOUNTS[0]}"][aria-pressed="true"]`).waitFor();
    await page.locator("#cs-beta-toggle").click();
    const panel = page.locator("#cs-evidence-panel");
    await panel.locator(":scope > summary").click();
    await panel.locator("#cs-evidence-kind").selectOption("SNAPSHOT");

    const observations = [];
    for (let index = 0; index < DEMO_ACCOUNTS.length; index++) {
      const account = DEMO_ACCOUNTS[index];
      if (forbiddenAccounts.has(account)) throw new Error("Protected account entered demo allowlist");
      if (index > 0) {
        await page.locator(`#account-switcher [data-account="${account}"]`).click();
        await page.locator(`#account-switcher [data-account="${account}"][aria-pressed="true"]`).waitFor();
        await assertEventually(async () => assert.equal(await panel.locator("#cs-evidence-list li").count(), 0));
      }

      await panel.locator("#cs-evidence-kind").selectOption("SNAPSHOT");
      await panel.locator("#cs-evidence-load").click();
      await page.waitForFunction(() => {
        const status = document.querySelector("#cs-evidence-status")?.textContent || "";
        return !status.includes("Aufzeichnungen werden gelesen");
      }, null, { timeout: 20000 });
      const status = await panel.locator("#cs-evidence-status").textContent();
      assert.match(status, /Store: INITIALIZED/, `${account}: evidence store unavailable (${status})`);
      const rows = panel.locator("#cs-evidence-list > li");
      const count = await rows.count();
      assert.ok(count > 0, `${account}: no recorded snapshot rows`);

      const records = await rows.locator("pre").evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent)));
      let entries = 0;
      let exits = 0;
      let candleCount = 0;
      for (const record of records) {
        assert.equal(record.type, "SNAPSHOT", `${account}: unexpected evidence type`);
        assert.equal(record.provenance, "RECORDED", `${account}: unrecorded snapshot`);
        assert.equal(record.accountId, account, `${account}: cross-account evidence`);
        assert.ok(record.payload.lifecycleEventIds?.some(event => event.type === "LIFECYCLE"), `${account}: missing deal link`);
        assert.equal(record.payload.chartView.timeframe, "M15", `${account}: snapshot timeframe drifted`);
        assert.ok(record.payload.marketData?.bars?.length > 0 && record.payload.marketData.bars.length <= 150,
          `${account}: invalid frozen candle range`);
        candleCount += record.payload.marketData.bars.length;
        if (record.payload.captureType === "ENTRY") entries++;
        else if (record.payload.captureType === "EXIT") exits++;
        else assert.fail(`${account}: unknown capture type`);
      }

      await rows.first().locator("details > summary").click();
      await rows.first().locator("canvas.cs-evidence-chart").waitFor({ state: "visible" });
      const caption = await rows.first().locator(".cs-evidence-chart-caption").textContent();
      assert.match(caption, /M15 · gespeicherte OHLC/);
      if (index === 0) {
        const pngDownloadPromise = page.waitForEvent("download");
        await rows.first().locator("button.cs-evidence-png-export").click();
        const pngDownload = await pngDownloadPromise;
        assert.equal(pngDownload.suggestedFilename(), `chart-snapshot-${account}-${records[0].id}.png`);
        const pngBytes = fs.readFileSync(await pngDownload.path());
        assert.deepEqual([...pngBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      }

      // A current-chart timeframe change must not reinterpret the historical
      // broker snapshot or inject today's indicators into the saved chart.
      if (index === 0) {
        await page.locator("#tf-btn-M5").click();
        await page.waitForFunction(() => document.querySelector("#tf-btn-M5")?.classList.contains("bg-blue-600"));
        assert.equal(await rows.first().locator(".cs-evidence-chart-caption").textContent(), caption);
        assert.equal(await rows.first().locator("canvas.cs-evidence-chart").count(), 1);
      }
      const lifecycleRefs = records[0].payload.lifecycleEventIds || [];
      assert.ok(lifecycleRefs.length > 0, `${account}: snapshot replay needs an exact lifecycle reference`);
      await rows.first().locator("button.cs-evidence-snapshot-replay").click();
      await page.waitForFunction(() => {
        const status = document.querySelector(".cs-evidence-snapshot-replay-status")?.textContent || "";
        return status.includes("RECORDED ·") || status.includes("Replay nicht verfügbar");
      });
      const replayStatus = await rows.first().locator(".cs-evidence-snapshot-replay-status").textContent();
      assert.match(replayStatus, /RECORDED · \d+ eingefrorene Bars/, `${account}: actual referenced-event replay failed (${replayStatus})`);
      assert.ok(apiRequests.some(request => request.path.endsWith(`/lifecycle/${encodeURIComponent(lifecycleRefs[0].id)}`)
        && request.account === account && request.method === "GET"
        && request.revision === String(lifecycleRefs[0].dataRevision)), `${account}: replay did not read its exact lifecycle record and revision`);
      const snapshot = records[0], snapshotSymbol = snapshot.payload.chartView.symbol;
      assert.equal(await rows.first().locator("button.cs-evidence-snapshot-mtf").count(), 1, `${account}: missing historical MTF action`);
      await rows.first().locator("button.cs-evidence-snapshot-mtf").click();
      await assertEventually(async () => assert.match(await rows.first().locator(".cs-evidence-snapshot-mtf-status").textContent(), /MTF-Kontext geladen/), 30000);
      await assertEventually(async () => assert.match(await page.locator(".cs-mtf-panel [data-mtf-status]").textContent(), /Abfrage abgeschlossen|Unvollständige Quellenantwort/), 30000);
      const rowsMtf = await page.locator(".cs-mtf-panel tbody tr").evaluateAll(nodes => nodes.map(row => ({ timeframe: row.cells[0].textContent.trim(), state: row.cells[1].textContent.trim(), emaContext: row.cells[3].textContent.trim(), sourceTime: row.cells[4].textContent.trim(), closedBars: Number(row.cells[5].textContent.trim()) })));
      assert.deepEqual(rowsMtf.map(row => row.timeframe), ["D1", "H4", "H1", "M15", "M5"], `${account}: MTF timeframe coverage drifted`);
      assert.ok(rowsMtf.every(row => ["READY", "INSUFFICIENT", "UNKNOWN", "UNAVAILABLE"].some(state => row.state.startsWith(state)) && Number.isInteger(row.closedBars) && row.closedBars <= 1000), `${account}: invalid historical MTF row`);
      assert.ok(rowsMtf.every(row => row.state.startsWith("READY") ? /Δ [+-]\d+\.\d{5}%$/.test(row.emaContext) : row.emaContext.endsWith("Δ —")), `${account}: EMA20 slope must be shown only for a valid closed-bar result`);
      assert.ok(rowsMtf.every(row => row.sourceTime === "—" || Number.isFinite(Date.parse(row.sourceTime)) && Date.parse(row.sourceTime) <= Date.parse(snapshot.payload.asOfUtc)), `${account}: MTF sourceTime contains a candle after the recorded fill`);
      const snapshotBefore = String(Math.floor(Date.parse(snapshot.payload.asOfUtc) / 1000));
      const requested = mtfReads.filter(read => read.account === account && read.before === snapshotBefore);
      assert.equal(requested.length, 5, `${account}: historical check must read exactly five frames`);
      assert.ok(requested.every(read => read.method === "GET" && read.symbol === snapshotSymbol), `${account}: MTF history escaped the recorded snapshot scope or UTC cutoff: ${JSON.stringify({snapshotSymbol,asOfUtc:snapshot.payload.asOfUtc,requested})}`);
      await panel.locator("#cs-evidence-kind").selectOption("DECISION");
      await panel.locator("#cs-evidence-load").click();
      await page.waitForFunction(() => {
        const status = document.querySelector("#cs-evidence-status")?.textContent || "";
        return !status.includes("Aufzeichnungen werden gelesen");
      }, null, { timeout: 20000 });
      const decisionStatus = await panel.locator("#cs-evidence-status").textContent();
      assert.match(decisionStatus, /Verfügbarkeit: NOT_RECORDED/,
        `${account}: old demo history must remain explicitly unrecorded (${decisionStatus})`);
      assert.match(await panel.locator("#cs-evidence-list li").first().textContent(),
        /NOT_RECORDED · Keine Aufzeichnung im gewählten Zeitraum; daraus folgt keine Aussage über ältere Zeiträume\./,
        `${account}: inspector must not invent historical decision reasons`);
      assert.ok(apiRequests.some(request => request.path.endsWith("/decisions")
        && request.account === account && request.method === "GET"), `${account}: missing scoped decision-history read`);
      observations.push({ account, snapshots: count, entries, exits, frozenBars: candleCount,
        historicalDecisions: "NOT_RECORDED", mtfAsOfUtc: snapshot.payload.asOfUtc, mtf: rowsMtf });
    }

    assert.ok(apiRequests.some(request => request.path.endsWith("/snapshots") && request.method === "GET"),
      "live snapshot evidence was not read through the inspector");
    assert.deepEqual(mutations, [], "live history acceptance issued a mutation or protected-account request");
    assert.deepEqual(pageErrors, [], "browser runtime errors during snapshot history acceptance");
    console.log("PASS live read-only snapshot inspector:", JSON.stringify(observations));
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

async function assertEventually(check, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { await check(); return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error("condition timed out");
}
