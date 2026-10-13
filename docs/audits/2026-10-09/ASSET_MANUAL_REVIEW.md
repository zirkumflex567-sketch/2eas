# Manual Stone asset review, current main 3032426

Reviewed 2026-10-09 during backlog execution. All five existing contact sheets and all eight flagged current PNGs (11/12/13/17/18/19/26/35) were inspected. Browser compositing on both #11151b and #f7f7f7 backgrounds was used to distinguish real alpha from RGB data hidden underneath fully transparent pixels. A raw PNG preview alone is insufficient for that distinction.

## Findings

| ID | Actual PNG dimensions | Result |
|---|---|---|
| 11 | 1086×1448 | Solid portrait panel preserved on both backgrounds. This is the user-supplied replacement, not the old multi-panel artwork in pack_02. No gross matte/checker artifact visible in browser compositing. |
| 12 | 1329×741 | **Not approved as a general transparent frame.** Central opening is transparent, but broad dark material sections in the left/right/top/bottom frame also become holes. The pale background exposes white fragmented sections inside the artwork; dark background masks the problem. Repair the material mask before cross-background approval. |
| 13 | 724×1321 | **Not approved as a general transparent frame.** The central opening works; light-background compositing also exposes erased dark frame material in the sides/corners. Repair the material mask before approval. |
| 17 | 1336×549 | Solid ticket body preserved; outer clearance tight and even. No gross baked checker/background block observed on either background. |
| 18 | 1304×620 | Solid journal plate preserved, including dark internal texture. No gross matte/checker artifact visible. |
| 19 | 1672×941 | User-supplied wide frame replacement; central opening is clear. Orange particles and cyan highlights remain attached to the ornamental edge. Colored RGB outside the shape is hidden by zero alpha in the browser; do not diagnose that hidden RGB as a visible fringe. |
| 26 | 776×813 | Rivet retains its solid face/rim and clears the gray background correctly in browser compositing. Corner RGB remains gray but alpha is zero, not a visible gray square. |
| 35 | 1292×466 | Warning body and orange artwork remain solid. Outer white/checker RGB is transparent in the browser; no baked checker block observed. |

These are visual inspection outcomes, not pixel-perfect color/contrast or every-size production acceptance. Browser review used 1400 px width with previews up to 265 px high; native PNGs were also opened at original resolution. UI derivative WebP/resizing, actual device/DPI and in-context control contrast remain separate gates.

## Stale evidence

`ready/processing-report.json` reports original-source dimensions for all eight entries, which differ from current Ready PNG dimensions. In particular IDs 11 and 19 were explicitly replaced in commit `4876482` while contact sheet pack_02 still depicts their previous artwork. The other current files also have newer cropping. Existing five packs remain historical generation evidence, not current Ready-file approval.

Next asset package must create current hash/dimension-bound evidence and current contact sheets without overwriting the original JPGs or user-supplied PNGs. It must repair or quarantine frame 12/13 mask behavior and validate the actual production derivatives on light/dark backgrounds. Preserve source artwork and the current working dashboard until replacements pass the UI/asset budget checks.

Private working evidence: `output/integration-live/runtime-20261009/current-asset-alpha-review.png`. No asset pixels were changed by this review. AUD-03 is partially completed (inspection), with the above repairs/current-evidence gate still open.

## Production quarantine, 2026-10-13

The two reviewed masks remain unapproved. `static/stone-asset-skin.css` now paints opaque Stone-colored borders for the chart panel and side-volume panel, preserving their existing border widths, padding, responsive rules, chart canvas, and expanded layout. Production CSS no longer references `12_chart_frame_wide.webp` or `13_volume_frame_tall.webp`; both original PNGs, WebP derivatives, and source JPGs remain available for later mask repair. The two omitted WebP files total 2,089,428 bytes on disk; this is a frame-only reduction, not an all-page transfer-budget claim.

The broker-free Chromium fixture exercised the production skin on `#11151b` and `#f7f7f7` surrounds at 1400, 1200, 800, and 360 px, plus 1400/360 px expanded states. Computed image sources were `none`, border colors opaque, chart shadow retained, prior frame geometry matched, content stayed within the viewport, and no requests for either frame appeared. The existing Stone preview smoke also passed after its chart expectation was updated for the fallback. Screenshots and scope verification are under ignored `output/stone-ui-assets/`.

SHA-256 comparison against this checkout's baseline found all 163 tracked raster files (source, Ready, and UI; 106,589,095 bytes) unchanged, along with generated `static/stone-ui-assets.css`. The UI manifest's `original_sha256` changed only for `static/stone-asset-skin.css`, from `0f2dac63782435d916b436f5a0c9874de0fb74b05a1049c11aa59d596d40e7ca` to its actual new digest `9632f4668d47c17eb25989a01ee9df2e41bd095d0a52f3ded57628c6c2ece453`; normalized structural comparison found every other manifest key and value unchanged. The old stored CSS digest was already stale against the aa6bf085 checkout's actual CRLF file (`453b714fd9b3944e374966cc3014ccd84c49889dd10e7cbb2b2624b904ece5b8`). This does not reapprove any other manifest entry.

AUD-03 remains partial. The current aa6bf085 inventory in the separate evidence package binds the reviewed assets to hashes and dimensions; source mask repair, complete production-derivative review, and broader theme/device acceptance remain open.
