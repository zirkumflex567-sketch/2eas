# Authoritative MT5 chart read models implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development + test-driven-development, spec review followed by quality review.

**Goal:** Deliver verified account/symbol-scoped OPEN_POSITION, PENDING_ORDER and HISTORY_DEAL contracts with revisions, broker metadata and honest freshness, without executing trades.

**Architecture:** Focused chart_studio/broker_reads.py handles normalization and validation; chart_studio/read_api.py installs endpoints using the existing account_gateway.session lock and verify_identity. Existing cockpit endpoints and JSON remain compatible. Raw broker clock values and explicit configured UTC conversion are both retained.

**Tech Stack:** Python/FastAPI/Pydantic, MT5 read APIs, Decimal canonical strings, SHA256 opaque revisions, pytest fakes, real demo GET verification.

## Task 1: symbols, symbol info and open/pending snapshots

Implementation/review evidence: commits 47bc90f and e3fc782 (rebased without content changes from independently approved bb94ef9). 135 focused tests pass. Spec fixes rejected inconsistent second/millisecond clocks and missing/mismatched legacy symbol metadata. Full suite, PR CI and live rollout remain pending.

Files: create chart_studio/broker_reads.py, chart_studio/read_api.py, tests/test_chart_studio_broker_reads.py; modify app.py to install routes and capabilities, docs/OPEN_TASKS.md partial evidence.

- [x] RED tests: explicit account required/unknown rejected before MT5; scope lock verifies expected login/server and never launches a stopped terminal. Two accounts cannot reuse each other's connection or position.
- [x] RED tests: GET /api/chart/v1/symbols?account=...&q=... returns actually existing broker symbols, bounded search limit (1..200), trade mode/provenance; no symbol_select side effect. GET /symbol-info has real digits/ticksize/point/stops/freeze/volume limits/currencies/trade mode; unknown/malformed symbol rejected, no XAU fallback.
- [x] RED tests: GET /positions?account=...&symbol=... returns separate positions/orders arrays, real account currency/margin mode and quotes with source/freshness. Multiple hedged/against-side tickets retained, pending type labels distinct. `None` broker result => 503 even if the other array is available; empty tuple => honest empty array. No signal-derived position or DRAFT.
- [x] RED tests: filters ticket, magic, manual apply to the verified broker result, never to another account. Strategy owner is MANUAL when magic=0; unknown EA magic remains UNKNOWN (don't guess from comments).
- [x] RED legacy quote regression: `/api/chart/v1/quotes` currently labels raw broker epoch as `quoteTimeUtc`. Correct it with the configured broker-clock conversion, retaining field names/numeric types used by the existing UI; add the original broker epoch, normalized age/freshness and offset provenance. Reject missing/nonfinite/crossed quotes and missing clock policy. Existing XAU-only scope remains until symbol-aware UI delivery. New model quote timestamps are explicitly normalized UTC with the raw source retained.
- [x] RED tests: each position/order contains canonical decimal strings, decimal-string IDs, nullable unsetSL/TP (0 is not a zone), side/volume/prices/magic/provenance. Invalid/nonfinite fields, crossed bid/ask, impossible side fail closed; stale valid quote keeps read models visible with explicit stale and canExecute=false.
- [x] RED tests: position revision includes account login/server, symbol, ticket/identifier/type/volume/price_open/SL/TP/time_update_msc. Pending order revision has a separate real TradeOrder schema: account/login/server/symbol/ticket/position_id/type/volume_current/volume_initial/price_open/price_stoplimit/SL/TP/time_setup_msc/time_expiration/type_time/type_filling/state. Pending orders have no time_update/position identifier field to invent. Any semantic mutation changes its hash; quote-only floating price/PnL changes don't change revisions. MT5 server-clock creation/update/expiry times converted using broker_clock, with original raw epoch and offset source retained. A missing required field cannot silently produce fabricated data.
- [x] Run `C:/Python314/python.exe -m pytest tests/test_chart_studio_broker_reads.py -q`, observe RED; implement minimal functions and endpoints under locked gateway.
- [x] Add mock API tests verifying query/body validation, malformed responses, account mismatch and zero order_send. Add new read endpoints; retain legacy quote fields/types while correcting their UTC meaning. The current UI consumes bid/ask/tickSize, not quoteTimeUtc.
- [ ] Targeted tests plus full pytest pass; independent spec then quality review and fixes. Commit exact files. Do not mark all FR-004/005/019 acceptance complete: UI/historical rendering and currency conversion are later tasks.

## Task 2: actual history deal pagination

Files: extend broker_reads.py/read_api.py; add tests/test_chart_studio_trade_history.py and chart_studio/history_cursor.py.

- [ ] RED: GET /trades requires account/symbol, bounded explicit UTC range <=31 days and limit1..500, returns HISTORY_DEAL from history_deals_get exclusively. Preserve entry/exit/reversal kind, actual fill time/price/volume/cost/profit/positionIdentifier/orderTicket; trade-side unknown is explicit, not guessed.
- [ ] RED: distinguish errorNone from empty history; exclude non-trade balance/credit rows from fills while reporting omitted categories. Account/symbol/magic/manual/ticket filters enforced after broker fetch.
- [ ] RED: cursor pins UTC range/as-of upper boundary and exact filter/account identity; authenticated opaque cursor invalid across accounts/filters or after process restart (explicit cursor-expired), stable ordering(time_msc,ticket) excludes repeated rows. Bound raw history <=50000 rows or explicit HISTORY_LIMIT, not silent truncation. Newer data cannot leak beyond pinned boundary.
- [ ] RED: datetime query sent in configured broker clock; raw broker times and normalized UTC retained; no future markers from cursor/history. String-decimal money, account currency, no invented USD FX.
- [ ] Observe failing pytest, implement minimal HMAC cursor with random process key, no URL secrets and constant-time verification; focused tests then spec/quality review. Existing FIFO journal remains unchanged.

## Next read-model tasks (separate detailed plans)

- Versioned real ticket preview-stop with stop/freeze/guard checks, timeout/expiry and no order_send (FR-006). Authority of guard must be recorded; unknown policy => canCommit=false.
- Historical bars pagination and indicator warmups; provenance and explicit as-of (FR-022), measured storage/CPU budget.
- Broker-calculated scenario A/B, lots/margin/guard/DD and verified FX (FR-027/020). Non-USD values cannot receive cosmetic USD labels.
- Native v5 UI open/pending/history integration and filter controls (FR-004/005/019), then independent write gate.

## Documentation / live acceptance

Official references: [positions_get](https://www.mql5.com/en/docs/python_metatrader5/mt5positionsget_py), [orders_get](https://www.mql5.com/en/docs/python_metatrader5/mt5ordersget_py), [history_deals_get](https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py). The native API returns None on error and tuples on success; symbol takes precedence over ticket, so request one symbol dataset and filter its tickets rather than assuming both filters are applied.

- [ ] Public/local authenticated GET smoke on both existing demos, account switch races and no mutation requests; filtered evidence stays under ignored output/integration-live.
- [ ] CI then main merge, latest runtime proof and public smoke. Preserve existing running MT5 charts/EAs.
