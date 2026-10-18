"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { parseOptions, createLoadPlan } = require("./aud01_load_plan.cjs");

const options = parseOptions(process.argv.slice(2));

const base = new URL(process.env.DASHBOARD_AUDIT_URL || "http://127.0.0.1:8056");
if (!["127.0.0.1", "localhost"].includes(base.hostname) || base.protocol !== "http:") {
  throw new Error("This read-only audit accepts only a local HTTP dashboard URL.");
}

const accounts = [
  { account: "titan", symbol: "XAUUSD" },
  { account: "xau5m_m5", symbol: "XAUUSD.p" },
  { account: "titan_m5", symbol: "XAUUSD.p" },
  { account: "xau5m_500", symbol: "XAUUSD.p" },
];
const samples = [];

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function getJson(relativePath, { retry429 = true } = {}) {
  const url = new URL(relativePath, base);
  const maxAttempts = retry429 ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (response.status === 429 && attempt + 1 < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1_000);
      continue;
    }
    const body = await response.json().catch(() => null);
    return { response, body };
  }
  throw new Error("Read request exhausted its bounded retry count.");
}

function tracePath(account) {
  return `/api/diagnostics/mt5-traces?account=${encodeURIComponent(account)}&limit=50`;
}

async function getTraces(account) {
  const { response, body } = await getJson(tracePath(account));
  assert.equal(response.status, 200, `scoped traces unavailable for ${account}`);
  assert.ok(Array.isArray(body?.traces));
  for (const trace of body.traces) assert.equal(trace.account, account);
  return body.traces;
}

async function readCandles(spec, phase, options) {
  const query = new URLSearchParams({ account: spec.account, symbol: spec.symbol, tf: "M15", count: "150" });
  const started = performance.now();
  const { response, body } = await getJson(`/api/candles?${query}`, options);
  const clientMs = performance.now() - started;
  assert.equal(response.status, 200, `${spec.account}/${phase} returned HTTP ${response.status}`);
  assert.equal(body.accountId, spec.account);
  assert.equal(body.symbol, spec.symbol);
  assert.equal(body.timeframe, "M15");
  assert.equal(body.source, "MT5_VERIFIED");
  assert.equal(body.canExecute, false);
  assert.equal(body.candles?.length, 150);
  samples.push({ account: spec.account, phase, clientMs: Number(clientMs.toFixed(3)) });
}

async function readHistory(spec) {
  const toUtc = new Date();
  const fromUtc = new Date(toUtc.getTime() - 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    account: spec.account,
    symbol: spec.symbol,
    fromUtc: fromUtc.toISOString(),
    toUtc: toUtc.toISOString(),
    limit: "100",
  });
  const started = performance.now();
  const { response, body } = await getJson(`/api/chart/v1/trades?${query}`);
  const clientMs = performance.now() - started;
  assert.equal(response.status, 200, `${spec.account}/history returned HTTP ${response.status}`);
  assert.equal(body.account, spec.account);
  assert.equal(body.symbol, spec.symbol);
  assert.equal(body.canExecute, false);
  samples.push({ account: spec.account, phase: "history-24h", clientMs: Number(clientMs.toFixed(3)) });
}

function processSample(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid < 1) return null;
  try {
    const output = execFileSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
      `$p=Get-Process -Id ${pid} -ErrorAction Stop; [pscustomobject]@{cpuSeconds=[math]::Round(($p.UserProcessorTime.TotalSeconds+$p.PrivilegedProcessorTime.TotalSeconds),3);privateBytes=$p.PrivateMemorySize64;workingSetBytes=$p.WorkingSet64}|ConvertTo-Json -Compress`,
    ], { encoding: "utf8", timeout: 5_000, windowsHide: true });
    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Number(ordered[Math.ceil(fraction * ordered.length) - 1].toFixed(3));
}

