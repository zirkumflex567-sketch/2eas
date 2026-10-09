# Main Consolidation Implementation Plan

> **For agentic workers:** Execute this maintenance plan in the current session, with review before merging. Follow executing-plans and requesting-code-review.

**Goal:** Merge verified Chart Studio and audit fixes, leave GitHub with a tested main branch, and publish a complete remaining-task list.

**Architecture:** Reuse the existing audit integration worktree, preserve private/untracked files and unique work through recovery tags, and merge through GitHub PR checks. Keep incomplete packages out of the running application.

**Tech Stack:** Python 3.14/FastAPI/MT5, browser JavaScript, isolated TypeScript v5 adapter, pytest, Playwright, GitHub Actions.

---

### Task 1: Inventory and baseline

- [x] Inventory all GitHub PRs, branches, issues, local divergence and worktrees.
- [x] Rebase integration conceptually by merging current origin/main into the existing audit branch, preserving all chart modules.
- [ ] Reproduce the failing asset browser test and distinguish delayed CSS loads from responsive paint omissions.

### Task 2: Auditfix verification and integration

**Files:** tests/test_stone_ui_assets_browser.py; .github/workflows/chart-studio-ci.yml; docs/CHART_STUDIO_SECURITY_GATE.md.

- [ ] Stabilize CSS request settling and validate actual responsive baseline transfers without weakening the 3 MiB/original-asset constraints.
- [ ] Add main push CI coverage and fail-fast native command handling; run the complete isolated pytest suite, frontend syntax/math checks, chart smoke matrix and v5 typecheck/build.
- [ ] Review the audit diff, including account routing, origin/session checks, risk writes and journal semantics.
- [ ] Push the updated PR #14; wait for both current-head GitHub CI workflows and merge only when green.

### Task 3: Remaining work and cleanup

**Files:** docs/OPEN_TASKS.md; docs/CHART_STUDIO_TASKS.md; README.md.

- [ ] Inspect the MTF branch for integration, coverage and completed acceptance; merge only if the package is complete and verified, otherwise record its exact remaining work and preserve its commit in an archive tag.
- [ ] Cross-reference all partial/open Chart Studio task IDs, FR/AT requirements and audit ledgers into one final checklist; correct stale merged/pending/security statements.
- [ ] Map every FR-001–035 and AT-001–056 plus original audit IDs to completion evidence or a concrete remaining task. Create a documentation/CI maintenance PR if needed, verify its checks and merge.
- [ ] Archive every non-main remote branch head in a pushed tag and verify its remote SHA before removing its remote branch. Inventory all dirty worktrees, preserve private/untracked/ignored data outside GitHub, and preserve unique local main work with a local recovery tag before updating the checkout without removing untracked files.
- [ ] Verify final main checks, main-only remote branch inventory and the local checkout; deliver links and explicit broker-live validation limits.

### Verification commands

Run in the audit integration worktree: `python -m pytest -q`, `python scripts/check_frontend_syntax.py`, every `node scripts/test_chart_studio_*.cjs` and `node scripts/smoke_chart_studio_*.cjs`, `node scripts/smoke_stone_preview.cjs`; run `npm run check` and `npm run build` in chart_studio_v5. GitHub checks must match each final PR head and the resulting main commit.

No real trade, stop change, drawdown reset or private live report publication is part of repository maintenance.
