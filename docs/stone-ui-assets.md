# Nonchart Stone UI asset budget

Scope: standalone worktree `test/audit-assets`, base `8562771832ff078fce6f67390439c8638e95c787`.
Only new files. No changes to `app.py`, existing `stone*.css`, `ready/`, `source/`, charts, indicators or EAs. Historical `docs/audits/` is read-only and unchanged.

## Integration (parent agent only)

Insert `<link rel="stylesheet" href="static/stone-ui-assets.css">` **after** `stone-asset-skin.css`. The builder does not modify the application or preview. The later accessibility stylesheet is independently owned.

## Measured RED → GREEN

Real pre-generation test `tests/test_stone_ui_assets.py` failed:
`19,665,638 > 3,145,728 bytes`. Initial generated builds also failed at
4,210,932 and 3,343,866 bytes; the budget was not weakened.

Final 29-file UI payload: **3,093,164 bytes / 2.949871 MiB** versus
**19,665,638 bytes / 18.754614 MiB** for the same distinct original sources.
Reduction **84.271225%**, headroom **52,564 bytes**. No file exceeds 260,000 bytes.
This explicit positive allowlist differs from the earlier broad cold estimate near 21 MiB: it excludes visualization cards and volume/plot assets, including #12/#13/#23/#41–44, and includes UI-only copies of shared #11/#14 etc.

Cold Chromium at **390×844 and 768×844, DPR 2** independently downloaded all
29 UI files: baseline **19,665,638** encoded bytes → optimized **3,093,164**;
optimized transfer including local HTTP response overhead **3,101,864** bytes.
The nonchart-only renderer fetched **zero ready originals**; computed URL
layers on elements, `::before` and `::after` also contained no `/ready/`.
See `docs/stone-ui-assets-browser-evidence.json` for the actual resource ledger.

## Quality and chart isolation gates

- All 29 WebP images decoded; proportional full-image LANCZOS resize, no crop or upscaling.
- Every resized reference alpha channel equals decoded alpha byte-for-byte, preserving its silhouette. #11 and #25 use fully lossless encoding. Emblem is **84×84** (42 CSS px at 2×); relief is **224×299** (112 CSS px wide at 2×). Rounding the original emblem ratio to 84px introduces only subpixel aspect rounding, not cropping.
- Composite RGB RMS ≤5.0 per channel over both dark and white mattes against the uncompressed resized reference. Raw uncomposited RMS can be higher in fully transparent colors; therefore it is recorded, not used as a misleading visible-error gate.
- Portrait screenshot comparison for nav, header, diagnostic and matrix: identical dimensions, per-channel RGB RMS ≤6.0; worst measured **5.141768/255**. Generated screenshots are local at `output/stone-ui-assets/`, not committed. Visual inspection found intact panel silhouettes/frames, no obvious missing decorative shapes; small/low-contrast existing text is outside this asset-only scope.
- Browser computes every style property on visualization cards, all descendants and pseudos before/after: **identical**. No chart/volume/Studio selector occurs in new CSS. CSS writes only `background-image`, `border-image-source`, and proportional `border-image-slice`; gradients, positioning, opacity, layouts and content remain owned by original/UI styles.
- Fractional numeric nine-slice values were rounded by Chromium and failed the nav screenshot gate. Percentage slices preserve original per-axis slice ratios and passed without raising tolerance. Header slab keeps its original dimensions for quality, while re-encoding cuts its bytes.
- SHA-256 baseline covers **133 originals** (all ready/source files, old Stone styles, app.py). All unchanged; Git-filtered blob verification against base also passes. Text checkouts have CRLF/LF differences versus raw Git blob bytes, so direct blob SHA comparison is not the correct EOL-aware comparison.
- Second generation produced identical hashes for all **31 generated files** with Pillow 12.1.1 and the same libwebp. Reproducibility across different encoder versions is not claimed.

## Reproduce

