# STT preflight before backlog execution

Date: 2026-10-09. Baseline main: `3032426f5749a4600c0e8d1198a3ac0dc46ff2bc`. This is point-in-time evidence, not a claim about future availability or the version after subsequent releases.

## Deployment and connections

- SSH to htown succeeded with the existing Ed25519 identity and strict known-host verification; nginx and sshd were active, nginx syntax valid.
- HTTPS certificate verified; unauthenticated `/stt/` returned 401. Authenticated public `/stt/`, both account status feeds and the ChartStudio asset returned 200.
- Remote tunnel listeners were restricted to `127.0.0.1:8055` and `[::1]:8055`; local dashboard listened on `127.0.0.1:8050`. Public nginx terminates TLS and Basic authentication, then forwards through that tunnel. No dashboard backend listener was public.
- Both expected MT5 terminal processes and the existing reverse-tunnel process were running. Only the stale dashboard Python process was restarted; MT5 charts/EAs and the tunnel were preserved.
- The stale process originally served 91,551 HTML bytes and lacked the new control-session route. After restart, local and authenticated public HTML both matched current source exactly: 109,069 bytes; SHA256 `a5ce0a45e299507a2ac19938158624c604c340c6e1665522fe273dd4d85b3ccb`.
- Both public and local MT5 account feeds reported fresh quotes. Twenty alternating local light-status reads returned the correct requested account and fresh source every time: median 63 ms, maximum 115 ms. These are this machine's observations, not an SLA or a cross-account broker mutation test.
- The actual firewall ruleset was inspected. `firewalld` was not running; nftables contained Docker forwarding rules. No independent INPUT-filter guarantee was established. Loopback bindings are verified; do not claim firewall hardening from service status alone.

## Browser and baseline measurements

- Local and authenticated public Chromium at 1280×850: no page errors, nine canvases, ChartStudio toggle present and studio panel opened successfully. Mutation routes were blocked by the test harness; none were requested.
- Local live Chromium: twenty UI account switches, then sixty seconds idle; no page errors or mutation requests. Account/chart identities matched. Slowest switch: 544 ms.
- CDP JS heap: 3,304,640 bytes before switches; 11,548,408 after switches; 4,905,160 after idle. No forced-GC comparison, long-term leak conclusion, actual-mobile or 150% desktop-DPI acceptance follows from these samples.
- Eleven long tasks observed: 301, 311, 80, 56, 64, 172, 54, 54, 63, 58, 63 ms. These provide a current baseline; they do not establish that all performance budgets pass.
- A separate five-minute visible/low-motion idle run (300.44 seconds, 31 samples) had no page errors. JS heap ranged from 4,194,236 to 4,962,660 bytes (first 4,333,808; last 4,860,780), DOM nodes from 3,581 to 5,318 (first 3,582; last 5,148). CDP task-duration delta was 29.027 seconds; eight long tasks were 140, 172, 109, 123, 162, 56, 56 and 56 ms. This is one mode on desktop Chromium, not Off/Full/celebration, CPU/FPS, forced-GC or 30/60-minute acceptance.
- Clean code baseline: 302 pytest tests plus 245 subtests passed; browser checks above exercise real demo data read-only.

## Remaining findings at this baseline

- Public `/stt/api/control_session` returned 403 despite successful Basic authentication. The authenticated username/role was not propagated to the application. The separate proxy-identity package addresses this with explicit roles and verified forwarding; release evidence must be added after its deployment.
- Running EA binary/preset identity was not proven. Repository source/ex5 hashes alone cannot identify an already loaded program. No EA acknowledgement, guard reset, SL/TP modification or trade close was tested.
- Private screenshots, filtered responses and measurement JSON remain in ignored `output/integration-live/runtime-20261009/`; they are intentionally not committed because screenshots can include broker/account information.

## Package #27 deployment, 2026-10-09 14:55 UTC

Main `4a0cb125288fb07e6d593a980fa7337b909de841` is deployed locally and through htown `/stt`. The dashboard alone was restarted after verifying its process identity; both MT5 terminals and the reverse SSH tunnel were preserved. nginx syntax validation and reload passed. Its shared-secret snippet is root-owned mode 0600, with a protected rollback copy; credentials remain outside Git.

- Local/public runtime agree: startup and disk revision `4a0cb12`, tracked-code digest `8f14960e867ff3826f74776f3961bed808280420f251f2ce6623fec4b3b6bbc1`, application code clean, restart_required=false. Runtime evidence identifies the serving process and checkout independently of HTML equality.
- Both account feeds are fresh locally and publicly. Authenticated public control_session now returns 200, role=trade, control_enabled=true; its cookie is Secure, HttpOnly and SameSite=Strict. No trading mutation was sent.
- A forged unauthenticated public identity returns 401. Direct loopback with the public Host and a wrong proxy secret returns 403. The prior public-control 403 finding is resolved.
- Public Chromium completed 20 account switches with matching account/chart identities (267–450 ms), opened ChartStudio, and reported zero page errors and zero mutation requests. Nine canvases were present.
- Both final PR workflows passed, including 397 tests and 245 subtests. The subsequent main Audit workflow passed; main Chart workflow `37947096233` failed one hung-status frontend fixture assertion. An existing status request can delay when the deliberately hung request starts; the next package must anchor that fixture's deadline to the actual intercepted request and obtain green main CI. The other 396 tests and all 245 subtests passed in that run.

This proves the deployed ingress/runtime package and read-only demo paths at that time. EA identity, actual broker writes, hardware and long-term performance acceptance remain as listed above. Filtered proof and screenshots are stored in the ignored evidence directory.

## Broker read package #28 deployment, 2026-10-09 15:26 UTC

