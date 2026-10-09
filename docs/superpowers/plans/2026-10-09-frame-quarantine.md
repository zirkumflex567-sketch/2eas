# Defective frame quarantine implementation plan

> **For agentic workers:** Use subagent-driven-development and independent specification then quality review. Preserve all supplied raster assets.

**Goal:** Stop production from consuming the two frames with unapproved material-mask holes while retaining panel dimensions and readable light/dark presentation.

**Architecture:** Replace only the two CSS frame-image declarations with code-native borders using existing Stone colors. Keep sources and derivatives intact for later repair. Current hashes and alpha comparisons identify the exact affected files; no image processing or regenerated artwork is part of this package.

**Tech Stack:** Existing CSS, Python/Playwright fixture validation and current browser smoke.

## Evidence and scope

ASSET_MANUAL_REVIEW.md records fragmented material on pale backgrounds for frame12 and13. CURRENT_ASSET_INVENTORY.json binds PNG/WebP hashes/dimensions to aa6bf085. Direct decoded alpha-plane comparisons are identical for each PNG/WebP pair (difference extrema0,0), so the production derivatives carry the same reviewed mask. static/stone-asset-skin.css consumes frame12 for .stone-asset-panel--chart and frame13 for .stone-side-volume. These are not supplied replacement11/19, which remain intact.

Files: modify static/stone-asset-skin.css at only those two rules; add focused tests/test_stone_frame_quarantine.py; document quarantine in docs/audits/2026-10-09/ASSET_MANUAL_REVIEW.md. Preserve all raster files, generated nonchart skin, chart drawing code and user files. Existing UI derivative manifest fingerprints the original CSS: reconcile the expected source hash metadata only with explicit comparison proving all other source/artifact hashes unchanged; do not rerun the image builder or bless unrelated edits.

## Task1: quarantine and real CSS validation

- [ ] Write a failing browser fixture test using the real production skin with chart/side-volume selectors, title, canvas and long text. On both pale and dark page backgrounds assert computed border-image-source is none, exact preexisting border widths22/17px, padding unchanged, content fits at widths360/1400, and no frame12/13 network requests. This is a CSS rendering test, not a string-only assertion. Avoid fake financial content or trade requests.
- [ ] Run focused test RED against current skin. Implement a plain opaque border using established Stone edge colors with modest inset highlight, retaining border widths, box-sizing, padding and all chart interactions. Do not layer the rejected image under the fallback or remove source files. No new heavy assets.
- [ ] Run GREEN and existing Stone/UI smoke, inspect saved fixture screenshots on pale/dark backgrounds, compare representative canvas/content geometry. Screenshot bounds/provenance under ignored output; no desktop hardware claim.
- [ ] Compare hashes of every raster source/ready/ui file and generated nonchart CSS before/after. Any change is out of scope. Update only manifest original_sha256 entry for stone-asset-skin.css if this established manifest actually tracks it, documenting old/new digest and why. Do not change original hashes for app.py or other independently changed files.
- [ ] Commit scope; independent spec then quality reviews, fix and re-review. No EA/MT5 operations.

## Release

- [ ] Parent full CI, merge expected reviewed head, guarded dashboard release and local/public authenticated browser smoke. Confirm frame URLs absent from actual view requests and production chart/side-volume remain visible; document reduced bytes without claiming all-page budget.
- [ ] AUD03 remains partial: defective frames quarantined, current inventory bound, source repair and complete production-derivative/theme/device review still open. This package does not declare every asset approved.
