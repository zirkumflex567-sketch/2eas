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
6. [x] Commit/push on `main` (`c97e8b5`); both Main workflows passed (Chart Studio `39121944142`, Performance/UX `39121944193`). Guarded local Runtime and htown `/stt` upstream agree on revision `c97e8b5e4d3a1326b420ca9f13a7e1506a0c4d8f` and digest `e5b032fa8e520c80a4556483747d43d1228c355a151d5d38f7994a1a91d903c4`, with `restart_required=false`; htown checkout is clean on `main` and nginx is active with `nginx -t` passing. Four-demo read-only chart acceptance loaded 1,001 verified XAU M15 candles per account with no writes, browser errors or Blueberry request.

## Release gates

This is preview-only. Full v4/v5 production parity, profile/editor parity, touch/DPI and hardware acceptance remain open. No trade or broker-write approval is implied.
