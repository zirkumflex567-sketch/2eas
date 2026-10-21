"use strict";

const path = require("node:path");

const PHASES = new Map([
  ["off-idle", { name: "off-idle", mode: "off" }],
  ["mystic-idle", { name: "mystic-idle", mode: "mystic" }],
  ["ritual-idle", { name: "ritual-idle", mode: "ritual" }],
  ["mystic-demo-celebration", { name: "mystic-demo-celebration", mode: "mystic", celebrateAtMs: 120000 }],
]);
const DEFAULT_PHASES = [...PHASES.keys()];

function parseConfig(env = process.env, cwd = process.cwd()) {
  const durationText = env.AUD04_DURATION_SECONDS ?? "300";
  if (!/^[0-9]+$/.test(durationText)) throw new Error("AUD04_DURATION_SECONDS must be 60–3600");
  const durationSeconds = Number(durationText);
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 3600) {
    throw new Error("AUD04_DURATION_SECONDS must be 60–3600");
  }

  const names = env.AUD04_PHASES === undefined || env.AUD04_PHASES.trim() === ""
    ? DEFAULT_PHASES
    : env.AUD04_PHASES.split(",").map(name => name.trim());
  if (names.some(name => !name || !PHASES.has(name)) || new Set(names).size !== names.length) {
    throw new Error("invalid AUD04_PHASES");
  }

  const output = path.resolve(cwd, env.AUD04_OUT || "output/aud04_headless_fx_trace_20261020.json");
  const outputRoot = path.resolve(cwd, "output") + path.sep;
  const compareOutput = process.platform === "win32" ? output.toLowerCase() : output;
  const compareRoot = process.platform === "win32" ? outputRoot.toLowerCase() : outputRoot;
  if (!compareOutput.startsWith(compareRoot)) throw new Error("AUD04_OUT must stay under output/");

  return {
    account: "titan",
    durationSeconds,
    output,
    phases: names.map(name => ({ ...PHASES.get(name) })),
  };
}

module.exports = { parseConfig };
