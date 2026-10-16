# FR-002 Volume-Triggered OHLC Zones

**Goal:** Add a read-only, transparent volume-triggered price-range overlay to the existing Chart Studio Market Structure panel.

**Rule `volume-range-median-v1`:** Use only complete candles closed by the supplied `asOfUtc`. For each candidate candle, select `real_volume` when positive; otherwise use `tick_volume` and label it `TICK_VOLUME_PROXY`. Compare the candidate with the median of the previous 20 complete candles using that same source. A trigger occurs at `candidateVolume >= priorMedian * 2`. The zone is the trigger candle's OHLC high/low range, beginning at its timestamp and ending no later than 20 chart bars after the trigger or the observed history end. Require 20 positive same-source baseline samples. No tick direction, bid/ask classification, orderbook, footprint, liquidity or institutional-order claim is inferred.

**Scope:** Add a toggle and multiplier/period settings to the existing account/symbol/timeframe-scoped Market Structure panel, expose source/count/status in the readout, and render translucent bounded rectangles. No new endpoint, broker write, EA change, MT5 UI operation, v5 cutover, or backtest.

**Validation:** RED/GREEN Node contracts for median threshold, real-volume preference, tick-proxy label, incomplete warm-up, closed-bar/as-of boundary, future bars, bounded duration, malformed volume and nonmutation; Chromium checks UI visibility, account scope, drawn-zone data, read-only requests and no browser errors.

## Tasks

- [x] Add failing pure formula contracts.
- [x] Implement versioned source-aware zone detection and preserve volume on cleaned bars.
- [x] Add account/symbol/timeframe-scoped controls and translucent OHLC zone rendering.
- [x] Verify formula and Chromium UI contracts, syntax, diff, and regression smokes.
- [ ] Record remaining v5 overlay, workspace, production, hardware, and load gates; push `main` and update guarded local runtime plus htown `/stt`.
