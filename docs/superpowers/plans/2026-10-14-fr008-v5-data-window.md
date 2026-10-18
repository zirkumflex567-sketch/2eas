# FR-008 native v5 data-window read model

Extend only the isolated Lightweight Charts v5 adapter with an exact-time, account-scoped read model for candle OHLC, volume provenance, and registered line-series values. Missing candles and indicator warm-up remain explicit; the API never interpolates, looks ahead, computes an indicator, or calls MT5. The v4 production mount stays unchanged.

## Acceptance

- A readout is available only for an exact loaded UTC candle timestamp and reports `CHART_FEED` provenance.
- OHLC uses that candle. Real volume is preferred when positive; otherwise tick volume is clearly a proxy; absent volume remains unavailable.
- Configured overlay/pane values appear only for the same exact timestamp; warm-up/missing values are null and labeled.
- The preview can pin the exact hovered candle readout, keep it stable as the pointer moves, and clear it with Escape or on account/symbol/timeframe change.
- Replacing candle history, updating a forming candle, or changing account invalidates stale indicator readout values.
- The optional preview shows a separate current MT5 quote snapshot only when account, symbol, provenance and `canExecute=false` match; quote age and UTC as-of are explicit and never attached to the hovered historical candle.
- Invalid timestamps/volume are rejected; unknown times return `UNAVAILABLE`; no future bar or interpolated value is returned.
- Chromium smoke proves outputs and no network writes. No v4 mount/cutover, broker mutation, demo mutation, or backtest.

## TDD and verification

Add readout contracts to `scripts/smoke_chart_studio_v5.cjs` first and observe failure against the current adapter. Implement the narrow read model, update README/RFC/OPEN_TASKS, build/check TypeScript and run v5 Chromium plus focused Python/security regressions and `git diff --check`.

## Progress

- [x] Chromium contract failed on `engine.readDataWindow is not a function` before implementation.
- [x] Added exact-time OHLC and volume provenance, exact series alignment, warm-up/missing state, and invalidation on forming-bar/history/account changes. Invalid volume fails bar validation.
- [x] TypeScript check/build and isolated v5 Chromium smoke pass; production v4 mount and MT5 remain untouched.
- [x] Review confirms exact timestamp joins only, no look-ahead/interpolation, account/history invalidation and local-only data. TypeScript check/build, v5 Chromium smoke, 128 Python foundation/security/audit tests with 29 subtests, and `git diff --check` pass.
- [x] Preview integration: the native v5 crosshair now emits the exact-time data-window record to an accessible read-only panel with UTC/OHLC, volume provenance, indicator values/warm-up labels, and explicit unavailable states. The user can pin the last exact candle readout, keep it steady while moving the pointer, and clear it with Escape or a scope change; feed replacement refreshes the pinned timestamp or clears it if unavailable. Pointer-driven Chromium acceptance passes with the v4 chart still mounted and no network writes. Quote/spread UI parity and production cutover remain outside this slice.
- [x] Quote parity in the optional preview: a separate GET-only read requests the exact active account/symbol and renders verified bid/ask/spread, UTC quote time, freshness and age; mismatched/unverified responses fail closed. The UI labels it as a current quote at retrieval time, never as the historical candle under the crosshair. Chromium smoke checks the values and request scope.
- [x] Match the live quote contract: `quoteTimeUtc` is an epoch-second number, not an ISO string. A RED test reproduces a `MT5_VERIFIED`, `STALE`, `canExecute=false` quote in that exact shape; the preview now normalizes the timestamp and still shows its explicit stale age without associating it with a candle. Missing or mismatched quote data remains unavailable.
