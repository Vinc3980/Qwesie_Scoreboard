# Hard-coded Colors Audit (Console UI)

**Updated:** 2026-11-20  
**Scope:** `client/src` console UI theming.  
**Excluded from console theme changes (intentionally unchanged):** broadcast/output/dev routes and visuals — `/out/*`, `/broadcast/*`, `/overlay/*`, `client/src/components/broadcast/**`, `client/src/features/broadcast/templates.tsx`, `client/src/pages/ScorebugPage.tsx`, `client/src/pages/BroadcastGraphicsPage.tsx`, `client/src/pages/CourtOutputPage.tsx`, `client/src/pages/OverlayPreviewPage.tsx`, `client/src/pages/dev/**`, `client/src/utils/broadcastTheme.ts`, and broadcast-specific CSS vars/classes in `client/src/styles/index.css`.

## Current status

- **Console semantic theming:** implemented via CSS variables in `client/src/styles/index.css` (`:root` / `.dark`) and Tailwind mappings in `client/tailwind.config.js` (`darkMode: 'class'`) for semantic tokens including surfaces (`surface/raised/sunken/alt`), foreground (`fg/muted/subtle`), borders (`border/strong`), and status/accent tokens (`accent/success/warning/danger/info/focus`, plus chart/team helpers).
- **Console migration:** shared UI, layout/infra, and console pages migrated to semantic tokens (including `LiveControlPage`, `OutputsPanel`, `RootLayout`, shared components under `client/src/components/ui/*`, notification/route boundary, auth pages, and console pages such as Overview/Matches/Teams/Players/Competitions/Settings/Statistics/Reports/Archive/Users/LiveControlClassic/Match Setup, etc.).
- **Static audit result (2026-11-20):** no remaining `bg-slate-8/9*`, `text-slate-4/5/6*`, or hex color literals found in console source files when excluding the broadcast/output/dev/overlay files and token-definition/style-utility files listed above (and excluding `*.test.*`). Broadcast/output/template/dev files still contain their own colors by design.
- **Contrast verification:** `client/tests/console-contrast.spec.ts` (Playwright + `@axe-core/playwright`) run on `chromium-1920x1080` **and** `chromium-1280x720` for `/overview`, `/matches`, `/teams`, `/players`, `/competitions`, `/live`, `/statistics`, `/archive`, `/reports`, `/settings`, `/users` in light and dark — **22/22 passed on each project with no serious/critical `color-contrast` violations**. The spec now waits for real console content (and supplies a full live-match fixture) rather than auditing loading skeletons. Screenshots saved to `docs/ui-audit/<route>-<theme>.png`.
- **Populated light-theme fixes (2026-11-20):** auditing real content exposed two tinted-status failures, fixed centrally in the light palette rather than per page: `--app-warning` darkened to `#92400e` (Next/status chips on `warning-subtle`), and `--app-success` darkened to `#065f46` (KILL/ACE/BLOCK action buttons on `bg-success/15`). Remaining console status/team palette classes replaced with `success`/`warning`/`info`/`danger`/`teamA`/`teamB`; `bg-slate-700` list badges moved to `bg-surface-sunken`. Dark theme tokens are unchanged.
- **Opacity-capable tokens (2026-11-20):** semantic Tailwind colours are now defined from RGB channel variables (`--app-*-rgb`) with `<alpha-value>`, so every `bg-*/NN`, `border-*/NN`, `text-*/NN`, `ring-*/NN` utility actually generates. Previously these were plain `var(--app-*)` strings and the opacity variants were missing from the built CSS.
- **Theme hardening (2026-11-20):** `html` now carries the themed background/foreground (not just `body`), native `input/select/textarea/option` and placeholders follow the tokens, the inline boot script sets first-paint canvas/`color-scheme`, and `theme.ts` broadcasts a `qwesie-theme-change` event so the header toggle and Settings select cannot drift out of sync. Redundant/conflicting `dark:*` token pairs, dark-only accent text, and `bg-surface-sunken0/10` typos were removed. Remaining `text-white` uses are intentional (text on coloured/team fills and print output).

## Theme architecture

- **Tailwind:** `client/tailwind.config.js` — `darkMode: 'class'`; every semantic console colour maps to an RGB channel variable with `<alpha-value>`, so opacity utilities work.
- **Global styles:** `client/src/styles/index.css` — light/dark canonical `--app-*` tokens (background, foreground, surface/surface-raised/surface-sunken/surface-alt, muted, subtle, border, accent, accent-hover, accent-foreground, danger, danger-subtle, focus, plus status/team/chart tokens and their `-rgb` mirrors), root/native-element theming, and separate `--broadcast-*` / `--team-*` / `.broadcast-*` definitions preserved for output/broadcast surfaces. See `docs/ui-audit/theme-tokens.md`.
- **Theme state:** `client/src/utils/theme.ts` (`qwesie-theme`, toggles `html.dark` + `data-theme`, emits `qwesie-theme-change`), initialized in `client/src/main.tsx` and pre-render boot script in `client/index.html`; subscribed to by both `RootLayout` and `SettingsPage`.
- **Single source of truth:** no duplicate theme definitions. `client/src/utils/themeTokens.test.ts` fails if any required token/`-rgb` mirror is missing from `:root` or `.dark`, or if Tailwind stops referencing the canonical variables.
- **Shared components:** `client/src/components/ui/*` consume semantic utilities only (status → `success`/`warning`/`danger`/`info`; team identity → `teamA`/`teamB`); no raw palette classes such as `bg-slate-800` or `text-emerald-200`.
- **Console shell:** `client/src/layouts/RootLayout.tsx` bypasses console layout for `/overlay`, `/broadcast/`, `/out/`.

## Areas intentionally not converted (broadcast/output/dev)

These retain their own palettes/visual behavior and must not be regressed by console theming changes:

- `client/src/components/broadcast/**`
- `client/src/features/broadcast/templates.tsx`
- `client/src/pages/ScorebugPage.tsx`, `client/src/pages/BroadcastGraphicsPage.tsx`, `client/src/pages/CourtOutputPage.tsx`, `client/src/pages/OverlayPreviewPage.tsx`
- `client/src/pages/dev/**`
- `client/src/utils/broadcastTheme.ts`, `client/src/utils/overlay.ts` (overlay preview/background helpers for output routes)
- Broadcast-related CSS vars/classes in `client/src/styles/index.css` (`--broadcast-*`, `--team-*`, `.broadcast-*`)

## Remaining gaps / manual checks

- **1280x720 viewport:** contrast spec now passes on the `chromium-1280x720` Playwright project (22/22) as well as 1920×1080.
- **States not covered by mocks:** interactive/focused/hover/disabled combinations, populated charts/tooltips, toasts/modals/drawers in all runtime states, and data-heavy tables may require manual visual review despite axe pass.
- **Runtime/manual acceptance:** full dev/production match-day walkthrough, OBS/program output behavior, and recovery scenarios remain pending (see `docs/FINAL_REGRESSION.md`).

## Tooling

- Playwright config: `client/playwright.config.ts` (projects include `chromium-1920x1080`, `chromium-1280x720`).
- Axe contrast spec: `client/tests/console-contrast.spec.ts` (saves screenshots to `docs/ui-audit/<route>-<theme>.png`).
- Wizard prefill spec: `client/tests/wizard-prefill.spec.ts`.
- Client unit tests (Vitest): `client/vitest.config.ts`, `client/src/utils/matchSetupRoster.test.ts`, `client/src/utils/apiErrors.test.ts`.
