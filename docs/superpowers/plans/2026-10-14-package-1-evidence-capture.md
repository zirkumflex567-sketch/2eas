# Package 1 plan: EA event capture and broker lifecycle evidence

Date: 2026-10-14. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Scope

FR-026/033/035, AUD-09/11/12, AT-036–038/049–050/055–056. Strategy Tester, backtests and any trade-rule or preset edits are excluded. The initial release is opt-in and read-only. Existing EvidenceStore remains the only immutable database writer; there is no HTTP append route.

## Evidence and blockers

`docs/EA_RUNTIME_IDENTITY_2026-10-14.md` is the identity ledger. The earlier read-only inventory showed Titan in three terminals and GoldM15 on the fourth. A newer 16:18 UTC inventory confirms four running terminal processes; their 14 October logs currently show XAU_Titan_Pro on all four, with XAUUSD.pi M15/M30, XAUUSD.p M15, XAUUSD.p M5 and XAUUSD M15 chart initializations. The runtime account API lists five configured aliases, and no API account-to-process binding was queried. No current log line identifies GoldM15_Reconstruction or XAUUSD 5 minute. This does not prove four distinct attached strategies or their in-memory binaries/presets; the chart profiles do not provide a fresh binding. Therefore no source replacement, EA attach, auto-trading toggle or demo trade is allowed in this package until a fresh, chart-bound identity record is collected. The recorder work must not claim events from those existing charts.

## Vertical-slice sequence

1. Define a strict local spool record contract: bounded line size/count, schema version, explicit configured account, opaque terminal identity, producer identity, monotonic sequence, UTC observation time, event kind, and payload. Reject malformed, oversized, cross-account, duplicate-conflicting and out-of-order records; keep duplicate identical records idempotent. Preserve a visible loss/gap count; never infer events across gaps.
2. Add a private spool consumer that reads complete newline-terminated records only, validates configured account/terminal context, maps only supported decision and lifecycle facts to existing schema-v1 envelopes, and calls `EvidenceStore.append`. Persist its cursor atomically outside the Git checkout; recover by replaying idempotently. Do not expose it as an HTTP route. It must not launch/connect to MT5 or block trade functions.
3. Add deterministic unit/integration tests first for malformed input, account isolation, duplicate/restart handling, partial final line, sequence gaps, importer crash/restart, append idempotency and logger/store failure. Use a temporary private root outside the repository. Verify there is no mutation call in the importer path.
4. Instrument EA hooks only after source and preset identity are verified. Use short `OnTradeTransaction` enqueue callbacks; no SQLite, network, sleep or disk flush inside tick/transaction hot paths. Decision hooks must record exact observed feature/predicate values and stable parameter/source hashes without changing branch conditions or order calls. Logger failure sets a bounded loss marker and returns immediately.
5. Compile the exact source copies and compare decision/order-call semantics against the pre-instrumented sources. Attach only to explicitly authorized demo charts after reviewing exact account, source, compiled binary and preset. Observe fresh events, broker transactions, partial fills and trailing changes read-only. Snapshot capture is independent of browser state; historical unrecorded periods remain `NOT_RECORDED`.
6. Add inspector/journal/snapshot UI only after the event pipe is proved. Render exact vs OHLC-estimated MFE/MAE distinctly and never infer intrabar order from bars alone.
7. Review, merge, CI, deploy a clean exact-main build, verify authenticated local and `/stt` runtime identity, then update every mapped FR/AUD/AT status with evidence.

## Files to evaluate

- New `chart_studio/evidence_spool.py` for bounded local record validation and cursor/importer logic.
- New tests under `tests/test_chart_studio_evidence_spool.py`.
- `chart_studio/evidence_models.py` validators and `EvidenceStore.append` are reused, not weakened.
- EA sources and preset files are excluded until runtime identity gate passes; no file from the dirty root checkout is overwritten or copied implicitly.
- UI files are out of the first vertical slice.

## Acceptance and stop conditions

A package milestone may close only with independent test/review evidence and an observed demo capture from a verified EA build. If identity, MQL5 compiler, MT5 event coverage, private spool location or chart-bound demo evidence cannot be obtained, preserve the safe read-only behavior and leave associated IDs open. Never mark synthetic fixtures or installed-file inspection as live capture evidence.

## Progress

- [x] Mapped checked-in Titan and GoldM15 candidate hooks with SHA-256 manifests and identified decision, risk-reject, order-intent and protective-exit points in [`EA_EVENT_HOOK_MAP_2026-10-14.md`](../../EA_EVENT_HOOK_MAP_2026-10-14.md). This is source-only review; runtime chart identities remain unverified and neither EA was changed.
- [x] Extended the read-only terminal inventory to all four running MT5 processes by resolving the non-portable terminal's roaming data folder. The initial inventory showed Titan in three and GoldM15 on XAUUSD M15 in the fourth; the newer 16:18 UTC log scan shows Titan on all four processes and no current GoldM15/XAUUSD 5 minute initialization. Five account aliases are configured but not bound to the four processes. Installed hashes and the supplied boss.set hash are recorded; loaded in-memory binary/preset identity remains unverified. No terminal or EA was changed.
- [x] Copied the GoldM15 v1.21 source/includes from its observed data folder and compiled twice in ignored output using MetaEditor 6230. Both runs reported zero errors/warnings; outputs differed from each other and the installed EX5. Exact hashes and the input/preset comparison are in docs/EA_GOLDM15_121_COMPILE_2026-10-14.md. No Strategy Tester, terminal write, or EA reload.
- [x] Bounded schema-v1 line validation, configured account/terminal/producer binding, atomic private write-ahead cursor, idempotent replay, sequence conflict rejection, first/interior gap counts, and store-loss reporting implemented in `chart_studio/evidence_spool.py`.
- [x] Unit tests first observed the missing-module failure; reviewer findings for first-sequence gaps, lost cursor state across restarts, and parser recursion were reproduced before fixes.
- [x] Add an opt-in single-consumer private file reader/rotation protocol and application startup/shutdown wiring; bounded reads run off the event loop and expose internal gap/loss diagnostics. It remains disabled without an explicit private spool root; it has not yet been enabled for live EA producers.
- [x] Harden the committed reader for multiple preconstructed consumers, reject ready→active reversals, and bind archive completion to the imported file identity and content digest; focused and full-suite regressions plus independent review pass.
- [ ] Add actual Titan/GoldM15 EA producers after resolving runtime identities; compile and verify without strategy changes.
- [x] Add an authenticated read-only Beta inspector for Decisions, Lifecycle, and Snapshots with bounded UTC range, account invalidation, cursor paging, explicit coverage/gap/`NOT_RECORDED` states, and inert JSON rendering. Chromium tests cover recorded/empty states, pagination, hostile text, chart immutability, and no POST/write path.
- [ ] Collect verified Titan/GoldM15 demo records and complete the inspector/journal/snapshot acceptance; all related IDs remain open until then.