```text
C:/Python314/python.exe scripts/build_stone_ui_assets.py
C:/Python314/python.exe tests/test_stone_ui_assets.py
C:/Python314/python.exe tests/test_stone_ui_assets_browser.py
C:/Python314/python.exe tests/test_stone_theme_contract.py
C:/Python314/python.exe tests/test_stone_celebrations_contract.py
```

Dependencies: Pillow (tested 12.1.1), Playwright Python + installed Chromium.
Runs directly through unittest; no root pytest discovery or historical simulation scripts.
**5 new tests + 12 existing Stone contract tests passed.** Browser fixture uses
actual HTML_CONTENT via AST literal extraction and original static CSS/Stone
presentation JS, no app import/MT5. Trading/API/chart scripts are removed and
HTTP mutations are denied. Fixture data is explicitly static, not measured/live
market data. It shows guard/modal/positions/target rows to exercise every UI
asset. Narrow desktop dynamic states and the actual production broker/session
waterfall are not claimed; the parent must run integrated browser verification.

## Shared originals remain legal visualization downloads

The full fixture (visualization cards retained) still downloads **5,692,176** bytes
of unmodified ready originals, plus the UI copies (**8,785,340** encoded bytes
total). The surviving originals are #02/#03/#07/#12/#14/#23/#27/#31/#32/#41,
owned by chart/volume consumers. These are intentionally not optimized or
suppressed. Do not report the total dashboard as ≤3 MiB; the target applies to
pure nonchart UI decoration. Volume-profile panel, side ladder, histogram,
plot, chart controls and Chart Studio are explicitly excluded.

## Inventory and selector mapping

Every row includes source bytes, output bytes/dimensions and exact positive
selector mapping. Repeated consumer uses are counted once for the byte budget.
Properties and all original/output hashes are in `static/stone-assets/ui/manifest.json`.

