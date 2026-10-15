# AUD-15 Light Theme Palette Tokens

## Goal

Replace repeated Light Theme palette literals in the existing light-only override section with shared variables while preserving exact rendered colors and cascade behavior.

## Scope and safety

- Define tokens only for `body.theme-light` inside the existing `stone-tokens` layer.
- Replace the twelve repeated hex colors only inside the Light Theme override section.
- Preserve selectors, declaration order, `!important`, and all colors outside that section.
- Leave one-off palette values unchanged.
- Do not change services, MT5, EAs, presets, broker routes, hardware gates, write gates, or backtests.

## Steps

1. Add a contract test requiring exact light-token definitions, references, and removal of only the targeted repeated literals; verify it fails first.
2. Add the tokens and substitute only the twelve repeated values within the Light Theme section.
3. Run the Stone contract, Light/Stone theme browser checks, preview smoke, frontend syntax check, and `git diff --check`.
4. Record this incremental result while leaving broader layering, deduplication, dead-CSS coverage, and hardware acceptance open.
