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
- [x] Run relevant Beta/Node regressions (`node scripts/smoke_chart_studio_beta.cjs`, `node scripts/test_chart_studio_indicators.cjs`) and review the diff.
- [x] Commit and push on `main` (`c6436af`).
- [x] Both GitHub workflows passed for `c6436af`; guarded local Main runtime restarted with matching startup/disk revision and digest (`517e774b54de079fb05d24d0b214076733a6b1a304fcb3a2384f091aef636a21`). htown `/home/kevin/2eas` is clean on `main`/`c6436af`; its `/stt` tunnel reports the same runtime identity. Local and htown upstream v5 bundles match SHA-256 `7620320a6167a3dc9762d8a47f4438279bfec063abcb1c6b2be49933d063fc7d`; nginx is active and `nginx -t` passes.
- [x] Read-only demo acceptance passed on the four authorized non-Blueberry aliases: 150 M15 XAU candles each, 58 GETs, no mutations or failures. All quotes were stale, so live risk remains unknown. The public `/stt` path retains its Basic Auth (anonymous status is 401).
