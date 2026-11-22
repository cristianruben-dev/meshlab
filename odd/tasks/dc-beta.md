# DC beta and transient simulation
Branch: feat/circuit-workbench · Delivery: ask-on-risk · Checks: npm test, npm run build, npm run test:e2e

## Specs
S1. "límites configurables de corriente y potencia por componente" with diagnostic links to relevant schematic items.
S2. "duplicar componentes, copiar y pegar bloques, y editar el recorrido de un cable sin borrarlo."
S3. "pruebas automáticas de navegador" for drag, wiring and PNG, plus current beta smoke.
S4. "capacitores y simulación transitoria" plus a voltage oscilloscope once transient analysis is available.

## Tasks
- T1 · S1 · inline · 39ba2f1, 0dc9481 · ratings/location checks passed
- T2 · S2 · inline · 0dc9481 · block and route checks passed
- T3 · S3 · delegated · browser-test delivery · 8 Chromium checks passed
- T4 · S4 · delegated engine and inline integration · 39ba2f1, 0dc9481 · RC and scope checks passed

## Log
L1. vamso a ahcer porfavor todo eso que mecionas ayudame a ahcerlo porfvaor dale

L2. T1/T2 RED on missing modules, then GREEN. T4 engine RED against a stub then GREEN; UI RED on missing scope and again on stale measurements after paused reset, then GREEN.
L3. Independent item 5 verification found no product blocker. Independent build, dependency and four domain probes passed. The verifier's resume attempt used an incorrect button label; the parent verified pause, reset and resume in Chromium and retains that regression.
L4. Final: 34 Vitest and 8 Chromium checks passed; production build passed with the Vite large-chunk warning. Native review switch off. The previous uncommitted locale and visual refinements were preserved in the editor commit. Engram mirror pending: project rejected.
