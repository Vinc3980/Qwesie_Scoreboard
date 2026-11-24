# Match-day Checklist

Use this checklist for each event. Roles: **Scorer/Operator** (console) and **Broadcast engineer** (OBS/outputs/network).

## A. Pre-match (venue/network) — Broadcast engineer
- [ ] **Power & network:** stable power, LAN switch/router up, operator and OBS machines on same network/subnet.
- [ ] **Firewall:** allow inbound TCP on server `PORT` (default 5000) and dev client port if using dev mode.
- [ ] **Database:** PostgreSQL running/reachable (`DATABASE_URL` correct). Migrations applied for current build.
- [ ] **Server:** start app and verify startup logs show LAN URLs, output URLs, and no fatal config errors.
  - Production: `npm run build` + `npm start` (same-port UI/API when client is served)
  - Dev: `npm run dev` (API 5000, client typically 5173)
- [ ] **Backups:** confirm `pg_dump` available/configured (`PG_DUMP_PATH`), `BACKUP_DIR` writable, and recent backup created/logged.
- [ ] **Time:** all machines have correct local time.
- [ ] **OBS sources (stable, configure once):**
  - Scorebug: `http://<lan-ip>:<port>/out/court/<court>/scorebug`
  - Graphics: `http://<lan-ip>:<port>/out/court/<court>/graphics`
  - All-in-one (optional): `http://<lan-ip>:<port>/out/court/<court>/all`
  - Browser Source: 1920x1080, FPS 30, transparent, disable shutdown-on-hide and refresh-on-scene-activate.

## B. Pre-match (access & setup) — Scorer/Operator
- [ ] **Access/auth:** sign in with authorized role (ADMIN/SCORER for mutations). Complete first-run bootstrap if required. If needed, use recovery/admin reset flows per policy.
- [ ] **Settings/defaults:** verify persisted match/output/branding defaults in **Settings** (court, tournament/competition defaults, branding) as applicable.
- [ ] **Create/open match:** create match or open scheduled match; confirm teams, short names, logos/colors, court, rules/sets/timeouts.
- [ ] **Rosters/lineups:** enter/confirm rosters and starting lineups as required for readiness.
- [ ] **Overview launchpad:** review match-day checklist status on **Overview** and follow the single **next-step CTA** to proceed (typically to **Go Live / Live Control**).
- [ ] **Outputs check:** open **Outputs** drawer (`O`) or **Live Control → Outputs**; confirm URLs/court, connection status, and send **test graphic** to verify program output in OBS.
- [ ] **Connection:** confirm console shows healthy connection; output pages should auto-reconnect if disrupted.

## C. Go-live — both
- [ ] **Graphics tab:** cue pre-match graphics in **Preview** (never on-air) and **Take** to program when ready (Enter take, Esc clear as per workflow). Confirm program in OBS.
- [ ] **Score tab:** set match to live/ready state as required and be ready to score.
- [ ] **Final checks:** correct court/match on outputs, no unintended graphic on program, audio/stream scene selection in OBS as needed.

## D. During match — Scorer/Operator (with broadcast awareness)
- [ ] **Scoring:** record points/actions/timeouts/substitutions promptly; monitor set/match progression.
- [ ] **Graphics/cues:** manage graphics/break/scene cues from **Live Control → Graphics**; use preview/program discipline.
- [ ] **Output health:** watch Outputs status; if network drops/server restarts/laptop sleeps, allow reconnection (last good state should persist; no error text should appear on air).
- [ ] **Issues:** use [TROUBLESHOOTING.md](TROUBLESHOOTING.md); keep scoring accurate even if graphics need temporary recovery.

## E. End of match / post-match
- [ ] **Finalize:** confirm final result/set scores and remove/clear on-air graphics as appropriate.
- [ ] **Review:** check reports/stats/history pages as needed.
- [ ] **Backups:** confirm a recent successful backup exists (console/logs and `BACKUP_DIR`); perform restore smoke test in non-production environment when scheduled.
- [ ] **Handoff:** note any incidents, manual corrections, or environment issues for follow-up.

## Quick links
- [FIRST_10_MINUTES.md](FIRST_10_MINUTES.md)
- [OBS_INTEGRATION.md](OBS_INTEGRATION.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md)
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
