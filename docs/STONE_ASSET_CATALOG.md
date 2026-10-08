# 2EAs — Stein-Assets: visueller Katalog / Zuordnungsprüfung

**Quelle:** `main/Okt 08 - 23_25/`. **Geprüft:** 51 JPGs, davon 50 Assets + 1 Dashboard-Referenz; 50/50 eindeutig den vorher geplanten Motiven zugeordnet. **Alle Originale bleiben erhalten.** Alle Assetdateien tragen denselben Export-Zeitstempel `20261008233527`; daraus folgt keine sinnvolle chronologische Reihenfolge.

**Dateibenennung:** Die JPGs unter `static/stone-assets/source/` sind mit den 50 kanonischen Basenamen umbenannt. Unter `ready/` werden bei ausgeführter Bildaufbereitung geeignete PNGs/WebPs mit Alphakanal generiert. JPGs haben niemals echte Transparenz — helles Schachbrett in JPGs ist in Pixel eingebrannt.

**Auffälligkeiten der Sichtprüfung:**
- `11_master_dashboard_panel` ist eine fertig eingeteilte Mehrfachkarte; nicht als universelle skalierbare Einzelkarte verwenden.
- `12_chart_frame_wide` und `13_volume_frame_tall` besitzen dunkle Mittelflächen, die für echte Chart-/HTML-Inhalte ggf. als transparente Aussparung verarbeitet werden müssen.
- `26_metal_rivet` hat einen grauen Hintergrund, obwohl der ursprüngliche Prompt transparent verlangte.
- `35_button_warning_amber` zeigt Schachbrettmuster **als Bildinhalt**; Transparenz nur durch Nachbearbeitung möglich.
- Leiterbahnen/Glühfragmente (`21`–`24`) haben fast schwarzen Hintergrund; Alphafreistellung für CSS-Overlays erforderlich.
- `41_chart_recessed_surface` ist als opake Chartfläche vorgesehen und muss **nicht** freigestellt werden.

## Galerie (Originalbilder)

### 01–10 · Stein- und Metallmaterialien

| 01: `01_basalt_dark_tile` | 02: `02_slate_fractured_tile` |
|:--|:--|
| <img src="../static/stone-assets/source/01_basalt_dark_tile.jpg" alt="01_basalt_dark_tile" width="300"> | <img src="../static/stone-assets/source/02_slate_fractured_tile.jpg" alt="02_slate_fractured_tile" width="300"> |
| **Opak belassen** | **Opak belassen** |

| 03: `03_obsidian_smoked_tile` | 04: `04_granite_worn_tile` |
|:--|:--|
| <img src="../static/stone-assets/source/03_obsidian_smoked_tile.jpg" alt="03_obsidian_smoked_tile" width="300"> | <img src="../static/stone-assets/source/04_granite_worn_tile.jpg" alt="04_granite_worn_tile" width="300"> |
| **Opak belassen** | **Opak belassen** |

| 05: `05_chiseled_stone_tile` | 06: `06_antique_bronze_tile` |
|:--|:--|
| <img src="../static/stone-assets/source/05_chiseled_stone_tile.jpg" alt="05_chiseled_stone_tile" width="300"> | <img src="../static/stone-assets/source/06_antique_bronze_tile.jpg" alt="06_antique_bronze_tile" width="300"> |
| **Opak belassen** | **Opak belassen** |

| 07: `07_brushed_gunmetal_tile` | 08: `08_charred_iron_tile` |
|:--|:--|
| <img src="../static/stone-assets/source/07_brushed_gunmetal_tile.jpg" alt="07_brushed_gunmetal_tile" width="300"> | <img src="../static/stone-assets/source/08_charred_iron_tile.jpg" alt="08_charred_iron_tile" width="300"> |
| **Opak belassen** | **Opak belassen** |

| 09: `09_bionic_inlay_tile` | 10: `10_ancient_circuit_stone_tile` |
|:--|:--|
| <img src="../static/stone-assets/source/09_bionic_inlay_tile.jpg" alt="09_bionic_inlay_tile" width="300"> | <img src="../static/stone-assets/source/10_ancient_circuit_stone_tile.jpg" alt="10_ancient_circuit_stone_tile" width="300"> |
| **Opak belassen** | **Opak belassen** |

