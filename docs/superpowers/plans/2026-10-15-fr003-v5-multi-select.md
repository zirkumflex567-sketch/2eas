# FR-003 native v5 drawing multi-selection

## Scope

Add additive drawing selection to the isolated v5 renderer. Shift-click toggles the hit drawing in the selected set; a normal click replaces the set. Selection is transient and is cleared on account/history replacement. Existing single-selection APIs and commands continue to target the primary selected drawing. Expose scoped selection and group visibility/lock APIs; H/L apply atomically validated group toggles.

## Files

- `chart_studio_v5/src/adapter.ts`: selection state, selection rendering, click modifiers, selection API, cleanup and inspection.
- `scripts/smoke_chart_studio_v5.cjs`: contract/browser checks for additive/toggle/replacement selection, stale IDs, group visibility/lock actions, account reset and unchanged broker-write count.
- `docs/OPEN_TASKS.md`: update FR-003/AT-006 and implementation-plan status with partial evidence only.

## Test-first sequence

1. [x] Add a Chromium contract that selects two drawings, toggles one off, rejects unknown IDs atomically, exercises group visibility/lock API and H/L keyboard actions, and clears selection on account change.
2. [x] Run the focused v5 smoke and confirm it fails because the multi-selection API is absent (`engine.selectDrawings is not a function`).
3. [x] Implement selection set and Shift-click toggle while retaining single-selection compatibility; H/L group actions work, and removals prune stale selected IDs.
4. [x] Run TypeScript check/build, focused Chromium smoke, and `git diff --check`.

## Verification

- `npm --prefix chart_studio_v5 run check` — passed.
- `npm --prefix chart_studio_v5 run build` — passed.
- `node scripts/smoke_chart_studio_v5.cjs` — passed; includes AT-025 capacity coverage and confirms no writes.
- `git diff --check` — passed.

## Limits

This slice does not claim multi-object movement/deletion, production v5 migration, physical touch/DPI acceptance, or full FR-003 closure. It performs no MT5 access or broker writes.
