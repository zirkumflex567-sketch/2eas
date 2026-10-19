# Titan BasketGuard evidence capture plan

## Goal

Build and verify an opt-in, account-bound evidence-capture variant from the exact current `XAU_Titan_Pro_BasketGuard.mq5` source for the two authorized PU Prime demo accounts (`xau5m_m5` and `titan_m5`). Do not replace an attached EA or make broker writes. The default installed EA and Blueberry account remain untouched.

## Scope and dependencies

- IDs: FR-026, FR-033, FR-035; AUD-09, AUD-11, AUD-12; AT-036–038, AT-049–050, AT-055–056.
- Depends on the existing bounded `ChartStudioEvidenceSpool.mqh`, trusted importer, account gateway identity hashes, and account-bound Blueberry protection in BasketGuard.
- Inputs come from each account's pinned `.set` file. Inputs omitted by the setfile use the current source's declared EA defaults; the complete effective input set is hashed and checked on EA initialization.
- The installed strategy source may differ from repository source only in generated account identity macros and must have the same trading behavior. Any semantic drift fails the build.

## Files

- Add a tracked BasketGuard variant builder under `scripts/` with strict account/preset/source allowlists, effective default expansion, parameter hash binding, private output under ignored `output/`, compile manifest, and no install path.
- Inject a bounded, RAM-only accepted-order ring and a `DEAL_ADD` observer into generated demo candidates. Correlate only exact broker order tickets and do not read history or make broker writes in the transaction callback.
- Add focused tests in `tests/test_titan_basketguard_evidence_build.py` for schema/default expansion, wrong/missing preset keys, source drift, account identity, Blueberry protection preservation, output containment, and capture-only changes.
- Update `docs/OPEN_TASKS.md` with build and compile evidence; keep runtime capture IDs open until a fresh imported demo decision is observed.

## Test-first sequence

1. Add failing contract tests for the exact source/input schema and safe effective-preset construction.
2. Implement source identity checks and deterministic account-bound source generation.
3. Assert unchanged entry, risk, exit and trade request statements; order registration and deal observation are enabled only through the opt-in macro and expected parameter hash.
4. Compile each candidate with its own terminal's MetaEditor into ignored output. Require fresh EX5 artifacts and `0 errors, 0 warnings`.
5. Compare manifests and source diffs; do not install or attach automatically. Provide a short manual MT5 procedure because Computer Use is prohibited.

## Validation and stop conditions

- Run the new focused pytest module, existing Titan evidence contracts, and relevant importer tests.
- Do not run Strategy Tester/backtests, send orders, or access Blueberry.
- Stop if source hashes, account login/server/path, setfile hashes, defaults, guard expressions, or compile diagnostics differ from the expected values.
- A compiled candidate is not a completed capture task. Mark recorder acceptance only after status shows a fresh imported decision from the bound demo terminal.

## Execution status (2026-10-19)

- Completed: exact source/preset identity checks, effective input hashing, UTC+3 quote-time normalization, accepted-order correlation ring, and matching `TRADE_TRANSACTION_DEAL_ADD` event generation.
- Verified: 131 focused tests passed across Titan capture/build, evidence models, spool service, and execution-quality modules; both generated demo candidates compiled with MetaEditor at 0 errors and 0 warnings. A broader attempted run could not set up the evidence-store module because this workspace Python lacks the optional `MetaTrader5` package.
- Candidate EX5 SHA-256: `xau5m_m5` `c83f814b76071d44a5297bba5ea71784c1cf558dcf5690c2f6f30410a3648865`; `titan_m5` `b5d732d0716bb34f33cddc164a9cd0919f1814fda725ca32e5a4d0b18c309acb`.
- Still open: copy/attach/reload on the two demo charts, verify the matching initialization logs and a fresh imported decision/deal event. No candidate was installed or attached by this build task; Blueberry remains excluded and backtests remain out of scope.
