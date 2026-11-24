# Broadcast Operator Manual

Guide for broadcast/graphics operators using Qwesie TV outputs with OBS and the console cue workflow.

## Output types and URLs
- **Stable per-court outputs (recommended):**
  - `/out/court/<court>/scorebug`
  - `/out/court/<court>/graphics`
  - `/out/court/<court>/all`
- **Per-match outputs:** `/broadcast/<matchId>/scorebug|graphics|all` (supported)
- **Console route note:** `/broadcast` in the console redirects to **Live Control → Graphics** (operator UI), not an on-air output URL.

Configure OBS once with stable court URLs so court-to-match switching does not require source URL changes.

## OBS setup
- Browser Source per output/layer as needed (or all-in-one).
- **1920x1080** (recommended), **30 FPS**, transparent background.
- Disable **Shutdown source when not visible** and **Refresh browser when scene becomes active**.
- Use the host server's LAN IP/port reachable from the OBS machine.

## Console workflow
- Open **Live Control → Graphics** for cue/scene control.
- Open **Outputs** drawer (`O`) or **Live Control → Outputs** for URLs, open-in-new-tab, connection/status, and **Send test graphic**.

### Preview / Program discipline
- **Preview** is operator-only and never reaches OBS/program output.
- **Take** publishes preview to program (**Enter**).
- **Clear** clears/removes cue state as applicable (**Esc**).
- Preview selection shortcuts **1–7** may be used where enabled.
- Always verify the intended change on the program/output monitor/OBS scene before and after transitions.

## On-air behavior expectations
- Scorebug/graphics outputs are transparent and designed for compositing.
- During reconnects, server restarts, or brief network issues, outputs attempt to recover automatically and keep last good state.
- If required data is missing, outputs should show **nothing/transparent** rather than error text.

## Match-day checks
- Before go-live: confirm correct court, active match, and test graphic visible in OBS.
- During match: monitor Outputs connection/status and coordinate with scorer on timing of graphic takes/breaks.
- If output appears stale: verify connection, confirm a program take occurred (not just preview), and check URL/court/match. Reopen browser source only if necessary.

## References
- [OBS_INTEGRATION.md](OBS_INTEGRATION.md)
- [MATCH_DAY_CHECKLIST.md](MATCH_DAY_CHECKLIST.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
