# FR-027 broker What-if on the active verified chart symbol

## Goal and boundary

Allow read-only quotes and broker-calculated What-if previews for any exact symbol in the currently selected verified MT5 chart context, rather than hard-coding XAUUSD. Scope A/B snapshots by account and symbol. On account/symbol changes, discard quote, preview, and price inputs so prices from another market/account cannot be submitted accidentally. Keep the existing position stop-draft restriction unchanged. No MT5 write, EA edit, demo mutation, deployment, hardware acceptance, or backtest.

## Requirement mapping

- `docs/OPEN_TASKS.md`: FR-005, FR-006, FR-020, FR-027; AT-018–020 and AT-039–040 local read-only slice.
- Master spec: `docs/CHART_STUDIO_MASTER_SPEC.md` risk preview and instrument scope.
- Existing foundation: generic broker money model in `chart_studio/money.py`, but `app.py` quote/preview routes and Beta UI still reject or label non-XAU symbols.

## Files

- `tests/test_backend_audit.py`: verify exact non-XAU broker symbol reaches profit/margin calculations, keeps `canExecute=false`, and never writes.
- `tests/test_chart_studio_broker_reads.py`: verify exact non-XAU quote metadata is accepted and mismatched broker names still fail closed.
- `scripts/smoke_chart_studio_beta.cjs`: verify active EURUSD quote/preview, account/symbol-cleared prices, portfolio correlation scope, symbol-scoped snapshot/export, and no write route.
- `app.py`: validate broker symbol identity in quotes/preview; remove the XAU-only gate for the read-only What-if endpoints.
- `static/chart-studio-beta.js`: bind quote, preview, portfolio context, and local A/B snapshots to current account/symbol; clear stale draft prices on account or symbol change.
- `docs/OPEN_TASKS.md`, `chart_studio/README.md`: record only the tested code/browser slice; demo and hardware acceptance remain open.

## TDD and verification

1. Add backend and Chromium contracts and confirm they fail against the current XAUUSD-only guards.
2. Implement generic exact-symbol broker reads and UI scope/invalidations.
3. Run focused audit/quote tests, beta Chromium smoke, syntax checks and `git diff --check`.

The feature stays read-only: the API uses `order_calc_profit` / `order_calc_margin`, quote reads, and portfolio reads only. Any use of `order_send`, a write route, account-mismatched response, or stale cross-symbol prices fails the acceptance.

## Progress

- [x] Write failing tests and verify RED.
- [x] Implement routes and browser scope.
- [x] Verify focused regressions and update the requirement ledger.

## Verification evidence

- RED was reproduced before implementation: the API rejected `EURUSD` and the quote contract could not use the selected symbol.
- `node scripts/smoke_chart_studio_beta.cjs` passes the full Chromium beta flow, including EURUSD 5-digit quote and preview, account/symbol input invalidation, isolated A/B snapshot storage, return to XAUUSD, and absence of broker-write calls.
- `python -m pytest tests/test_backend_audit.py tests/test_chart_studio_broker_reads.py -q`: 244 passed.
- `node --check` for the beta and smoke scripts, `python scripts/check_frontend_syntax.py`, and `git diff --check` pass.
- The MT5 demo/hardware acceptance and real non-USD account acceptance remain open; this package changes only read-only paths.
