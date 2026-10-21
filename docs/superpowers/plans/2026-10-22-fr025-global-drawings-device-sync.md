# FR-025 cross-device sync for symbol-wide market drawings

## Goal

Extend the existing encrypted device-sync feature so a user can explicitly synchronize the selected global market drawings for one symbol across authenticated devices. Keep these drawings independent from account-scoped layouts and from positions, orders, tickets, trade drafts, and broker history.

## Constraints

- Preserve account-scoped layout sync behavior and its recovery-package compatibility.
- A global-drawing bundle has a dedicated reserved scope, bound to one exact symbol and user; it must not be readable as an account layout.
- In proxy-authenticated sessions, the browser-local global-drawing namespace is user-scoped with a stable opaque principal hash. Legacy `local` drawings stay under their existing key until the signed-in user explicitly confirms the in-app copy into their proxy-user namespace; the source remains intact.
- Only explicitly shared drawing geometry is synchronized. Unshared drawings and account-specific settings remain local.
- Server and offline queue store ciphertext only; AES-GCM keys remain in page memory or user-carried recovery packages.
- Reuse proxy identity/role checks, same-origin writes, CAS revision conflicts, bounded history, and existing encryption limits.
- The optional feature flag remains disabled by default. Do not enable it on `/stt` or place broker orders as part of this package.
- Do not access Blueberry or run a backtest.

## Implementation sequence

1. Add failing WebCrypto contracts for a distinct symbol-wide drawing document and recovery package. Reject account-layout fields, unknown keys, broker data, wrong symbols, and attempts to use a global bundle as an account layout.
2. Add failing Chromium contracts for switching between account-layout and global-drawing sync modes, preserving separate bundle/revision/cache state, transferring one explicitly shared drawing between two device contexts, and retaining account-local drawings/settings. Cover conflict, offline retry, account switch, and symbol switch.
3. Extend the Beta chart adapter with a strict export/import contract for the current symbol's global drawings. Import must replace only the global drawing set, preserve local drawings and all account settings, validate geometry, and resolve ID collisions safely.
4. Extend the encrypted sync panel with an explicit mode selector and separate symbol-scoped recovery package handling. Account mode retains current behavior. Global mode uses a reserved account scope and a dedicated `kind` discriminator inside the encrypted document. Loading and saving remain explicit user actions.
5. Keep API envelope/schema and owner/role isolation unchanged where possible; if any server changes are needed, add authorization and cross-scope regressions first.
6. Run RED then GREEN focused tests, related Beta/object-manager and proxy/device-sync suites, Chromium smoke, JavaScript syntax checks, and `git diff --check`. Conduct independent spec and quality reviews; resolve findings before merge.
7. Update `OPEN_TASKS.md` and the master spec only to evidence actually obtained. The `/stt` feature flag, authenticated two-device production acceptance, security review, and target-hardware review remain separate release gates.

## Acceptance criteria

- A user must deliberately choose the global-drawings mode and explicitly share each drawing before it enters the global symbol store.
- Two authenticated same-user device contexts can sync and decrypt the same global drawing bundle with a user-carried recovery package; another user, symbol, bundle, role, or account-layout mode cannot read or apply it.
- A `read` role may retrieve ciphertext under the existing ACL but cannot write; only layout/trade roles can upload. Decryption/application requires the recovery key and matching global scope.
- AES-GCM additional authenticated data distinguishes global drawing bundles from legacy account-layout bundles without changing account-layout AAD compatibility.
- The remote payload contains only AES-GCM ciphertext; the API cannot observe drawing plaintext or recovery keys.
- A global import modifies only global drawings for the exact symbol. It preserves local drawings, account settings, and all broker-derived state.
- Global drawings remain visible across timeframes for the same symbol and owner, but do not cross user or symbol boundaries.
- Revision conflicts preserve local and remote versions and require an explicit resolution; offline retry keeps only encrypted payloads.
- Existing account-layout sync tests remain green, and `/stt` remains disabled until separately approved.