| Asset | Original bytes | UI bytes | UI dimensions | Nonchart selectors |
|---|---:|---:|---|---|
| `11_master_dashboard_panel.webp` | 2,025,248 | 88,572 | 224×299 | `body.theme-stone .stone-asset-panel--diagnostic::before` |
| `19_entry_matrix_frame.webp` | 1,188,542 | 167,644 | 1024×576 | `body.theme-stone .stone-asset-panel--matrix` |
| `25_rune_crest_emblem.webp` | 1,186,368 | 14,798 | 84×84 | `body.theme-stone header.stone-asset-header .stone-cockpit-crest` |
| `49_modal_warning_frame.webp` | 967,718 | 98,386 | 768×562 | `body.theme-stone #dd-reset-modal .glass-card` |
| `20_guard_warning_plaque.webp` | 903,720 | 149,342 | 1024×446 | `body.theme-stone .stone-asset-panel--guard`<br>`body.theme-stone .stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--4` |
| `18_journal_stone_plate.webp` | 856,928 | 133,960 | 1024×487 | `body.theme-stone .stone-asset-panel--journal` |
| `16_diagnostic_core_panel.webp` | 810,708 | 143,188 | 768×628 | `body.theme-stone .stone-asset-panel--diagnostic` |
| `32_button_active_blue.webp` | 801,222 | 64,696 | 640×276 | `body.theme-stone .stone-asset-panel:where(.stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal) button.bg-blue-600`<br>`body.theme-stone header.stone-asset-header .stone-theme-dock button[aria-pressed="true"]` |
| `37_tab_idle_stone.webp` | 795,148 | 81,012 | 768×321 | `body.theme-stone nav.stone-asset-nav .account-tab` |
| `27_broken_corner_ornament.webp` | 774,930 | 17,968 | 196×200 | `body.theme-stone .glass-card:where(nav.stone-asset-nav, header.stone-asset-header, .stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal, #dd-reset-modal .glass-card)::before` |
| `17_trade_ticket_cartridge.webp` | 773,422 | 127,116 | 1024×421 | `body.theme-stone .stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--2`<br>`body.theme-stone .stone-asset-panel--positions` |
| `31_button_idle_blue.webp` | 702,340 | 48,048 | 640×235 | `body.theme-stone .stone-asset-panel:where(.stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal) button:not([disabled])`<br>`body.theme-stone header.stone-asset-header #dd-reset-button`<br>`body.theme-stone header.stone-asset-header .stone-theme-dock button` |
| `21_cyan_side_circuit.webp` | 687,128 | 188,360 | 264×1026 | `body.theme-stone #stone-rails .left` |
| `38_tab_selected_cyan.webp` | 671,176 | 68,214 | 768×238 | `body.theme-stone nav.stone-asset-nav .account-tab[aria-pressed="true"]` |
| `22_amber_side_circuit.webp` | 656,416 | 185,876 | 316×1023 | `body.theme-stone #stone-rails .right` |
| `48_tooltip_engraved_plate.webp` | 593,010 | 113,652 | 768×432 | `body.theme-stone .stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--1` |
| `15_header_command_slab.webp` | 556,380 | 165,666 | 1369×364 | `body.theme-stone header.stone-asset-header`<br>`body.theme-stone header.stone-asset-header .stone-theme-dock`<br>`body.theme-stone nav.stone-asset-nav` |
| `14_long_volume_plate.webp` | 551,586 | 81,964 | 1024×284 | `body.theme-stone .stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--3` |
| `01_basalt_dark_tile.webp` | 487,938 | 215,770 | 768×768 | `body.theme-stone` |
| `02_slate_fractured_tile.webp` | 430,742 | 189,574 | 768×768 | `body.theme-stone #dd-reset-modal .glass-card`<br>`body.theme-stone .glass-card:where(nav.stone-asset-nav, header.stone-asset-header, .stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal, #dd-reset-modal .glass-card)` |
| `09_bionic_inlay_tile.webp` | 408,720 | 175,614 | 768×768 | `body.theme-stone .stone-asset-panel--diagnostic`<br>`body.theme-stone header.stone-asset-header` |
| `07_brushed_gunmetal_tile.webp` | 400,884 | 157,828 | 768×768 | `body.theme-stone #dd-reset-modal .ticker-bg`<br>`body.theme-stone .stone-asset-panel:where(.stone-asset-panel--diagnostic, .stone-asset-panel--matrix, .stone-asset-panel--guard, .stone-asset-panel--positions, .stone-asset-panel--journal) .ticker-bg`<br>`body.theme-stone header.stone-asset-header .ticker-bg`<br>`body.theme-stone nav.stone-asset-nav` |
| `46_readiness_fill_green.webp` | 388,492 | 33,640 | 640×125 | `body.theme-stone .stone-asset-panel--diagnostic #buy-bar` |
| `10_ancient_circuit_stone_tile.webp` | 385,352 | 163,086 | 768×768 | `body.theme-stone::before` |
| `03_obsidian_smoked_tile.webp` | 375,794 | 110,990 | 640×640 | `body.theme-stone .stone-asset-panel--matrix` |
| `45_risk_fill_red.webp` | 359,188 | 28,712 | 640×121 | `body.theme-stone .stone-asset-panel--diagnostic #sell-bar` |
| `36_input_recessed_field.webp` | 335,364 | 20,638 | 512×128 | `body.theme-stone #dd-reset-modal #dd-reset-input`<br>`body.theme-stone .stone-asset-panel--positions input[type=number]` |
| `47_table_row_metal.webp` | 310,822 | 49,564 | 1024×151 | `body.theme-stone .stone-asset-panel--matrix #matrix-tbody tr.stone-target-row--0` |
| `29_electric_corner_glow.webp` | 280,352 | 9,286 | 216×218 | `body.theme-stone .stone-asset-panel--diagnostic .stone-edge-light` |
