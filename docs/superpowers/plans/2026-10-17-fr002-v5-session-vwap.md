# FR-002 native-v5 session VWAP

Add the existing Beta session-VWAP behavior to the isolated native-v5 renderer so the indicator catalogue can advance toward v4/v5 parity. Preserve the user's IANA timezone and local wall-clock session boundary, DST handling, `real_volume` preference, tick-volume-proxy fallback, and honest unavailable behavior. This is a display-only overlay on verified caller-provided candles; it does not infer order flow or modify production v4, broker state, EA logic, or order state.

## Acceptance

- The calculation matches `ChartStudioIndicators.math.vwap` for valid bars, configured timezone and session start, including session resets and DST.
- Missing/zero volume bars do not create observations; result metadata labels real volume, tick-volume proxy, mixed input, or no usable volume.
- The native adapter can add, update and remove a VWAP line; candle replacement, forming-bar replacement and new-bar append refresh it without duplicate or stale points.
- The overlay counts against the shared 20-indicator limit, participates in readouts and reports the configured session and volume provenance.
- Settings persist in the private account/symbol/timeframe-scoped schema-v4 profile, survive reload, migrate valid schema-v1/v2/v3 profiles, and leave the prior versioned key intact for rollback.
- Portable schema-v2 layout export/import and merge include VWAP settings without account identity; preview validation is atomic on invalid input.
- Invalid settings fail before mutating a live series; account/scope changes and adapter destruction clear the overlay.
- Chromium tests exercise formula parity, DST/reset, forming-bar updates, remove/re-add, source labels, limit behavior and invalid-input atomicity. The CI workflow runs this test.

## Files and verification

`chart_studio_v5/src/adapter.ts`, `scripts/smoke_chart_studio_v5_vwap.cjs`, `scripts/smoke_chart_studio_v5_preview.cjs`, `.github/workflows/chart-studio-ci.yml`, and the Chart Studio task documentation. The focused Chromium suite covers formula parity, DST/session resets, forming-bar updates, reload, account isolation, migration and portable layout integration. Run TypeScript check/build, focused and relevant native-v5 Chromium smokes, then CI. No Strategy Tester, backtests, broker requests or MT5 mutations.
