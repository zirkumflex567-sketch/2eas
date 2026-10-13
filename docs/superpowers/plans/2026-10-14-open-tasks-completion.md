# ChartStudio and Auditfix Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Each package needs its own file-level implementation plan before code changes.

**Goal:** Complete every remaining requirement and acceptance item in `docs/OPEN_TASKS.md`, except strategy backtests and Strategy Tester parity, while keeping `main` and `/stt` usable.

**Architecture:** Deliver independently reviewable packages on clean branches. Broker reads and immutable event recording feed the native ChartStudio UI; authenticated proposals and demo-only writes form a separate release. Every package updates the requirement ledger with evidence, tests, deployment status, and remaining gaps. Historical facts are never inferred from later calculations.

**Tech Stack:** Python/FastAPI, Pydantic, SQLite, browser JavaScript, Lightweight Charts v5, MQL5/MT5, PowerShell, nginx/SSH, pytest, Node/Chromium.

---

## Scope and baseline (14 October 2026)

- `main` is `255768f` after PRs #31 and #32. Both main CI workflows passed. #31 supplies strict immutable evidence models, opt-in private append-only storage and scoped read APIs. #32 quarantines the defective Stone-frame rendering path, while the full asset audit remains open.
- The root checkout contains unrelated uncommitted EA, preset and dashboard work. All implementation happens in the isolated `codex/open-tasks-delivery` worktree. Never reset, stage, or overwrite the root checkout's changes.
- Existing `docs/superpowers/plans/2026-10-09-open-tasks-execution.md` records earlier deliveries and the package architecture. This document tracks the *remaining* completion work and supersedes its stale baseline statements, without rewriting historical evidence.
- Strategy backtests and Strategy Tester parity are deferred. Unit, integration, browser, storage, security, performance, deployment and MT5-demo checks remain in scope. Deferred checks cannot be marked passed.
- MT5 is the selected economic-calendar source. An actual bid/ask execution footprint requires execution-side and volume data; when MT5 lacks them, the accepted result is an explicit unavailable state, never synthetic order flow.
- No funded-account mutation test. The real-write release requires its own security and demo gates. Existing ChartStudio remains read-only until those gates pass.

## Delivery and verification protocol

Each package below follows these steps. The package plan supplies exact files, test names, commands, expected RED/GREEN results, deployment steps and rollback criteria.

- [ ] Write the package plan from the master spec and current code; map its FR/AUD/AT IDs and verify dependencies.
- [ ] Write meaningful failing contract/integration tests, then implement the smallest complete vertical slice. Preserve unknown/unrecorded states and account isolation.
- [ ] Run focused tests, relevant regression suites, and independent code review. Fix findings before PR.
- [ ] Merge only after required PR checks pass. Check both workflows on the resulting `main` commit.
- [ ] Deploy a clean, exact-main checkout through the guarded runtime launcher; verify local and authenticated `/stt` identity, both configured demo feeds, and rollback readiness when runtime behavior changes.
- [ ] Update `OPEN_TASKS.md` per ID with implemented behavior, actual evidence and still-open acceptance. An ID closes only when its whole contract and relevant AT cases pass.

## Packages in dependency order

### 1. Actual EA and broker event capture (P0)

**IDs:** FR-026, FR-033, FR-035; AUD-09, AUD-11, AUD-12; AT-036–038, AT-049–050, AT-055–056.

- [ ] Map Titan and GoldM15's actual candidate, signal, reject, order-attempt, transaction and exit hooks. Record source/preset/binary identity without exposing credentials or altering entry/exit rules.
- [ ] Add a bounded, failure-isolated MQL5 event channel and a trusted local importer into `chart_studio/evidence_store.py`. Retry/idempotency, gaps, clock/source provenance and account/terminal identity are explicit. No browser-supplied append route.
- [ ] Record actual broker lifecycle and immutable entry/exit data snapshots independently of an active browser. Link decisions, orders, deals and positions only with proved identifiers. Historical missing events stay `NOT_RECORDED`.
- [ ] Add read-only inspector, journal linkage and snapshot history. Demonstrate failure of logging cannot block EA trading; compile both EAs and verify unchanged strategy decisions without Strategy Tester/backtests.
- [ ] Verify active demo EA/binary/preset identities, fresh captured events, partial fills/trailing provenance and exact/estimated MFE/MAE distinctions. Close IDs only after real demo evidence.

### 2. Broker models, risk previews and complete What-if (P0)

**IDs:** FR-004–006, FR-012, FR-019–020, FR-027; AT-008–012, AT-015–021, AT-026, AT-039–040.

- [ ] Complete native account/symbol-filtered position, pending-order and deal UI with historical entry/exit markers and account-safe scope switching.
- [ ] Add revision-bound mouse/touch SL/TP draft overlays and validate EA guard state. Keep all drafts and What-if plans free of MT5 writes.
- [ ] Complete Long/Short lots, margin, fees/FX assumptions, guard/DD distance, A/B save/export and broker-calculated profit/margin, including non-USD accounts and unavailable data.
- [ ] Complete the extended position planner with portfolio exposure and correlation scenarios. Use only verified position, price and currency inputs; mark unavailable correlation/history data explicitly.
- [ ] Exercise both demo terminals and rapid account/symbol/TF changes with no cross-account leakage.

