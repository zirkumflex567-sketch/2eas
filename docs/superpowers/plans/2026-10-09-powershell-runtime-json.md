# PowerShell runtime JSON compatibility implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development and test-driven-development, followed by independent spec and quality review.

**Goal:** Make the existing guarded launcher work in installed Windows PowerShell 5.1 and PowerShell 7.6 without weakening runtime identity validation.

**Architecture:** Fetch the loopback runtime response as raw JSON text, then parse with timestamp strings preserved. Keep every required-field/type/hash/PID/checkout check and every pre-stop guard. Validate through disposable no-MT5 HTTP fixtures; the live restart remains a later parent-owned release step.

**Tech Stack:** Windows PowerShell 5.1, PowerShell 7.6, Python pytest and existing runtime mock server.

## Observed failure and scope

On deployed main 04194ec, PowerShell 7.6.6 Status returns `Listener runtime identity unavailable or malformed; nothing stopped.` Its Invoke-RestMethod converts startedUtc to DateTime, violating the intended string contract. The same response passes Windows PowerShell 5.1 Status, and its guarded Restart deployed that main successfully. No MT5 or tunnel process changed.

Microsoft documents [ConvertFrom-Json DateKind](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/convertfrom-json?view=powershell-7.6): String preserves source timestamp text; the parameter was added in 7.5. Do not add that parameter unconditionally to 5.1 or cast an automatically converted DateTime back to culture-sensitive text.

## Task 1: raw JSON parsing and cross-shell regression

Implementation commit 67e8a3d: cross-shell regression reproduced the original refusal before the parser change; unsupported Core parsing reproduced the unhelpful generic diagnostic. Focused cross-shell/unsupported tests passed after the fix. All 120 runtime/proxy/control tests passed on the two installed shells. Independent spec and quality review and release CI/live proof are pending.

Files: modify scripts/dashboard_runtime.ps1, tests/test_dashboard_runtime.py and docs/STT_OPERATIONS.md. Parent owns OPEN_TASKS and this plan.

- [ ] Add a helper-shell argument to the existing test harness with default powershell.exe. Discover pwsh.exe using shutil.which; only its specific tests skip when absent. Keep the existing 120-second harness bound, fixture cleanup by exact app path plus interpreter, and original tests.
- [ ] Add a disposable fixture regression: start with Windows PowerShell, obtain the original string startedUtc from Python JSON, run Status with pwsh and require exact timestamp preservation and matching PID/revision/digest. Run guarded Restart with pwsh, then require fresh process identity, unchanged source digest, successful Status under both shells, and retained private environment without secret output.
  The mock must actually verify the expected private environment value and return only a boolean assertion result, never the value; today's mock does not read it. Do not infer retention from the launch command or return code alone.
- [ ] Run the new test before implementation: `C:/Python314/python.exe -m pytest tests/test_dashboard_runtime.py -k cross_shell -q`. Observe the installed PowerShell 7 refusal; never exercise the real 8050/8055 ports.
- [ ] Replace Read-Runtime's automatically deserialized REST fetch with raw `Invoke-WebRequest -UseBasicParsing -TimeoutSec 2` content. Construct ConvertFrom-Json parameters conditionally using its actual parameter metadata; when DateKind exists pass String, while Windows PowerShell 5.1 retains its string parsing. Preserve every existing schema/type/UTC-format/ownership check. Older Core shells lacking string-preserving parsing must fail clearly before stopping, rather than silently accepting culture-dependent conversion. Do not introduce permissive DateTime coercion or change the runtime endpoint.
  The unsupported-parser message must survive Read-Runtime's generic catch (or be rejected in earlier preflight), while ordinary malformed responses keep their safe generic refusal.
- [ ] Add malformed raw startedUtc regressions (non-string, invalid UTC format, invalid date), wrong runtime PID and another checkout; both tested shells must refuse without stopping the fixture listener or leaking private values. Use narrowly bounded disposable server lifetime and finally cleanup. No real terminal, SSH or dashboard calls in test code.
- [ ] Run focused cross-shell/refusal tests, then the existing runtime suite and relevant proxy/security tests. Expected GREEN with every original refusal retained. Document precisely which shells are tested; remove the unqualified 5.1-or-later compatibility claim.
- [ ] Commit only the three scoped files. Independent spec review checks source-text preservation, before-stop refusal and exact process scope; quality review checks the parser fallback, bounded test cleanup and secret-free output. Fix and re-review findings.

## Release gate

- [ ] Parent performs CI and main merge with expected head, then Status under both installed shells against live runtime. A subsequent parent-approved guarded dashboard restart may use PowerShell 7 only after disposable regression and independent reviews pass. Keep both MT5 terminal processes and the existing reverse tunnel unchanged. Record revision/digest and protected public/local proofs separately.
