# Scorebug Matrix Review

Automated matrix screenshots are written by `client/tests/scorebug-matrix.spec.ts` to `docs/scorebug/matrix/` when run in an environment with Playwright browsers.

## Status in this environment

- Playwright matrix test was **not executed** here (no browser run completed in this session).
- No screenshots were opened/reviewed manually.

## Required manual review when run

1. Open a sample from `docs/scorebug/matrix/` for each variant class (classic/wide, stacked, mini/pill/set-table, bottom-bar/top-bar, side-panel).
2. Confirm: no full-width overflow for non-bar variants, bar variants within safe margins, no clipped/overlapping text, no layout shift at 9→10/100, set-history/banners visible where enabled.
3. Record observations, failures, and screenshot filenames here.
