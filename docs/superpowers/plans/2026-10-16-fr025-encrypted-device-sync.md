# FR-025 Encrypted Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable cross-device Chart Studio layout sync with authenticated per-user access, client-side encryption, recoverable immutable revisions, offline retry and explicit conflict resolution.

**Architecture:** Keep layout encryption and keys in the browser with WebCrypto AES-GCM; users export a high-entropy recovery key for another device and the server never receives it or plaintext layouts. Each bundle has one account alias and symbol scope, bound into authenticated data along with bundle ID and format version. Global market drawings are not cross-account shared by this first version; account layouts exclude broker positions and order bindings. The backend accepts only an authenticated proxy identity, stores opaque ciphertext revisions scoped to that user and bundle, and uses compare-and-swap revisions with retained history. The UI keeps unsent encrypted payloads locally, surfaces conflicts, and requires an explicit choice before replacing a newer remote revision.

**Tech Stack:** FastAPI, SQLite, browser WebCrypto, vanilla JavaScript, pytest, Node/Chromium.

---

## Scope boundary

This subplan implements FR-025 only. FR-024's constrained signed indicator extension sandbox is a separate package-7 item and remains open with its own plan and acceptance; package 7 cannot be marked complete until that work is delivered. The first FR-025 release supports account-scoped layouts only. Cross-account global market-drawing sharing remains an explicit follow-up and prevents claiming full §14.1 scope until implemented.

## Files and boundaries

- Create `chart_studio/device_sync.py` for validation and SQLite opaque-revision storage, reusing `CHART_STUDIO_DB` but maintaining separate tables.
- Modify `app.py` for authenticated API routes and role checks using `request.state.control_identity` populated by `dashboard_security.py`.
- Replace `static/chart-studio-server-sync.js` with the encrypted sync client. Do not keep the old plaintext bearer-token workflow enabled.
- Add `tests/test_chart_studio_device_sync.py` for storage, API auth/ACL, ciphertext validation, revision history, conflicts, and migration recovery contracts.
- Add `tests/test_chart_studio_device_sync_frontend.cjs` for WebCrypto round-trip, wrong-key/tamper/scope failure, encrypted IndexedDB offline retry, and explicit conflict resolution in Chromium.
- Update `docs/OPEN_TASKS.md` and `docs/CHART_STUDIO_MASTER_SPEC.md` with evidence and any remaining deployment or manual-recovery gates.
- Ensure the encrypted payload contains only saved chart configuration/drawings. Runtime broker positions, pending orders, and order-bound overlay data are rebuilt from broker reads and never persisted or synchronized.

## Task 1: Opaque private revision store

- [x] Write failing tests for per-user bundle isolation, immutable revisions, compare-and-swap conflicts, invalid envelope rejection, bounded history and store errors.
- [x] Run `python -m pytest tests/test_chart_studio_device_sync.py -q` and confirm the new store/import is missing.
- [x] Implement strict envelope validation and SQLite tables storing only authenticated owner, bundle ID, account alias, symbol, format version, nonce, ciphertext, revision, and timestamps. Bind account alias and symbol in the encryption additional data and enforce the same scope on list/read/write. Retain the latest 10 revisions. Never accept plaintext fields or client-supplied owner.
- [x] Run focused storage tests; verify the database contains no plaintext layout fixture strings.

## Task 2: Authenticated role-bound API

- [x] Add failing API tests proving only verified proxy identities reach device sync; `read` can GET only, while `layout` and `trade` can GET/PUT because trade-role users also own chart preferences; all other roles fail closed. Verify one proxy user cannot list/read/write another user's revisions or move a revision across account/symbol scope. Reuse proxy middleware and reject write requests with foreign Origin or `Sec-Fetch-Site`; apply a bounded per-user write rate limit.
- [x] Run the API tests and confirm they fail at the absent routes.
- [x] Add GET current/history and PUT compare-and-swap routes, requiring opaque bundle IDs and envelope-only payloads. Use `request.state.control_identity`; reject local/bearer identities. Return current revision metadata on 409 without decryptable data.
- [x] Run `python -m pytest tests/test_chart_studio_device_sync.py -q` and existing proxy/workspace security tests.