### 11–20 · Große Panels und Steinrahmen

| 11: `11_master_dashboard_panel` | 12: `12_chart_frame_wide` |
|:--|:--|
| <img src="../static/stone-assets/source/11_master_dashboard_panel.jpg" alt="11_master_dashboard_panel" width="300"> | <img src="../static/stone-assets/source/12_chart_frame_wide.jpg" alt="12_chart_frame_wide" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 13: `13_volume_frame_tall` | 14: `14_long_volume_plate` |
|:--|:--|
| <img src="../static/stone-assets/source/13_volume_frame_tall.jpg" alt="13_volume_frame_tall" width="300"> | <img src="../static/stone-assets/source/14_long_volume_plate.jpg" alt="14_long_volume_plate" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 15: `15_header_command_slab` | 16: `16_diagnostic_core_panel` |
|:--|:--|
| <img src="../static/stone-assets/source/15_header_command_slab.jpg" alt="15_header_command_slab" width="300"> | <img src="../static/stone-assets/source/16_diagnostic_core_panel.jpg" alt="16_diagnostic_core_panel" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 17: `17_trade_ticket_cartridge` | 18: `18_journal_stone_plate` |
|:--|:--|
| <img src="../static/stone-assets/source/17_trade_ticket_cartridge.jpg" alt="17_trade_ticket_cartridge" width="300"> | <img src="../static/stone-assets/source/18_journal_stone_plate.jpg" alt="18_journal_stone_plate" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 19: `19_entry_matrix_frame` | 20: `20_guard_warning_plaque` |
|:--|:--|
| <img src="../static/stone-assets/source/19_entry_matrix_frame.jpg" alt="19_entry_matrix_frame" width="300"> | <img src="../static/stone-assets/source/20_guard_warning_plaque.jpg" alt="20_guard_warning_plaque" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

### 21–30 · Runen und Energieleiter

| 21: `21_cyan_side_circuit` | 22: `22_amber_side_circuit` |
|:--|:--|
| <img src="../static/stone-assets/source/21_cyan_side_circuit.jpg" alt="21_cyan_side_circuit" width="300"> | <img src="../static/stone-assets/source/22_amber_side_circuit.jpg" alt="22_amber_side_circuit" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 23: `23_blue_crack_emissive` | 24: `24_amber_crack_emissive` |
|:--|:--|
| <img src="../static/stone-assets/source/23_blue_crack_emissive.jpg" alt="23_blue_crack_emissive" width="300"> | <img src="../static/stone-assets/source/24_amber_crack_emissive.jpg" alt="24_amber_crack_emissive" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 25: `25_rune_crest_emblem` | 26: `26_metal_rivet` |
|:--|:--|
| <img src="../static/stone-assets/source/25_rune_crest_emblem.jpg" alt="25_rune_crest_emblem" width="300"> | <img src="../static/stone-assets/source/26_metal_rivet.jpg" alt="26_metal_rivet" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 27: `27_broken_corner_ornament` | 28: `28_bionic_joint_connector` |
|:--|:--|
| <img src="../static/stone-assets/source/27_broken_corner_ornament.jpg" alt="27_broken_corner_ornament" width="300"> | <img src="../static/stone-assets/source/28_bionic_joint_connector.jpg" alt="28_bionic_joint_connector" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 29: `29_electric_corner_glow` | 30: `30_ancient_power_core` |
|:--|:--|
| <img src="../static/stone-assets/source/29_electric_corner_glow.jpg" alt="29_electric_corner_glow" width="300"> | <img src="../static/stone-assets/source/30_ancient_power_core.jpg" alt="30_ancient_power_core" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

### 31–40 · Buttons, Felder und Regler