(async () => {
  const beforeTraces = new Map();
  for (const spec of accounts) beforeTraces.set(spec.account, new Set((await getTraces(spec.account)).map(trace => trace.requestId)));
  const runtimeBefore = await getJson("/api/runtime");
  assert.equal(runtimeBefore.response.status, 200);
  assert.equal(runtimeBefore.body.restart_required, false);
  assert.equal(runtimeBefore.body.applicationCodeDirty, false);
  const processBefore = processSample(runtimeBefore.body.pid);

  let repeatedCycles = 0;
  let measurementPlan = { mode: "one-shot", requestsPerAccount: 5, maxRequests: accounts.length * 5 };
  if (options.durationSeconds !== null) {
    const plan = createLoadPlan(options);
    const startedAt = Date.now();
    const endsAt = startedAt + plan.durationSeconds * 1000;
    measurementPlan = plan;
    let lastCycleCompletedAt = null;
    for (let cycle = 0; cycle < plan.cycles; cycle += 1) {
      const scheduledAt = startedAt + cycle * plan.intervalSeconds * 1000;
      const cycleAt = Math.max(scheduledAt, lastCycleCompletedAt === null ? scheduledAt : lastCycleCompletedAt + plan.intervalSeconds * 1000);
      if (cycleAt >= endsAt) break;
      await wait(Math.max(0, cycleAt - Date.now()));
      if (Date.now() >= endsAt) break;
      for (const spec of accounts) await readCandles(spec, `repeat-${cycle + 1}`, { retry429: false });
      repeatedCycles += 1;
      lastCycleCompletedAt = Date.now();
    }
  } else {
    for (const spec of accounts) {
      await readCandles(spec, "warm-1");
      await readCandles(spec, "warm-2");
    }
    await Promise.all(accounts.flatMap(spec => [
      readCandles(spec, "parallel-1"),
      readCandles(spec, "parallel-2"),
    ]));
    for (const spec of accounts) await readHistory(spec);
  }

  const byAccount = [];
  for (const spec of accounts) {
    const traces = await getTraces(spec.account);
    const newTraces = traces.filter(trace => !beforeTraces.get(spec.account).has(trace.requestId));
    const accountSamples = samples.filter(sample => sample.account === spec.account);
    const durations = accountSamples.map(sample => sample.clientMs);
    const spans = Object.fromEntries(["mt5_lock_wait", "mt5_initialize", "mt5_identity_verify", "mt5_rates", "mt5_history"]
      .map(name => [name, newTraces.flatMap(trace => trace.spans || []).filter(span => span.name === name)
        .map(span => span.durationMs)]));
    byAccount.push({
      account: spec.account,
      requests: accountSamples.length,
      ratesRequests: accountSamples.filter(sample => sample.phase !== "history-24h").length,
      historyRequests: accountSamples.filter(sample => sample.phase === "history-24h").length,
      traces: newTraces.length,
      clientMs: { median: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: Math.max(...durations) },
      spanMs: Object.fromEntries(Object.entries(spans).map(([name, values]) => [name, {
        count: values.length, median: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Number(Math.max(...values).toFixed(3)) : null,
      }])),
    });
  }

  const runtimeAfter = await getJson("/api/runtime");
  assert.equal(runtimeAfter.response.status, 200);
  assert.equal(runtimeAfter.body.pid, runtimeBefore.body.pid);
  assert.equal(runtimeAfter.body.startupRevision, runtimeBefore.body.startupRevision);
  assert.equal(runtimeAfter.body.startupDigest, runtimeBefore.body.startupDigest);
  assert.equal(runtimeAfter.body.diskRevision, runtimeBefore.body.diskRevision);
  assert.equal(runtimeAfter.body.restart_required, false);
  assert.equal(runtimeAfter.body.applicationCodeDirty, false);
  const processAfter = processSample(runtimeAfter.body.pid);
  const report = {
    schemaVersion: 1,
    measuredAtUtc: new Date().toISOString(),
    runtime: {
      startupRevision: runtimeAfter.body.startupRevision,
      diskRevision: runtimeAfter.body.diskRevision,
      restartRequired: runtimeAfter.body.restart_required,
      applicationCodeDirty: runtimeAfter.body.applicationCodeDirty,
    },
    scope: accounts.map(({ account }) => account),
    method: "GET",
    measurementPlan: { ...measurementPlan, completedCycles: options.durationSeconds === null ? null : repeatedCycles },
    candles: { timeframe: "M15", count: 150 },
    sampleCount: samples.length,
    byAccount,
    process: processBefore && processAfter ? {
      cpuSecondsBefore: processBefore.cpuSeconds,
      cpuSecondsAfter: processAfter.cpuSeconds,
      cpuSecondsDelta: Number((processAfter.cpuSeconds - processBefore.cpuSeconds).toFixed(3)),
      privateBytesBefore: processBefore.privateBytes,
      privateBytesAfter: processAfter.privateBytes,
      workingSetBytesBefore: processBefore.workingSetBytes,
      workingSetBytesAfter: processAfter.workingSetBytes,
    } : { available: false },
    mutations: 0,
    blueberryRequests: 0,
  };

  assert.equal(report.runtime.restartRequired, false);
  assert.equal(report.runtime.applicationCodeDirty, false);
  assert.equal(report.scope.includes("blueberry"), false);
  assert.equal(report.sampleCount, options.durationSeconds === null ? accounts.length * 5 : accounts.length * repeatedCycles);
  const outputDir = path.resolve("output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `aud01-mt5-traces-${report.runtime.startupRevision.slice(0, 8)}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath: outputPath }, null, 2));
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
