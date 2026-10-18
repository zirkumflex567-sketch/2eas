# FR-029 versioned MTF rule profile implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the read-only five-timeframe MTF panel with user-editable, account/symbol-scoped, versioned EMA-bias rules and explainable confluence states, without inventing EA settings or implying trade probability.

**Architecture:** Keep the existing closed-bar `ChartStudioMTF` engine authoritative for source, scope, gap and as-of checks. Add a pure validator/evaluator for an explicit version-1 rule profile, then render and persist that profile locally by account and symbol. No profile defaults to an active strategy; no rule profile produces `UNCONFIGURED`. All calculation stays on the same immutable five-frame response and the captured UTC as-of. Emit deterministic `FeatureSnapshot` audit metadata for the decision window, per-frame bar granularity, closed source window, warmup, algorithm version and frame quality. This metadata explains the calculation but does not guarantee recomputation if broker history is later revised.

**Tech Stack:** Vanilla JavaScript, localStorage, Node contracts, Playwright/Chromium smoke tests.

---

## Boundaries

- Implement only explicit per-frame EMA-bias expectations (`ANY`, `UP`, `DOWN`, `NEUTRAL`) in this slice. Do not claim this completes EMA slope, volatility, structure-change or setup criteria from §24.4; retain those as open follow-up work.
- Rule schema carries `schemaVersion`, `ruleVersion`, positive `revision`, stable `profileId`, account ID, symbol, five frame predicates and update UTC. `validateRuleSet` validates one profile's shape; a separate transition validator compares an update against the stored same-scope profile and requires the same profile ID/scope plus a strictly larger revision. Creation starts at revision 1 only when storage is truly absent. Corrupt stored state blocks saves and is never silently replaced. Scope mismatch, unknown fields, invalid versions or malformed predicates fail closed without changing saved state.
- Each predicate is `MATCH`, `PARTIAL`, `CONTRADICTED`, `UNKNOWN` or `NOT_REQUIRED`. `PARTIAL` means a required directional bias is currently `NEUTRAL`; opposite direction is `CONTRADICTED`; absent/stale/unavailable/non-ready frame is `UNKNOWN`.
- Overall status is `UNCONFIGURED` when no frame has a requirement; otherwise `INCOMPLETE` if any required criterion is unknown, `CONTRADICTORY` if any required criterion contradicts, `SATISFIED` if all required criteria match, and `PARTIAL` for remaining known cases. No percentage, score or trading recommendation.
- Results include profile/revision, rule/algorithm versions, exact captured `asOfUtc`, and each source frame's closed-bar `sourceTime`. Never use unclosed or future bars.
- `FeatureSnapshot` records `decisionTimeUtc`, the event window `[windowStartUtc, decisionTimeUtc)`, `asOfUtc`, each frame's `granularitySeconds`, closed-source-window start and end, observed and required warmup bars, EMA seed/calculation version, status/reason, data-quality flags and closed-bar `sourceTime`. The start is the first closed input bar's open time, inclusive; the decision time is the exclusive end. This is audit metadata only; existing `barOpen + timeframeSeconds <= decisionTimeUtc` remains the sole bar-selection rule. Preserve the last source timestamp when a gap or stale source makes the result `UNKNOWN`; it may be null when no closed bar exists.
- A historical M15 decision is evaluated at its recorded UTC timestamp. Its H4 context must use only H4 bars with `barOpenUtc + 4h <= decisionTimeUtc`; tests add future H4 bars and require the historical snapshot and rule result to remain byte-for-byte identical.
- An XAU weekend closure remains a visible heuristic, not an authoritative calendar. H1, M15 and M5 gaps are tolerated only at their observed Friday close / Sunday 22:00 UTC reopen edges; H4 weekend gaps remain `UNKNOWN/DATA_GAP` pending verified session data. Early-Friday outages and late-Sunday/late-Monday missing-history gaps also remain `UNKNOWN/DATA_GAP`.
- No EA-specific preset, persistence server, broker write, trade route, Strategy Tester or backtest. Existing v4/v5 chart behavior is unchanged.

