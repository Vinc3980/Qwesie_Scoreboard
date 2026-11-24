# Console Theme Tokens (Single Source of Truth)

**Updated:** 2026-11-20  
**Applies to:** operator console only. Broadcast/output/overlay surfaces (`/out/*`, `/broadcast/*`, `/overlay/*`, `components/broadcast/**`, `features/broadcast/templates.tsx`, `utils/broadcastTheme.ts`) keep their own separate palette.

## Contract

- All console theme values live in `client/src/styles/index.css` under `:root` (light) and `.dark` (dark). No component or page may define its own theme colours.
- Each canonical semantic token is defined as a hex value plus an RGB channel mirror used by Tailwind opacity modifiers.
- `client/tailwind.config.js` maps semantic colours to `rgb(var(--app-<token>-rgb) / <alpha-value>)`.
- The active theme is switched only by `html.dark` (set by `client/src/utils/theme.ts`, pre-rendered by `client/index.html`).
- `client/src/utils/themeTokens.test.ts` fails if a required token or its RGB mirror is missing from either theme, or if Tailwind stops referencing the canonical variables.

## Required tokens

| Semantic token | CSS variable | Auto dark? | Tailwind usage |
|---|---|---|---|
| background | `--app-background` | yes | `bg-background` |
| foreground | `--app-foreground` | yes | `text-fg` |
| surface | `--app-surface` | yes | `bg-surface` |
| surface-raised | `--app-surface-raised` | yes | `bg-surface-raised` |
| surface-sunken | `--app-surface-sunken` | yes | `bg-surface-sunken` |
| surface-alt | `--app-surface-alt` | yes | `bg-surface-alt` |
| muted | `--app-muted` | yes | `text-fg-muted` |
| subtle | `--app-subtle` | yes | `text-fg-subtle` |
| border | `--app-border` | yes | `border-border` |
| accent | `--app-accent` | yes | `bg-accent`, `text-accent` |
| accent-hover | `--app-accent-hover` | yes | `hover:bg-accent-hover` |
| accent-foreground | `--app-accent-foreground` | yes | `text-accent-fg` |
| danger | `--app-danger` | yes | `text-danger`, `bg-danger` |
| danger-subtle | `--app-danger-subtle` | yes | `bg-danger-subtle` |
| focus | `--app-focus` | yes | `ring-focus`, `border-focus` |

Additional supporting tokens in both themes: `surface-hover`, `border-strong`, `success`/`warning`/`info` (plus `-fg`/`-subtle`), `live`, `warn`, `team-a`/`team-b`, and chart helpers. They follow the same source-of-truth rules.

## Light-theme readability decisions

- Light `--app-warning` is `#92400e` and light `--app-success` is `#065f46`, so small bold status text clears 4.5:1 on `warning-subtle` and on `bg-success/15` composites over light surfaces. `--app-accent` stays `#b45309`, with white primary-button text (~5:1).
- Light surfaces are genuinely light: page `#f3f4f6`, cards `#ffffff`, foreground `#111827`, muted `#4b5563`, subtle `#5b6472`, border `#d6dbe3`; inputs/selects use `surface-sunken` with dark text.
- Fix tinted status contrast by adjusting the shared token, never by adding page-specific overrides.

## Shared component rules

- `components/ui/*` must use semantic utilities (`bg-surface`, `text-fg-muted`, `border-border`, `bg-danger-subtle`, `text-danger`, `bg-teamA/15`, etc.) and must not use raw Tailwind palette values such as `bg-slate-800` or `text-emerald-200`.
- Status meaning maps to `success` / `warning` / `danger` / `info`; team identity maps to `teamA` / `teamB`.
- Opacity modifiers are always allowed because every solid token has an RGB mirror.

## Verification

```powershell
npm run typecheck
npm run test --workspace=client
npm run build
cd client
npx playwright test tests/console-contrast.spec.ts --project=chromium-1920x1080
npx playwright test tests/console-contrast.spec.ts --project=chromium-1280x720
```
