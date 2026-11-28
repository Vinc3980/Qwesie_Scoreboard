import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { playersApi, teamsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select, Textarea } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { ImageUpload, type ImageValue } from '../components/ui/ImageUpload.js';
import { Avatar } from '../components/ui/Avatar.js';

function toCsv(rows: any[]) {
  const header = ['id', 'teamId', 'firstName', 'lastName', 'displayName', 'jerseyNumber', 'heightCm', 'position', 'isCaptain', 'isLibero', 'photoUrl'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))].join('\n');
}

const emptyForm = (teamId = '') => ({
  teamId, firstName: '', lastName: '', displayName: '', jerseyNumber: '', heightCm: '',
  position: '', isCaptain: false, isLibero: false,
  photo: null as ImageValue | null,
});

export const PlayersPage: React.FC = () => {
  const notify = useNotification(); const qc = useQueryClient();
  const [q, setQ] = useState(''); const [teamFilter, setTeamFilter] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [bulkTeam, setBulkTeam] = useState(''); const [bulkText, setBulkText] = useState('');
  const [visibleCount, setVisibleCount] = useState(80);
  React.useEffect(() => { setVisibleCount(80); }, [q, teamFilter]);

  const teamsQ = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const playersQ = useQuery({ queryKey: ['players', teamFilter], queryFn: () => playersApi.list(teamFilter || undefined) });
  const teams = teamsQ.data || [];
  const players = (playersQ.data || []).filter((p: any) => `${p.displayName || ''} ${p.firstName || ''} ${p.lastName || ''} ${p.jerseyNumber || ''}`.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        teamId: form.teamId || null,
        firstName: form.firstName, lastName: form.lastName, displayName: form.displayName || null,
        jerseyNumber: form.jerseyNumber === '' ? null : Number(form.jerseyNumber),
        heightCm: form.heightCm === '' ? null : Number(form.heightCm),
        position: form.position || null, isCaptain: !!form.isCaptain, isLibero: !!form.isLibero,
        photoKey: form.photo?.key || null, thumbKey: form.photo?.thumbKey || null,
        photoUrl: form.photo?.key ? null : (form.photo?.url || null),
      };
      return editing?.id ? playersApi.update(editing.id, payload) : playersApi.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['players'] }); qc.invalidateQueries({ queryKey: ['teams'] }); notify.success(editing?.id ? 'Player updated' : 'Player created'); setEditing(null); },
    onError: (e: Error) => notify.error(e.message),
  });
  const delMut = useMutation({ mutationFn: (id: string) => playersApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['players'] }); notify.success('Player deleted'); }, onError: (e: Error) => notify.error(e.message) });

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      teamId: p.teamId || '', firstName: p.firstName || '', lastName: p.lastName || '', displayName: p.displayName || '',
      jerseyNumber: p.jerseyNumber ?? '', heightCm: p.heightCm ?? '', position: p.position || '',
      isCaptain: !!p.isCaptain, isLibero: !!p.isLibero,
      photo: (p.photoKey || p.photoUrl) ? { key: p.photoKey || null, thumbKey: p.thumbKey || null, url: p.photoUrl || null, thumbUrl: p.thumbUrl || p.photoUrl || null } : null,
    });
  };

  const exportCsv = () => { const blob = new Blob([toCsv(players)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'players.csv'; a.click(); };
  const importCsv = async (file?: File) => {
    if (!file) return; const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); const [head, ...rows] = lines; const cols = head.split(',').map(s => s.replace(/^"|"$/g, ''));
    let ok = 0, fail = 0; for (const line of rows) { const vals = line.match(/("[^"]*(?:""[^"]*)*"|[^,]*)/g)?.filter((_, i, arr) => i < arr.length - 1 || line.endsWith(',') ? true : true) || line.split(','); const obj: any = {}; cols.forEach((c, i) => { let v = (vals[i] || '').trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/""/g, '"'); obj[c] = v; });
      try { await playersApi.create({ teamId: obj.teamId || null, firstName: obj.firstName || 'Player', lastName: obj.lastName || 'Name', displayName: obj.displayName || undefined, jerseyNumber: obj.jerseyNumber ? Number(obj.jerseyNumber) : null, heightCm: obj.heightCm ? Number(obj.heightCm) : null, position: obj.position || null, isCaptain: obj.isCaptain === 'true' || obj.isCaptain === '1', isLibero: obj.isLibero === 'true' || obj.isLibero === '1', photoUrl: obj.photoUrl || null }); ok++; } catch { fail++; }
    }
    qc.invalidateQueries({ queryKey: ['players'] }); notify.success(`CSV import: ${ok} created, ${fail} failed`);
  };

  const bulkCreate = async () => {
    if (!bulkTeam) return notify.error('Select a team');
    try { const res = await teamsApi.bulkPlayers(bulkTeam, { text: bulkText, dryRun: false }); notify.success(`Bulk: ${res.createdCount || 0} created`); setBulkText(''); qc.invalidateQueries({ queryKey: ['players'] }); } catch (e: any) { notify.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Registry" title="Players" description="Manage player profiles, photos, jersey identities, and team assignments for rosters and statistics." actions={<Button variant="primary" onClick={() => { setEditing({}); setForm(emptyForm(teamFilter || '')); }}><Plus className="w-4 h-4" />Add Player</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Player Registry</CardTitle>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-56"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" /><Input className="pl-9" placeholder="Search players" value={q} onChange={e => setQ(e.target.value)} /></div>
              <Select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="md:w-44"><option value="">All teams</option>{teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4" />CSV</Button>
              <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border-strong cursor-pointer text-sm">Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={e => importCsv(e.target.files?.[0])} /></label>
            </div>
          </CardHeader>
          {playersQ.isLoading && <div className="text-sm text-fg-subtle">Loading players...</div>}
          {playersQ.error && <div className="text-sm text-danger">{(playersQ.error as Error).message}</div>}
          {!playersQ.isLoading && players.length === 0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-xl">No players found. Add players or bulk paste to build rosters.</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-fg-muted text-left border-b border-border"><th className="py-2 pr-2">Player</th><th className="py-2 pr-2">#</th><th className="py-2 pr-2">Team</th><th className="py-2 pr-2">Pos</th><th className="py-2 pr-2">Flags</th><th className="py-2"></th></tr></thead>
              <tbody>
                {players.slice(0, visibleCount).map((p: any) => {
                  const team = p.team || teams.find((t: any) => t.id === p.teamId);
                  const name = p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim();
                  return (
                    <tr key={p.id} className="border-b border-border" style={{ contentVisibility: 'auto', containIntrinsicSize: '52px' }}>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={p.thumbUrl || p.photoUrl} name={name} size={34} color={team?.primaryColor} textColor={team?.textColor} />
                          <span className="truncate">{name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-2 font-semibold">{p.jerseyNumber ?? '-'}</td>
                      <td className="py-2 pr-2 text-fg-subtle">{team?.name || '-'}</td>
                      <td className="py-2 pr-2">{p.position || '-'}</td>
                      <td className="py-2 pr-2 text-xs">{p.isCaptain ? 'C ' : ''}{p.isLibero ? 'L' : ''}</td>
                      <td className="py-2 text-right"><div className="flex gap-2 justify-end"><Button variant="secondary" size="sm" onClick={() => openEdit(p)}><Edit3 className="w-4 h-4" /></Button><Button variant="danger" size="sm" onClick={() => { if (confirm('Delete player?')) delMut.mutate(p.id); }}><Trash2 className="w-4 h-4" /></Button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {players.length > visibleCount && <div className="pt-3 flex justify-center"><Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + 80)}>Show more ({players.length - visibleCount} remaining)</Button></div>}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{editing?.id ? 'Edit Player' : 'Create Player'}</CardTitle></CardHeader>
            {!editing && <div className="text-sm text-fg-subtle">Select a player or click Add Player.</div>}
            {editing && (
              <div className="space-y-3">
                <div><Label>Team</Label><Select value={form.teamId || ''} onChange={e => setForm({ ...form, teamId: e.target.value })}><option value="">No team</option>{teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>
                <div className="grid grid-cols-2 gap-2"><div><Label>First name</Label><Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></div><div><Label>Last name</Label><Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></div></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Jersey #</Label><Input type="number" value={form.jerseyNumber} onChange={e => setForm({ ...form, jerseyNumber: e.target.value })} /></div>
                  <div><Label>Height cm</Label><Input type="number" value={form.heightCm} onChange={e => setForm({ ...form, heightCm: e.target.value })} /></div>
                  <div><Label>Position</Label><Select value={form.position || ''} onChange={e => setForm({ ...form, position: e.target.value })}><option value="">-</option>{['OH', 'MB', 'S', 'OPP', 'L', 'DS'].map(p => <option key={p} value={p}>{p}</option>)}</Select></div>
                </div>
                <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.isCaptain} onChange={e => setForm({ ...form, isCaptain: e.target.checked })} />Captain</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.isLibero} onChange={e => setForm({ ...form, isLibero: e.target.checked, position: e.target.checked ? 'L' : form.position })} />Libero</label></div>
                <ImageUpload label="Player photo" scope="player-photo" aspect={3 / 4} previewShape="portrait" value={form.photo} onChange={photo => setForm({ ...form, photo })} />
                <div className="flex gap-2"><Button variant="primary" onClick={() => saveMut.mutate()} isLoading={saveMut.isPending}>Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader><CardTitle>Bulk paste players</CardTitle></CardHeader>
            <div className="space-y-2">
              <Label>Target team</Label>
              <Select value={bulkTeam} onChange={e => setBulkTeam(e.target.value)}><option value="">Select team</option>{teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} className="h-28 text-xs font-mono" placeholder={`7, K. Mensah, OH\n12\tJ. Doe\tL`} />
              <Button variant="secondary" onClick={bulkCreate}>Import to team</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
