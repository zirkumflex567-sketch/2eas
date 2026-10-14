# FR-005 Broker Symbol Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select a broker-visible symbol in the read-only broker book and consistently filter positions, pending orders, and deal history by that symbol.

**Architecture:** Use the existing verified `/symbols` route to populate an account-scoped symbol selector. Pass the selected symbol through existing `/positions` and `/trades` routes, validate response provenance and symbol equality, and invalidate pending cursors/drafts when the symbol changes. Since the beta chart itself remains XAUUSD, non-XAU broker rows remain visible in tables but never draw XAU chart overlays or enable chart-bound stop drafts.

**Tech Stack:** Browser JavaScript, FastAPI read routes, Playwright/Chromium smoke, pytest.

---

## Scope and files

- `static/chart-studio-broker-panel.js`: search/load verified symbol catalog, track selection, scope read requests, clear cursors/drafts/overlays on changes, restrict chart-bound actions to XAUUSD.
- `scripts/smoke_chart_studio_beta.cjs` and `static/chart-studio-fixture.html`: verify symbol selection and request isolation using fake broker responses.
- `chart_studio/README.md` and `docs/OPEN_TASKS.md`: describe the read-only symbol filter and remaining chart/v5 limitations.

## Steps

- [x] Add failing Chromium smoke coverage for catalog loading/search, selected-symbol request parameters, switching symbol invalidates deal history/cursor and active draft, bad row provenance fails closed, and non-XAU rows are table-only.
- [x] Run the smoke and observe the absent selector behavior fail.
- [x] Add an account-scoped searchable symbol selector populated only after validating the `/symbols` envelope and each row's matching account, `MT5_VERIFIED` source and `canExecute=false`. Request `limit=200`; expose query-based search and the server's `truncated` state so results beyond the cap remain reachable. Retain XAUUSD initially only when present and verified.
- [x] Use the selected symbol in position and history reads and response-envelope checks. Validate every displayed position/order/deal row's account, symbol, source and `canExecute=false`; invalid rows fail closed and clear the affected view. On changes, increment request generations, clear old tables/markers/drafts/cursors and reload positions; history restarts from page one and rejects stale JSON after parsing.
- [x] Keep stop-draft and chart-overlay actions enabled only for XAUUSD, because the displayed chart remains XAUUSD in this slice. For other symbols, show read-only tables and a clear chart-scope note.
- [x] Chromium beta smoke, 149 focused broker-read/foundation pytest tests, JavaScript syntax and diff checks pass; independent review found no remaining issues.
- [x] Update the FR-004/FR-005 ledger to distinguish broker-panel filtering from still-open chart-wide symbol switching. Commit the reviewed slice and retain remaining v5, FX, demo and hardware gates.
