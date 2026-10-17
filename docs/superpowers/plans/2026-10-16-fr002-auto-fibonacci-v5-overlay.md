# FR-002 native-v5 Auto-Fibonacci overlay follow-up

## Goal

Render the already implemented `confirmed-swing-auto-fib-v1` calculator as a read-only, scope-validated overlay in the isolated native v5 preview. Keep v5 gated from production v4.

## Acceptance

- Seven native retracement lines begin only at the confirmed second swing and expose ratio labels.
- Auto-Fibonacci consumes one entry in the shared 20-indicator limit; historical readout is absent before the confirming candle.
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
- [x] Regression-test and enforce the shared indicator limit, plus pre-confirmation historical-readout hiding; v5 check/build, native Chromium smoke, Beta smoke and indicator math regression pass.
- [x] Wire the transient overlay into the separately gated dashboard preview; propagate server UTC candle snapshot time and test visible toggle, seven lines, fail-closed missing time, scope cleanup and unchanged v4 chart.
- [x] After CI and guarded Main restart on `afae2df`, live headless read-only acceptance on the four authorized demos loaded 1,001 `MT5_VERIFIED` M15 candles each and rendered the gated native v5 preview plus seven confirmed Auto-Fibonacci series (DOWN for `titan`, UP for the other three); each preview canvas was 580×430. The v4 chart remained mounted, 72 requests were GET-only, and there were no browser errors, mutations or Blueberry requests. The server production flag remained off; only the isolated smoke response enabled preview. Stale quotes left live risk unknown.
