"use strict";

function byteValue(value) {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}

function summarizeResources(entries) {
  const resources = entries.filter(entry => !entry.path.startsWith("/stt/api/"));
  return {
    requests: resources.length,
    transferBytes: resources.reduce((sum, entry) => sum + byteValue(entry.transfer), 0),
    encodedBytes: resources.reduce((sum, entry) => sum + byteValue(entry.encoded), 0),
    decodedBytes: resources.reduce((sum, entry) => sum + byteValue(entry.decoded), 0),
    cachedRequests: resources.filter(entry => entry.encoded > 0 && entry.transfer < entry.encoded).length,
  };
}

function selectCacheHeaders(responses, paths) {
  const byPath = new Map();
  for (const response of responses) {
    if (!byPath.has(response.path) || response.status === 200) byPath.set(response.path, response);
  }
  return paths.flatMap(path => {
    const response = byPath.get(path);
    return response ? [{
      path,
      status: response.status,
      cacheControl: response.cacheControl ?? null,
      etag: response.etag ?? null,
      contentEncoding: response.contentEncoding ?? null,
      age: response.age ?? null,
      expires: response.expires ?? null,
      lastModified: response.lastModified ?? null,
      vary: response.vary ?? null,
    }] : [];
  });
}

function measurementContextOptions(width, credentials) {
  return {
    viewport: { width, height: 1000 },
    deviceScaleFactor: width < 500 ? 2 : 1,
    reducedMotion: "reduce",
    javaScriptEnabled: false,
    httpCredentials: credentials,
  };
}

function isSafeMeasurementRequest(method, pathname) {
  return ["GET", "HEAD"].includes(method) && !pathname.startsWith("/stt/api/");
}

function summarizeCacheExchanges(events) {
  const result = Object.fromEntries(["cold", "warm"].map(phase => [phase,
    { requests: 0, conditionalRequests: 0, responses200: 0, responses304: 0 }]));
  for (const event of events) {
    const phase = result[event.phase];
    if (!phase) continue;
    if (event.kind === "request") {
      phase.requests += 1;
      if (event.ifNoneMatch) phase.conditionalRequests += 1;
    } else if (event.kind === "response" && event.status === 200) {
      phase.responses200 += 1;
    } else if (event.kind === "response" && event.status === 304) {
      phase.responses304 += 1;
    }
  }
  return result;
}

module.exports = { summarizeResources, selectCacheHeaders, measurementContextOptions,
  isSafeMeasurementRequest, summarizeCacheExchanges };
