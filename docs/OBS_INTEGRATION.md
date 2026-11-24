# OBS Integration & Output URLs

How to use Qwesie TV outputs with OBS (or other browser-source-based production tools) for match day.

## Recommended outputs (configure once)

Use **stable per-court URLs** so you do not need to reconfigure OBS for each match:

| Output | URL | Purpose |
|---|---|---|
| Scorebug | `/out/court/<court>/scorebug` | On-air score bug only (transparent) |
| Graphics | `/out/court/<court>/graphics` | Full-screen/overlay graphics program output (transparent) |
| All-in-one | `/out/court/<court>/all` | Single browser source combining scorebug + graphics |

- Replace `<court>` with your court identifier/number (as used in the match, e.g. `1`).
- These URLs follow the active match on that court. When no active match/data is available, outputs stay **transparent** (nothing on air) rather than showing an error.
- Configure these once in OBS/vMix and keep them between matches.

### Other supported routes
- **Per-match outputs (still supported):** `/broadcast/<matchId>/scorebug`, `/broadcast/<matchId>/graphics`, `/broadcast/<matchId>/all`
- **Legacy/compatibility:** `/overlay/scorebug` (and other existing overlay routes remain available where implemented)

> The **console** broadcast page path (`/broadcast`) redirects to **Live Control → Graphics** for operators; public on-air outputs are the `/out/...` and `/broadcast/:matchId/...` URLs above.

## Getting URLs from the console
- Open **Outputs** from the top bar/drawer (shortcut **`O`**) or go to **Live Control → Outputs**.
- The Outputs panel provides copy/open actions for scorebug/graphics/all-in-one URLs, court context, and connection/status indicators.
- Use **Send test graphic** to push a test graphic to program output and confirm OBS is receiving updates.

## OBS Browser Source settings (recommended)
- **URL:** stable court output URL (use LAN IP and correct port reachable from the OBS machine)
- **Width:** `1920`  **Height:** `1080` (match your canvas/output resolution)
- **FPS:** `30`
- **Background:** transparent (outputs are designed for transparent compositing)
- **Shutdown source when not visible:** **Off** (recommended for reliability)
- **Refresh browser when scene becomes active:** **Off** (recommended)
- **Control audio via OBS:** not required for visual outputs

> If your canvas is 720p, you can use `1280x720`, but 1920x1080 is recommended for the designed layout.

## Network and ports
- In **development**, the console is commonly on `5173` and the API/socket server on `5000` (Vite proxy in dev). In **production/same-port mode**, UI and API are typically served from the server `PORT` (default `5000`).
- Use the **server/LAN IP** of the host machine in OBS URLs (not `localhost` on a different computer).
- Allow inbound TCP traffic on the server port through the OS firewall.
- CORS is configured to support common LAN/dev/server-port origins, but correct URL/port/firewall/network reachability is still required.

## Operating workflow (console)
1. Prepare match data and readiness in the console (**Overview** checklist → **Open Live Control**).
2. **Live Control → Score:** run scoring/actions/timeouts/subs.
3. **Live Control → Graphics:** manage preview/program cue workflow (preview is **never** sent to OBS/program output until taken), scenes/breaks as configured.
4. **Live Control → Outputs / Outputs drawer:** monitor connection status, copy/open URLs, send test graphic.
5. OBS displays only **program/output** state; preview remains inside the operator console.

## Resilience behavior
- Output pages reconnect automatically after socket drops and use fallback polling/snapshot refresh where applicable.
- Last known good on-air state is retained when possible during brief disruptions.
- When required data is missing/unavailable, outputs render **nothing/transparent** rather than error text.

## Troubleshooting quick checks
- Open the output URL in a regular browser on the OBS machine to confirm it loads and is transparent/updated.
- Verify match is active/on-court for stable court URLs.
- Confirm you copied the correct court and LAN IP/port.
- Check **Outputs** panel connection indicators and server logs.
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed fixes.
