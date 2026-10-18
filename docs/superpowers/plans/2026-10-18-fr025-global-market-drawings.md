# FR-025 explicit symbol-wide market drawings

**Goal:** Let a user explicitly share selected market drawings across account aliases for the same symbol, while preserving account-local layouts, undo/redo behavior, and broker-data isolation.

**Scope:** Browser-local sharing between accounts in the same browser profile. This does not enable encrypted device sync or cross-device sharing; those FR-025 deployment/authentication gates remain open. Backtests, broker writes, and Blueberry access are excluded.

## Tasks

- [x] Add failing Chromium coverage for explicit share/unshare, account switching, local export isolation, and undo/redo.
- [x] Add a separate symbol-keyed shared-drawing store and explicit Object Manager controls.
- [x] Keep account-local exports, profiles, clear, and reset operations from copying or deleting shared drawings.
- [x] Run object-manager and Beta Chromium regression tests, JavaScript syntax checks, and `git diff --check`.
- [ ] Review, record the partial FR-025 status in `OPEN_TASKS.md`, and deploy the commit to main/`/stt`.

## Acceptance

Only explicitly selected drawings share. Their geometry remains separate from positions, orders, tickets, and account layouts. Sharing is independent of timeframe but scoped to the exact current symbol. Unsharing adds the drawing to the account where the action is performed. No network or broker write is introduced.
