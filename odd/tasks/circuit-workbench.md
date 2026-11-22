# Interactive DC circuit workbench
Branch: feat/circuit-workbench · Delivery: ask-on-risk · Checks: npm test, npm run build
Forecast: ~1,800 authored lines across solver, circuit topology, and workbench.

## Specs
S1. "Análisis Nodal Modificado (MNA)" with pivoted elimination, branch and node data, power balance, and topology diagnostics. Dynamic time stepping and AC are optional.
S2. "Fuente de voltaje DC, fuente de corriente DC" plus resistors, potentiometers, SPST switches, fuses, ground, bulbs, diodes, LEDs, and meters. Symbols support 90° rotations.
S3. "Cables ortogonales a 90°" with explicit T junctions, nonconnecting crossings and rerouting. Grid, pan, zoom, selection, undo/redo, and shortcuts.
S4. "slider + input numérico" with SI units; ground returns, play/pause, speed, current direction, labels and voltage coloring.
S5. Yellow current animation, tooltips, results, and the four requested example circuits.
S6. "Exportar circuito a **JSON** (esquema versionado y limpio)" plus validated import, high-resolution PNG, and local autosave.
S7. Dark responsive engineering UI built with "vite" and shadcn "con base ui"; exact-results solver regressions for the requested benchmarks.

## Tasks
- T1 · S1/S2/S7 · delegated Sol · DC solver and deterministic tests · f302399 · RED 10 failing against stub; GREEN 10 passing
- T2 · S2/S3/S5/S6 · delegated Sol · topology, examples, wire flow and validation · bb0cb91 · 6 passing
- T3 · S2–S7 · inline Sol · Vite/Base UI workbench, editor, and integration · 4 DOM tests and production build passing; browser-only checks pending

## Log
L1. Build the requested real-time, multi-loop DC circuit editor with Vite and current shadcn/Base UI; use Sol in separate sessions and assess whether Luna or Terra is sufficient. See S1–S7 for acceptance scope.

L2. Sol implemented solver and topology in separate sessions. Terra independently built the app and checked all example round trips plus invalid version rejection. The requested Luna 6.1 model was unavailable in this runtime; Terra's evidence covers bounded checks, not the full interaction surface.
L3. Observed a RED editor regression: starting a wire on an existing segment mutated autosave even after Escape. GREEN: defer the draft split and commit it atomically with the finished connection.
L4. Browser rendering, pointer/zoom behavior on a real device, and PNG download are not verified. npm audit --omit=dev returned zero vulnerabilities; the full dependency audit identified moderate findings in the shadcn tooling dependency chain. No native review run: the global switch was off. Engram task mirror pending because the workspace project key was rejected.
