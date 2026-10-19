# AUD-01 Request Route Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute each captured MT5 request trace to its HTTP method and canonical FastAPI route without storing query strings or concrete path values.

**Architecture:** A small `APIRoute` subclass sets request-local telemetry context around the route handler. `request_trace` copies only the method and route template into the bounded in-memory record. The app installs this route class before registering endpoints; direct telemetry callers remain compatible and omit route fields.

**Tech Stack:** Python, FastAPI/Starlette, ContextVar, pytest.

---

### Task 1: Capture canonical route context

**Files:**
- Modify: `broker_telemetry.py`
- Modify: `app.py`
- Test: `tests/test_broker_telemetry.py`

- [x] Add failing FastAPI integration tests for a parameterized route and a second route that raises; assert method/template attribution, no query or concrete path values, and context reset after exceptions. Preserve the legacy shape for direct `request_trace` callers and assert concurrent route contexts do not cross-contaminate. Add a custom `PreviewRoute` regression; it failed before composing the telemetry route wrapper.
- [x] Run focused tests and verify the new canonical-route and custom-preview tests fail before implementation because attribution is absent.
- [x] Add a telemetry `APIRoute` wrapper that scopes method and canonical route template, and include those safe fields in traces only when route context exists. `PreviewRoute` composes with this wrapper while retaining its validation-error response behavior.
- [x] Install the route class immediately after app construction, before endpoint registration.
- [x] Run focused telemetry/preview/broker regressions: 319 passed; `git diff --check` passed.
- [x] Update `OPEN_TASKS.md` with implementation and test evidence. AUD-01 remains partial pending new attributed cold/warm/load runs, approved performance budgets, and hardware/load gates.

