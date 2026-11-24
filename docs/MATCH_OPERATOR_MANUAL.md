# Match Operator Manual

Guide for scorers/operators running a match in Qwesie TV.

## Roles and access
- **ADMIN/SCORER:** can perform scoring and match/broadcast control mutations.
- **VIEWER (if used):** read-oriented access; scoring controls require sufficient permissions.
- Sign in at `/login`. First-run deployments may require protected **admin bootstrap** (`/bootstrap`) before normal login.
- Account/security features include password policy, lockout protection, change password, logout/logout-all, and recovery paths (admin reset, recovery codes, temp password flows, and optional SMTP token reset if configured).

## Navigation and workspace
- **Overview (`/`):** match-day launchpad with checklist/readiness indicators and a single next-step CTA to proceed (e.g. Open Live Control / Go Live).
- **Live Control (`/live/:matchId?tab=score|graphics|outputs`):** primary operating workspace with tabs:
  - **Score:** scoring actions, points, timeouts, substitutions, set/match progression controls.
  - **Graphics:** preview/program cue workflow, scene/graphic/break controls, and graphics operations for broadcast output.
  - **Outputs:** output URLs, connection/status, open-in-new-tab actions, and **Send test graphic**.
- **Outputs drawer:** available from the app shell (top bar / shortcut **`O`**) for quick access to output URLs/status without leaving current context.
- **Matches, Teams, Players, Competitions, Stats, History, Settings, System:** preparation, management, reporting, and configuration areas grouped in the sidebar by workflow/role.
- **Console `/broadcast` path:** redirects to **Live Control → Graphics** (public on-air output URLs are separate; see OBS docs).

## Pre-match workflow
1. **Create/select match:** from Matches, create a new match or open an existing one. Confirm court, teams, rules (sets/points/timeouts), and metadata.
2. **Prepare data:** set rosters/lineups and verify branding/team details as needed.
3. **Check readiness:** use Overview checklist/readiness indicators to resolve blockers.
4. **Settings/defaults:** use **Settings** for persisted match/output/branding defaults (applied to future/setup flows as designed) to speed match-day setup.
5. **Verify outputs:** open Outputs drawer/tab, copy stable court URLs, and send a test graphic to confirm OBS/program path.

## Live scoring (Score tab)
- Record rally outcomes and actions according to your match procedures.
- Use timeout/substitution/set controls as needed; confirm score, set count, serving/rotation indicators, and status after each key action.
- Undo/correction flows (where available) should be used carefully and verified against on-air state.
- If connectivity is interrupted, keep officiating/scoring continuity and confirm state resync when connection returns.

## Graphics and cue workflow (Graphics tab)
- **Preview vs Program:** build/select content in **Preview** first. Preview never reaches OBS/program output.
- **Take:** publish preview to program (keyboard shortcut **Enter**).
- **Clear:** clear/remove program cue state as applicable (keyboard shortcut **Esc**).
- Preview shortcuts (where enabled): **1–7** select preview targets/cues.
- Manage scene/break/graphic controls from this tab; use discipline to avoid unintended on-air changes.
- Use **Send test graphic** (Outputs) to validate the OBS path without disrupting live content unnecessarily.

## Outputs and monitoring
- Prefer **stable court URLs** for OBS: `/out/court/<court>/scorebug`, `/out/court/<court>/graphics`, `/out/court/<court>/all`.
- Monitor connection/status in Outputs panel/tab and on output pages (debug indicators only when explicitly enabled).
- If an operator machine sleeps, server restarts, or sockets drop, outputs should reconnect and keep last good state; missing data should render as transparent (no on-air error text).

## End of match
- Confirm final score/result and set history.
- Clear on-air graphics/cues as appropriate.
- Review stats/history/reports if needed.
- Ensure a recent backup exists and report any incidents.

## Tips
- Use the `?` shortcut/help (where available) and keep one operator focused on Score while another manages Graphics when possible.
- Keep OBS browser sources configured once with stable court URLs to reduce match-day risk.
- See [OBS_INTEGRATION.md](OBS_INTEGRATION.md), [MATCH_DAY_CHECKLIST.md](MATCH_DAY_CHECKLIST.md), and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
