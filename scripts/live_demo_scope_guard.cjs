"use strict";

const UNACCOUNTED_READS = new Set([
  "/api/accounts",
  "/api/runtime",
  "/api/chart/v1/capabilities",
]);

function classifyLiveDemoRequest({ url, method, basePath = "", allowedAccounts = [] }) {
  const parsed = url instanceof URL ? url : new URL(url);
  let normalizedBasePath;
  let pathname;
  try {
    normalizedBasePath = decodeURIComponent(basePath).replace(/\/$/, "");
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return { allowed: false, reason: "invalid_path" };
  }
  const prefix = `${normalizedBasePath}/api/`;
  if (!pathname.startsWith(prefix)) return { allowed: true, kind: "non_api" };
  if (method !== "GET") return { allowed: false, reason: "method" };
  const endpoint = pathname.slice(normalizedBasePath.length);
  const accountValues = parsed.searchParams.getAll("account");
  // These endpoints ignore account scope and return global metadata. They are
  // permitted only unscoped; a cosmetic account parameter must not imply
  // that their response is filtered.
  if ((endpoint === "/api/accounts" || endpoint === "/api/chart/v1/capabilities") && accountValues.length > 0) {
    return { allowed: false, reason: "global_endpoint_scope" };
  }
  if (accountValues.length === 0) {
    if (UNACCOUNTED_READS.has(endpoint)) {
      return { allowed: true, kind: "global_read", endpoint };
    }
    return { allowed: false, reason: "missing_account" };
  }
  if (accountValues.length !== 1 || !allowedAccounts.includes(accountValues[0])) {
    return { allowed: false, reason: "account_scope" };
  }
  return { allowed: true, kind: "demo_read", account: accountValues[0], endpoint };
}

module.exports = { classifyLiveDemoRequest };
