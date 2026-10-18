# Recorder shutdown flush

## Goal

Drain the bounded in-memory MT5 evidence queue during orderly EA deinitialization. A detach, chart close, or terminal shutdown must not discard up to one queue's worth of already captured records when the private spool is writable. Keep the drain bounded and stop immediately on recorder disablement or lack of progress. Do not add filesystem work to `OnTick` or `OnTradeTransaction`, and do not alter strategy decisions or trade calls.

## Scope

- Shared `ChartStudioEvidenceSpool.mqh`: add a shutdown drain that invokes the existing maximum-eight-record timer flush at most `ceil(CS_QUEUE_CAPACITY / CS_QUEUE_BATCH)` times, stopping on empty queue, disabled recorder, or unchanged queue count.
- Titan and GoldM15 evidence builders: call that drain from the generated `OnDeinit` before killing the timer and before GoldM15 risk-guard shutdown.
- Builder tests: assert the generated deinit ordering and bounded helper contract for both EAs; preserve the ordinary non-capture source path.
- Update GoldM15's pinned shared-helper hash and run focused regression tests plus isolated MetaEditor builds.

## Verification

Run RED before implementation. Then run Titan/GoldM15 builder tests, recorder spool/store/lifecycle regressions, `git diff --check`, and MetaEditor compile for both account-bound GoldM15 and Titan candidates. Do not attach/reload any EA or run a trade, Strategy Tester, or backtest.

## Acceptance boundary

This reduces loss on orderly deinitialization only. It does not prove recovery after forced process termination or storage failure; sequence gaps remain visible for those failures. Live demo event acceptance, runtime identity, partial-fill/trailing provenance, hardware, and write-release gates remain open.

## Execution record (18 October 2026)

- RED/GREEN: the Titan and GoldM15 generated-deinit tests failed before the change and pass after it.
- Regression: 235 recorder model/store/spool/service/lifecycle and Titan/GoldM15 builder/contract tests passed with Python 3.14.3; four existing FastAPI `on_event` deprecation warnings remain.
- MetaEditor: isolated Titan `xau5m_m5`, Titan `titan_m5`, and GoldM15 candidates each compiled with 0 errors and 0 warnings. EX5 SHA-256 values are `49f7e7c4d1d3bb55df3542fea5ca1b51aa23986e45576bebc3e71f2591887f6b`, `a170b8a648fc8930994e0ea92dc80466e963072abeffbaf9235976f4757d7252`, and `35d46ee6d24a2f7d462ddff04c55810bc62e85e3ff9f3540e3d88d56b94fc43f`, respectively.
- The GoldM15 and two Titan compiled candidates were copied side-by-side into their non-Blueberry demo Experts folders; manifests record `INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED`. No chart/profile/preset or running EA was reloaded. No order or backtest was run.
- A live recorder smoke still reports Titan `IDLE` and Marketplace `NOT_CONFIGURED`; fresh quotes and actual Decision events are not yet observed. Blueberry was not queried.
