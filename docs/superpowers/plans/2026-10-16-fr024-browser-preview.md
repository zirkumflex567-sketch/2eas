# FR-024 browser preview integration

Date: 2026-10-16. Parent: [Open Tasks completion plan](2026-10-14-open-tasks-completion.md).

## Goal

Let a user import a signed declarative indicator package into the Chart Studio Beta and preview its output on the currently loaded chart bars. The host verifies the signature against a host-injected trust map and evaluates only the existing bounded expression language. Imported code is never executed, packages are not persisted, no MT5 call is made by the extension route, and no result is treated as an authoritative signal or trade instruction.

## Contract

- `POST /api/chart/v1/indicator-extensions/preview` accepts one bounded JSON envelope with account/symbol/timeframe context, canonical signed package text, parameters, and at most 10,000 bars.
- Reject Blueberry scope, duplicate JSON fields, unknown fields, oversized requests, bad scope, invalid bars, unknown signers, invalid signatures, and missing host trust configuration.
- The trust map is injected by the host via a private environment setting and contains public keys only. There is no package-provided trust, private-key loading, or browser storage.
- The result explicitly says `CALLER_SUPPLIED_BARS`, `canExecute=false`, and returns aligned `(time,value)` pairs. The extension route has no broker dependency and performs no persistence.
- The Beta drawer accepts a user-selected `.json` package, submits only its current in-memory chart bars, renders bounded readouts, and reports verification/configuration failures without accepting script code.

## TDD and delivery

1. Add route contract tests using generated Ed25519 keys: valid signed package; missing trust map; invalid signer/signature; Blueberry denial; duplicate/unknown fields; oversized envelope; malformed bars; alignment and no-store/no-MT5 behavior.
2. Run tests and capture the expected missing-route failure.
3. Implement the injected trust provider and bounded read-only preview route, then add the accessible Beta import/result UI.
4. Add Chromium coverage for import gesture, verified result rendering, rejected packages, scope changes, and absence of persistence or broker mutations.
5. Run focused and relevant regressions, update FR-024 to evidence-backed partial status, review, push on `main`, wait for required Actions, then guarded-restart and verify exact `/stt` runtime identity.

## Stop conditions

No trust map means fail closed. Do not invent or persist a production signer key. Never call the module evaluator on unverified or unsupported package content. Do not display extension output as a broker signal or execute a trade. Browser-side bars are caller-supplied input and must never be labeled server-verified in the route response.

## Progress

- [x] Route contracts went RED because `chart_studio.indicator_extension_api` was missing.
- [x] Implement bounded request streaming, duplicate-key rejection, strict XAU/demo scope, environment-injected public-key trust, signed-package verification, bounded calculation, and caller-supplied provenance response.
- [x] Add a Beta file-import control, current-chart overlay, stale-response/scope guard, and account/symbol/timeframe cleanup. Packages and outputs remain session-only.
- [x] Add local PKCS#8 Ed25519 package signing and download; prove interoperability by verifying the browser-exported canonical package with the Python server verifier using a generated test keypair. Private key material is never posted or persisted.
- [x] Focused API/interpreter suite: 32 passed. Chromium extension UI smoke: passed. Full dashboard frontend/security plus extension suite: 181 passed, 38 subtests, 4 existing FastAPI deprecation warnings. Full Beta Chromium smoke: passed with zero broker writes.
- [x] GitHub Actions passed for `8f6648e`: Performance/UX `39038559658`; Chart Studio `39038559615` passed on retry after one non-reproduced existing evidence-spool lifespan test `KeyError` (the focused test and complete file passed locally). Main was deployed and guarded runtime plus htown `/stt` were verified at the same revision/digest; live read-only chart/calendar acceptance passed on the four authorized demo aliases, with no writes or Blueberry reads.
- [ ] Independent security review, production trusted-key provisioning/rotation, acceptance with a real live-trusted-key package, native indicator catalog integration, and target-hardware profiling.
