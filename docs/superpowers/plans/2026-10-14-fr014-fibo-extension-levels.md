# FR-014 negative and extension Fibonacci levels

## Scope

Implement the Master Spec's per-drawing Fibonacci levels for negative retracements and extensions above 200%, including the 261.8% example. Preserve ascending unique levels, the 16-level cap, existing saved layouts, undo, and strict workspace persistence. This does not add fan/time-zone/trend-based Fibonacci tools or alter trading behavior.

## Steps

- [x] Add failing parser, workspace-persistence, and browser contracts for negative and >200% levels, saved/editable extension values, and existing invalid-input safety.
- [x] Extend the bounded percentage parser and workspace validator consistently; retain 1–16 finite strictly ascending values, bounded to −1000%…+1000%.
- [x] Run Fibonacci, workspace, Chromium beta, syntax, and diff checks; resolve the independent review's endpoint-format round-trip finding.
- [x] Update FR-014 and commit this independently reviewable slice. Fan, time zones, trend-based Fib, and hardware acceptance remain open.
