# Read-only broker preview acceptance on the four demo feeds

**Goal:** Verify the actual local Main runtime can read each authorized demo's chart symbol, fresh quote and portfolio context, then return broker-calculated sizing, margin and PnL for a What-if scenario. Keep every result non-executable and exclude Blueberry.

**Scope:** FR-005, FR-020 and FR-027 live read-only acceptance. This does not exercise the separate ticket-bound stop preview in FR-006, authorize trade mutations, infer an EA guard, or close hardware/demo acceptance globally.

## Acceptance

- [x] Restrict the runner to `titan`, `xau5m_m5`, `titan_m5` and `xau5m_500`; derive the broker symbol from each verified M15 candle response.
- [x] Verify `MT5_VERIFIED` candle/quote/portfolio provenance, exact account+symbol scope, explicit risk/correlation states and `canExecute=false`.
- [x] Use only the read-only scenario calculation endpoint to verify positive broker sizing, margin, stop PnL and target PnL. Never call order, modify, close, or workspace-write endpoints.
- [x] Run `node scripts/smoke_live_whatif_demos.cjs` on the guarded local Main runtime.
- [x] Preserve `UNAVAILABLE` correlation and `UNKNOWN` EA guard as such; no synthetic value or trade permission.

## Live result (2026-10-16)

All four feeds returned 150 verified M15 gold candles and fresh quotes. Broker symbols were `XAUUSD` for `titan` and `XAUUSD.p` for the other three. Portfolio stop risk was `AVAILABLE`; correlation was explicitly `UNAVAILABLE`. Each broker calculation returned 0.01 lots, USD margin and stop/target PnL, with `canExecute=false`; daily DD/EA guard remained `UNKNOWN`. Position counts were 0/2/2/0. No order or other broker write occurred; Blueberry was not queried.

## Remaining gates

FR-005/020/027 remain partial pending broader risk inputs, correlation history and hardware acceptance. FR-006's separate ticket-bound SL/TP stop-preview contract and remaining demo/hardware checks were not exercised here. The approval gate for any trade mutation remains separate and closed.
