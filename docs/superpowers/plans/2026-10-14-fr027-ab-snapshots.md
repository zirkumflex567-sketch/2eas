# FR-027 What-if A/B snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users save two account-scoped, broker-verified What-if previews with the contemporaneous portfolio exposure/correlation snapshot and export their comparison without sending broker mutations.

**Architecture:** Keep A/B snapshots in browser localStorage under a versioned account key. Save only the exact latest successful MT5 preview request/response plus a minimized, validated account portfolio snapshot captured from the same account, show risk/margin/exposure/correlation values side-by-side, and export the two snapshots as JSON. A failed or stale preview cannot replace a saved snapshot; switching accounts opens that account's distinct pair. Preserve schema-v1 snapshots as readable legacy previews with portfolio context explicitly unavailable.

**Tech Stack:** Existing ChartStudio beta JavaScript, localStorage, Chromium smoke test.

---

## Files

- Modify `static/chart-studio-beta.js`: add A/B save buttons, scoped snapshot persistence, portfolio-context capture and validation, comparison rendering, and JSON download. All displayed fields remain read-only previews; strip login/server provenance from the exported portfolio context.
- Modify `scripts/smoke_chart_studio_beta.cjs`: assert saved slots bind preview and portfolio to the same account, include exposures/correlation without login/server, preserve schema-v1 migration display, compare account separation, JSON export contents, and absence of broker writes.
- Modify `chart_studio/README.md` and `docs/OPEN_TASKS.md`: record this partial FR-027 delivery and local persistence boundary.

## TDD steps

1. Add a Chromium contract that attempts saving before a successful preview (must reject), then saves A and B after distinct broker-priced previews.
2. Verify account isolation by switching accounts and checking a distinct empty pair, then switching back and checking Titan's saved snapshots.
3. Download the JSON comparison and assert both exact preview request/result objects, account scope, and schema version; verify all broker requests remain only scenario preview POSTs.
4. Run the browser smoke and Python risk-sizing regression suite, inspect the diff, request independent review, resolve findings, and commit.

## Acceptance boundaries

These are local saved preview snapshots, not executable orders or durable server workspaces. A portfolio snapshot is a point-in-time read and may be stale by the time a user reopens it; display its capture time. The context does not provide broker Guard authority, correlation hedge credit, non-USD-to-USD conversion beyond the saved preview, broker writes, or live demo acceptance. FR-027 and AT-040 remain partial/open.

## Progress

- [x] Failing browser contract observed: the smoke failed because the A/B save control did not exist.
- [x] Account-scoped A/B snapshots, comparison, and JSON export implemented.
- [x] Browser smoke passed, including v99 snapshot rejection and quote-refresh invalidation; Python suite passed (359 tests, 19 subtests), and independent review passed with no remaining findings.
- [x] Schema-v2 snapshots now retain the same-account validated portfolio exposure, stop-risk and scenario-symbol correlation snapshot with capture time, omit broker login/server fields, and render a clear unavailable state when no current portfolio exists. Existing schema-v1 entries remain readable and state that portfolio data was not captured. Verification: Chromium smoke covers available/unavailable context, export contents, legacy v1, account isolation and zero writes; 354 broker/preview/history regressions pass.
