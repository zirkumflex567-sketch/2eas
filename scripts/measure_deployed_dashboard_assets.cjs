"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { summarizeResources, selectCacheHeaders } = require("./deployed_asset_measurement_helpers.cjs");

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
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    deviceScaleFactor: width < 500 ? 2 : 1,
    reducedMotion: "reduce",
    httpCredentials: credentials,
  });
  const page = await context.newPage();
  const blocked = [];
  const failures = [];
  const responseHeaders = [];
  page.on("requestfailed", request => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith("/stt/api/")) failures.push({ pathname, error: request.failure()?.errorText || "unknown" });
  });
  page.on("response", response => {
    const url = new URL(response.url());
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
  await page.route("**/*", route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/stt/api/") || !["GET", "HEAD"].includes(request.method())) {
      blocked.push({ pathname, method: request.method() });
      return route.abort();
    }
    return route.continue();
  });

  const pageUrl = new URL(base);
  pageUrl.searchParams.set("account", "titan");
  const response = await page.goto(pageUrl.toString(), { waitUntil: "networkidle", timeout: 90_000 });
  if (response?.status() !== 200) throw new Error(`deployed document returned HTTP ${response?.status() ?? "no response"}`);
  await page.waitForTimeout(300);
  const coldRaw = await snapshot(page);
  const cold = { ...coldRaw, resources: summarizeResources(coldRaw.resources) };
  const coldHeaders = responseHeaders.slice();

  const warmResponse = await page.reload({ waitUntil: "networkidle", timeout: 90_000 });
  if (warmResponse?.status() !== 200) throw new Error(`warm deployed document returned HTTP ${warmResponse?.status() ?? "no response"}`);
  await page.waitForTimeout(150);
  const warmRaw = await snapshot(page);
  const warm = { ...warmRaw, resources: summarizeResources(warmRaw.resources) };
  await context.close();

  return { width, deviceScaleFactor: width < 500 ? 2 : 1, cold, warm,
    blockedApiOrWriteRequests: blocked,
    nonApiFailures: failures,
    cacheHeaders: selectCacheHeaders(coldHeaders, sampledPaths) };
}

(async () => {
  const password = fs.readFileSync(passwordPath, "utf8").trim();
  if (password.length < 1) throw new Error("Deployment password file is empty.");
  const browser = await chromium.launch({ headless: true });
  try {
    const viewports = [];
    for (const width of [390, 1440]) {
      viewports.push(await measureViewport(browser, width, { username, password }));
    }
    const report = {
      schemaVersion: 1,
      mode: "authenticated public /stt; only HTML and static GET/HEAD; /api requests blocked before network",
      measuredAtUtc: new Date().toISOString(),
      baseOrigin: new URL(base).origin,
      viewports,
      limits: "Resource Timing omits transfer headers and cache behavior may vary by browser; this is not a physical memory, paint or hardware benchmark.",
    };
    if (viewports.some(view => view.nonApiFailures.length)) throw new Error("A non-API public asset request failed.");
    if (viewports.some(view => view.blockedApiOrWriteRequests.some(request => !request.pathname.startsWith("/stt/api/")))) {
      throw new Error("The browser attempted a non-GET request outside the blocked API.");
    }
    const outputPath = path.resolve("output", "asset-budget", "deployed-dashboard-load-evidence.json");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, outputPath }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
