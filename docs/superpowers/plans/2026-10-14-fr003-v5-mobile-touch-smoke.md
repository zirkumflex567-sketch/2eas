# FR-003 native v5 mobile touch contract

**Goal:** Prove an endpoint drag works on a narrow touch viewport without requiring a pre-existing mouse-hover state.

**Scope:** Chromium emulation only at 390 CSS px and 150% device-pixel ratio. Physical-device, Windows display scaling, production integration and broker tests are out of scope.

## Acceptance

- [x] Add a red Playwright contract that injects a real touch sequence at a trend anchor and verifies the opposite anchor stays fixed.
- [x] Resolve a touch-down directly against public chart-coordinate anchors when hover metadata is absent.
- [x] Verify the drag at 390 CSS px / 150% DPR and save a mobile fixture screenshot.
- [x] Run TypeScript check/build, native v5 smoke and git diff --check.
- [ ] Physical mobile and Windows 150% DPI acceptance remain open.
