# FR-002 native-v5 Auto-Fibonacci overlay follow-up

## Goal

Render the already implemented `confirmed-swing-auto-fib-v1` calculator as a read-only, scope-validated overlay in the isolated native v5 preview. Keep v5 gated from production v4.

## Acceptance

- Seven native retracement lines begin only at the confirmed second swing and expose ratio labels.
- Caller-supplied `MT5_VERIFIED` as-of identity must match the chart account, exact symbol and timeframe; cadence must match the chart timeframe.
- Readout returns algorithm, source, timeframe, direction, swing anchors, confirmation time and levels.
- Forming/future bars cannot alter confirmed anchors; clear, account change and destroy remove the lines.
- Chromium proves parity, readout, fail-closed scope, cleanup and no writes.

## Tasks

- [x] Add failing Chromium contract for native API, line series, provenance, forming-bar exclusion and lifecycle.
- [x] Implement isolated native line-series overlay and exact-scope as-of validation.
- [x] Document the transient preview API and its remaining production/profile/hardware gates.
- [x] Run the complete v5 Chromium smoke, TypeScript check/build and inspect the implementation diff.
- [ ] Run relevant Beta/Node regressions, then commit/push/deploy under the main workflow.
