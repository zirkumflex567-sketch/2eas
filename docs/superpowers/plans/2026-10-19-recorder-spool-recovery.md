# Decision Recorder Spool Recovery

## Goal

Find and fix the confirmed decision-recorder failure for the two source-backed demo aliases (`xau5m_m5` and `titan_m5`) while preserving all existing private spool evidence. Keep Blueberry excluded, avoid broker writes, and leave Strategy Tester work deferred.

## Evidence and scope

- The local main service on port 8056 is the htown `/stt` upstream; the duplicate local port 8050 has been restarted with a sanitized private environment and now reports `NOT_STARTED` for decision import.
- Port 8056 now reports `IDLE` for both configured Titan demo producers, confirming the producer lock conflict is cleared.
- The private shared MT5 spool contains about 20,000 `.tmp.ndjson` files (about 61 MB), with no active or ready segment count reported in the existing scan. The reader intentionally consumes only active and ready segments.
- The previous scan found valid newline-terminated JSON and repeated event IDs among temp files. That is evidence of a backlog, but it does not establish why the MQL5 final rename failed.

## Implementation steps

1. Reproduce and document the spool writer's exact `FileMove`/temporary-file behavior using source contracts and focused tests; do not inspect or print private event payloads.
2. Add throttled, actionable MQL5 diagnostics for file open, write, final rename, and failed temporary-file cleanup, including `GetLastError()` and sequence, while ensuring the callback path remains disk-free and avoiding sensitive event content.
3. Identify the failing writer stage from an authorized demo terminal log. If no diagnostic exists yet, build a candidate and leave a precise manual attach/reload step for the user; do not use desktop automation.
4. Implement the confirmed writer fix and regression coverage; preserve the bounded queue and append-only semantics. If logs do not establish a failure stage, do not claim the recorder problem is fixed.
5. Update helper hash pins in all builders/manifests/tests; build both account-bound BasketGuard recorder candidates in isolated MetaEditor output, verify account identity, preset binding, source parity, and hashes, and install side-by-side only in the two authorized demo terminals.
6. After the manual attach if required, verify a successful final rename, one new demo decision import/readback, no remaining producer lock conflict, both local service statuses, htown `/stt` revision/digest, and CI for the fix's own commit. Record any remaining manual demo attach and independent hardware gates in `OPEN_TASKS.md`.

## Safety and acceptance

- Never query or access Blueberry account data.
- No Strategy Tester/backtests and no broker writes.
- Preserve all `.tmp.ndjson` files until a separately verified recovery/import path exists; do not rename, delete, or rewrite the backlog during diagnosis.
- Acceptance requires a passing focused test suite, two successful isolated candidate builds with zero compiler warnings/errors, demo-side file/hash verification, a confirmed cause and tested fix, one successful new demo decision import/readback, one unlocked importer on 8056, the fix commit's CI, and matching deployed `/stt` main identity. If the required manual attach has not happened, explicitly leave the recorder recovery open.

## Current progress (19.10.2026)

- The initial RED test established that final-rename failures had no useful diagnostic. The implementation now logs throttled `open`, `write`, `rename`, and failed `cleanup` stages with sequence and MQL error code; it never logs the event line. A second RED/GREEN contract covers cleanup failures.
- The focused importer, Titan capture/build, and GoldM15 build regression passed: 76 tests. Both current account-bound candidates compiled with 0 errors/0 warnings and their installed side-by-side EX5 hashes were verified: `xau5m_m5` `f95e9aa6c5ee7e250750af93b0a99e1b9b1d136c15fecd31d876e71c99c3317a`; `titan_m5` `3b345372339a9cd1809361537802eaeb2fad49059695680ef3bc7854de402e94`.
- Root cause is still unconfirmed because neither candidate has been manually reloaded on its demo chart yet. The existing ~20,000 temp files are preserved. The only available next evidence step is to load the `..._diag_f95e9aa6.ex5` and `..._diag_3b345372.ex5` candidates on their corresponding Titan M15 demo charts, then inspect the Experts tab for the phase/sequence/error line.
