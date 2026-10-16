# FR-024 signed indicator sandbox implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept only trusted, signed declarative indicator packages and evaluate them under deterministic CPU, memory, input, and output limits without executing imported code.

**Architecture:** A small Python module verifies Ed25519 signatures over canonical JSON using an injected trusted-key map, validates a strict expression-tree schema, and evaluates bounded series operations over validated OHLC bars. The first delivery is an internal, independently testable engine; no imported JavaScript, Python, filesystem access, MT5 access, broker mutation, or untrusted signing key is accepted. Browser import/catalog integration and operational public-key provisioning remain separate follow-up work and must not be reported complete by this engine alone.

**Tech Stack:** Python 3.14, `cryptography` Ed25519 verification, pytest, canonical JSON, bounded pure-Python evaluator.

---

## Scope and requirements

Requirement: FR-024 / P2 — constrained indicator sandbox, secure signed imports/exports, and measured CPU/memory limits; arbitrary `eval` is prohibited. This phase supplies the package contract and safe calculator. It does not grant an extension any code execution, network, storage, account, or trade capability. Backtests and Strategy Tester are out of scope.

`chart_studio/indicator_extensions.py` will own strict package parsing, signature verification, schema and AST validation, parameter validation, deterministic evaluation, and cost accounting. `tests/test_chart_studio_indicator_extensions.py` will use generated Ed25519 keys and real evaluator calls; private test keys never enter production files. `requirements-dashboard.txt` will pin the already installed `cryptography` dependency. `chart_studio/README.md` and `docs/OPEN_TASKS.md` will record the exact capability and remaining integration gaps.

Package format is UTF-8 JSON with exact top-level fields `schemaVersion`, `keyId`, `signature`, and `manifest`. Signature input is UTF-8 canonical JSON of `manifest` (sorted keys, compact separators, finite JSON numbers only); imported input rejects duplicate keys. Export serializes the same canonical envelope after signing its manifest with a caller-injected Ed25519 private-key object. The library never loads, stores, generates, or logs private keys; application key provisioning/rotation is a separate gate. The trust map is passed by the host; unknown/malformed keys or bad signatures fail closed. Manifest fields are a stable lowercase ID, semantic version, short display name, declared bounded parameters, and a declarative expression tree. Allowed leaves are OHLC/derived-price sources, constants, and declared parameters. Allowed operations are arithmetic/min/max/abs, SMA, and EMA. There are no identifiers for Python/JavaScript functions, imports, callbacks, loops, property lookup, or dynamic dispatch.

Limits are explicit and independently tested: package <=64 KiB encoded bytes; <=128 expression nodes; depth <=16; <=16 parameters; bars <=10,000; periods 2–1,000; estimated owned memory <=64 MiB; and <=3,000,000 counted operation units per evaluation. Text callers are capped at 64 KiB Unicode code points before UTF-8 conversion (at most 256 KiB temporary encoded bytes), then the exact 64 KiB encoded-package cap is enforced before JSON parsing. Preflight conservatively charges every AST node one bars-length array at 64 bytes/cell plus per-array overhead, rolling-window scratch, five bars/time normalization arrays, and output. The evaluator checks each array visit against a runtime operation meter and checks an injected monotonic deadline (250 ms by default) at least every 64 units, aborting without returning partial output. The preflight estimator is `5 * bars + nodeCount + weightedNodePasses * bars`; source and elementwise nodes weigh one pass, SMA/EMA nodes weigh ten passes. Runtime metering includes each of these units and is authoritative if implementation work is added. Inputs and results must be finite where present; warmup is represented as `None`; division by zero is `None`, never infinity. Invalid or over-budget inputs are rejected before allocating output arrays. The module's allocations are bounded by the conservative estimate. Limits can be tightened after profiling but never expanded from package data.

## Tasks

### 1. Signed package import/export contract and validation

- [x] Write tests for real signed import and export using generated Ed25519 keys, unknown key, bad signature, mutated manifest, duplicate JSON key, malformed/noncanonical/oversized input, malformed key/signature encodings, unknown fields, invalid identifiers/parameters and unsupported AST nodes. Assert exported private key material is never included in output.
- [x] Run the focused tests and observe the expected missing-module failure before implementation.
- [x] Implement strict bounded JSON loading, duplicate-key rejection, canonical envelope/manifest serialization, caller-injected Ed25519 signing, trusted-key verification, and exact schema/AST validation. No file/key loading or private-key persistence is permitted.
- [x] Add the pinned runtime dependency and verify Python 3.14 can install/import it in the project environment.
- [x] Run focused tests after security review fixes (23 indicator tests passed); Python compilation passed.

### 2. Bounded deterministic evaluator

- [x] Add tests for OHLC and derived-source calculation, constants and parameters, SMA/EMA warmup, arithmetic, repeated updates, and deterministic output.
- [x] Add adversarial tests for excess nodes/depth/period/bars/cost/cells, bool-as-number, NaN/infinity, malformed bars, invalid parameter ranges/steps, divide-by-zero, and input mutation.
- [x] Implement preflight cost and conservative Python-byte memory estimates before allocations, then evaluate only the allowlisted AST. Enforce a runtime operation counter and monotonic deadline within loops. Never use `eval`, `exec`, dynamic imports, or user-provided callables.
- [x] Measure a 10,000-bar SMA(20) fixture with `time.perf_counter` (56–86 ms over five runs with the runtime deadline enabled) and separately with `tracemalloc` (835 KB peak, profiler-only frozen clock); these are local evidence, not universal hardware guarantees.
- [x] Run focused and relevant indicator/workspace regressions (final results recorded below).

### 3. Documentation and review

- [x] Document the signed package schema, trust-map injection requirement, resource limits, and the fact that this engine is not yet wired to the browser indicator catalog.
- [x] Update FR-024 only to `Teilweise`, preserving browser integration, key provisioning/rotation, export UI, and independent security/performance review as open.
- [x] Run the full non-backtest suite; Strategy Tester/backtest modules remained excluded (1,036 passed, 305 subtests passed, 4 existing FastAPI deprecation warnings).
- [x] Obtain independent implementation reviews and fix the oversized-string pre-encoding allocation/override findings.
- [x] PR [#44](https://github.com/zirkumflex567-sketch/2eas/pull/44) merged to `main` as `698b70d`; resulting-main revision and local regression suite verified. GitHub Actions failed before its first step (no job logs), so CI remains an infrastructure limitation rather than a passing check.

## Stop conditions

- Missing trusted-key configuration rejects every package; never accept a key supplied only by the package itself.
- Signature verification proves publisher identity only; strict schema and resource preflight are still mandatory.
- Any malformed package, invalid signature, unsupported operation, limit overrun, arithmetic overflow, or evaluator exception produces a bounded error and no partial result.
- No imported source code is run. No MT5 terminal or broker function is reachable from this module.
- No browser catalog/integration, deployment, demo, hardware, or write approval is implied by unit tests.

## Follow-up: browser preview slice (2026-10-16)

See [FR-024 browser preview integration](2026-10-16-fr024-browser-preview.md). The Beta drawer now accepts a user-selected JSON package, submits only in-memory chart bars to a bounded server preview route, and plots verified results on the current chart without persistence. Host public keys remain an explicit environment-injected trust map; no signer key was generated or provisioned. Until a trusted key is provisioned and a real signed package is accepted, FR-024 stays partially complete.
