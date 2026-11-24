# Final Regression Record

Record of match-day regression verification for the current implementation state.

**Date:** 2026-11-20 (updated)  
**Workspace:** `F:\qwesie_tv_scoreboard` (Windows, non-git workspace)  
**Scope:** console light/dark theming token migration and theme-implementation fixes (opacity-capable semantic tokens, root/native theming, cross-surface theme sync), Match Setup wizard roster prefill/validation/error handling, contrast/wizard automated checks, plus previously delivered hygiene/backups/security/resilience/auth/console/preview-program work (code-level unless noted).

## Executed checks (this environment)

| Check | Command / method | Result | Notes |
|---|---|---|---|
| Root build | `npm run build` | **PASS** | Shared/server/client built successfully. Vite chunk-size warnings only (no type/build errors). |
| Typecheck | `npm run typecheck` | **PASS** | Shared, server, and client `tsc --noEmit` all passed. |
| Client unit tests | `npx vitest run` (in `client`) | **PASS** | 3 files, **38 tests passed** (`src/utils/matchSetupRoster.test.ts`, `src/utils/apiErrors.test.ts`, `src/utils/themeTokens.test.ts`). `themeTokens.test.ts` enforces required semantic tokens + RGB mirrors in both themes and canonical Tailwind mappings. |
| Server tests | `npx vitest run --root server` | **PASS** | 10 files, **71 passed, 7 skipped**. Integration suite `tests/integration.stageG.test.ts` skipped (7). |
| Wizard prefill Playwright spec | `npx playwright test tests/wizard-prefill.spec.ts --project=chromium-1920x1080 --reporter=list` (in `client`) | **PASS** | 3/3 tests passed: prefills 12 players with accurate toast count when all jerseys present; shows missing-jersey warning, highlights rows, blocks save with specific row message (no `jerseyNumber: 0` sent), and auto-numbers missing jerseys; shows "This team has no players yet" warning with Add players link and no false success toast. |
| Console contrast Playwright+axe spec | `npx playwright test tests/console-contrast.spec.ts --project=chromium-1920x1080 --reporter=list` (in `client`) | **PASS** | 22/22 tests passed (11 routes × light/dark). **No serious/critical `color-contrast` violations** detected by axe-core on: `/overview`, `/matches`, `/teams`, `/players`, `/competitions`, `/live`, `/statistics`, `/archive`, `/reports`, `/settings`, `/users`. The spec now audits populated console content (full live-match fixture for `/live`) instead of loading skeletons. Screenshots saved to `docs/ui-audit/<route>-<theme>.png` (22 files). |
| Console contrast Playwright+axe spec (responsive) | `npx playwright test tests/console-contrast.spec.ts --project=chromium-1280x720 --reporter=list` (in `client`) | **PASS** | 22/22 tests passed (11 routes × light/dark) at 1280×720 with no serious/critical `color-contrast` violations. |
| Theme implementation audit + fixes | Source review + built-CSS inspection | **PASS (code)** | Single source of truth consolidated: canonical tokens renamed to `--app-background`, `--app-foreground`, `--app-accent-foreground` and `--app-focus` (with `-rgb` mirrors) across `index.css`, Tailwind, chart/tooltip inline styles and utilities; `themeTokens.test.ts` enforces completeness in both themes. Semantic Tailwind colours use RGB channel tokens + `<alpha-value>` so opacity utilities generate (confirmed `border-accent/40`, `border-success/30`, `bg-surface-sunken/50`, `bg-surface-subtle/30`, `bg-background/30`, `bg-surface/[0.03]` in built CSS); `html` owns themed background/colour plus native control/option/placeholder theming; boot script sets first-paint canvas/colour-scheme; `html.dark`/`data-theme` remain the single switch; header toggle and Settings select share the `qwesie-theme-change` event; shared `Button`/`Badge` variants now use semantic tokens (including `teamA`/`teamB` bound to theme variables) instead of raw palette classes; console `text-white` assumptions replaced with foreground tokens (except intentional text on coloured/team fills and print styles); light `fg-subtle` darkened to pass AA on `bg-background`; `bg-surface-sunken0/10` typos fixed; redundant `dark:*` token pairs and dark-only accent text removed. Populated-content axe runs then surfaced tinted-status failures, fixed in the shared palette: light `warning` → `#92400e`, light `success` → `#065f46`; remaining console palette status/team classes were replaced with `success`/`warning`/`info`/`danger`/`teamA`/`teamB`. See `docs/ui-audit/theme-tokens.md`. |
| Axe dependency install | `npm install -D @axe-core/playwright@^4.10.0 --workspace=client` | **PASS** | Installed in client workspace; Playwright browsers `chromium-1255` / `chromium_headless_shell-1255` / `ffmpeg-1013` installed in local ms-playwright cache for compatibility with current `@playwright/test`. |
| Console theming audit (static) | Source search (excluding broadcast/output/dev/overlay/theme utility/style-token files) | **PASS (code)** | No remaining `bg-slate-8/9*`, `text-slate-4/5/6*`, or hex color literals found in console source files (`client/src` excluding `components/broadcast/**`, `features/broadcast/templates.tsx`, `pages/dev/**`, `ScorebugPage.tsx`, `BroadcastGraphicsPage.tsx`, `CourtOutputPage.tsx`, `OverlayPreviewPage.tsx`, `utils/broadcastTheme.ts`, `utils/overlay.ts`, `styles/index.css` token definitions, and tests). Broadcast/output visuals intentionally unchanged. |
| Wizard/accessibility fixes (code-level) | Source review/build/tests | **PASS** | `MatchSetupWizardPage` uses extracted helpers (`client/src/utils/matchSetupRoster.ts`), never coerces blank jersey to 0, reports accurate load counts/warnings, replace/merge prompt, highlights invalid/missing/duplicate/captain/libero issues, auto-numbers missing jerseys, blocks invalid saves with specific row messages, and formats server/client errors via `client/src/utils/apiErrors.ts` + normalized API issues. Accessible labels added for Home/Away team selects. |
| Error shape normalization (code-level) | Source review + unit tests | **PASS (code)** | Server `errorHandler` includes canonical `issues` for Zod/AppError; client normalizes/formats issues without raw JSON. |

