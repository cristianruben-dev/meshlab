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
- T1 · S1, S2, S6 · inline · theme preference module, early theme script, semantic tokens, schematic/scope palettes, theme selector · pending
- T2 · S1, S5, S6 · inline · chrome redesign: topbar, panels, library, inspector, results, scope, notices, empty states, mobile · pending
- T3 · S3, S6 · inline · breadboard 2D refinement for both themes and mobile guided layout · pending
- T4 · S4 · inline · 3D prototype, decision, and optional lazy 3D board view with 2D fallback · pending
- T5 · S5, S7 · inline · final capture matrix, full checks, README update · pending

## Log
L1. (2026-11-22) User request, verbatim: "Necesito que abras otra sesión, pero con Cloud Opus 5.5 in height para que cheque absolutamente toda la parte del diseño, que sea un diseño mucho más premium y que demos una vuelta de tuerca para que toda esta interfaz de usuario se sienta de verdad muy bonita con tema claro, tema oscuro, y mejorar absolutamente todo. Por ejemplo, también este el tema de la Proto Worlds, que también se pueda ver muchísimo mejor. E inclusive lo mejor es por qué no hasta en 3D. Necesito por favor que cheques todo eso y que no te detengas hasta que todo quede perfecto. Hay que ir tomando capturas del navegador para checar que toda la interfaz vaya en un camino correcto."
L2. Orchestrator brief: implement in this isolated worktree; keep Vite/React/shadcn Base UI/EN-ES/accessibility/solver/editing/JSON; verify every cosmetic change visually; 3D only as optional view with 2D fallback.
L3. Baseline: the app is dark-only (`<html class="dark">`, hard-coded hex colors in CSS and SVG). Light scheme renders identically. Mobile guided callout is clipped on the right; board stage scrolls horizontally inside its panel. T3 preview panel snapshot timed out twice, so captures use Playwright Chromium (`artifacts/capture.mjs`, output `artifacts/ui-redesign/`).
L4. Design decision: HTML chrome uses CSS custom properties; SVG schematic/scope/board colors come from a TypeScript palette keyed by resolved theme so PNG export (serialized SVG) keeps literal colors.