## Task 3: Client-side encryption and safe recovery

- [x] Add failing browser tests for generated 256-bit recovery keys, cross-page key import/decrypt, AES-GCM authentication failure on tamper or wrong bundle scope, and absence of keys/plaintext in requests/storage.
- [x] Run the browser test and confirm expected missing API/UI failures.
- [x] Implement bundle encryption with a random nonce and authenticated additional data bound to bundle ID, account alias, symbol and format version. Generate a random 256-bit key and export it in a documented `2eas-sync:v1:<base64url>` portable package containing bundle ID, scope and the exact 32-byte key; parse its structure and lengths strictly. Keep keys only in page memory; offer copy/export and import. A lost key has no server-side recovery, so preserve ciphertext revisions and report data as unrecoverable. Key rotation decrypts and verifies all retained revisions into a new bundle with a new key; the original remains an immutable archive, so rotation cannot revoke a previously copied key's ability to decrypt old revisions. Never persist keys in local/session storage, URLs, or server responses.
- [x] Run headless Chromium tests and confirm server sees only ciphertext while another device can decrypt with the exported key.

## Task 4: Offline and version conflict recovery

- [x] Add failing UI tests for disconnected saves preserved as encrypted pending data, retry after reconnection, stale revision conflict preserving both local and remote ciphertext, and all three master-spec choices.
- [x] Implement an IndexedDB pending queue containing ciphertext envelope and scope metadata only, from a stable captured chart-document snapshot. On 409 show: “Meine Änderungen” (explicitly replace using the freshly fetched head revision), “Serverstand” (decrypt/import remote), or “Als Kopie speichern” (new bundle ID). Keep old revisions immutable for rollback. Unsupported format versions remain available as ciphertext archive and cannot overwrite newer data.
- [x] Run focused browser tests, including stale/unknown offline base revisions, and test rapid account/chart switching for stale async response isolation.

## Task 5: Recoverable migration from existing layouts

- [x] Add failing browser tests showing local layouts remain unchanged if a new encrypted upload is interrupted or fails verification.
- [x] Implement user-triggered migration from a local layout: exclude runtime broker/position/order-binding data, encrypt locally, upload as a new revision, then decrypt and verify the returned revision before reporting success. Never delete or rewrite the source layout.
- [x] Define legacy server migration as a pre-upgrade export/import workflow: users export from the currently deployed legacy client while it is available, then import the file in the new client. The new client never calls the legacy API, asks for its bearer token, or silently copies/deletes old plaintext data. Keep legacy plaintext routes behind their existing explicit `CHART_STUDIO_STORAGE_ENABLED=1` plus strong-token gate.
- [x] Preserve unsupported encrypted format versions as downloadable ciphertext archives and block overwrite until a compatible client can decrypt them. Test that failed decrypt/migration leaves the source and server head unchanged.
- [x] Run migration tests with supported, unsupported, tampered and interrupted payloads.

## Task 6: Acceptance, docs and release

- [x] Run focused sync tests, related workspace/proxy/security suites, and frontend functional checks.
- [x] Review exact diff for plaintext leakage, ownership spoofing, revision races, and silent overwrite; fix offline base-revision overwrite and asynchronous scope-switch races.
- [x] Document the runtime flag, proxy role mapping, recovery-key handling, rollback/history behavior, the pre-upgrade legacy export, and any deployment acceptance not yet completed.
- [x] Update FR-025 only to the evidence actually obtained; a new API contract test uses two separately instantiated authenticated device clients to verify shared encrypted revisions and stale-write conflict detection. Keep FR-025 partially open for `/stt` acceptance, live authenticated cross-device testing, global drawing sharing and independent security/hardware review.
