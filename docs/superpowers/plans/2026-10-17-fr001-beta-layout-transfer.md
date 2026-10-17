# Beta Chart Layout Import and Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the active Chart Studio Beta chart export and safely import complete portable layouts, including drawings and supported view settings, while keeping account identity and broker state out of the file.

**Architecture:** Add a strict, bounded schema-v2 portable envelope in the Beta adapter. Validate scope, shape, and each supported settings section before changing chart state; merge drawings with collision-free IDs and replace only after explicit confirmation. Expose download/file controls beside local layouts and keep the existing preview-only v5 import workflow separate.

**Tech Stack:** Browser JavaScript, Playwright/Chromium, existing Chart Studio Beta settings modules.

---

### Task 1: Portable layout contract

**Files:**
- Modify: `scripts/smoke_chart_studio_beta.cjs`
- Modify: `static/chart-studio-beta.js`
- Modify: `docs/OPEN_TASKS.md`
- Modify: `chart_studio/README.md`

- [x] Add failing browser assertions for portable export fields, account-free scope, schema/size/symbol/timeframe rejection, merge ID remapping, replace confirmation, and no partial mutation on rejection.
- [x] Run the focused browser contract and confirm it fails because the Beta portable-layout API is absent.
- [x] Implement strict schema-v2 export/import, validated merge/replace behavior, and accessible Beta controls.
- [x] Run the full Beta Chromium browser test, v5 adapter and preview smokes, encrypted-device-sync browser contract, JavaScript syntax, and repository diff checks.
- [x] Record only the verified Beta behavior in `OPEN_TASKS.md`; keep production-v5 cutover, physical hardware, and cross-user conflict resolution open.
- [x] Commit the reviewed change on `main` and deploy after required GitHub checks pass. The implementation is `ae3bc99` on `origin/main`; subsequent passing Main CI (`4306865`, Chart Studio `39071123611`, Performance/UX `39071123603`) and the verified `/stt` runtime revision `4306865` include it. Production-v5 cutover, physical hardware, and cross-user conflict resolution remain open as recorded in `docs/OPEN_TASKS.md`.
