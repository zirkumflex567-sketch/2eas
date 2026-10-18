"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { summarizeResources, selectCacheHeaders, measurementContextOptions, isSafeMeasurementRequest,
  summarizeCacheExchanges } = require("./deployed_asset_measurement_helpers.cjs");

const base = process.env.DASHBOARD_DEPLOYED_ASSET_URL || "https://h-town.duckdns.org/stt/";
const username = process.env.DASHBOARD_DEPLOYED_ASSET_USERNAME || "kevin";
const passwordPath = process.env.DASHBOARD_DEPLOYED_ASSET_PASSWORD_FILE ||
  path.join(os.homedir(), ".stt-basic-password.txt");
const sampledPaths = [
  "/stt/",
  "/stt/static/tailwind.generated.css",
  "/stt/static/lightweight-charts.js",
  "/stt/static/stone-cockpit.js",
  "/stt/static/stone-assets/ready/27_broken_corner_ornament.webp",
];

async function snapshot(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource")
      .filter(entry => !new URL(entry.name).pathname.startsWith("/stt/api/"))
      .map(entry => ({ path: new URL(entry.name).pathname,
        transfer: entry.transferSize, encoded: entry.encodedBodySize, decoded: entry.decodedBodySize }));
    const paints = performance.getEntriesByType("paint")
      .map(entry => ({ name: entry.name, milliseconds: Number(entry.startTime.toFixed(1)) }));
    return { navigation: navigation ? {
      transferBytes: navigation.transferSize,
      encodedBytes: navigation.encodedBodySize,
      decodedBytes: navigation.decodedBodySize,
      domContentLoadedMs: Number(navigation.domContentLoadedEventEnd.toFixed(1)),
      loadMs: Number(navigation.loadEventEnd.toFixed(1)),
    } : null, resources, paints };
  });
}

async function measureViewport(browser, width, credentials) {
  const context = await browser.newContext(measurementContextOptions(width, credentials));
  const page = await context.newPage();
  const unsafeRequests = [];
  const failures = [];
  const responseHeaders = [];
  const cacheExchanges = [];
  const allowedOrigin = new URL(base).origin;
  let phase = "cold";
  page.on("requestfailed", request => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith("/stt/api/")) failures.push({ pathname, error: request.failure()?.errorText || "unknown" });
  });
  page.on("request", request => {
    const requestUrl = new URL(request.url());
    const pathname = requestUrl.pathname;
    if (!isSafeMeasurementRequest(request.method(), request.url(), allowedOrigin)) {
      unsafeRequests.push({ pathname, method: request.method(), crossOrigin: requestUrl.origin !== allowedOrigin });
    }
    if (sampledPaths.includes(pathname) && pathname !== "/stt/") {
      cacheExchanges.push({ phase, kind: "request", path: pathname,
        ifNoneMatch: Boolean(request.headers()["if-none-match"]) });
    }
  });
  page.on("response", response => {
    const url = new URL(response.url());
    if (sampledPaths.includes(url.pathname) && url.pathname !== "/stt/") {
      cacheExchanges.push({ phase, kind: "response", path: url.pathname, status: response.status() });
    }
    if (url.origin !== new URL(base).origin || !sampledPaths.includes(url.pathname)) return;
    const headers = response.headers();
    responseHeaders.push({ path: url.pathname, status: response.status(),
      cacheControl: headers["cache-control"] || null,
      etag: headers.etag || null,
      contentEncoding: headers["content-encoding"] || null,
      age: headers.age || null,
      expires: headers.expires || null,
      lastModified: headers["last-modified"] || null,
      vary: headers.vary || null });
  });
  const pageUrl = new URL(base);
  pageUrl.searchParams.set("account", "titan");
  const response = await page.goto(pageUrl.toString(), { waitUntil: "networkidle", timeout: 90_000 });
  if (response?.status() !== 200) throw new Error(`deployed document returned HTTP ${response?.status() ?? "no response"}`);
  await page.waitForTimeout(300);
  const coldRaw = await snapshot(page);
  const cold = { ...coldRaw, resources: summarizeResources(coldRaw.resources) };
  const coldHeaders = responseHeaders.slice();

  phase = "warm";
  const warmResponse = await page.reload({ waitUntil: "networkidle", timeout: 90_000 });
  if (warmResponse?.status() !== 200) throw new Error(`warm deployed document returned HTTP ${warmResponse?.status() ?? "no response"}`);
  await page.waitForTimeout(150);
  const warmRaw = await snapshot(page);
  const warm = { ...warmRaw, resources: summarizeResources(warmRaw.resources) };
  await context.close();

  return { width, deviceScaleFactor: width < 500 ? 2 : 1, cold, warm,
    unsafeRequests,
    nonApiFailures: failures,
    cacheHeaders: selectCacheHeaders(coldHeaders, sampledPaths),
    staticCacheValidation: summarizeCacheExchanges(cacheExchanges) };
}

(async () => {
  const password = fs.readFileSync(passwordPath, "utf8").trim();
  if (password.length < 1) throw new Error("Deployment password file is empty.");
  const browser = await chromium.launch({ headless: true });
  try {
    const viewports = [];
    for (const width of [390, 1440]) {
      viewports.push(await measureViewport(browser, width, { username, password, origin: new URL(base).origin }));
    }
    const report = {
      schemaVersion: 1,
      mode: "authenticated public /stt; JavaScript disabled to prevent API calls; Chromium HTTP cache enabled; GET/HEAD only",
      measuredAtUtc: new Date().toISOString(),
      baseOrigin: new URL(base).origin,
      viewports,
      limits: "Resource Timing omits some transfer headers; this is not a physical memory, paint or hardware benchmark.",
    };
    if (viewports.some(view => view.nonApiFailures.length)) throw new Error("A non-API public asset request failed.");
    if (viewports.some(view => view.unsafeRequests.length)) {
      throw new Error("The JavaScript-disabled browser attempted an API or non-GET request.");
    }
    const outputPath = path.resolve("output", "asset-budget", "deployed-dashboard-load-evidence.json");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, outputPath }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
