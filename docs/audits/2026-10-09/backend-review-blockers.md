# Independent backend review blockers

Scope: `app.py` backend only (no Chart APIs/candles/HTML), `journal_accounting.py`, isolated tests and this document. Security middleware, EAs and original checkouts are untouched. All broker calls and reset destinations are mocked/redirected in tests; no live order/reset was performed.

## Source freshness API contract

`GET /api/status` (full or light) succeeds with HTTP200 only for fresh broker data. Success retains numeric risk fields and adds these top-level fields:

- `source_fresh`: boolean, true on successful status.
- `quote_time_epoch`: numeric MT5 `tick.time`, seconds since Unix epoch, interpreted as UTC. This is source time, never request time.
- `quote_age_seconds`: signed finite number, `time.time() - tick.time`; a negative age means the source is ahead of the wall clock.
- `source_status`: `fresh` on success; `stale` for a timestamped rejected quote, `unknown` for invalid/missing source timestamps.
- `quote_max_age_seconds`: effective safety threshold, default and hard maximum 30 seconds.
- `quote_future_tolerance_seconds`: 5 seconds.
- `risk_status`: `available` on success; this is not EA execution/heartbeat verification.

Missing/invalid/nonfinite timestamps, nonpositive/nonfinite quote prices, age > effective maximum, or future offset >5 seconds fail HTTP503 with those freshness fields inside JSON `detail`, plus `risk_status: unknown` and a message. Invalid timestamps/ages are represented as null, never NaN/Infinity. Stale status detail includes `daily_drawdown` policy metadata (`manual_active`, `manual_expired`, `risk_day`, `risk_timezone`, `risk_reset_hour`, `risk_status`), **not** fabricated numeric risk. Parent UI must mark HTTP503 stale; do not treat a successful HTTP round trip as a fresh source. No fake heartbeat is added.

`DASHBOARD_QUOTE_MAX_AGE_SECONDS` optionally tightens the limit. Positive finite values are capped at 30; invalid/nonpositive/nonfinite values fall back to 30. Values cannot disable or widen the hard cap. Future tolerance remains 5 seconds.

Mutations independently enforce source freshness for modify/close and both reset actions, including `auto`. Close remains a market close with the existing volume/filling/comment/deviation business behavior; it does not bypass freshness as an emergency exception. Modify/close fetch and check another quote immediately before `order_send`; close uses that latest price. Stale/invalid requests never reach mocked `order_send` or write reset files. Freshness does not prove account data age, attached EA health or broker execution permission; identity locking remains in place.

## Risk policy clock

Actual wall UTC (`time.time()`), not the broker tick clock, determines the risk day, reset timestamp and daily-history end. Titan reset hour remains UTC0; Gold uses the existing configured reset-hour offset interpreted in UTC. Guard baseline date validation also receives wall time, without changing its independent unknown-heartbeat contract. A frozen tick cannot keep yesterday's manual reset active; stale HTTP503 still exposes its expired policy state. Test clocks alone are injected/frozen; production uses real wall time.

## Stop quantization

Only USD-derived SL/TP prices are quantized using Decimal: BUY rounds up to a whole broker tick, SELL down. Thus nominal payoff is no smaller than requested, and requested stop loss is not enlarged. Broker side/distance limits still apply after quantization. Example: -$50, 0.03 lots, 100 contract, entry4000, tick0.01 yields BUY SL3983.34 / SELL SL4016.66. Explicit prices remain exact: any off-grid supplied price is HTTP422, including tiny off-grid differences. Zero USD still means break-even; explicit removal remains separate.

Limits: the existing contract-size linear USD conversion is retained; nominal payoff excludes costs, slippage and currency conversion. Stops do not guarantee realized loss.

## Journal ownership

FIFO consumes all lifecycle entry inventory so foreign lots cannot silently disappear. If any consumed entry is foreign, accounting is incomplete/unknown: attributable volume, opening price, entry costs, gross/exit/net profit are null, including through `build_trade_journal`. Manual/foreign INOUT and OUT_BY invalidate owned inventory irrespective of their magic; subsequent attributable exits cannot reuse stale entry prices/costs. Conservative invalidation persists within that position lifecycle because reversal volume ownership is not reconstructed. Pure owned partial closes retain final-cent cost allocation and evidenced manual exit matching.

## Execution evidence

Interpreter: `C:/Python314/python.exe` (default Python3.11 lacked numpy; no packages were installed).

Baseline `python -m pytest tests/ -q`: **213 passed, 177 subtests passed**.

Strict RED→GREEN slices:

| Slice | Observed RED | GREEN |
|---|---:|---:|
| USD-derived quantization | 6 failures; existing exact-price control passed | 7 passed |
| Mixed ownership + manual/foreign reversal/close-by, real accounting/build | 12 failures | 12 passed |
| Source age/bounds/mutations/invalid timestamps/wall-risk expiry/reset/pre-send recheck | 29 failures after correcting test input types | 29 passed |
| Strengthened invalidated lifecycle gross/exit attribution | 8 failures | 8 passed |
| Strict tiny off-grid exact supplied price | 1 failure | passes |
| Configurable tighter hard-capped age | 1 failure, 4 controls passed | 5 passed |

Additional invalid status timestamp checks passed with the same source validation. New review test file: **60 tests**. Updated existing fixtures provide timestamped finite quotes and independently frozen deterministic wall clocks; account isolation/conversion/time assertions are unchanged. Final focused backend suite: **174 passed** before cleanup. Final full `tests/`: **273 passed, 177 subtests passed** in 221.83s.

Verification compared AST source segments for all 12 Chart/candles functions and the entire HTML tail to base142c4b2, and confirmed zero middleware diff. `git diff --check` passed. Remaining UI rendering/integration is parent-owned; no live broker validation was attempted.
