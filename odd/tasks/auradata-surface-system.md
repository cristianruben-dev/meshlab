# AuraData surface system (drawers, shadows, concentric corners)

Objective: rebuild Meshlab's surfaces (radii, elevation, borders, backgrounds) on AuraData tokens so every drawer, bar, card and dialog reads clearly in light and dark, with concentric corners. Branch: `poc/auradata-design` (PoC, uncommitted). Delivery: single PoC branch, user decides on publish. Test runner: `npm test` (vitest) + `npx tsc --noEmit`; visual check via Playwright screenshots at 2x.

## Specs

- S1 Drawers and other shadowed surfaces must look right: «checa como que los drawers y esas cosas que tienen sombras y todo por que creo que no se ven del todo bien». Every surface (panels, docked cards, top bar, tabs, toolbar, launcher, status bar, menus, dialogs, hub cards) separates clearly from the background in light and dark.
- S2 Concentric corners: «checa las esquinas concéntricas». An element whose corner sits inside a rounded container at inset `p` uses radius `R_outer - p` (rounded to the scale).
- S3 Overall quality: «checa todo porfavor y que se vea mucho mejor, si necesitas hay que darle un rediseño completo». A full redesign of the surface layer is authorized; electrical/domain colors stay (see L1 context of the PoC).
- S5 Full review of «margenes, paddings, esquinas concéntricas, necesito que revises todoooo»: every padding, gap and margin sits on the AuraData 4 px scale (an even padding plus a 1 px border counts as on-grid); every corner within a rounded container's corner zone is concentric.
- S4 (assumption) Values come from `@auradata/tokens` (radius sm 6 / md 8 / lg 14 / card 16; elevation shadows), not new hardcoded colors.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1 S2 S4 | inline | done | `--surface-ring` + AuraData elevation (`--aura-shadow-card/raised/overlay/control`) replace old navy shadows; radius scale chip 6 / control 8 / bar 12 / surface 16 on :root |
| T2 | S1 S2 | inline | done | Top bar 48 px with 8 px inset (controls 8 in bar 16); tab strip 36 px, 28 px tabs, 4 px inset (8 in 12); toolbar/launcher buttons 8 in 12; floating panels use the elevated surface; light schematic canvas #f5f5f5 |
| T3 | S1 S2 S3 | inline | done | projects.css: 12 radii → scale; cards/menus/dialogs ring instead of border; dialog footer 8 px inset; wizard art 8 in 16; project row thumb 8 in 16; filter ribbon 6 px around 8 |
| T4 | S1 S2 | inline | done | resistor-tool.css, board.css, settings-panel.css radii → scale; segmented 2 px around 6; 3D controls/tray 6 px around 8 |
| T5 | S1-S3 | inline | done | 2x crops + 7-screen before/after tour light/dark; tsc clean; 126/126 unit tests; e2e not run |
| T6 | S1 S2 S5 | inline | done | DOM geometry auditor (Playwright, 22 screens desktop + phone): concentric corners incl. clipping ancestors, spacing on the 4 px grid; odd spacing 53 → 0, real corner breaks 10 → 0 (3 remaining hits are vertical separators) |

Route rationale: one coherent design change; parallel writers would risk inconsistent visual judgment, so the parent works inline.

## Log

- L1 (2026-11-24, user, verbatim): "nomas cehca como que lso drawers y esas cosas que tienen sombras y todo por que creo que no se ven del todobien, cehca las esquinas concentrucas checa todo porfvaor y que se va mucho mejor, si necesoitas hay que darle un redisenio completo porfvaor"
- L2 Audit (2x crops): light panels are white on a #fafafa canvas (almost no contrast, edge relies on faint old navy shadow); dark panels lose their shadow entirely; top bar 16px radius with controls 10px at 10px inset (should be 6); shadows `--shadow-float/bar/dock/pop/panel` are still the old theme values; projects.css uses 12 different radii.
- L3 Decision: panel header keeps 16 px left padding (icon aligned with the body column) and 10 px right (actions hug the corner, radius 6 = 16 - 10). Alignment beat strict concentricity for the left icon, which sits 10 px from the top but 16 px from the side.
- L4 Verification: tsc clean, 126/126 unit tests, 2x visual audit of top bar, tabs, drawers, results sheet, dialog, hub ribbon and templates in light and dark. e2e not run (hub heading assertions are stale on main: "My Projects" vs "Projects"). Next: user review; electrical colors (wires/nodes teal) remain an open choice.
- L5 (2026-11-24, user, verbatim): "okey margenes, paddigs, esquinas concecntricas, necesito que revises todoooo"
- L6 T6: built an in-page auditor (scratch, outside the repo). Fixed: hub filter ribbon (pill, fixed 23 px for wrap), template strip 8 px around 8 px cards, save indicator 28 px / radius 8 in the tab strip, pill counts nested (equal insets), card overlay pills 5 px (+1 border) so radius 10 nests in 16, wizard steps 4 px around the number, phone "back to editor" count; odd values (1, 3, 5, 7, 9, 11, 13 px) normalized across projects.css, resistor-tool.css, board.css, workbench.css. tsc clean, 126/126 unit tests.
