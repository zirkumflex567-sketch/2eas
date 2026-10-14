# FR-026/033 read-only evidence inspector UI

## Contract

Expose authenticated, account-scoped reads of recorded Decision, Lifecycle, and Snapshot evidence inside the existing ChartStudio Beta panel. Query a selectable 1/7/30-day UTC range (API maximum is 31 days) with a 500-row in-memory cap. Show store availability, coverage, loss/gap count, and `NOT_RECORDED` plainly. Render payloads as inert text/JSON; make no append request, MT5 request, or chart mutation. A context change clears old rows and cursors. Pagination uses the API cursor and its pinned snapshot.

## Files

- `static/chart-studio-beta.js`: add inspector controls, bounded 30-day query, safe text rendering, paging, and account invalidation.
- `static/chart-studio-quick.css`: compact, scrollable evidence list and JSON detail styling.
- `scripts/smoke_chart_studio_beta.cjs`: stub the read API; verify scoped account/range, evidence display, empty/not-recorded state, pagination, hostile text inertness, and zero writes/chart mutations.
- `docs/OPEN_TASKS.md`: record the UI slice while keeping real EA capture and demo evidence open.

## Verification

Add Chromium assertions first and observe RED. Then implement and run Beta + object browser smokes, focused evidence API/store and frontend regression tests, syntax and diff checks, and independent review. This UI is strictly read-only; no live producer or terminal changes.