| 31: `31_button_idle_blue` | 32: `32_button_active_blue` |
|:--|:--|
| <img src="../static/stone-assets/source/31_button_idle_blue.jpg" alt="31_button_idle_blue" width="300"> | <img src="../static/stone-assets/source/32_button_active_blue.jpg" alt="32_button_active_blue" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 33: `33_button_confirm_green` | 34: `34_button_danger_red` |
|:--|:--|
| <img src="../static/stone-assets/source/33_button_confirm_green.jpg" alt="33_button_confirm_green" width="300"> | <img src="../static/stone-assets/source/34_button_danger_red.jpg" alt="34_button_danger_red" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 35: `35_button_warning_amber` | 36: `36_input_recessed_field` |
|:--|:--|
| <img src="../static/stone-assets/source/35_button_warning_amber.jpg" alt="35_button_warning_amber" width="300"> | <img src="../static/stone-assets/source/36_input_recessed_field.jpg" alt="36_input_recessed_field" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 37: `37_tab_idle_stone` | 38: `38_tab_selected_cyan` |
|:--|:--|
| <img src="../static/stone-assets/source/37_tab_idle_stone.jpg" alt="37_tab_idle_stone" width="300"> | <img src="../static/stone-assets/source/38_tab_selected_cyan.jpg" alt="38_tab_selected_cyan" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 39: `39_slider_metal_track` | 40: `40_slider_power_knob` |
|:--|:--|
| <img src="../static/stone-assets/source/39_slider_metal_track.jpg" alt="39_slider_metal_track" width="300"> | <img src="../static/stone-assets/source/40_slider_power_knob.jpg" alt="40_slider_power_knob" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

### 41–50 · Datenvisualisierung

| 41: `41_chart_recessed_surface` | 42: `42_volume_bar_cyan` |
|:--|:--|
| <img src="../static/stone-assets/source/41_chart_recessed_surface.jpg" alt="41_chart_recessed_surface" width="300"> | <img src="../static/stone-assets/source/42_volume_bar_cyan.jpg" alt="42_volume_bar_cyan" width="300"> |
| **Opak belassen** | **Freistellen prüfen** |

| 43: `43_volume_bar_gold` | 44: `44_volume_bar_inactive` |
|:--|:--|
| <img src="../static/stone-assets/source/43_volume_bar_gold.jpg" alt="43_volume_bar_gold" width="300"> | <img src="../static/stone-assets/source/44_volume_bar_inactive.jpg" alt="44_volume_bar_inactive" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 45: `45_risk_fill_red` | 46: `46_readiness_fill_green` |
|:--|:--|
| <img src="../static/stone-assets/source/45_risk_fill_red.jpg" alt="45_risk_fill_red" width="300"> | <img src="../static/stone-assets/source/46_readiness_fill_green.jpg" alt="46_readiness_fill_green" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 47: `47_table_row_metal` | 48: `48_tooltip_engraved_plate` |
|:--|:--|
| <img src="../static/stone-assets/source/47_table_row_metal.jpg" alt="47_table_row_metal" width="300"> | <img src="../static/stone-assets/source/48_tooltip_engraved_plate.jpg" alt="48_tooltip_engraved_plate" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

| 49: `49_modal_warning_frame` | 50: `50_scroll_track_etched` |
|:--|:--|
| <img src="../static/stone-assets/source/49_modal_warning_frame.jpg" alt="49_modal_warning_frame" width="300"> | <img src="../static/stone-assets/source/50_scroll_track_etched.jpg" alt="50_scroll_track_etched" width="300"> |
| **Freistellen prüfen** | **Freistellen prüfen** |

## Technische Einordnung

- **11 opake Assets** (10 Texturen + #41 Chartoberfläche) bleiben geschlossen.
- **39 Freistell-Kandidaten**: Panels, Elemente, Buttons, Leuchteffekte und Balken, die im Web auf variablen Hintergründen liegen können. Hintergrund muss bei Bedarf erst aus JPG entfernt und separat als PNG/WebP mit Alpha gespeichert werden.
- Freistellung ist nicht identisch mit einem JPG→PNG-Dateiformatwechsel. Ein PNG ohne echte Alpha-Maske zeigt den alten Hintergrund weiterhin.
- Nach jedem automatischen Freistellen Sichtprüfung im Checkerboard-Viewer, besonders bei dunklem Stein und Metall, da dunkle Kanten zu leicht mit verschwinden.

**Nicht Teil der 50 Assets:** `Stone_dashboard_with_glowing_runes_2K_20261008221355.jpg_20261008233527.jpg` ist nur das originalgetreue Designreferenzbild.
