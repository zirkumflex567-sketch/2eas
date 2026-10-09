# Chart Studio foundation — test branch

Primary requirements: [docs/CHART_STUDIO_MASTER_SPEC.md](../docs/CHART_STUDIO_MASTER_SPEC.md)
Execution: [plan](../docs/CHART_STUDIO_PLAN.md) · [task board](../docs/CHART_STUDIO_TASKS.md).

The first functional **read-only** beta is integrated into the existing dashboard
via `static/chart-studio-beta.js`, using a temporary Lightweight Charts v4 adapter.
It does **not** replace the planned professional v5 engine.

Current features:
- Enable/disable EMA20/50/200; SMA20/50 and Bollinger 20 overlays.
- Draw horizontal/trend/rectangle/Fibonacci tools with time+price anchors, drag
  existing handles, undo/redo, account-scoped *provisional* browser storage and
  JSON export through clipboard.
- Optionally display actual broker position Entry/SL/TP lines and zone overlays
  **without any trading mutation**.
- Read-only What-if plan and JSON API endpoints for a verified MT5 XAUUSD
  quote and `order_calc_profit`/`order_calc_margin` broker pricing.
- No USD exchange-rate fabrication: previews for non-USD accounts are in
  account currency, with USD explicitly unavailable.

Routes: `GET /api/chart/v1/capabilities`,
`GET /api/chart/v1/quotes`,
`POST /api/chart/v1/scenarios/preview`.

No real SL/TP edit, position opening, execution, replay, decision logging, or
production SQLite drawing storage exists yet. Exact roadmap is in the task board.
Do not present this as implementation of the entire master spec.