## Tasks

### Task 1: Pure rule contract

**Files:** `static/chart-studio-mtf.js`, `scripts/test_chart_studio_mtf.cjs`

- [x] Write failing contracts for strict rule-schema validation, all evaluator aggregate/criterion states, unknown frames with explained causes, profile revision and `FeatureSnapshot` window/granularity/warmup/source-time metadata.
- [x] Add a historical M15-decision/H4-filter contract proving that only closed H4 bars at the decision timestamp are used and that adding later H4 bars cannot change the snapshot or result.
- [x] Bound the existing H1/M15/M5 XAU weekend-gap heuristic to the observed Friday close / Sunday reopen edges, keep H4 weekend gaps `UNKNOWN` pending verified session data, and add regressions for an early-Friday outage and late-Sunday gap; do not label any heuristic as broker-verified.
- [x] Run `node scripts/test_chart_studio_mtf.cjs`; confirm the new API is missing.
- [x] Implement `validateRuleSet`, `createRuleSet`, `validateRuleSetTransition`, and `evaluateRuleSet` as pure functions. Reject prototypes, extra keys, unsupported frames, invalid enum values and account/symbol mismatch; require strictly increasing revision transitions against an existing same-scope profile. Include deterministic audit metadata for event window, data granularity, warmup and EMA seed semantics.
- [x] Verify RED/GREEN and future/open-bar invariance; existing baseline engine contracts stay unchanged. Task 1 spec and code-quality review approved the implementation.

### Task 2: Scoped rule editor and local versioned storage

**Files:** `static/chart-studio-mtf-panel.js`, `scripts/smoke_chart_studio_mtf.cjs`

- [x] Add a collapsed, accessible editor for the five fixed frames with `Keine Anforderung`, `UP`, `DOWN` and `NEUTRAL` selections; the UI says this is a manual EMA context profile and not an EA rule. No saved profile displays `UNCONFIGURED`; scope-key and missing-profile contracts cover this state.
- [x] Save only a fully validated candidate under an account-ID/symbol-derived localStorage key; increment the revision on real changes and leave current saved state untouched on validation/storage failure.
- [x] Clear the editor and active results on account/symbol change; never import a profile from another scope. A chart timeframe change refreshes the calculation context but preserves the same fixed five-frame rule profile.
- [x] Every refresh, including the normal button path after editing the UTC input, sends an exclusive historical cursor equal to `floor(asOfUtc)` for all five source reads. This is required to make historical M15/H4 checks and the GoldM15 1,000-bar feed use the selected decision window instead of fetching only the newest page.
- [x] After a successful same-as-of refresh, render per-frame explanations and the aggregate state with source times. Missing or stale data remains `UNKNOWN` with a concrete cause; no total score or network writes.

### Task 3: End-to-end verification and ledger update

**Files:** `scripts/smoke_chart_studio_mtf.cjs`, `docs/OPEN_TASKS.md`, this plan

- [x] Extend Chromium smoke for save/reload, revision increment, account/symbol isolation, malformed stored profile, storage failure, all aggregate result states, scope-change clearing, snapshot provenance, exact `before=floor(asOfUtc)` on every refresh, historical M15/H4 future-bar invariance and GET-only requests. The future-H4 case is adversarial fixture data that verifies client filtering beyond the requested cursor.
- [x] Run MTF contracts/smoke, Beta smoke, JavaScript syntax checks and `git diff --check`.
- [x] Record only the completed EMA-rule slice in `OPEN_TASKS`; leave EMA slope, volatility, confirmed structures, setup semantics, EA-specific profiles, decision import, historical navigation, authoritative session coverage and full AT-041/042 open.

## Acceptance boundary

This makes a generic user-authored EMA-baseline profile inspectable. It does not reproduce any Titan, GoldM15 or Marketplace EA's internal rules, prove current chart attachment, authorize broker writes, or close FR-029/AT-041/042. User-provided or independently attested strategy rules and live event/history acceptance remain separate evidence requirements.
