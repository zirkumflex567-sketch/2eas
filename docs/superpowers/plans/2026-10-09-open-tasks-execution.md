# ChartStudio / Auditfix execution plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development, test-driven-development and requesting-code-review. Track delivered evidence below; no global acceptance from partial tests.

**Goal:** Execute OPEN_TASKS in independently releasable packages while keeping tested main and htown /stt operational.

**Architecture:** Preserve existing cockpit contracts and account gateway. Authenticate proxy identity before interpreting forwarded metadata; new chart trading stays read-only until its independent write gate. Versioned read models and immutable recording precede v5 product migration and analysis features.

**Tech Stack:** FastAPI/Starlette/Uvicorn, MT5, SQLite, browser JavaScript, pinned Lightweight Charts v5, PowerShell, SSH/nginx, pytest/Node/Chromium.

## Verified prerequisites

- [x] SSH htown, nginx/TLS, loopback reverse tunnel, both local MT5 processes checked.
- [x] Restart stale dashboard process only; local and authenticated public HTML match main 3032426 exactly. Both public account feeds fresh.
- [x] Isolated existing audit-integration worktree switched to codex/chartstudio-backlog; live main checkout untouched by development.
- [x] Package #27 resolves authenticated public control_session: 200, explicit trade role and protected cookie; live proof recorded in STT_PREFLIGHT_2026-10-09.md.

## Package 1: authenticated ingress and runtime identity (AUD-07, operational portion AUD-14)

### Task 1: proxy identity, role-bound operator sessions

Implementation status: code complete at `74d6691`; port documentation clarified at `28fa2f9`. RED observed (39 failing new tests), final 76 security tests pass. Independent spec review and quality review approved after fixing local bearer compatibility and early session revocation. Merged in PR #27 as main 4a0cb12 and deployed at 14:55 UTC; authenticated public/local session and forged-ingress refusals verified.

Files: modify dashboard_security.py, app.py (__main__ only), stt_nginx.conf; add tests/test_dashboard_proxy_security.py and docs/STT_OPERATIONS.md. Keep tests/test_dashboard_control_security.py passing.

- [x] RED: test trusted loopback proxy + >=32-character shared secret + explicitly mapped username => read/layout/trade role. Unknown user, invalid secret, duplicate auth headers and non-loopback transport fail closed.
- [x] RED: read/layout role cannot modify/close/reset, trade role can reach mock handlers with valid same-origin CSRF. Every mutation rechecks identity/role; changing proxy username or role invalidates existing capability. No broker calls in these tests.
- [x] RED: forged forwarding headers/direct requests to allowed remote Host cannot obtain local capability; loopback Host retains existing local session and explicit bearer compatibility.
- [x] RED: valid signed proxy HTTPS + /stt prefix produces secure cookie and correct origin checks; malformed prefix/proto/IP rejected. Encoded/trailing mutation paths remain guarded.
- [x] Run `C:/Python314/python.exe -m pytest tests/test_dashboard_proxy_security.py tests/test_dashboard_control_security.py -q`, observe new tests fail for missing behavior.
- [x] Implement authenticated proxy normalization in security middleware with raw socket peer preserved (`uvicorn.run(..., proxy_headers=False)`). Shared secret comes from DASHBOARD_PROXY_SECRET; role map from JSON DASHBOARD_PROXY_USERS; no default trade grants. Trust X-Dashboard-Proxy-Secret and X-Dashboard-User only from loopback transport with configured secret. Require exact allowed host and verified role; do not trust arbitrary X-Forwarded-For.
- [x] Session payload exposes role/control_enabled, never secret; bind session to principal/role/channel. Preserve local operator and explicit bearer behavior. Existing workspace token remains separate; do not expand its privileges or activate chart writes.
- [x] nginx template overwrites authentication headers, uses $remote_user, replaces forwarding chain with $remote_addr, includes root-owned secret snippet, strips upstream Basic credentials. Document secret/role configuration and guarded rollout/rollback without credential examples.
- [x] Run targeted tests, commit only task files; spec review then quality review, fix and re-review findings.

### Task 2: runtime version proof and safe restart

Implementation status: implemented at `44fc4de`, review corrections at `df74a11`. Original RED and seven additional failing review regressions observed; corrected runtime suite: 32 passed, including disposable PowerShell lifecycle/refusal/recovery. Final PR CI passed 397 tests plus 245 subtests. Main 4a0cb12 is live with matching startup/disk version and digest, clean application source and restart_required=false. Both account feeds and 20 public UI switches passed read-only. Main Audit CI passed; main Chart CI exposed a hung-status fixture race, tracked for deterministic correction in the next package.

Files: add dashboard_runtime.py, tests/test_dashboard_runtime.py, scripts/dashboard_runtime.ps1; modify app.py to install GET /api/runtime; extend docs/STT_OPERATIONS.md.

