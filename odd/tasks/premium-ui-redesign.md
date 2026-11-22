# Premium UI redesign with light/dark themes
Branch: t3/premium-ui-theme-redesign (local only, no push/PR) · Delivery: ask-on-risk · Checks: Vitest, Vite build, Playwright Chromium
Forecast: approximately 1,200 authored lines across theme system, chrome redesign, breadboard refinement, and an optional 3D board view.

## Specs
S1. "que sea un diseño mucho más premium y que demos una vuelta de tuerca para que toda esta interfaz de usuario se sienta de verdad muy bonita con tema claro, tema oscuro, y mejorar absolutamente todo." Coherent color/typography/spacing system and interaction states across bar/navigation, schematic, library, inspector, results, oscilloscope, empty states/alerts, and breadboard.
S2. Light/dark selector that persists; system preference is the default when no choice is saved.
S3. "también este el tema de la Proto Worlds, que también se pueda ver muchísimo mejor." Refined 2D breadboard in both themes; probe, selection, and guided assembly keep working.
S4. "E inclusive lo mejor es por qué no hasta en 3D." Evaluate 3D as an optional view in addition to 2D (not a replacement) with a visual prototype; implement with 2D fallback only if it adds clarity without losing accessibility, precision, or reasonable performance; otherwise explain why to defer.
S5. "Hay que ir tomando capturas del navegador para checar que toda la interfaz vaya en un camino correcto." Baseline, intermediate, and final captures in light/dark and desktop/mobile; evidence files kept with clear names.
S6. Preserve Vite, React, shadcn with Base UI, EN/ES, accessibility, keyboard use, contrast, information density, solver, editing, and JSON persistence; no mobile layout overflow.
S7. Close with observable criteria, captures, results of npm test / npm run build / npm run test:e2e, and pending limits. Local only: no push, PR, or publishing.

## Tasks
- T1 · S1, S2, S6 · inline · theme preference module, early theme script, semantic tokens, schematic/scope palettes, theme selector · done · 9eda7cc · RED App theme test failed (no "Theme" group); GREEN 43/43
- T2 · S1, S5, S6 · inline · chrome redesign: topbar, panels, library, inspector, results, scope, notices, empty states, mobile · done · 9eda7cc
- T3 · S3, S6 · inline · breadboard 2D refinement for both themes and mobile guided layout · done · 07ba86a (geometry tests written alongside, not RED-first)
- T4 · S4 · inline · 3D prototype, decision, and optional lazy 3D board view with 2D fallback · done · ac5f576 · decision: implement (L6)
- T5 · S5, S7 · inline · final capture matrix, full checks, README update · done · see L7

## Log
L1. (2026-11-22) User request, verbatim: "Necesito que abras otra sesión, pero con Cloud Opus 5.5 in height para que cheque absolutamente toda la parte del diseño, que sea un diseño mucho más premium y que demos una vuelta de tuerca para que toda esta interfaz de usuario se sienta de verdad muy bonita con tema claro, tema oscuro, y mejorar absolutamente todo. Por ejemplo, también este el tema de la Proto Worlds, que también se pueda ver muchísimo mejor. E inclusive lo mejor es por qué no hasta en 3D. Necesito por favor que cheques todo eso y que no te detengas hasta que todo quede perfecto. Hay que ir tomando capturas del navegador para checar que toda la interfaz vaya en un camino correcto."
L2. Orchestrator brief: implement in this isolated worktree; keep Vite/React/shadcn Base UI/EN-ES/accessibility/solver/editing/JSON; verify every cosmetic change visually; 3D only as optional view with 2D fallback.
L3. Baseline: the app is dark-only (`<html class="dark">`, hard-coded hex colors in CSS and SVG). Light scheme renders identically. Mobile guided callout is clipped on the right; board stage scrolls horizontally inside its panel. T3 preview panel snapshot timed out twice, so captures use Playwright Chromium (`artifacts/capture.mjs`, output `artifacts/ui-redesign/`).
L4. Design decision: HTML chrome uses CSS custom properties; SVG schematic/scope/board colors come from a TypeScript palette keyed by resolved theme so PNG export (serialized SVG) keeps literal colors.
L5. Captures: 00-baseline, 01-chrome, 02-board/02-detail, 03-3d-proto, 04-final (light/dark × desktop 1440 / mobile 390; schematic, board, board3d, guided, scope, alert, empty) and 04-final-es. Document overflow 0 px and no page errors in every run. WCAG contrast of key text pairs 4.60–12.62 (lowest: brand text on brand-soft in light).
L6. 3D decision: implemented as optional view. Evidence: same socket geometry as 2D (shared `geometry.ts`, `nearestSocket` pick within 1 mm), click-to-probe ("A11 · Not connected") and click-to-select (R1) work, orbit median 16.7 ms/frame in Chromium, lazy chunk 613 kB (154 kB gzip) loaded only on demand, no WebGL → notice and 2D. Limits: 3D is pointer-first (keyboard has orbit/reset buttons only; socket navigation stays in 2D), touch drag on the 3D canvas orbits instead of scrolling the page, labels on phones are small.
L7. Final checks: npm test 47/47, npm run build OK (Vite large-chunk warning now also covers the lazy Board3D chunk), npm run test:e2e 13/13. Local only; no push or PR.

