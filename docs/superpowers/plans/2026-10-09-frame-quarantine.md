# Defective frame quarantine implementation plan

> **For agentic workers:** Use subagent-driven-development and independent specification then quality review. Preserve all supplied raster assets.

**Goal:** Stop production from consuming the two frames with unapproved material-mask holes while retaining panel dimensions and readable light/dark presentation.

**Architecture:** Replace only the two CSS frame-image declarations with code-native borders using existing Stone colors. Keep sources and derivatives intact for later repair. Current hashes and alpha comparisons identify the exact affected files; no image processing or regenerated artwork is part of this package.

**Tech Stack:** Existing CSS, Python/Playwright fixture validation and current browser smoke.

## Evidence and scope

ASSET_MANUAL_REVIEW.md records fragmented material on pale backgrounds for frame12 and13. CURRENT_ASSET_INVENTORY.json binds PNG/WebP hashes/dimensions to aa6bf085. Direct decoded alpha-plane comparisons are identical for each PNG/WebP pair (difference extrema0,0), so the production derivatives carry the same reviewed mask. static/stone-asset-skin.css consumes frame12 for .stone-asset-panel--chart and frame13 for .stone-side-volume. These are not supplied replacement11/19, which remain intact.

Files: modify static/stone-asset-skin.css at only those two rules; add focused tests/test_stone_frame_quarantine.py; modify only static/stone-assets/ui/manifest.json original_sha256 entry for this CSS if needed; document quarantine in docs/audits/2026-10-09/ASSET_MANUAL_REVIEW.md. Preserve all raster files, generated nonchart skin, chart drawing code and user files. Existing UI derivative manifest fingerprints the original CSS: reconcile the expected source hash metadata only with explicit comparison proving all other source/artifact hashes unchanged; do not rerun the image builder or bless unrelated edits.

## Task1: quarantine and real CSS validation

- [x] Write/update a failing browser fixture test using the real production skin with chart/side-volume selectors, title, canvas and long text. On both pale and dark page backgrounds assert computed border-image-source is none, preserved baseline computed border widths/padding at each viewport (desktop chart22px/volume17px; below1360 volume10px; below900 chart14px/padding11px when its stone-asset-panel class applies), content fits at widths360/1400, expanded behavior is preserved including hidden side-volume below520px, and no frame12/13 network requests. The pre-fix production preview smoke failed on the active image-frame rule; the browser-contract updates are CSS rendering checks, not string-only assertions. No financial or trade controls are in the fixture.
- [x] Replace both frame images with plain opaque Stone borders using existing colors, retaining the existing later !important shadow cascade, responsive widths, padding and chart interactions. The focused fixture verifies computed opaque borders, geometry and shadow; rejected images are not layered underneath and source files remain intact.
- [x] Run the green 12-subtest Playwright fixture and Stone preview smoke; inspect pale/dark desktop and expanded mobile screenshots from ignored output. The screenshot checks make no desktop-hardware claim.
- [x] Compare all raster hashes and generated nonchart CSS before/after: all 163 raster files are SHA-256-identical (106,589,095 bytes); generated CSS is identical after CRLF normalization. Update only the tracked stylesheet digest in the manifest and verify structurally that all other manifest fields/hashes remain unchanged. No unrelated app.py hash was changed.
- [ ] Commit scope; independent spec then quality reviews, fix and re-review. No EA/MT5 operations.

## Release

- [ ] Parent full CI, merge expected reviewed head, guarded dashboard release and local/public authenticated browser smoke. Confirm frame URLs absent from actual view requests and production chart/side-volume remain visible; document reduced bytes without claiming all-page budget.
- [ ] AUD03 remains partial: defective frames quarantined, current inventory bound, source repair and complete production-derivative/theme/device review still open. This package does not declare every asset approved.

## Exact verification commands

RED/GREEN: `C:/Python314/python.exe -m pytest tests/test_stone_frame_quarantine.py -q` (RED due actual computed border-image and frame requests; GREEN after fallback). Use synchronous installed Python Playwright with bounded browser lifetime as in existing unittest smoke patterns; include a fixture-test skip only if the existing CI genuinely lacks browser support, then run the explicit installed browser check and report that limitation rather than false GREEN.

Existing Stone smoke: `node scripts/smoke_stone_preview.cjs` with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if the established environment requires it; expected success and saved ignored screenshots. Full integration: `C:/Python314/python.exe -m pytest -q --junitxml=output/dashboard-frame-quarantine.xml`; expected all tests pass. No production MT5 server is required for fixture/smoke. Existing local node_modules remain untracked.

The fixture must include both actual classes stone-asset-panel and stone-asset-panel--chart, real skin cascade and expanded-mode class/state, not an invented selector-only panel. Preserve 360px expanded side-volume hidden state; validate visible volume at1400px. The test captures baseline bounding rectangles/computed borders/padding before applying the fallback for a direct geometry comparison, and independently asserts the final image rejection and opaque frame color.

Independent plan review approved revised contract at1a3b901; implementation awaits the current evidence-store task/reviews.
