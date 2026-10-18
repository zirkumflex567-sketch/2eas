# FR-003 v5 interactive drawing tools

## Goal
Expose native price-level, time-marker, rectangle, and Fibonacci placements through the read-only v5 preview, using the existing verified-candle anchoring and native drawing APIs.

## Steps
1. [x] Add failing preview-smoke contracts for the four placements and their click counts/anchor data.
2. [x] Extend the adapter state machine for single-click PRICE/TIME and two-click RECT/FIBO while preserving validation, Escape cancellation, history, and drawing counts.
3. [x] Add controls to the production preview and wire tool-specific prompts and button state.
4. [x] Run preview smoke, TypeScript checks/build, relevant regression smoke, then update `OPEN_TASKS.md` with only verified scope and remaining caveats.
5. [x] Commit/push as `01ca4c2`, pass both Main CI workflows, guarded-restart local runtime, fast-forward htown `/stt`, verify identical revision/digest/bundle, and run the four-demo GET-only live preview smoke; Blueberry was excluded.

## Constraints
Keep v5 optional/read-only, keep v4 mounted, and make no broker writes or account changes.
