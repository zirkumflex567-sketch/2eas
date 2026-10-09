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