### 3. Native v5 chart, layouts and drawing parity (P0)

**IDs:** FR-001–003, FR-008–011, FR-013–016; AUD-16; AT-001–007, AT-022–025, AT-031, AT-033–034.

- [ ] Complete v5 panes/axes, pointer and touch drawing primitives, object management, persistence/version migration and scoped layout operations.
- [ ] Complete the indicator parameter catalog, styles, price/volume levels and data window with correct UTC anchors, display shift, warmup and source labels.
- [ ] Switch the production view behind a reversible flag after parity and measured 5,000-bar/20-indicator/1,000-drawing budget. Run theme, DPI, touch, resize and Fullscreen acceptance.

### 4. Security-gated broker write release (separate release)

**IDs:** FR-007, FR-021; AUD-07, AUD-10; AT-013–017, AT-028–030, AT-032.

- [ ] Implement explicit role-bound proposals, confirmation, current broker/EA-guard read, optimistic revision, idempotency, bounded timeout, audit record and broker readback.
- [ ] Independently review proxy/firewall and all write paths. Deny cross-account, stale, double-confirm, hard-lock, stop/freeze and forged identity cases.
- [ ] Before enabling a real write route or running demo mutations, present the reviewed release candidate, exact demo account/operation list, rollback and security evidence for explicit user-controlled write approval. Keep the feature flag off until that release gate is satisfied.
- [ ] After that gate, run controlled MT5-demo end-to-end mutations and verify broker readback and audit records. Keep funded accounts out of tests.

### 5. Analysis, navigation and read-only integrations (P1)

**IDs:** FR-017–018, FR-022–023, FR-029–032, FR-034; AT-041–048, AT-053–054.

- [ ] Start this package only after the read-only P0 gates are safe and usable and package 4 has completed its separate write-release gate; no P1 activation before that point.
- [ ] Add alerts, watchlists, linked 2/4 charts, MTF confluence, sessions/DST and liquidity proxies with provenance and missing-data states.
- [ ] Add intended-price/quote/deal execution quality, deterministic market regimes and valid sample/fee/OOS reporting.
- [ ] Integrate MT5 economic calendar via read-only MQL5 bridge with event revisions, cancellation/stale state and explicit EA-guard separation.
- [ ] Finish P1 acceptance before starting the separate P2 replay package. Show footprint only for verified execution-side and volume data; otherwise show `UNAVAILABLE`.

### 5a. Event-backed replay (P2, after P1 acceptance)

**IDs:** FR-028 and the remaining FR-022 replay scope; AT-051–052.

- [ ] Implement barwise decision/position/indicator replay with as-of provenance, no look-ahead, bounded history and a technically enforced ban on MT5 mutations during replay.
- [ ] Verify replay against recorded events and explicit gaps. This package cannot be claimed from the earlier frozen candle preview.

### 6. Auditfix closure and operational acceptance

**IDs:** AUD-01–06, AUD-08, AUD-13–15 plus remaining AUD-03/07/09/11/12/16; AT-023–035 where relevant.

- [ ] Capture reproducible cold/warm API and page/network/asset budgets, MT5 lock spans, two-tab load, long-duration CPU/FPS/heap and Golden screenshots on real hardware.
- [ ] Finish the asset quarantine/replacement review, CSS tokens/layers, documented chart-pane FX and keyboard/screenreader/touch/150%-DPI checks.
- [ ] Verify broker clock/reset/DST assumptions, crash recovery and EA heartbeat/runtime identity on demo data. Review the local EMA9/auto-sync draft as a separate candidate with no embedded secrets or public Git-pull route.
- [ ] Profile Titan and GoldM15 OnTick/Timer paths, specifically Tick-HUD, retry sleep and GoldM15 service. Optimize only measured bottlenecks, with guard/risk behavior verified afterward.
- [ ] Re-run the original validation matrix, account races, network failure and long-run checks. Record actual before/after measurements rather than general speed claims.

### 7. Persistence, extension and device sync (P2)

**IDs:** FR-024–025 plus any remaining FR-001/009/022/028 persistence requirements.

- [ ] Deliver a constrained indicator extension model with signed imports and measured CPU/memory limits, without arbitrary evaluation.
- [ ] Deliver encrypted device sync with explicit user/role ACL, version conflicts and recoverable migration. Validate cross-device scope and offline conflict behavior.

## Final closure gate

- [ ] `OPEN_TASKS.md` has an evidence-backed result for FR-001–035, AUD-01–16 and AT-001–056. Deferred backtesting checks are explicitly marked deferred, not passed.
- [ ] All relevant PR and resulting-main CI checks pass; independent review findings are resolved.
- [ ] The released dashboard reports the exact clean `origin/main` revision and digest locally and through authenticated `/stt`; both MT5 demos and the reverse tunnel respond. Root checkout user changes remain untouched.
- [ ] No open non-backtesting requirement is represented as completed without its required demo, browser, security, hardware or deployment evidence.
