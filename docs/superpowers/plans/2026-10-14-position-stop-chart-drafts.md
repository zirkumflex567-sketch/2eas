# Revision-bound position stop drafts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a user select a verified open position, adjust its SL/TP as a chart draft, and request the existing broker-calculated stop preview without sending a broker mutation.

**Architecture:** The broker panel remains the source of current verified open-position rows. A selected row supplies its ticket and position revision; the chart keeps candidate SL/TP only in transient memory and overlays those prices. Every preview request includes the captured account, ticket, revision and a fresh request ID, and only the currently selected scope may accept the response. A 409 or any scope change clears the preview and asks for a fresh read. The existing endpoint remains read-only and reports `guard UNKNOWN`, `canCommit=false`, `canExecute=false`; this work adds no commit control or route.

**Tech Stack:** Existing FastAPI `POST /api/chart/v1/position/preview-stop`, browser JavaScript, beta overlay canvas, Playwright smoke.

## Files

- `static/chart-studio-broker-panel.js`: expose strictly verified current position summaries and a user selection action; preserve the broker revision from the positions API.
- `static/chart-studio-beta.js`: implement transient revision-bound draft state, account/ticket scoped preview requests, chart price drag, stale-response clearing, and explicit no-commit status.
- `static/chart-studio-fixture.html` and `scripts/smoke_chart_studio_beta.cjs`: provide verified revisioned positions, mock preview success/conflict and assert pointer/touch draft behavior and absence of mutation routes.
- `docs/OPEN_TASKS.md` and `chart_studio/README.md`: state the delivered preview scope and remaining live EA guard/write-release gates.

## TDD steps

1. Add browser contracts for selecting one verified row, opening a ticket/revision-bound draft, previewing, rejecting a stale 409 response, clearing on account switch, and confirming no write route. Observe the new assertions fail first.
2. Preserve the server position revision in the rendered position data and use DOM text nodes for controls. No row lacking valid ticket, side, symbol, or revision may start a draft.
3. Add SL/TP pointer and touch draft handles tied to the selected open position. Snap to verified symbol tick size; validate side and preview response scope. Keep the draft disabled until the selected position read and symbol metadata are fresh.
4. Use only the existing authenticated preview route. Send both candidate values with the captured expected revision; require matching account, symbol, ticket, revision, and `canExecute=false`, `canCommit=false`, `guard UNKNOWN` response before showing broker-calculated amounts. 409, timeout, account/symbol/timeframe change, or a changed positions snapshot invalidates it.
5. Run browser smoke and the broker-read/position-preview regression suite; request independent review, fix findings, and update the requirement ledger as partial.

## Acceptance boundaries

This is an editable draft and a read-only calculation only. It cannot enable, imply, or invoke SL/TP modification, trade execution, or EA guard approval. The current true runtime guard remains unknown; no demo mutation or backtest is part of acceptance. Full mouse/touch acceptance on target hardware, live guard evidence and the separate write-release gate remain open.

## Progress

- [x] Plan independently reviewed.
- [x] Browser contract observed failing before implementation.
- [x] Revision-bound draft and read-only preview implemented.
- [x] Browser and Python regressions pass; independent review has no findings. Touch/hardware acceptance remains open in the requirement ledger.
