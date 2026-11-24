import React, { useEffect, useMemo, useState } from 'react';
import * as QRCode from 'qrcode';
import { Copy, ExternalLink, AlertTriangle, CheckCircle2, RefreshCw, Settings2, Wifi } from 'lucide-react';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { Input, Label, Select } from '../ui/Input.js';
import { useNotification } from '../../contexts/NotificationContext.js';
import { broadcastApi, matchApi, systemApi } from '../../services/api.js';
import { buildCourtOutputUrl, getRememberedLanInterface, obsSettingsText, rememberLanInterface, resolveOutputBaseUrl } from '../../utils/outputUrls.js';
import { withOverlayBg } from '../../utils/overlay.js';
import { copyToClipboard } from '../../utils/clipboard.js';

type Props = { open: boolean; onClose: () => void; matchId?: string; court?: string; inline?: boolean };

const OBS_SETTINGS_LINES = [
  '1920x1080',
  '30 fps',
  'Do not shut down when not visible (Shutdown source when not visible: Off)',
  'Refresh browser when scene becomes active: Off',
  'Custom CSS: (blank)',
];

function Qr({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    (QRCode as any).toDataURL(url, { width: 140, margin: 1 }).then((s: string) => { if (alive) setSrc(s); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  return src ? <img src={src} alt="QR" className="w-[100px] h-[100px] rounded bg-surface p-1 border border-border" /> : <div className="w-[100px] h-[100px] rounded bg-surface-sunken border border-border flex items-center justify-center text-xs text-fg-muted">QR</div>;
}

export const OutputsPanel: React.FC<Props> = ({ open, onClose, matchId, court: courtProp, inline }) => {
  const notify = useNotification();
  const [baseUrl, setBaseUrl] = useState('');
  const [lanList, setLanList] = useState<string[]>([]);
  const [selectedLan, setSelectedLan] = useState<string | null>(getRememberedLanInterface());
  const [court, setCourt] = useState((courtProp || '1').trim() || '1');
  const [sys, setSys] = useState<any>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number>(0);
  const [match, setMatch] = useState<any>(null);
  const [scene, setScene] = useState<any>(null);
  const [courtActive, setCourtActive] = useState<any>(null);
  const [obs, setObs] = useState(() => { try { return JSON.parse(localStorage.getItem('qwesie.obsws') || '{}'); } catch { return {}; } });
  const [, forceTick] = useState(0);
  const [devUi, setDevUi] = useState(false);

  useEffect(() => { if (!open && !inline) return; const t = setInterval(() => forceTick(x => x + 1), 1000); return () => clearInterval(t); }, [open, inline]);
  useEffect(() => { if (courtProp && courtProp.trim()) setCourt(courtProp.trim()); }, [courtProp]);

  const refresh = async () => {
    try {
      const resolved = await resolveOutputBaseUrl({ preferredLan: selectedLan, forceLan: true });
      setBaseUrl(resolved.baseUrl);
      setLanList(resolved.lanIpv4 || []);
      if (resolved.selectedLan) { setSelectedLan(resolved.selectedLan); rememberLanInterface(resolved.selectedLan); }
      setDevUi(!!resolved.isDevUi);
      const info = await systemApi.info();
      setSys(info);
      setLastCheckedAt(Date.now());
      if (matchId) {
        const [m, s] = await Promise.all([matchApi.getMatchById(matchId).catch(() => null), broadcastApi.getSceneState(matchId).catch(() => null)]);
        setMatch(m); setScene(s);
      }
      const ca = await systemApi.activeCourtMatch(court).catch(() => null);
      setCourtActive(ca || null);
    } catch {}
  };

  useEffect(() => { if (!open && !inline) return; refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [open, inline, selectedLan, matchId, court]);

  const urls = useMemo(() => {
    const b = baseUrl || window.location.origin;
    const c = (court || '1').trim() || '1';
    return {
      scorebug: buildCourtOutputUrl(b, c, 'scorebug'),
      graphics: buildCourtOutputUrl(b, c, 'graphics'),
      all: buildCourtOutputUrl(b, c, 'all'),
    };
  }, [baseUrl, court]);

  const copy = async (text: string, msg = 'Copied') => {
    const ok = await copyToClipboard(text);
    if (ok) notify.success(msg);
    else notify.error('Copy failed. Copy the link manually.');
  };

  const secondsAgo = lastCheckedAt ? Math.max(0, Math.round((Date.now() - lastCheckedAt) / 1000)) : null;
  const counts = sys?.connectedClients?.byType || { scorebug: 0, graphics: 0, console: 0, other: 0 };
  const totalClients = sys?.connectedClients?.total || 0;

  const statusFor = (kind: 'scorebug' | 'graphics' | 'all') => {
    const connected = kind === 'scorebug' ? (counts.scorebug || 0) > 0
      : kind === 'graphics' ? (counts.graphics || 0) > 0
      : ((counts.scorebug || 0) > 0 || (counts.graphics || 0) > 0);
    return connected ? 'connected' : 'waiting';
  };

  const matchStatus = String(match?.status || courtActive?.status || '').toUpperCase();
  const diagnostics = useMemo(() => {
    const out: string[] = [];
    if (!matchId) out.push('No match is selected on this screen, so no scene settings can be applied here.');
    if (courtActive && !courtActive.matchId) out.push(`No match is assigned to court "${court}".`);
    if (sys && totalClients === 0) out.push('No output client is connected. Open a URL above (use the LAN URL from another device).');
    if (matchId && scene?.scorebug?.visible === false) out.push('The scorebug is hidden for this match.');
    if ((matchStatus === 'SCHEDULED' || matchStatus === 'READY') && !scene?.scorebug?.showPreMatch) out.push('This match is pre-match: enable "Show pre-match" to display the scorebug.');
    if (matchStatus === 'COMPLETED' && scene?.scene && scene.scene !== 'FINAL') out.push('The match is finished: outputs force FINAL even if the stored scene is still PLAY.');
    out.push('Add ?debug=1 to an output URL to see connection, match, court, scene, revision and the last error on screen.');
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, courtActive, sys, totalClients, scene, court, matchStatus]);

  const renderGuidedBlock = (label: string, kind: 'scorebug' | 'graphics' | 'all') => {
    const url = urls[kind];
    const state = statusFor(kind);
    const connected = state === 'connected';
    return (
      <div key={kind} className="rounded-xl border border-border p-4 bg-surface-raised space-y-3 text-fg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} aria-hidden="true" />
              <h3 className="font-bold text-fg text-base leading-tight">{label}</h3>
              {kind === 'all' && <span className="text-[11px] text-fg-muted">Following: {courtActive?.match ? `#${courtActive.match.matchNumber || '?'} ${courtActive.match.homeTeamName || 'Home'} vs ${courtActive.match.awayTeamName || 'Away'}` : 'no on-air match'}</span>}
            </div>
            <div className="text-xs font-mono break-all text-fg bg-surface-sunken rounded px-2 py-1.5 border border-border">{url}</div>
          </div>
          <div className="shrink-0 hidden sm:block"><Qr url={url} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === 'all' ? (
            <Button size="sm" variant="secondary" onClick={() => copy(url, 'OBS URL copied')}><Copy className="w-4 h-4" />Copy OBS URL</Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => window.open(withOverlayBg(url, 'checker'), '_blank')}><ExternalLink className="w-4 h-4" />Open preview (checkerboard)</Button>
        </div>
        <div className="text-xs text-fg-muted">
          <div className="font-semibold text-fg mb-0.5">OBS settings</div>
          <ul className="list-disc pl-5 space-y-0.5 text-fg-muted">
            {OBS_SETTINGS_LINES.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <div className={`text-xs font-semibold flex flex-wrap items-center gap-2 ${connected ? 'text-success' : 'text-warning'}`}>
          {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          <span>{connected ? 'Connected' : 'Waiting for connection'}{secondsAgo != null ? `, last update ${secondsAgo}s ago` : ''}</span>
          <span className="font-normal text-fg-muted">
            {kind === 'scorebug' ? `(${counts.scorebug || 0} scorebug client${counts.scorebug === 1 ? '' : 's'})`
              : kind === 'graphics' ? `(${counts.graphics || 0} graphics client${counts.graphics === 1 ? '' : 's'})`
              : `(scorebug ${counts.scorebug || 0}, graphics ${counts.graphics || 0})`}
          </span>
        </div>
      </div>
    );
  };

  const setScorebug = async (patch: any) => {
    if (!matchId) return notify.info('Open/select a match to apply scorebug settings');
    try { await broadcastApi.setScene(matchId, { scorebug: patch }); notify.success('Scorebug updated'); refresh(); } catch (e: any) { notify.error(e.message); }
  };
  const sendTestGraphic = async () => {
    if (!matchId) return notify.info('Select a match first');
    try {
      await broadcastApi.take(matchId, { template: 'MATCH_INTRO', payload: { __test: true, title: 'TEST GRAPHIC', subtitle: 'OBS signal check' }, duration: null, autoReturn: false } as any).catch(async () => {
        await broadcastApi.setScene(matchId, { scene: 'BREAK_SLATE', template: 'MATCH_INTRO', payload: { __test: true, title: 'TEST GRAPHIC', subtitle: 'OBS signal check' }, lock: false, scorebug: { visible: true } });
      });
      notify.success('Test graphic sent to program output');
    } catch (e: any) { notify.error(e?.message || 'Failed to send test graphic'); }
  };
  const backToLive = async () => {
    if (!matchId) return;
    try { await broadcastApi.clear(matchId).catch(() => broadcastApi.setScene(matchId, { scene: 'PLAY' })); notify.success('Back to live (scorebug restored)'); } catch (e: any) { notify.error(e.message); }
  };

  const saveObs = (next: any) => { const v = { ...obs, ...next }; setObs(v); try { localStorage.setItem('qwesie.obsws', JSON.stringify(v)); } catch {} };
  const autoAddObs = async () => {
    try {
      const host = obs.host || 'localhost'; const port = obs.port || 4455; const password = obs.password || '';
      const ws = new WebSocket(`ws://${host}:${port}`);
      const wait = (type: string, id: string) => new Promise<any>((resolve, reject) => {
        const to = setTimeout(() => { ws.close(); reject(new Error(`OBS timeout waiting for ${type}`)); }, 5000);
        const h = (ev: MessageEvent) => { try { const msg = JSON.parse(ev.data); if (msg?.op === 7 && msg?.d?.requestId === id) { clearTimeout(to); ws.removeEventListener('message', h); if (msg.d.requestStatus?.result) resolve(msg.d.responseData || {}); else reject(new Error(msg.d.requestStatus?.comment || 'OBS request failed')); } } catch {} };
        ws.addEventListener('message', h);
      });
      ws.addEventListener('message', async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.op === 0) {
            const identify: any = { op: 1, d: { rpcVersion: 1 } };
            if (msg.d?.authentication) {
              if (!password) throw new Error('OBS requires password');
              const enc = new TextEncoder();
              const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
              const b64 = (hex: string) => btoa(String.fromCharCode(...(hex.match(/.{2}/g) || []).map(h => parseInt(h, 16))));
              const secret = b64(await sha(password + msg.d.authentication.salt));
              identify.d.authentication = b64(await sha(secret + msg.d.authentication.challenge));
            }
            ws.send(JSON.stringify(identify));
          }
          if (msg.op === 2) {
            const sceneName = 'Qwesie Outputs';
            const req = (requestType: string, requestData: any, requestId: string) => ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
            req('CreateScene', { sceneName }, 's1'); await wait('CreateScene', 's1').catch(() => {});
            req('GetCurrentProgramScene', {}, 'g1'); const cur = await wait('GetCurrentProgramScene', 'g1').catch(() => ({ currentProgramSceneName: sceneName }));
            const target = cur.currentProgramSceneName || sceneName;
            const make = async (name: string, url: string) => {
              req('CreateInput', { sceneName: target, inputName: name, inputKind: 'browser_source', inputSettings: { url, width: 1920, height: 1080, fps: 30, shutdown: false, reroute_audio: false } }, name); await wait('CreateInput', name);
              req('GetSceneItemId', { sceneName: target, sourceName: name }, name + 'id'); const item = await wait('GetSceneItemId', name + 'id');
              req('SetSceneItemTransform', { sceneName: target, sceneItemId: item.sceneItemId, sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, boundsWidth: 1920, boundsHeight: 1080, boundsType: 'OBS_BOUNDS_SCALE_INNER' } }, name + 'tr'); await wait('SetSceneItemTransform', name + 'tr').catch(() => {});
            };
            await make('Qwesie Scorebug', urls.scorebug);
            await make('Qwesie Graphics', urls.graphics);
            await make('Qwesie All-in-One', urls.all);
            notify.success('OBS browser sources added (1920x1080)'); ws.close();
          }
        } catch (e: any) { notify.error(e.message || 'OBS setup failed'); try { ws.close(); } catch {} }
      });
    } catch (e: any) { notify.error(e.message || 'Auto-add to OBS failed'); }
  };

  const courtValue = (court || '1').trim() || '1';

  const body = (
      <div className={inline ? "space-y-4 text-fg" : "space-y-4 max-h-[75vh] overflow-auto pr-1 text-fg"}>
        {devUi && (
          <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 text-sm text-fg">
            <div className="font-semibold mb-1 text-warning">Dev server detected</div>
            <div className="text-fg-muted">OBS-facing links below use the LAN IP with the Vite dev port (Vite proxies /api and /socket.io). Ensure the dev server and app are reachable from other devices on the LAN.</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Court (stable URL)</Label>
            <Input value={court} onChange={e => setCourt(e.target.value)} placeholder="1" />
          </div>
          <div>
            <Label>Network interface / LAN base</Label>
            <Select value={selectedLan || ''} onChange={e => { setSelectedLan(e.target.value || null); if (e.target.value) rememberLanInterface(e.target.value); }}>
              <option value="">Auto-detect</option>
              {lanList.map(ip => <option key={ip} value={ip}>{ip}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh}><RefreshCw className="w-4 h-4" />Refresh</Button>
            <Button variant="secondary" onClick={() => copy(urls.all, 'OBS URL copied')}><Copy className="w-4 h-4" />Copy OBS URL</Button>
          </div>
        </div>

        <div className={`rounded-lg border p-3 text-sm flex flex-wrap items-center gap-2 ${totalClients > 0 ? 'border-success/40 bg-success-subtle text-success' : 'border-warning/40 bg-warning-subtle text-warning'}`}>
          {totalClients > 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span className="font-semibold">{totalClients > 0 ? 'Clients connected' : 'No clients detected'}</span>
          <span className="text-xs text-fg-muted">Total {totalClients} (scorebug {counts.scorebug}, graphics {counts.graphics}, console {counts.console}, other {counts.other})</span>
          <span className="text-xs text-fg-muted">{secondsAgo == null ? '' : `• last update ${secondsAgo}s ago`}</span>
        </div>

        <div className="rounded-lg border border-border bg-surface-alt p-3 text-sm flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">On air for Court {courtValue}:</span>
          <span className="text-fg-muted">{courtActive?.match ? `#${courtActive.match.matchNumber || '?'} ${courtActive.match.homeTeamName || 'Home'} vs ${courtActive.match.awayTeamName || 'Away'} (${courtActive.match.status || courtActive.status || 'unknown'})` : (courtActive?.matchId ? `Match ${courtActive.matchId}` : 'No on-air match assigned')}</span>
          {matchId && courtActive?.matchId && courtActive.matchId !== matchId && (
            <>
              <span className="text-warning font-semibold">Different from selected match.</span>
              <Button size="sm" variant="secondary" onClick={async () => { try { await systemApi.setActiveCourtMatch(courtValue, matchId); await refresh(); notify.success('This match is now on air for the court'); } catch (e: any) { notify.error(e?.message || 'Failed to set on-air match'); } }}>Make this match on-air</Button>
            </>
          )}
        </div>

        <div className="space-y-3">
          {renderGuidedBlock('Scorebug', 'scorebug')}
          {renderGuidedBlock('Graphics', 'graphics')}
          {renderGuidedBlock('All-in-one (Scorebug + Graphics)', 'all')}
        </div>
        <p className="text-xs text-fg-muted">Stable OBS-facing URLs for court <span className="font-semibold text-fg">{courtValue}</span> (<code className="text-fg">/out/court/{encodeURIComponent(courtValue)}/{'{'}scorebug|graphics|all{'}'}</code>). Paste once in OBS; they follow the active match on the court.</p>

        <details className="rounded-xl border border-border p-3 bg-surface-raised" open>
          <summary className="font-bold text-sm cursor-pointer text-fg">Why is my overlay blank?</summary>
          <ul className="mt-2 space-y-1 text-xs text-fg-muted list-disc pl-5">
            {diagnostics.map((d, i) => <li key={i}>{d}</li>)}
            <li><span className="font-semibold text-fg">Broadcast Studio scenes</span> (lineups, match stats/analysis, breaks, results, spotlight, etc.) appear on <span className="font-semibold text-fg">Graphics</span> or <span className="font-semibold text-fg">All-in-one</span> outputs, not on Scorebug-only.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.open(withOverlayBg(urls.scorebug, 'checker'), '_blank')}><ExternalLink className="w-4 h-4" />Open scorebug (checkerboard)</Button>
            <Button size="sm" variant="secondary" onClick={() => { const u = new URL(urls.all); u.searchParams.set('debug', '1'); u.searchParams.set('bg', 'checker'); window.open(u.toString(), '_blank'); }}><AlertTriangle className="w-4 h-4" />Open all-in-one (debug + checkerboard)</Button>
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy(obsSettingsText(urls.all), 'OBS settings copied')}><Settings2 className="w-4 h-4" />Copy OBS settings (all-in-one)</Button>
          <Button variant="secondary" onClick={sendTestGraphic}>Send test graphic</Button>
          <Button variant="outline" onClick={backToLive}>Back to live</Button>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-2 bg-surface-raised">
          <div className="font-bold text-sm text-fg">Scorebug quick settings {matchId ? '' : '(select/open a match)'}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Select defaultValue={scene?.scorebug?.variant || 'classic'} onChange={e => setScorebug({ variant: e.target.value })}><option value="classic">Classic</option><option value="compact">Compact</option><option value="wide">Wide</option></Select>
            <Select defaultValue={scene?.scorebug?.position || 'top-left'} onChange={e => setScorebug({ position: e.target.value })}><option value="top-left">Top-left</option><option value="top-right">Top-right</option><option value="bottom-left">Bottom-left</option><option value="bottom-right">Bottom-right</option></Select>
            <Select defaultValue={String(scene?.scorebug?.scale ?? 1)} onChange={e => setScorebug({ scale: Number(e.target.value) })}><option value="0.75">Scale 0.75</option><option value="1">Scale 1</option><option value="1.25">Scale 1.25</option><option value="1.5">Scale 1.5</option></Select>
            <Button variant="secondary" onClick={() => setScorebug({ visible: !(scene?.scorebug?.visible !== false) })}>{scene?.scorebug?.visible !== false ? 'Hide scorebug' : 'Show scorebug'}</Button>
            <Button variant="secondary" onClick={() => setScorebug({ showPreMatch: !scene?.scorebug?.showPreMatch })}>{scene?.scorebug?.showPreMatch ? 'Hide pre-match' : 'Show pre-match'}</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-2 bg-surface-raised">
          <div className="font-bold text-sm text-fg">Optional: Auto-add to OBS (obs-websocket v5)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input placeholder="Host (localhost)" value={obs.host || ''} onChange={e => saveObs({ host: e.target.value })} />
            <Input placeholder="Port (4455)" value={obs.port || ''} onChange={e => saveObs({ port: e.target.value })} />
            <Input placeholder="Password" type="password" value={obs.password || ''} onChange={e => saveObs({ password: e.target.value })} />
          </div>
          <div className="flex gap-2"><Button variant="secondary" onClick={autoAddObs}><Wifi className="w-4 h-4" />Auto-add to OBS</Button><span className="text-xs text-fg-muted self-center">Adds stable /out/court URLs as browser sources (1920x1080). Stored locally.</span></div>
        </div>
      </div>
  );

  if (inline) return body;
  return (
    <Modal isOpen={open} onClose={onClose} title="Outputs (OBS / Displays)">
      {body}
    </Modal>
  );
};

export default OutputsPanel;
