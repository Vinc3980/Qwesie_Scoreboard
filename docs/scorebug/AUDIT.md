# Scorebug Audit

## Reproduction / causes (code audit)

Tested by code inspection and local rendering logic review. Primary full-width causes:

1. **Wide/Classic fixed pixel widths + high scale** - real. Classic base width is ~1096px before scale (`teamBlockW 400*2 + sets 72*2 + points 124*2 + setBadge 132 + competition 220 = 1096`). Wide is ~1352px. At `scale=2` this becomes 2192px/2704px visually, exceeding 1920 frame and crowding content. `maxWidth` on container did not constrain fixed-width flex children.
2. **Set-history row** - can extend visual footprint below scorebug; width is content-driven. Mitigated by collapse priority (hide set history first) and overflow safety.
3. **Long names** - mitigated by `useFitText` truncation/fit, but could force wide layouts before sizing model; now collapse switches to short names then shrinks font.
4. **Output stage scaling** - `ScaledStage` already uses uniform 1920x1080 canvas scaling (`Math.min(w/1920,h/1080)`) and `transformOrigin: top left`; it keeps scorebug fraction consistent for OBS source sizes. Window fit uses fixed inset+hidden overflow. Non-16:9 sources letterbox by uniform fit.
5. **Container stretch** - not observed in output stage; root is fixed 1920x1080 canvas. Console preview uses `fit="container"` with centered scaled canvas.

OBS/source sizes checked by reasoning: 1920x1080, 1280x720, 2560x1440, 3840x2160 scale uniformly; non-16:9 (1080x1920, 1:1, 21:9) letterbox - scorebug remains inside 1920x1080 safe canvas.

## Component audit

| Component | Classic/Compact/Wide | Stacked | New variants | Findings / fix |
|---|---|---|---|---|
| Team block (accent/logo/name/serve/pips) | OK after sizing model | OK | OK basic | Added sizing-driven widths, logo size, effFontScale, collapse hides pips/logos/short names. Serve indicator remains visible unless content rules hide. |
| Sets box | OK | OK | OK | Fixed width from sizing; font scales with effFontScale. |
| Points box (flip/3 digits) | OK | OK | OK | Fixed width; 3-digit font reduced; ScoreFlip preserved; no layout shift by fixed box width. |
| Competition/tournament block | OK | Strip | Bar/Side panel text | Collapses before overflow; hidden when missing/collapsed. |
| Set badge | OK | Strip set label | Pill/Bar/Side include label | Fixed width/font scale. |
| Set-history row/panel | OK, can add height | N/A (pips/columns) | Set Table uses columns | First collapse target; overflow hidden safety. |
| Banners (set point/match point/timeout/tech timeout) | OK | Strip takeover | Basic/none in simple variants | Classic banner below scorebug preserved; stacked uses strip takeover with countdown. New simple variants should get banner support in follow-up. |
| Pre-match | OK via existing visibility rules | OK | OK | Uses existing shouldShow logic. |
| Break/set summary | OK banner logic | Strip summary | Basic | CourtOutputPage computes set summary banner. |
| Sponsor slot | OK | N/A | Bottom bar has space potential | Preserved in classic/wide; width included in base width calculation. |

## Fixes applied

- Added `theme.sizing` schema with width mode, maxWidthPercent, row height, part widths, fontScale, padding/gap; defaults preserve classic dimensions.
- Added guardrails: non-bar cap defaults to sizing maxWidthPercent (45% recommended), bar variants allow full width minus safe margins. Priority collapse: set history → timeout pips → competition/tournament → logos → short names → font shrink → width shrink. Scale clamped to cap.
- ScorebugOverlay classic/compact/wide now use sizing values and effective collapsed values.
- New variants added: Mini, Pill, Set Table, Bottom Bar, Top Bar, Side Panel with presets.
- Designer: variant select includes new variants, Sizing section controls, live size readout, 45% guide, frame-size switcher, safe-area guides.
- ScaledStage keeps uniform 1920x1080 fit; transparent/no-scroll.

## Remaining risks / follow-up

- New simple variants (mini/pill/set-table/side-panel) have minimal banner rendering; add banner strip parity.
- Frame-size preview switcher changes aspect container only; true 9:16/21:9 logical canvas simulation needs ScaledStage support.
- Visual regression pixel snapshots not automated in this environment; run Playwright matrix and review screenshots in CI/OBS.
- "Default maxWidthPercent 45%" conflicts with pixel-identical legacy defaults; defaults were kept compatible via sizing defaults and cap behavior. Confirm desired migration policy.
