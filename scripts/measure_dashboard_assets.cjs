"use strict";

// Whole-page measurement against an isolated local app. API requests are
// intercepted narrowly so Chromium's HTTP cache remains enabled for assets.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { extractLoadedCssImageUrls, estimateRgbaSurfaceBytes } =
  require("./dashboard_asset_measurement_helpers.cjs");

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitReady(base, process) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (process.exitCode !== null) throw Error("isolated app exited before listening");
    try { if ((await fetch(base)).ok) return; } catch (_) { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error("isolated app readiness timed out");
}

function createIsolatedProxy(upstream) {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      response.writeHead(request.method === "GET" ? 503 : 403,
        { "content-type": "application/json", "cache-control": "no-store" });
      return response.end(JSON.stringify({ detail: "measurement API disabled" }));
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(403, { "cache-control": "no-store" });
      return response.end("Forbidden by measurement harness");
    }
    try {
      const upstreamResponse = await fetch(new URL(request.url, upstream), {
        method: request.method,
        headers: { "accept": request.headers.accept || "*/*" },
      });
      const headers = Object.fromEntries(upstreamResponse.headers.entries());
      response.writeHead(upstreamResponse.status, headers);
      if (request.method === "HEAD") return response.end();
      return response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { "content-type": "text/plain" });
      return response.end(`Isolated upstream failed: ${error.message}`);
    }
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

function classify(url) {
  const pathname = new URL(url).pathname;
  if (/lightweight-charts|chart-studio|stone-chart/.test(pathname)) return "chart";
  if (pathname.includes("/stone-assets/ui/")) return "stone-ui";
  if (/\/stone-assets\/(ready|source)\//.test(pathname)) return "visualization";
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) return "font";
  return "other";
}

function summarize(entries) {
  const unique = new Map();
  for (const entry of entries) if (!unique.has(entry.url)) unique.set(entry.url, entry);
  const resources = [...unique.values()];
  const byteSum = field => resources.reduce((total, entry) => total + entry[field], 0);
  return {
    requests: entries.length,
    uniqueRequests: resources.length,
    encodedBytes: byteSum("encoded"),
    transferBytes: byteSum("transfer"),
    decodedBytes: byteSum("decoded"),
    classes: Object.fromEntries(["chart", "stone-ui", "visualization", "font", "other"].map(name =>
      [name, resources.filter(entry => classify(entry.url) === name)
        .reduce((total, entry) => total + entry.encoded, 0)])),
    resources: resources.sort((a, b) => b.encoded - a.encoded).slice(0, 15),
  };
}

