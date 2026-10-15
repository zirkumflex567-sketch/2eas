# FR-006 live demo stop-preview acceptance

**Goal:** Verify the ticket- and revision-bound broker stop-preview path on current open positions in the explicitly authorized non-Blueberry demos. The candidate always repeats the existing protective SL/TP price, so the broker calculates it without proposing a change.

**Boundary:** Read-only MT5 position/quote/metadata reads plus `order_calc_profit` through `/api/chart/v1/position/preview-stop`. No `/api/modify_position`, order route, terminal UI, EA reload, or browser automation. Every preview must be non-committable and leave the EA guard unknown.

## Acceptance

- [x] Restrict requests to `titan`, `xau5m_m5`, `titan_m5`, `xau5m_500`; derive the exact broker symbol from the verified candle feed.
- [x] Read current positions and retain the exact ticket, account, symbol and revision returned by MT5.
- [x] Submit only unchanged protective levels and assert exact scope/revision, valid geometry, matching PnL currency, `canCommit=false`, `canExecute=false`, and guard `UNKNOWN/NONE`.
- [x] Run `node scripts/smoke_live_position_stop_preview.cjs` against the guarded local Main runtime.
- [x] Confirm empty books are reported without inventing a position or preview.

## Live result (2026-10-16)

The four verified chart feeds were M15 gold: `titan` on `XAUUSD` and the three PU-Prime demos on `XAUUSD.p`. The books contained 0/2/2/0 open positions. Four unchanged-SL previews succeeded across `xau5m_m5` and `titan_m5`; each returned the matching ticket revision, valid geometry, USD PnL, `canCommit=false`, `canExecute=false`, and guard `UNKNOWN/NONE`. The two empty books were read but not previewed. Blueberry was not queried; no position mutation or order route was called.

## Remaining gates

FR-006 remains partial: changed-price/draft gestures, end-user UI, touch/target-hardware acceptance, fresh EA guard provenance and broader broker cases remain unverified. The independent write-release gate stays closed.
