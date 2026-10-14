# FR-003 native v5 visible drawing handles

**Goal:** Make the draggable trend, rectangle and Fibonacci endpoints discoverable in the isolated v5 renderer.

**Scope:** Selected drawings render visible anchor handles at their exact chart coordinates. No production cutover, MT5 access or broker writes.

## Acceptance

- [x] Render contrasting 12-pixel canvas handles for both semantic anchors on selected trend lines, rectangles and Fibonacci drawings.
- [x] Verify the selected trend emits both handle draw calls in Chromium and save a selected-state visual artifact.
- [x] Run TypeScript check/build, the v5 Chromium smoke and `git diff --check`.
- [ ] Production drawing-tool integration, touch/DPI and target-hardware review remain open.