## Not executed / environment-dependent (pending manual verification)

| Area | Status | What to verify |
|---|---|---|
| `npm run verify` (full) | **NOT RUN** | Full script runs build + server tests + **all** Playwright e2e specs/projects; only targeted specs were executed here. Run with app/DB/browsers available and expect environment-dependent failures in specs that require real backend/runtime data. |
| Full Playwright suite (other specs) | **NOT RUN** | `client/tests/auth.spec.ts`, `court-resolution.spec.ts`, `live-control.spec.ts`, `live-hover-stability.spec.ts`, `match-day-path.spec.ts`, `preview-program.spec.ts`, `scenes.spec.ts`, `scorebug.spec.ts`, `stage-g-e2e.spec.ts`, `stageB-setup.spec.ts` not executed; many require running app/DB/auth/runtime state. |
| CI execution | **NOT APPLICABLE / NOT FOUND** | No `.github/` CI config found in this workspace. |
| Database/runtime alignment | **NOT VERIFIED (runtime)** | Local env has DB config (`.local/pgdata`, port 5433) but DB/service was not started for e2e in this pass; verify migrations/client/runtime in target environment as needed. |
| Auth flows (runtime) | **NOT VERIFIED** | Bootstrap/login/change-password/logout-all, lockout, recovery codes/temp password, optional SMTP 30-min token reset, `DEV_AUTO_LOGIN` dev-only behavior, production JWT secret enforcement at startup. |
| Full match-day walkthrough (dev mode) | **NOT VERIFIED** | Setup, pre-match graphics/preview-program, scoring a full set, timeout, set break, final result with live console + outputs. |
| Full match-day walkthrough (production mode) | **NOT VERIFIED** | Same flow with production build/serving (`npm run build && npm start`, `SERVE_CLIENT`/same-port as configured), LAN clients, and persisted defaults/branding/settings. |
| OBS/program output validation | **NOT VERIFIED** | 1920x1080 transparent outputs, stable court URLs, all-in-one/scorebug/graphics behavior, cue/take/clear on program output, "Send test graphic", no stale/error frames on air. `/out/*`, `/broadcast/*`, `/overlay/*` were intentionally not modified. |
| Disconnect/restart/sleep recovery (runtime) | **NOT VERIFIED** | Socket drops, server restarts, sleeping laptops: reconnect behavior, last-good state retention, and no on-air error rendering under real conditions. |
| Backup/restore operations (runtime) | **NOT VERIFIED** | Actual `pg_dump` execution on Windows/Linux targets, retention pruning over time, and restore smoke test against a temporary database. |

## Findings / notes

- Contrast validation used axe-core `color-contrast` rule and reported **no serious/critical violations** on the tested console routes in light/dark at 1920x1080. Automated checks do not replace manual visual review of complex charts, dynamic toasts/modals, focus states during interaction, or states not reached by current mocks.
- Wizard "no players" case intentionally surfaces both an inline warning and an info notification (no success toast) for visibility; tests were scoped accordingly.
- `rosterSaveBlockMessage` now prioritizes specific row-level errors (invalid/missing jersey or name, duplicates, captain/libero rules) before roster-size errors to provide actionable blocking feedback.

## Recommended manual production-mode checklist
1. Configure production `.env` (`DATABASE_URL`, strong `JWT_SECRET`, LAN `CORS_ORIGIN`/ports as needed, backup vars, SMTP if used).
2. Build and start: `npm run build` -> `npm start`; confirm startup logs (URLs, backup scheduler, no secret/CORS errors).
3. Complete bootstrap/login, create a match, verify readiness and persisted Settings defaults/branding.
4. Add OBS Browser Sources using stable `/out/court/:court/{scorebug,graphics,all}` URLs (1920x1080, transparent, shutdown/refresh disabled).
5. Run full flow: pre-match graphics, score a full set, call timeout, observe set break flow/timers, complete match to final result.
6. Simulate network drop/server restart/client sleep and confirm outputs recover with last good state/no error text.
7. Verify a backup file is created and perform restore smoke test into a temporary DB per [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## Summary
- **Automated:** build, typecheck, client unit tests, server tests, wizard prefill Playwright spec (1920x1080), and console contrast Playwright+axe spec (11 routes × light/dark) at both 1920×1080 and 1280×720 all pass in this environment, with screenshots captured.
- **Theme:** semantic colour utilities now generate opacity variants; the document root, native controls and first paint follow the active theme; the header toggle and Settings select share one persisted theme state.
- **Runtime acceptance:** full `verify`/all e2e specs and end-to-end match-day behavior in dev/production (including auth lifecycle, OBS, and fault recovery) require execution in a running stack with DB/browsers/network/OBS and should be recorded when completed.
