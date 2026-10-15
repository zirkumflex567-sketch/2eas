# AUD-15 repeated Stone label tokens

## Goal

Replace repeated Stone-only inset, label-surface and label-text colors in the live cockpit and asset skin with shared tokens while preserving the current computed colors exactly.

## Scope and safety

- Add the values to the existing `stone-tokens` layer and replace only identical literals in `body.theme-stone` rules.
- Keep all selectors and declaration priority unchanged; do not wrap product styles in cascade layers.
- Verify the values in the Stone contract and browser smoke.
- Do not change live services, MT5, EAs, presets, orders, hardware gates or backtests.

## Steps

1. Extend the Stone token contract for the three repeated color families and verify it fails before implementation.
2. Add tokens and substitute only the matching repeated Stone values in both CSS files.
3. Run the Stone contract, Stone browser smoke, relevant live-dashboard theme checks, CSS syntax and `git diff --check`.
4. Update `OPEN_TASKS.md` with this incremental result; keep complete migration/coverage/hardware work open.
