# GoldM15 recorder side-by-side installation

## Goal

Install the verified GoldM15 evidence candidate into a unique Experts subfolder of the configured `goldm15` demo. Preserve the active EA and chart; do not attach/reload, trade, or query Blueberry.

## Implementation contract

- Builder output must be a complete, account-bound GoldM15 candidate whose manifest, EX5, source, shared spool, supporting includes, and pinned preset hashes verify before any terminal write.
- Confirm the `goldm15` alias is demo-only, challenge protection is false, the connected MT5 login/server match the configured identity, and the terminal/data paths match the configured installation.
- Stage into a fresh temporary directory beneath that terminal's `MQL5/Experts`, verify every copied file, then atomically rename to `ChartStudioEvidence_goldm15`.
- Refuse a conflicting existing destination. An exact existing installation is idempotent. Never replace an active EA or remove files outside the installer-owned staging directory.
- Preserve the build manifest as immutable build provenance and create a separate install manifest with state `INSTALLED_SIDE_BY_SIDE_NOT_ATTACHED` only after verifying the copied package. Do not infer live events from files or logs.

## TDD and verification

1. Add installer contract tests for the successful side-by-side copy, non-demo / wrong-login rejection before writes, artifact hash mismatch rejection, conflicting destination refusal, and exact-install idempotency.
2. Run the tests first and confirm the expected missing-installer failure.
3. Implement the smallest installer that satisfies the contract; rerun focused builder/installer tests and `git diff --check`.
4. Rebuild with the configured GoldM15 MetaEditor, verify `0 errors, 0 warnings`, and install only after a fresh read-only `goldm15` identity check.
5. Verify byte-identical installed artifacts, no active-chart attachment/reload, no broker mutation, and no Blueberry request. Live event acceptance remains open until a verified chart attach produces fresh demo evidence.

## Authorization boundary

The user authorized use of every demo account except Blueberry for demonstrations and testing. This plan uses that authorization only for a non-active, side-by-side file install; it does not authorize broker writes or trades. Strategy backtests and Strategy Tester remain deferred.

## Execution record (18 October 2026)

- The installer was added test-first. The initial collection failed because the module did not exist; the completed contract suite passes **12 tests**. The broader GoldM15/Titan builder, recorder, spool, model, and store set passes **199 tests** with four existing FastAPI deprecation warnings.
- A fresh MetaEditor 6230 build completed with **0 errors and 0 warnings**; EX5 SHA-256 is `f8f9f7d5ede2ee69950895278371600f50eabbc9b0a963948638ec79aef80f4b`.
- The connected `goldm15` account was verified as demo/non-challenge, with the configured login/server and terminal/data path matching. The target side-by-side directory did not exist before installation.
- Installer created `ChartStudioEvidence_goldm15` by verified staging and atomic rename. Its immediate idempotent rerun confirmed all package bytes and the install manifest without copying again. The pre-existing `_OrderCapture` side-by-side package and active EA/chart were not touched.
- No chart attach/reload, MT5 order, broker mutation, Blueberry access, or backtest occurred. The installed candidate is not attached; live decision/lifecycle events, fresh-quote acceptance, and chart-bound in-memory identity remain open.
