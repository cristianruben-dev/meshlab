# Interactive 2D breadboard
Branch: feat/circuit-workbench · Delivery: ask-on-risk · Checks: Vitest, Vite build, Chromium
Forecast: approximately 550 authored lines split across physical connectivity and workbench integration.

## Specs
S1. "la protoboard 2d" with correctly separated terminal strips and power rails.
S2. The approved proposal: "dos montajes guiados: el divisor y el LED con interruptor"; check physical connectivity and detect common placement mistakes.
S3. "una ui muy linda" with synchronized selection and a virtual voltage probe driven by the live schematic solution.
S4. Preserve Spanish and English, existing JSON and schematic editing. No automatic placement for arbitrary circuits or 3D.

## Tasks
- T1 · S1–S2 · inline · physical connectivity and presets · c497751 · RED missing model; GREEN 4 passing
- T2 · S2–S4 · inline · board, assembly, highlighting and probes · UI delivery · 3 new Chromium checks passing

## Log
L1. dale porfvaor implementalo asi con la protoboard 2d empeiza a hacerlo con una ui muy linda prfvaor

L2. Physically distinct strips and rails are modeled as socket groups; jumpers join those groups before closure is compared to the schematic terminal equivalence relation. Layouts are selected by recognized net topology, not by component coordinates or values.
L3. Chromium verified the 8 V divider output, live change to 6 V, same-strip warning, complete guided assembly, cross-view selection and progress, and the Spanish LED switch on a narrow viewport. Manual Chromium screenshots reviewed. Full checks: 38 Vitest, 11 Chromium, production build passed with pre-existing large-chunk warning.
L4. Unchanged schematic JSON/PNG formats; placement is session-local. Engram mirror rejected the project key.
