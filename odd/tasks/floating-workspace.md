# Full-screen editor with floating panels and a 3D-only breadboard
Branch: t3/premium-ui-theme-redesign (local only, no push/PR) · Delivery: ask-on-risk · Checks: Vitest, Vite build, Playwright Chromium
Forecast: approximately 1,400 authored lines in two parallel units (breadboard, workspace shell) plus parent integration.

## Specs
S1. "Quiero que elimines por favor todo lo que es el diseño guiado de la protoboard." Remove guided assembly (steps, placement checks, progress, related copy and tests). The assembled reference layouts of the supported examples and the voltage probe stay.
S2. "La protoboard ya no va a estar en 2D, ya solo vamos a utilizar 3D." Remove the 2D board view and the 2D/3D toggle. Without WebGL, show a clear message instead of the board (assumption: no 2D fallback). Assumption: keep keyboard access by moving a socket cursor with the arrow keys in 3D and probing with Enter/Space, announced to screen readers.
S3. "hay diferentes tamaños de Protoboards. También hay que tener ahí como las configuraciones para poder utilizarlas o no." Assumption: breadboard settings let the user choose the board size (Mini 170 tie points: 17 columns, no rails; Half 400: 30 columns with 4 rails; Full 830: 63 columns with 4 rails) and turn optional board features on or off (power rails where the size has them, split rails on Full, socket labels). Settings persist locally. Reference layouts adapt to the chosen size and still match the schematic.
S4. "quiero que el editor sea toda la pantalla. Como que prácticamente está como de fondo." The active editor (schematic or 3D breadboard) fills the viewport behind everything else.
S5. "todo lo demás, sean paneles, sean por ejemplo drawwares o sheets ... pueden ser tanto flotantes como podemos fijarlos para que queden como estaqueados." Library, inspector, results, oscilloscope, settings, and file actions live in drawers/sheets that can float over the editor or be pinned (docked) so the editor makes room for them.
S6. "hay que dejarles algunas como sombritas para saber que están como delante de lo que es todo el fondo y todo el editor." Floating panels have elevation shadows in light and dark themes.
S7. Preserve EN/ES, light/dark themes, keyboard access, solver, editing, JSON/PNG, autosave, and no mobile overflow. Verify with browser captures.

## Tasks
- T1 · S1–S3, S7 · delegated (parallel unit A) · breadboard: remove guided build and 2D view, size presets and settings, adaptive layouts, 3D keyboard cursor · pending
- T2 · S4–S7 · delegated (parallel unit B) · workspace shell: full-screen editor, floating/pinnable drawers and sheets, shadows, responsive behavior · pending
- T3 · S1–S7 · inline · integration, translations, captures, full checks, README · pending

Route evidence: T1 and T2 are independent units with disjoint edit surfaces, each several hundred lines; the user asked to "abrir hasta las sesiones que necesitemos". Parent owns git, `src/locale.ts`, and integration.

## Log
L1. (2026-11-22) User request, verbatim: "Vamos a hacer algunos cambios ahorita más que nada estáticos y eliminando algunas funcionalidades. Quiero que elimines por favor todo lo que es el diseño guiado de la protoboard. La protoboard ya no va a estar en 2D, ya solo vamos a utilizar 3D. Y según tengo entendido, hay diferentes tamaños de Protoboards. También hay que tener ahí como las configuraciones para poder utilizarlas o no. Y en cuestión de diseño, quiero que diseñemos completamente diferente. Todos los paneles que tenemos. Ahorita tenemos diferentes paneles y tenemos como tal el editor que es como lo más importante. Yo quiero que el editor sea toda la pantalla. Como que prácticamente está como de fondo. Y todo lo demás, sean paneles, sean por ejemplo drawwares o sheets, dependiendo qué es lo que necesitemos. Esos drawers, sheets, este o como los utilicemos. pueden ser tanto flotantes como podemos fijarlos para que queden como estaqueados. Igual hay que dejarles algunas como sombritas para saber que están como delante de lo que es todo el fondo y todo el editor. Ahorita por el momento hay que hacer esos cambios, hay que abrir hasta las sesiones que necesitemos y vamos a ir puliendo."
L2. Prep: browser tests for the breadboard moved to `e2e/breadboard.spec.ts` (unit A owns it); the App-level WebGL test was removed (unit A replaces it with board-level tests). Unit B owns `e2e/workbench.spec.ts` and `src/App.test.tsx`.
