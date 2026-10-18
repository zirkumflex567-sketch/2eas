# FR-002 Native v5 Oscillator Feed Synchronization Plan

## Goal

When the user opens the optional read-only v5 preview, mirror the active local Chart Studio oscillator configuration into native v5 panes for the exact account, symbol and timeframe.

## Boundaries

- Keep v4 authoritative and the v5 preview opt-in.
- Synchronize only supported pane oscillator settings from `ChartStudioIndicators` and user-created instances from `ChartStudioOscillators`; do not derive unsupported overlays or broker/calendar data.
- Require exact local settings scope and `canExecute:false`; no requests, broker writes, MT5 actions or Blueberry access.
- Treat synchronized pane groups as transient: exclude them from local/portable v5 layouts and remove them on scope change, close, invalid config or engine failure.
- Leave all strategy backtests/Strategy Tester deferred.

## Tasks

1. [x] Add failing Chromium contracts for enabled oscillator synchronization, editor changes, independent parameters, account/scope rejection and layout exclusion.
2. [x] Add strict account/symbol/timeframe metadata and change notification to the v4 indicator settings source.
3. [x] Add transient oscillator lifecycle support to the v5 adapter without changing persistent/imported oscillator behavior.
4. [x] Add the local feed bridge, wire it into the preview lifecycle, and preserve atomic cleanup on errors.
5. [x] Run focused Chromium/Beta/v5 tests, TypeScript check/build, full regression, then record partial FR-002 evidence.
6. [ ] Commit and push on main after checks; guarded local and htown `/stt` rollout remains required.

## Release gates

This is preview-only. Full v4/v5 production parity, profile/editor parity, touch/DPI and hardware acceptance remain open. No trade or broker-write approval is implied.
