# Non-chart dashboard audit fixes

## Reproduce safely

```bash
C:/Python314/python.exe -m pytest tests -q
C:/Python314/python.exe -m pytest tests/test_dashboard_frontend.py -q
AUDIT_UI_TRACE=1 C:/Python314/python.exe -m pytest tests/test_dashboard_frontend.py -q -k hung_status
```

Requires pytest, Playwright/Chromium and Pillow. Axe 4.10.3 is vendored under tests/vendor; no CDN/network needed for test execution. Harness AST-extracts the production HTML_CONTENT without importing app or MT5, serves the actual repository assets on an ephemeral loopback port, and intercepts every API, including all mutations. The fixture server rejects unexpected APIs and POSTs. Existing ports 8050/8057 and original conflicted worktree were not touched.

## Implemented

- VIS-01/UX-01: scoped non-chart semantic foreground/background tokens for dark/light/stone; legible prices/risk; 24px tabular countdown; 44px controls and 128px numeric inputs. Gold guard/volume fixtures covered.
- VIS-02: wrapping mobile header, no hidden matrix values; focusable named horizontal matrix region with a visible swipe/keyboard hint, arrows/Home/End. 320/390/768 and doubled-root-font reflow tested. Small-screen modal has scroll fallback and fits primary controls at 320x640.
- VIS-03: diagnosis trend updates only responsible classes, preserving stone asset and accessibility panel classes over ten polls and account switch.
- A11Y-01: reset dialog role/name/modal semantics, labeled reference input, initial focus, inert background, keyboard focus trap, capture-phase Escape, return focus, inline finite positive validation. Position fields have account/ticket/USD accessible names.
- REL-01: AbortController plus Promise.race deadline including JSON body; 4.5s request limit; last success and 6s freshness watchdog; explicit STALE/OFFLINE with age; last good values retained. Mutations recheck fresh account/risk both before and after CSRF bootstrap. Abort pending account-scoped requests on generation change; preserve existing response identity checks.
- REL-02: keyed position nodes, account/ticket draft map, focus preservation across additions/removals/reorder/partial volume; own-ticket closure announces discarded draft. Successful submission clears only matching submitted values, never a newer in-flight draft.
- REL-03: retried complete account bootstrap with bounded exponential delay, hidden non-chart polls paused, visible-tab refresh; optional chart-init/read failures cannot erase/stop account features; journal per-source last good cache with incomplete/unknown totals instead of $0.00.
- PERF-03: keyed/signature journal rows, no same-payload DOM replacement, expandable native details preserving disclosure/focus; safe optional storage; off/low/full non-chart decoration (default low), reduced motion across themes, IntersectionObserver/background pause.
- CSRF integration: controlled endpoints only modify_position/close_position/reset_drawdown obtain GET /api/control_session using same-origin credentials; send X-Dashboard-CSRF, cache session Promise, clear on 403, do not automatically retry mutations. No chart mutation APIs changed.

## Evidence

- Sequential RED/GREEN logs: tdd-01 through tdd-24 (each behavior first reproduced failing, then fixed).
- full-suite.log: 85 passed, 28 subtests passed in 102.82s; 39 new real-page Playwright tests plus baseline 46 tests.
- Header/matrix initial/end screenshots for 3 themes x 3 widths; journal, gold guard, gold mobile positions/journal, small-screen modal.
- contrast.json and gold-contrast.json retain axe violations AND incomplete results. Zero scoped contrast violations in all themes. Stone pseudo/textured backgrounds remain incomplete, not an axe compliance claim.
- texture-contrast.json: 33 actual-pixel background probes for key numerals/prices; minimum measured contrast 7.0137:1. Probe removes only target text, samples screenshot background, restores inline style. Does not prove every textured label compliant.
- Network/error logs for each real-page browser test; broker mutations are intercepted fixture responses, never real execution claims.
- Optional Playwright traces generated locally (not committed: decorative original assets make traces large). Timeout trace: output/audit-ui/test_hung_status_expires_without_losing_last_good.zip.

## Integration / limits

Parent: register dashboard_security middleware and GET control_session; this branch implements frontend contract only. Parent/backend must finalize light-status option (likely light=true), then change updateStatus to /api/status?light=true. This branch deliberately retains /api/status until backend contract is integrated.

Chart function block and backend before HTML_CONTENT verified unchanged. Shared accountFetch transport now times out optional candle requests, preventing a blackholed optional feature from holding bootstrap forever; no candle functions/series/chart APIs altered. New CSS selectors only named non-chart regions, never chart card/scenes. Original stone/chart/celebration asset files unchanged.

No real MT5 GETs or writes used by these regression tests. No representative hardware CPU/GPU/FPS claim or <16.7ms guarantee; performance evidence is motion pause and keyed DOM behavior. Full integration with backend null-risk semantics and middleware requires parent rerun. 200% check uses doubled root font (not full OS/browser accessibility zoom). Stone axe incomplete cases remain explicitly recorded.