- [x] RED: runtime snapshot reports startup git revision, tracked-code digest, process PID/start timestamp, current disk digest/revision and restart_required when source changes after snapshot. Include an opaque checkout identity (SHA256 of normalized absolute root) so identical code in another worktree cannot authorize stopping its process. No account data, filesystem paths, environment or credentials returned. Capture before serving, never infer running version from current disk alone.
- [x] RED: temporary non-git tree => explicit unknown revision; missing/deleted source => restart_required; module/static source changes detected. Exclude private/untracked data, generated output, tests/docs and mutable tracked drawdown_config.json from application-code digest. Immutable module/JS/TS/CSS/HTML/package manifests are tracked source. Add/remove a tracked source file must change digest, not only edits to the original list. Bounded git timeouts and no hashes/secrets in exception output.
- [x] Run `C:/Python314/python.exe -m pytest tests/test_dashboard_runtime.py -q` and observe failure, then implement focused module. Use subprocess git argument arrays with timeouts and content hashes; no shell execution.
- [x] PowerShell Status/Start/Restart accepts explicit repo/python/port and private env JSON outside tracked source; rejects dirty tracked application code (mutable drawdown configuration is not code). A pure standalone `dashboard_runtime.py --inspect-checkout <root>` command supplies expected revision/digest/checkout identity without importing app/MT5. Hidden launch, ignored logs; confirms listener PID matches runtime PID AND checkout identity before stop, refuses unrelated listener. Validate configuration/preconditions before stopping; failed startup must report failure with recoverable previous environment/source, never kill MT5/SSH. No git pull, no EA/MT5 restart, no credentials in output. Wait with bounded timeout; verify new running revision/digest.
- [x] Run focused runtime tests and a disposable mocked/no-MT5 server restart check; run full pytest and chart smoke before merge. Update OPEN_TASKS partial evidence accurately.
- [x] Spec review then quality review, commit reviewed work; PR CI, merge main, guarded rollout and public/local proof; preserve rollback.

## Remaining package order / scope ledger

These are delivery boundaries, not claims of implemented work. Each receives a detailed task plan before coding, with failing tests, exact module files, spec and quality review, CI/main rollout and OPEN_TASKS evidence update.

1. **Broker read models and history**: FR-004/005/006/019/022/027/020; authoritative symbol/quote/position/order/history contracts, revisions, broker previews, risk/FX, pagination and race isolation. Account gateway owns every MT5 call; no new order_send path.
2. **Recording and audit integrity**: FR-026/031/033/035, AUD-09/11/12; immutable decision/lifecycle/execution snapshots independent of browser, actual EA logger and compiler manifest, crash recovery, read-only inspector/journal. Never reconstruct missing intent as fact.
3. **v5 production migration**: FR-001/003/008/009/010/011/012 plus AUD-16; native primitives/panes/data window/levels/profiles/persistence/parity and rollback. Preserve UTC anchors/account scope. Reconcile limits through measured AT-025, not by raising unchecked constants.
4. **Indicator/tool catalog**: FR-002/013/014/015/016; complete documented math/warmup/algorithm versions and all period/shift/Bollinger/VWAP/volume/style/template/fib behaviors. No EA strategy changes.
5. **Analysis and navigation**: FR-017/018/029/030/032; alerts, watchlists/multi-chart, archived MTF integration with nofuture historical semantics, DST sessions/liquidity proxies, deterministic regimes and OOS.
6. **Secure optional infrastructure**: FR-024/025/028; constrained interpreter (no arbitrary eval), ACL/sync/conflicts, event-backed replay with as-of provenance.
7. **MT5 data integrations (user-selected source)**: FR-023/034; use the terminal economic calendar via read-only MQL5 bridge and broker tick feed. Verify calendar server-time conversion/coverage and authentic trade-side volume availability per symbol. Quote changes/tick counts cannot be presented as executed bid/ask orderflow; capability unavailable when MT5 lacks the required fields. Implement stale/gap/error/fixtures before live overlay. Keep this UI feed distinct from the actual EA news guard.
8. **Independent write release**: FR-007/021 and AUD-10; proposals/roles/revisions/idempotency/confirmation/guard/readback/audit first, authorized demo test last. Drag/what-if never trades. No funded-account mutation test.
9. **Measured audit completion**: AUD-01..06/08/13/15 and remaining AUD-07/09/12/14/16 evidence; perf baseline/asset manual8/CSS/FX/hardware/broker clock/EA profiling. Only change measured bottlenecks, keep protection cycles.

## Release gates that require real evidence

- Actual phone/touch, Windows 150% DPI and screenreader evidence cannot be substituted by Chromium emulation.
- Broker offset/day policy confirmation, active EA/preset hashes/compiler and genuine demo trade ack/readback remain required.
- User selected MT5 instead of an external licensed provider. Actual terminal calendar/tick capabilities and distribution terms still need verification; missing orderflow cannot be invented. Multi-user permissions require explicit configuration.
- Do not mark FR/AT complete if its dependent full acceptance remains open. Main stays functional and remote temporary branches are archived/deleted after merging.

User steering 2026-10-09: defer strategy backtests and Strategy Tester parity; continue functional/security/storage/browser/deployment regression. No deferred backtest is counted as passed.