Main `04194ec090f8e727ae594aa469cd55cc846f24ef` is deployed with the reviewed Windows PowerShell 5.1 Restart guard. Both final PR workflows passed: 532 tests and 245 subtests, chart math, isolated native-v5 build/proof and browser/Stone smoke. Independent broker, fixture and integration reviews approved. Both subsequent main workflows passed as well: Chart run 37951699511 and Audit run 37951699667.

- Local/public runtime agree on startup/disk main `04194ec` and digest `f461f3d6042ac915b31833847dbfd31c9fb6c469bd8e5ec568f989eefcf469fb`, with clean source and restart_required=false. Existing MT5 terminal processes and reverse tunnel were preserved.
- GET symbols, symbol-info and positions return verified account/symbol data and fresh quotes for both demos, with separate open/pending arrays and canExecute=false. Both demos currently return an empty pending array; positive pending-schema coverage comes from fake tests, not a created demo order.
- Twenty alternating API account switches passed on each of the local and public surfaces. Missing account and unknown account requests are rejected. No broker mutation was sent.
- Public Chromium completed another 20 account switches with matching identities (249–558 ms), zero page errors and zero mutation requests. ChartStudio opens, and the protected public trade session remains available.
- PowerShell 7.6.6 Status refuses this runtime without stopping it: Invoke-RestMethod deserializes startedUtc as a DateTime, while the guard expects a string. Windows PowerShell 5.1 Status and actual Restart succeed. Cross-version parsing needs a tested correction before claiming PowerShell 7 compatibility.

## Package #29: history and PowerShell compatibility release

PR [#29](https://github.com/zirkumflex567-sketch/2eas/pull/29) merged as `043d7b69b7edd6ad71a9dec19ba34ee959ccea68`. Both final PR workflows passed 688 tests plus 245 subtests and the math/native-v5/browser/Stone checks (37956437357, 37956437423). Main includes the intervening volume-profile commits 55dd508/9c03ee7; both combined-main workflows passed (Chart 37982298944, Audit 37982299135).

The history contract received independent spec and quality approval. The separate PowerShell reviewer found no source gaps and verified eight focused cases before its account quota interrupted the review; the parent completed the remaining source/spec/quality review independently of the implementer. Raw timestamp strings, before-stop identity checks, bounded fixture execution and exact app/interpreter cleanup were retained. The complete runtime/proxy/control suite passed 120 tests; older Core behavior was simulated, not tested on an installed old shell.

- PowerShell 7.6.6 guarded Restart succeeded; Windows PowerShell 5.1 Status and PowerShell 7 Status confirmed the same runtime. PID 40556, startedUtc 2026-10-09T19:45:14.616227Z; startup/disk revision match main, digest `9f4b964af00935f11ef34a408f078de668190af0eb258bfaa378bd23c4102b01`, applicationCodeDirty=false and restart_required=false.
- Authenticated local and public `/stt` HTML both match source SHA256 `af9cdd70b32c85dd51f25b486e028588afe67f2b26e90e7b08d930debc009020`. Both demo feeds are fresh; forged unauthenticated public identity returns 401 and direct false proxy identity 403.
- Both demos returned real deal history on both surfaces. Two one-deal pages per account/surface had no duplicate tickets, retained the same as-of boundary and rejected another account's cursor with 410. Broker-read account-switch tests also passed.
- Public Chromium completed 20 account switches in 249–700 ms, with nine chart canvases, no browser errors and zero API mutation requests. These timings are smoke evidence, not a full performance budget.
- MT5 processes 13940/34812 and reverse SSH 16580 retain their original creation times. nginx/sshd are active and nginx -t passes. No actual broker order, modify, close or reset was sent.

Filtered live evidence remains ignored under `output/integration-live/runtime-20261009/`: live-proof.json, broker-read-proof.json, trade-history-proof.json and browser-after-deployment.json. Credentials, full account responses and cookies are not committed.

## Package #30: actual read-only position stop preview

PR [#30](https://github.com/zirkumflex567-sketch/2eas/pull/30) merged as main `aa6bf08569c5e3ae8403e5aad2e658f7c7fcac02`. Final head 9b93b801 received independent spec and quality approval; both PR workflows passed 755 tests plus 245 subtests and math/native-v5/browser/Stone checks (37985116089, 37985116016). Subsequent main workflows 37986313388 and 37986313353 also passed.

PowerShell 7 guarded Restart succeeded: PID 35968, startedUtc 2026-10-09T20:21:30.398872Z, matching startup/disk revision and digest `c2870d107df04b0e7de86ffba4542e91c4b3b91e4872cc9f9d93d7ae4b3d4707`; clean application source, restart_required=false. Windows PowerShell 5.1 Status confirms the identical runtime. Local/public HTML still matches SHA256 af9cdd70b32c85dd51f25b486e028588afe67f2b26e90e7b08d930debc009020, both feeds fresh and ingress forgery rejected.

Both demos, on both local and public surfaces, passed an actual ticket/read/calculation/readback sequence: proposals valid, canonical response contract, correct account currency, real gross profit estimates, guard UNKNOWN/source NONE and both execution flags false. Position/pending revision books matched before/after. A deliberately stale expected revision returned 409 POSITION_CHANGED. Only the reviewed read-only preview endpoint was POSTed; no broker order/modify/close/reset was sent.

Public Chromium completed 20 account switches (265–549 ms), nine canvases, no errors and zero API mutations. MT5/tunnel process identities remain unchanged. Filtered preview evidence is position-preview-proof.json; #29 release files were preserved separately before the new proof. Native drag/touch, genuine live EA action policy and independent write acceptance remain open.

Native symbol/order UI, historical fills, FX and the independent chart write gate remain open. Private evidence stays in the ignored directory; package #27 proofs are preserved separately.
