"use strict";

// Reserve one final interval for a five-request round to finish within 15 minutes.
const MAX_DURATION_SECONDS = 840;
const MIN_INTERVAL_SECONDS = 60;
const demoAccounts = Object.freeze([
  Object.freeze({ account: "titan", symbol: "XAUUSD" }),
  Object.freeze({ account: "xau5m_m5", symbol: "XAUUSD.p" }),
  Object.freeze({ account: "titan_m5", symbol: "XAUUSD.p" }),
  Object.freeze({ account: "xau5m_500", symbol: "XAUUSD.p" }),
  Object.freeze({ account: "goldm15", symbol: "XAUUSD" }),
]);

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(args) {
  const values = new Map();
  for (const arg of args) {
    const match = /^(--repeat-seconds|--interval-seconds)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown option: ${arg}`);
    if (values.has(match[1])) throw new Error(`${match[1]} may be specified once.`);
    values.set(match[1], positiveInteger(match[2], match[1]));
  }
  const durationSeconds = values.get("--repeat-seconds") ?? null;
  const intervalSeconds = values.get("--interval-seconds") ?? MIN_INTERVAL_SECONDS;
  if (durationSeconds === null && values.has("--interval-seconds")) {
    throw new Error("--interval-seconds requires --repeat-seconds.");
  }
  if (durationSeconds !== null) createLoadPlan({ durationSeconds, intervalSeconds });
  return { durationSeconds, intervalSeconds };
}

function createLoadPlan({ durationSeconds, intervalSeconds }) {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`Repeated duration must be at most ${MAX_DURATION_SECONDS} seconds.`);
  }
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < MIN_INTERVAL_SECONDS) {
    throw new Error(`Repeated interval must be at least ${MIN_INTERVAL_SECONDS} seconds.`);
  }
  if (intervalSeconds > durationSeconds) throw new Error("Repeated interval cannot exceed the duration.");
  const cycles = Math.ceil(durationSeconds / intervalSeconds);
  return {
    mode: "repeated",
    durationSeconds,
    intervalSeconds,
    cycles,
    requestsPerCycle: demoAccounts.length,
    maxRequests: cycles * demoAccounts.length,
  };
}

module.exports = { parseOptions, createLoadPlan, demoAccounts };
