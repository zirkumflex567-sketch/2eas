"use strict";

const assert = require("node:assert/strict");

function rememberSnapshot(snapshotsById, account, traces) {
  for (const trace of traces) {
    assert.equal(trace.account, account, `trace account mismatch for ${account}`);
    assert.equal(typeof trace.requestId, "string", `trace ID missing for ${account}`);
    snapshotsById.set(trace.requestId, trace);
  }
}

function correlateSamples(samples, snapshotsById) {
  return samples.map(sample => {
    const trace = snapshotsById.get(sample.traceId);
    assert.ok(trace, `${sample.account} trace ${sample.traceId} was not captured in a bounded trace snapshot`);
    assert.equal(trace.account, sample.account);
    assert.equal(trace.httpMethod, "GET");
    assert.equal(trace.route, sample.route);
    return trace;
  });
}

module.exports = { rememberSnapshot, correlateSamples };
