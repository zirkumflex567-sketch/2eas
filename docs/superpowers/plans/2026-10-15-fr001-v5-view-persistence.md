# FR-001 native v5 view persistence

## Goal

Extend opt-in account/symbol/timeframe-scoped local persistence from drawings and undo history to the native renderer's supported view state: managed moving-average and oscillator definitions, oscillator pane placement and heights, volume visibility, display timezone, and visible logical range. Existing schema-v1/v2 drawing snapshots must migrate forward without losing drawings or history. Invalid state is rejected before mutating the renderer; storage remains disabled without explicit scope.

## Files

- `chart_studio_v5/src/adapter.ts`: strict schema-v3 snapshot, v1/v2 migration, restored view configuration, and persistence triggers for view-setting changes.
- `scripts/smoke_chart_studio_v5.cjs`: reload, scope isolation, v1/v2 migration, invalid-view atomicity, and zero-write contracts.
- `chart_studio_v5/README.md`: supported persisted state and remaining full-layout/product migration gaps.
- `docs/OPEN_TASKS.md`: update FR-001/FR-002/AT-001 evidence without claiming production acceptance.

## Test-first sequence

1. Add Chromium checks that persist a scoped EMA, RSI/MACD, pane geometry, volume visibility, timezone and visible range; reload into a fresh renderer; verify each item exactly and verify another timeframe is empty.
2. Add invalid-schema checks for malformed indicator settings, scope mismatch, and oversized state; require all-or-nothing restore.
3. Run the focused v5 smoke and confirm the new view-restoration contract fails before implementation.
4. Implement strict schema-v3 serialization and backward migration for schemas v1/v2; persist only after a successful local state change.
5. Run TypeScript check/build, the complete v5 Chromium smoke, relevant workspace tests if schema code changes those paths, and `git diff --check`.

## Limits

This delivers native-v5 local view persistence only. It does not implement SQLite/server merge, multi-user conflict resolution, production mount, chart-style migration, full remote layout transfer, or desktop/mobile/hardware acceptance. No MT5 access, writes, deployment, or backtesting.
