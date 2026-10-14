# Chart Studio v5 Adapter RFC — staged migration (0.8)

**Decision:** pin `lightweight-charts@5.2.1`, `typescript@5.9.3` and `esbuild@0.25.12` in `chart_studio_v5/package.json`. This is an **opt-in, read-only renderer proof**, not yet a production switchover.

## Current integration and compatibility

- Existing dashboard, data feeds, EA signals, risk guards and all MT5 functionality continue using `static/lightweight-charts.js` (v4). **Do not change the active `app.py` Chart mount in this PR.**
- v5 replaces `chart.addLineSeries(options)` with `chart.addSeries(LineSeries, options)`, and likewise Candlestick/Histogram. v5 supports `addSeries(..., paneIndex)`, `moveToPane`, `chart.panes()`, and native pane height management.
- An independent native TypeScript adapter in `chart_studio_v5/src/adapter.ts` currently renders candles, configurable line-instance data, native indicator panes and volume. It rejects invalid/duplicate candles, stale out-of-order updates, unsafe line IDs, and indicator count excess. An account switch clears series and bars; no broker routes are called.
- The isolated adapter also exposes a read-only exact-time data-window model: OHLC and real volume (or explicitly labeled tick-volume proxy), plus only line-series values whose timestamp exactly matches a loaded candle. Missing/warm-up data stays null, forming-bar updates invalidate indicator readouts, replacing history clears old values, and all fields identify the current account and `CHART_FEED` source. This is adapter capability only; no production sidebar/crosshair wiring is claimed.
- The isolated adapter renders horizontal price-level and vertical UTC-candle primitives. Their hit tests support selection and pointer-capture drag; horizontal lines follow the price coordinate, vertical lines snap to loaded bars, Escape restores the pre-drag anchor, and account/history changes cancel stale edits. A bounded in-memory history supports undo/redo, duplicate/delete and visibility/lock shortcuts. With an account/symbol/timeframe scope, a versioned localStorage snapshot restores drawings across browser reloads; external changes and invalid snapshots fail closed. Scoped JSON schema-v1 export/import validates all drawings before mutation and omits account identity. Chromium covers these paths. This remains a renderer proof without full layout migration or production drawing integration.
- Run: `npm install --prefix chart_studio_v5 --package-lock=false --no-audit --no-fund`, `npm --prefix chart_studio_v5 run check`, `npm --prefix chart_studio_v5 run build`, then `node scripts/smoke_chart_studio_v5.cjs` after installing the repository's Playwright Chromium dependencies. CI repeats these steps and stores a screenshot.
- Source is modular TypeScript. Generated `dist/` is not committed. No LWC 5 script or compiled bundles are shipped to production in this RFC.

## License, provenance and version lock

Lightweight Charts™ is distributed under Apache-2.0; its attribution requirements include linking to TradingView and retaining the upstream NOTICE. The v5 browser fixture includes a link to https://www.tradingview.com/. **Before actual main-dashboard migration**, display the mandatory attribution persistently in the UI and bundle the upstream NOTICE/LICENSE text appropriately (do not substitute a generic source-code link). Refer to https://tradingview.github.io/lightweight-charts/docs/ and https://tradingview.github.io/lightweight-charts/docs/migrations/from-v4-to-v5.

Pin must be reviewed for a security update with an explicit PR rather than `latest` dependency drifting silently. Production third-party asset/CDN injection is not allowed. Offline/local static packaging is the intended deployment.

## Next engineering gates (not claimed by this RFC)

1. Replace v4-specific price/time coordinate and mouse-gesture assumptions behind a versioned adapter interface; stable native price and time scale semantics, including multi-symbol/timeframe subscriptions.
2. Move production indicator math to v5 native panes **without duplicate render or duplicated EMA calculations**. Preserve user settings and complete pane sizing/axis labels; the isolated fixture now includes price/time lines plus bounded anchored text annotations with scoped local persistence and JSON transfer. Additional drawing types and stop/target draft overlays remain separate work.
3. Add robust rollback and v4/v5 screenshot parity on real historical broker data (account-scoped; no foreign-account fallback), responsiveness at 320/390/768/1440 px, full-screen, touch and reduced-motion.
4. Do not permit any new MT5 mutation from adapter or smoke tests; all real stop adjustments remain behind separate auth/CSRF/guard/revision/idempotency, and demo-user-release gates in Tasks 0.7/4.x.
5. Only after native browser/Windows-MT5 demo testing, migration review and user acceptance may `app.py` switch to v5. Build currently has **no** production switch.

## Acceptance evidence

- Task 0.8: version and API/license decision plus isolated proof source exist; CI results must be recorded before treating 0.8 as complete.
- Task 1.8, 2.1: **not completed**. The isolated renderer proves native price/time lines, anchored text annotations, two-point trend lines and filled rectangle zones, along with drawing persistence/transfer, hit testing, pointer-capture movement, candle snap and Escape rollback. It does not replace the production wrapper; additional drawing types, full parity and target-hardware acceptance remain open.

## Follow-up: native pane lifecycle package (PR #25)

The opt-in adapter now includes native v5 `addPaneLine`, `movePaneLine`, `resizePane` and `removePaneLine` using the single chart's `addSeries(LineSeries, ..., paneIndex)` API, not independent chart instances. Its read-only lifecycle caps oscillator panes at eight, validates series points, and removes all pane lines on account switch. The browser proof adds an RSI-shaped line, checks native pane movement and resize bounds, and checks disposal/account isolation. This is a renderer proof only, **not** a completed RSI indicator implementation or the production v5 migration.
