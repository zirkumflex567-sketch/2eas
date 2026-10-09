# Backend audit fixes — implementation evidence

Scope: SAFE-01/02/03/04, DATA-01/02/03, PERF-02. Base `8562771832ff078fce6f67390439c8638e95c787`; branch `test/audit-backend`. No EA, Chart API, candles API, HTML/JS or account_gateway lock changes.

## TDD execution

Command throughout: `C:/Python314/python.exe -m pytest tests -q --tb=short`.
Baseline: **46 passed, 16 subtests passed**. Each behavior below was tested RED before implementation, then GREEN and the full regression suite rerun:

| Behavior slice | Observed RED | GREEN/regression result |
|---|---|---|
| Finite models, positive ticket/price/baseline, Literal action | 21 failures: invalid values did not raise | 67 tests passed |
| Exclusive USD/price/removal; removal flags | 5 failures, 2 existing behaviors passed | 74 passed |
| Mandatory write account and XAUUSD scope | 5 failures: HTTP200 instead of 422/403 | 79 passed |
| Computed positive price; tick size and broker stops/freeze metadata | 6 failures: HTTP200 instead of 422/503 | 85 passed |
| Validated DD config; stage/replace/readback/failure rollback | 8 failures: no exception or success HTTP200 | 93 passed |
| None history/positions fail closed with recovery | 5 failures: HTTP200/404 instead of 503 | 99 passed |
| Expire manual baseline at UTC risk-day boundary | 3 failures: old manual_active remained true | 103 passed |
| Journal ownership/unknown reasons/FIFO entry costs and partial closes | 2 failures: foreign entries included | 105 passed |
| Titan closed-bar invariance and Wilder RSI | 2 failures: forming bar changed matrix; wrong RSI | 107 passed |
| Guard baseline is not a live heartbeat | missing protection_status | 108 passed |
| Opt-in light status and account-only journal cache | 4 failures: journal still built; other account leaked | 112 passed |
| Gold account/bar/data/preset computation cache | compute called twice, expected once | 113 passed |
| Daily entry commission/fees/swap | -299 instead of -300 | 114 passed |
| Evidenced Gold S1/S2/S3 long/short and duplicate deals | 4 failures: slot absent / duplicate output | 119 passed |
| Invalid account numbers, mismatched lifecycle | 4 failures: nonfinite JSON/crash, missing row | 123 passed |
| Partial-close penny allocation | entry cost disappeared (0 instead of -.01) | 124 passed |
| Nonfinite deal and inconsistent manual timestamp | 2 failures: invalid JSON / old baseline active | 128 passed |
| Strict removal flags/tickets and missing close quote | 4 failures: coercion or None quote crash | 135 passed |
| Persisted incomplete schema | 2 failures: defaulted {} and partial object | 138 passed |

Additional regression fixtures cover Wilder known values (existing), Berlin DST/header/journal instant consistency, cache detached copies/capacity/account login key, EA reference climax/SR indexing/readiness, same-day reset readback/restart, and Gold next-day fallback to validated persisted EA baseline while live protection remains unknown.

Final suite: **139 passed, 16 subtests passed**. Compileall succeeded. Tests isolate every MT5 call used and reset/guard targets; no real order, reset or terminal mutation.

## API integration contract

- Prefer `/api/status?account=...&include_journal=false`; `light=true` is an alias. Existing default callers still get journal. Light omits journal, journal_cache and journal_meta but retains fresh risk/position/quote fields. Global account lock unchanged.
- Success daily_drawdown fields remain numeric. None/unreadable/nonfinite risk data returns HTTP503, not fictitious zero loss.
- Stop removal: `sl_price:0` / `tp_price:0` OR strict boolean `remove_sl:true` / `remove_tp:true`. `*_usd:0` means break-even, **not removal**. USD and price/removal conflict returns 422. Positive nonzero price must lie on broker tick grid and respect stop/freeze distances; missing metadata returns 503.
- DD has `risk_day`, `risk_timezone:'UTC'`, `risk_reset_hour`, `manual_expired`. Gold uses preset RiskResetHourServer on the explicit existing UTC interpretation; broker/funded reset timezone equivalence is not asserted.
- Journal GET exposes only selected account. `journal_meta` gives fixed dated UTC cutoff and snapshot age. UTC interpretation is explicit; Europe/Berlin conversion is DST-aware. Open PnL is unrealized profit+swap, excluding entry costs. Closed `profit_usd` is compatibility alias of net_profit_usd incl allocated entry costs, fees and swap; gross_profit_usd is separate.
- Incomplete lifecycle / reversal / close-by accounting has `net_complete:false`, `net_unknown_reason`, nullable net_profit_usd/profit_usd/open_price/type. UI must display unknown values without coercing them to 0 or invoking `.toFixed` on null. No reason is invented.
- Titan `signal_mode:'closed_bar_reference'`, signal_label, signal_bar_time_utc, `signal_preview` (forming-bar only), ea_execution_verified:false and status unknown. Eight rule rows remain. Source/default preset inspected; runtime inputs and exact attached EA identity are **not proven**, so no 1:1 live-execution assertion. EMA startup uses available rate history; no terminal CopyBuffer capture is claimed.
- Guard `baseline_verified` only validates persisted daily baseline. `hard_lock`/`daily_lock` are null without heartbeat. Persisted lock values move to `persisted_hard_lock`/`persisted_daily_lock`; protection_status unknown, heartbeat_verified false and no fabricated freshness timestamp.

## Intentional existing-test updates

`test_multi_account.py`: supply broker quote/tick/stops/freeze metadata to existing conversion fixture, keep expected 3975/4050 conversion unchanged. No security changes (parent owns them).

`test_stone_celebrations_contract.py`: remove exit-only net formula source assertion, require net alias/accounting helper; real numeric FIFO/partial-close regressions now prove entry-cost correctness. Celebration UI untouched.

## Remaining boundaries

Two independent reset files cannot be process-crash-atomic; both staged before replacement, each replacement atomic, readback mandatory, failure rolls back with explicit partial-state error if rollback fails. Success means persisted—not EA acknowledgement. Gold writes display config only.

Unknown EA decision reasons/heartbeat cannot be reconstructed truthfully from MT5 deals/state v1.21. No EA modification or fabricated event/heartbeat added.

Computation cache removes repeated Gold indicator work, not MT5 rate retrieval. Real status p95/cross-account browser timing, UI null rendering/auth integration and final CI remain parent verification gates; fake-fixture timings are not live performance proof.
