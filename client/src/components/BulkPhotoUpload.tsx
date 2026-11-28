import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileImage, Upload, XCircle } from 'lucide-react';
import { playersApi, uploadsApi } from '../services/api.js';
import { Button } from './ui/Button.js';
import { Avatar } from './ui/Avatar.js';
import { useNotification } from '../contexts/NotificationContext.js';

type MatchRow = {
  file: File;
  fileName: string;
  playerId?: string;
  playerName?: string;
  jerseyNumber?: number | null;
  status: 'matched' | 'unmatched' | 'uploaded' | 'error' | 'uploading';
  message?: string;
};

function normalize(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function inferFromFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, '');
  const jerseyMatch = base.match(/^0*(\d{1,2})(?:[^0-9].*)?$/) || base.match(/^0*(\d{1,2})[-_\s].*$/);
  const jersey = jerseyMatch ? Number(jerseyMatch[1]) : undefined;
  const namePart = base.replace(/^0*\d{1,2}[-_\s]*/, '').replace(/[-_]+/g, ' ').trim();
  return { jersey: Number.isFinite(jersey) ? jersey : undefined, name: namePart };
}

export const BulkPhotoUpload: React.FC<{ teamId: string; teamColor?: string | null; teamTextColor?: string | null }> = ({ teamId, teamColor, teamTextColor }) => {
  const notify = useNotification();
  const qc = useQueryClient();
  const playersQ = useQuery({ queryKey: ['players', teamId], queryFn: () => playersApi.list(teamId) });
  const players = playersQ.data || [];
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [busy, setBusy] = useState(false);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: MatchRow[] = Array.from(files).map((file) => {
      const { jersey, name } = inferFromFilename(file.name);
      let match: any = null;
      if (jersey != null) match = players.find((p: any) => Number(p.jerseyNumber) === Number(jersey));
      if (!match && name) {
        const n = normalize(name);
        match = players.find((p: any) => {
          const candidates = [p.displayName, `${p.firstName} ${p.lastName}`, `${p.lastName} ${p.firstName}`, p.lastName, p.firstName].filter(Boolean).map(normalize);
          return candidates.some(c => c === n || c.includes(n) || n.includes(c));
        });
      }
      return {
        file, fileName: file.name,
        playerId: match?.id, playerName: match ? (match.displayName || `${match.firstName} ${match.lastName}`) : undefined,
        jerseyNumber: match?.jerseyNumber ?? jersey ?? null,
        status: match ? 'matched' : 'unmatched',
        message: match ? undefined : 'No matching player found',
      } as MatchRow;
    });
    setRows(next);
  };

  const setPlayer = (idx: number, playerId: string) => {
    const p = players.find((x: any) => x.id === playerId);
    setRows(rs => rs.map((r, i) => i !== idx ? r : ({ ...r, playerId: p?.id, playerName: p ? (p.displayName || `${p.firstName} ${p.lastName}`) : undefined, jerseyNumber: p?.jerseyNumber ?? r.jerseyNumber, status: p ? 'matched' : 'unmatched', message: p ? undefined : 'No matching player found' })));
  };

  const apply = async () => {
    const targets = rows.filter(r => r.playerId && (r.status === 'matched' || r.status === 'error'));
    if (!targets.length) return notify.error('No matched photos to upload');
    setBusy(true);
    const updated = [...rows];
    for (let i = 0; i < updated.length; i++) {
      const r = updated[i];
      if (!r.playerId || !(r.status === 'matched' || r.status === 'error')) continue;
      updated[i] = { ...r, status: 'uploading', message: undefined };
      setRows([...updated]);
      try {
        const up = await uploadsApi.upload(r.file, 'player-photo');
        await playersApi.update(r.playerId, { photoKey: up.key, thumbKey: up.thumbKey, photoUrl: null });
        updated[i] = { ...updated[i], status: 'uploaded', message: 'Saved' };
      } catch (e: any) {
        updated[i] = { ...updated[i], status: 'error', message: e?.message || 'Upload failed' };
      }
      setRows([...updated]);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['players', teamId] });
    qc.invalidateQueries({ queryKey: ['players'] });
    const ok = updated.filter(r => r.status === 'uploaded').length;
    const bad = updated.filter(r => r.status === 'error').length;
    notify.success(`Bulk photos: ${ok} saved${bad ? `, ${bad} failed` : ''}`);
  };

  const matched = rows.filter(r => r.status === 'matched' || r.status === 'uploaded' || r.status === 'error' || r.status === 'uploading').filter(r => r.playerId).length;

  return (
    <div className="pt-3 border-t border-border space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-fg">Bulk photo upload</div>
          <div className="text-xs text-fg-muted">Drop files named by jersey or name (e.g. <code>7.jpg</code>, <code>07_kofi-mensah.png</code>). Review matches before saving.</div>
        </div>
        <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border-strong cursor-pointer text-sm"><Upload className="w-4 h-4" />Select files<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { onFiles(e.target.files); e.currentTarget.value = ''; }} /></label>
      </div>

      {rows.length > 0 && (
        <>
          <div className="overflow-auto border border-border rounded-lg">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-surface-sunken"><tr><th className="p-2 text-left">File</th><th className="p-2 text-left">Matched player</th><th className="p-2 text-left">Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.fileName}-${i}`} className="border-t border-border">
                    <td className="p-2"><div className="flex items-center gap-2"><FileImage className="w-4 h-4 text-fg-subtle" /><span className="truncate max-w-[180px]" title={r.fileName}>{r.fileName}</span></div></td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {r.playerId && <Avatar src={players.find((p: any) => p.id === r.playerId)?.thumbUrl || players.find((p: any) => p.id === r.playerId)?.photoUrl} name={r.playerName} size={28} color={teamColor} textColor={teamTextColor} />}
                        <select className="w-full rounded border border-border-strong px-2 py-1 bg-surface-sunken text-fg" value={r.playerId || ''} onChange={e => setPlayer(i, e.target.value)} disabled={busy || r.status === 'uploaded'}>
                          <option value="">Unmatched</option>
                          {players.map((p: any) => <option key={p.id} value={p.id}>#{p.jerseyNumber ?? '-'} {p.displayName || `${p.firstName} ${p.lastName}`}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="p-2 text-xs">
                      {r.status === 'uploaded' && <span className="text-success inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Saved</span>}
                      {r.status === 'matched' && <span className="text-accent">Ready</span>}
                      {r.status === 'uploading' && <span className="text-fg-muted">Uploading…</span>}
                      {r.status === 'unmatched' && <span className="text-warning inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Unmatched</span>}
                      {r.status === 'error' && <span className="text-danger">{r.message || 'Error'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={apply} isLoading={busy} disabled={matched === 0}>Upload {matched} matched photo{matched === 1 ? '' : 's'}</Button>
            <Button variant="outline" size="sm" onClick={() => setRows([])} disabled={busy}>Clear</Button>
          </div>
        </>
      )}
    </div>
  );
};