async function sample(page) {
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0];
    return entry ? {
      encodedBytes: entry.encodedBodySize,
      transferBytes: entry.transferSize,
      domInteractiveMs: entry.domInteractive,
      domContentLoadedMs: entry.domContentLoadedEventEnd,
      loadMs: entry.loadEventEnd,
    } : null;
  });
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter(entry => !new URL(entry.name).pathname.startsWith("/api/"))
    .map(entry => ({ url: entry.name, encoded: entry.encodedBodySize,
      decoded: entry.decodedBodySize, transfer: entry.transferSize,
      durationMs: entry.duration, initiator: entry.initiatorType })));
  const paints = await page.evaluate(() => performance.getEntriesByType("paint")
    .map(entry => ({ name: entry.name, startTimeMs: entry.startTime })));
  const imageElements = await page.evaluate(async () => {
    let decoded = 0, failures = 0;
    for (const image of document.images) {
      try { await image.decode(); decoded++; } catch (_) { failures++; }
    }
    return { elements: document.images.length, decoded, failures };
  });
  const cssSnapshot = await page.evaluate(() => {
    const styleValues = [];
    const nodes = document.querySelectorAll("*");
    for (const element of nodes) {
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(element, pseudo);
        if (pseudo && (style.content === "none" || style.content === "normal")) continue;
        styleValues.push(style.backgroundImage, style.borderImageSource);
      }
    }
    return { baseUrl: location.href, styleValues,
      loadedUrls: performance.getEntriesByType("resource").map(entry => entry.name) };
  });
  const cssUrls = extractLoadedCssImageUrls(cssSnapshot.styleValues,
    cssSnapshot.baseUrl, cssSnapshot.loadedUrls);
  const decodedCss = await page.evaluate(async urls => {
    const started = performance.now();
    const images = await Promise.all(urls.map(async url => {
      const image = new Image();
      let timeout;
      try {
        image.src = url;
        await Promise.race([image.decode(), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("decode timeout")), 5000);
        })]);
        return { url, width: image.naturalWidth, height: image.naturalHeight };
      } catch (_) { return { url, width: 0, height: 0 }; }
      finally { clearTimeout(timeout); }
    }));
    return { images, durationMs: Number((performance.now() - started).toFixed(3)) };
  }, cssUrls.slice(0, 200));
  const decodedCssImages = decodedCss.images;
  const decodedCssBytes = decodedCssImages.map(image => estimateRgbaSurfaceBytes(image));
  const cssBackgroundImages = {
    uniqueLoadedSameOriginCssUrls: cssUrls.length,
    decodeLimit: 200,
    decoded: decodedCssImages.filter((_, index) => decodedCssBytes[index] !== null).length,
    decodeDurationMs: decodedCss.durationMs,
    failedOrInvalid: decodedCssImages.filter((_, index) => decodedCssBytes[index] === null).length,
    omittedByLimit: Math.max(0, cssUrls.length - 200),
    estimatedRgbaSurfaceBytes: decodedCssBytes.reduce((total, value) => total + (value || 0), 0),
    estimate: "sum of intrinsic width × height × 4 for decoded unique same-origin CSS images; not actual GPU/paint memory",
  };
  return { navigation, paints, imageElements,
    cssBackgroundImages, resources: summarize(resources) };
}

async function measure(browser, base, width) {
  const deviceScaleFactor = width < 500 ? 2 : 1;
  const context = await browser.newContext({ viewport: { width, height: 1000 },
    deviceScaleFactor, reducedMotion: "reduce" });
  const page = await context.newPage();
  const apiRequests = [], blockedWrites = [], failedRequests = [];
  page.on("requestfailed", request => failedRequests.push({ url: request.url(),
    error: request.failure()?.errorText || "unknown" }));
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
      if (request.method() !== "GET") blockedWrites.push({ method: request.method(), path: request.url() });
    }
  });
  const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  if (!response?.ok()) throw Error("dashboard document did not load");
  await page.waitForTimeout(1200);
  const cold = await sample(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  const warm = await sample(page);

  const result = { width, deviceScaleFactor, cold, warm, apiRequests,
    blockedWrites, failedRequests };
  await context.close();
  return result;
}

(async () => {
  const port = await freePort();
  const upstream = `http://127.0.0.1:${port}/`;
  const server = spawn("python", ["-m", "uvicorn", "app:app", "--host", "127.0.0.1",
    "--port", String(port)], { cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
  let browser, proxy;
  try {
    await waitReady(upstream, server);
    proxy = createIsolatedProxy(upstream);
    const proxyPort = await listen(proxy);
    const base = `http://127.0.0.1:${proxyPort}/`;
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.CHART_STUDIO_CHROMIUM_PATH || undefined });
    const result = { schemaVersion: 3,
      mode: "isolated local app; all /api/ requests intercepted; no broker, evidence-store or MT5 access",
      measuredAtUtc: new Date().toISOString(), viewports: [] };
    for (const width of [390, 1440]) result.viewports.push(await measure(browser, base, width));
    const bad = result.viewports.flatMap(view => view.blockedWrites);
    if (bad.length) throw Error(`unexpected non-GET API request observed: ${JSON.stringify(bad)}`);
    if (result.viewports.some(view => view.failedRequests.length))
      throw Error("failed network requests observed; refusing to report a clean page load");
    const output = path.join("output", "asset-budget", "dashboard-load-evidence.json");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.viewports.map(view => ({ width: view.width,
      cold: view.cold, warm: view.warm, apiRequests: view.apiRequests.length,
      blockedWrites: view.blockedWrites.length, failures: view.failedRequests.length })), null, 2));
  } finally {
    if (browser) await browser.close();
    if (proxy) await new Promise(resolve => proxy.close(resolve));
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
