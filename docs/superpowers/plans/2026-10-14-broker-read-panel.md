# ChartStudio broker read panel implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show verified XAUUSD open positions, pending orders, and paginated deal history in the ChartStudio beta with account-scoped filters and no broker writes.

**Architecture:** Add a small broker-read panel module mounted by the existing beta. It fetches only the existing `/api/chart/v1/positions` and `/api/chart/v1/trades` endpoints, renders broker values with text nodes, clears data on account changes, and uses generation tokens to discard late responses. It respects the `/stt` deployment prefix. Position queries expose the supported `ticket`, `magic`, and `manual` filters. Deal queries require explicit UTC start/end; the panel defaults to the last seven days, caps the range at 31 days, and binds cursor pagination to account, symbol, range, ticket, magic and manual filters. Any filter/range change starts at page one. HTTP 410 clears the cursor and offers a restart. Deal history is explicitly a list of deals, not a reconstructed position lifecycle; historical chart markers and full symbol selection remain outside this increment.

**Tech Stack:** Browser JavaScript, existing FastAPI read routes, Playwright smoke test.

---

## Files

- `static/chart-studio-broker-panel.js`: account-scoped read-only panel, filters, positions/orders lists and deal pagination.
- `static/chart-studio-beta.js`: include the panel module and connect mount/account lifecycle.
- `app.py`: add an explicit `<script src="static/chart-studio-broker-panel.js"></script>` before the beta module; the existing `/static` mount serves the file but production HTML must reference it.
- `static/chart-studio-fixture.html`: include module for isolated browser smoke.
- `scripts/smoke_chart_studio_beta.cjs`: mocked verified broker reads and account-switch/no-write assertions.
- `chart_studio/README.md`, `docs/OPEN_TASKS.md`: document partial delivery and boundaries.

## TDD steps

1. Add browser assertions for the new panel, `MT5_VERIFIED`/`canExecute=false` provenance, position/order separation, exact UTC-range/filter query parameters and pagination. Confirm RED before implementation.
2. Implement rendering via DOM text nodes and strict account/symbol/UTC query values. Clear all content on scope changes and discard stale async results. Restart history at page one when cursor-bound filters change; on 410 clear the cursor and expose a restart path.
3. Verify Chromium behavior with fixture responses, including empty states, HTTP 503, 422, 410, stale account responses and no POST/PUT/DELETE requests.
4. Run relevant Python route tests and browser smoke; request independent review and resolve findings.
5. Update requirement ledger without claiming historical position reconstruction or closed FR-004/012/019/027; commit this vertical slice.

## Acceptance boundaries

This increment does not add a symbol picker, native deal entry/exit markers, portfolio exposure/correlation, SL/TP writes, or inference of EA ownership. Existing server account verification, read-only provenance, UTC pagination cursor and broker identity checks remain authoritative.

## Progress

- [x] Browser contract written and observed failing on the missing panel.
- [x] Read-only panel implemented; Chromium smoke covers MT5 provenance, position/order separation, strict impossible-calendar-date rejection before network requests, UTC range, ticket/magic/manual filters, pagination and cursor expiry, 503/422 errors, `/stt` prefix, delayed account responses and the no-write route boundary. Deal pages are limited to 50 rows; position P/L and swap remain separate broker values.
- [x] Verification: Chromium beta smoke passed; broker-read/history/preview/foundation suite passed (359 tests, 19 subtests); `git diff --check` passed.
- [x] Independent review passed; invalid-date and P/L labeling findings were fixed and re-reviewed.
