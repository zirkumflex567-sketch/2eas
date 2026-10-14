# AT-031 account/symbol/timeframe race stress

**Goal:** Add repeatable local-browser evidence for rapid ChartStudio scope changes without stale account data, duplicate symbol events, DOM/chart growth or MT5 writes.

**Requirements:** AT-031, FR-012, FR-005; preserve read-only behavior. This supplements current single-race assertions. It does not claim real-terminal or hardware memory acceptance.

**Fixture:** `scripts/smoke_chart_studio_beta.cjs`, using its existing local HTTP fixture, Titan/GoldM15 mock accounts, verified XAUUSD/EURUSD/GBPUSD symbols, and read-only API routes.

## Tasks

1. [x] Add a 20-cycle scope-change stress. Each cycle asserts actual account, verified-symbol and timeframe state changes; the test derives and checks all 60 transitions, plus exactly one `chartstudio:symbol-change` event per selected-symbol transition.
2. [x] Hold one old-scope GBPUSD portfolio and position response until the final Titan/XAUUSD/M15 scope is active, then release them. Wait for both browser responses to finish before asserting the stale data did not replace the final portfolio and position context.
3. [x] Capture DOM canvas/panel counts before and after; assert stable counts, no page errors, and no additional broker API mutations during the stress. Record forced-GC JS heap readings, diagnostic only and not hardware leak proof.
4. [x] Initial runs/review exposed test issues (position scope is in `positionContext`; one setup event; stale responses needed a completion barrier; transition count needed live assertions). Corrected these; full `node scripts/smoke_chart_studio_beta.cjs` passes with the stress included. Hardware, real-terminal and long-duration testing remain open.
5. [x] Independent spec and code-quality review completed; stale-response barrier and observed-transition assertions were strengthened from reviewer findings. Re-review found no remaining blocking or important issues.

**Acceptance:** `node scripts/smoke_chart_studio_beta.cjs` passes; 60 scope transitions are measured from observed state, the 20 selected-symbol transitions emit exactly 20 events, completed delayed old-scope data cannot replace the final view, selected UI element counts remain stable, and no broker API mutation occurs during the stress. Full 20-cycle behavior on both live demos, physical hardware memory profiling and long-duration endurance remain open.

**Safety:** Do not automate MT5 or browser GUI, invoke MT5 writes, start or alter terminals, run a backtest/Strategy Tester, or connect to GitHub.
