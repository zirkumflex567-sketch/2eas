# FR-003 Native v5 drawing manager plan

## Goal

Make native v5 drawings usable through an accessible, scope-local object manager in the opt-in preview. The preview stays read-only toward MT5 and does not replace the production v4 chart.

## Scope

- List the drawings currently loaded by the active v5 engine using safe text nodes and visible object type/label/state.
- Allow selecting one or more rows and applying hide, show, lock, unlock, duplicate, and delete actions through the adapter's existing atomic drawing APIs.
- Reflect drawings created on the chart, chart selections, undo/redo, profile/layout loads, and deletes without stale rows.
- Keep selection scoped to the active account/symbol/timeframe and clear it with renderer teardown/scope changes.
- Preserve undo/redo and local layout persistence; no broker/network writes or v4 cutover.

## TDD and verification

1. Add fixture controls and a Chromium contract proving row discovery, selection, visibility/lock actions, duplicate/delete, and undo/redo.
2. Run the preview smoke and confirm the missing object-manager behavior fails.
3. Add the narrow adapter read surface and accessible preview controls, delegating mutations to the existing v5 APIs.
4. Re-run preview smoke, native-v5 TypeScript/build/smoke, related preview and drawing tests, JS syntax checks, and `git diff --check`.
5. Review the diff, update FR-003/RFC evidence, then wait for main CI and guarded-deploy only the opt-in preview. Keep hardware acceptance and production v5 cutover open.

## Status

- [x] Contract fails before implementation.
- [x] Object manager behavior and adapter read surface pass focused tests (preview smoke, full native-v5 smoke, TypeScript check/build, JS syntax, Python compile).
- [ ] Focused Python tests finish and deployment/review pass.
- [ ] Evidence is recorded without claiming production parity or hardware acceptance.
