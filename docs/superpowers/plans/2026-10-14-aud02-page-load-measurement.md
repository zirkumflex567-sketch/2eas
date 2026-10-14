# AUD-02 isolated whole-page load measurement

## Scope

Measure the actual dashboard HTML and all browser-loaded resources at 390px/DPR2 and 1440px/DPR1, on cold and same-profile warm navigation. Intercept every `/api/` request before it reaches FastAPI so no broker, SQLite evidence, or MT5 operation occurs. Record measured document transfer, resource transfer/decoded sizes, classes, request failures, API method/path, FCP/load timing, and a clear image-decoding limitation for CSS backgrounds.

## Files

- `scripts/measure_dashboard_assets.cjs`: isolated local launcher, browser measurement and fail-closed API interception.
- `scripts/dashboard_asset_measurement_helpers.cjs`: pure parsing/size-estimation helpers for loaded CSS image resources.
- `tests/test_dashboard_asset_measurement.cjs`: URL-origin/cache membership and safe pixel-size contracts, run in audit-fixes CI.
- `docs/aud-02-page-load-evidence.md`: method, measured results, interpretation, limits and still-open acceptance.
- `docs/OPEN_TASKS.md`: update AUD-02 with evidence while retaining cold/warm network, decode/paint, cache, chart/volume and archive questions not proven.

## Verification

- [x] `node --check scripts/measure_dashboard_assets.cjs`
- [x] `node --test tests/test_dashboard_asset_measurement.cjs`
- [x] `node scripts/measure_dashboard_assets.cjs`
- [x] Both viewports/cold-warm passes recorded; API paths are answered at the proxy before the app, non-GET API count is zero, browser failures are zero, and warm asset transfer is zero in Resource Timing.
- [x] `git diff --check`

## Progress

- [x] Isolated proxy preserves Chromium cache while denying API access; report records complete-page measurements, decoded loaded same-origin CSS image resources and their intrinsic RGBA surface estimate, plus the remaining deployment/paint limitations.
- [x] `OPEN_TASKS.md` records AUD-02 as partial with evidence and remaining acceptance.

Do not hit remote `/stt`, MT5, or deployment. Generated JSON stays ignored under `output/` and is not a committed evidence source; the committed markdown records reproducible summary only.

## Acceptance boundary

This is only a reproducible isolated measurement slice. It does not establish real server compression/cache headers, API latency, runtime/MT5 overhead, physical decode/paint/FPS, or remote deployment behavior. Keep AUD-02 open and do not assert the entire page meets 3 MiB.
