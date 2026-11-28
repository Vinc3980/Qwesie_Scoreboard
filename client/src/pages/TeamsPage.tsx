import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Palette, Plus, Search, Trash2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { teamsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Textarea } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { ImageUpload, type ImageValue } from '../components/ui/ImageUpload.js';
import { Avatar } from '../components/ui/Avatar.js';
import { BulkPhotoUpload } from '../components/BulkPhotoUpload.js';

function imgVal(obj: any, key: string, thumbKey: string, urlKey: string, thumbUrlKey?: string): ImageValue | null {
  const k = obj?.[key]; const tk = obj?.[thumbKey]; const u = obj?.[urlKey]; const tu = thumbUrlKey ? obj?.[thumbUrlKey] : null;
  if (!k && !u) return null;
  return { key: k || null, thumbKey: tk || null, url: u || null, thumbUrl: tu || u || null };
}

function ScorebugPreview({ team }: { team: any }) {
  const bg = team.primaryColor || 'rgb(15,23,42)';
  const text = team.textColor || 'rgb(255,255,255)';
  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs font-bold">
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: bg, color: text }}>
        <Avatar src={team.logoThumbUrl || team.logoUrl} name={team.shortName || team.name} size={24} color="rgba(255,255,255,0.2)" textColor={text} rounded="md" />
        <span>{team.shortName || team.code || team.name?.slice(0, 4) || 'TEAM'}</span>
        <span className="ml-auto bg-black/30 px-2 py-0.5 rounded">12</span>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  name: '', shortName: '', code: '', city: '', country: '',
  logo: null as ImageValue | null,
  coachName: '', assistantCoachName: '', managerName: '',
  coachPhoto: null as ImageValue | null,
  teamPhoto: null as ImageValue | null,
  primaryColor: '#0ea5e9', secondaryColor: '#0369a1', textColor: '#ffffff',
});

export const TeamsPage: React.FC = () => {
  const notify = useNotification(); const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<any>(null);

  const teamsQ = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const teams = (teamsQ.data || []).filter((t: any) => `${t.name} ${t.shortName || ''} ${t.code || ''}`.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name, shortName: form.shortName, code: form.code || null, city: form.city || null, country: form.country || null,
        logoKey: form.logo?.key || null, logoThumbKey: form.logo?.thumbKey || null, logoUrl: form.logo?.key ? null : (form.logo?.url || null),
        coachName: form.coachName || null, assistantCoachName: form.assistantCoachName || null, managerName: form.managerName || null,
        coachPhotoKey: form.coachPhoto?.key || null, coachPhotoThumbKey: form.coachPhoto?.thumbKey || null,
        teamPhotoKey: form.teamPhoto?.key || null, teamPhotoThumbKey: form.teamPhoto?.thumbKey || null,
        primaryColor: form.primaryColor, secondaryColor: form.secondaryColor, textColor: form.textColor,
      };
      return editing?.id ? teamsApi.update(editing.id, payload) : teamsApi.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); notify.success(editing?.id ? 'Team updated' : 'Team created'); setEditing(null); setForm(emptyForm()); },
    onError: (e: Error) => notify.error(e.message),
  });
  const delMut = useMutation({ mutationFn: (id: string) => teamsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); notify.success('Team deleted'); }, onError: (e: Error) => notify.error(e.message) });

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name || '', shortName: t.shortName || '', code: t.code || '', city: t.city || '', country: t.country || '',
      logo: imgVal(t, 'logoKey', 'logoThumbKey', 'logoUrl', 'logoThumbUrl'),
      coachName: t.coachName || '', assistantCoachName: t.assistantCoachName || '', managerName: t.managerName || '',
      coachPhoto: imgVal(t, 'coachPhotoKey', 'coachPhotoThumbKey', 'coachPhotoUrl', 'coachPhotoThumbUrl'),
      teamPhoto: imgVal(t, 'teamPhotoKey', 'teamPhotoThumbKey', 'teamPhotoUrl', 'teamPhotoThumbUrl'),
      primaryColor: t.primaryColor || '#0ea5e9', secondaryColor: t.secondaryColor || '#0369a1', textColor: t.textColor || '#ffffff',
    });
  };

  const runBulk = async (dryRun: boolean) => {
    if (!editing?.id) return notify.error('Select/save a team first');
    try { const res = await teamsApi.bulkPlayers(editing.id, { text: bulkText, dryRun }); setBulkPreview(res.parsed || res); if (!dryRun) { notify.success(`Created ${res.createdCount || 0} players`); qc.invalidateQueries({ queryKey: ['teams'] }); setBulkText(''); } } catch (e: any) { notify.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Registry" title="Teams" description="Manage team profiles, branding, coaches, and rosters used across competitions and matches." actions={<div className="flex gap-2"><Link to="/matches/blank/team-sheet?blank=1"><Button variant="outline"><FileText className="w-4 h-4" />Blank team sheet</Button></Link><Button variant="primary" onClick={() => { setEditing({}); setForm(emptyForm()); }}><Plus className="w-4 h-4" />Register Team</Button></div>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Team Directory</CardTitle>
            <div className="relative w-full md:w-72"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" /><Input className="pl-9" placeholder="Search teams" value={q} onChange={e => setQ(e.target.value)} /></div>
          </CardHeader>
          {teamsQ.isLoading && <div className="text-sm text-fg-subtle">Loading teams...</div>}
          {teamsQ.error && <div className="text-sm text-danger">{(teamsQ.error as Error).message}</div>}
          {!teamsQ.isLoading && teams.length === 0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-xl">No teams yet. Create your first team to start match setup.</div>}
          <div className="space-y-3">
            {teams.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-subtle/40">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={t.logoThumbUrl || t.logoUrl} name={t.shortName || t.name} size={40} color={t.primaryColor} textColor={t.textColor} rounded="lg" />
                  <div className="min-w-0">
                    <div className="font-semibold text-fg truncate">{t.name}</div>
                    <div className="text-xs text-fg-subtle">{t.shortName || t.code || '-'} • {t._count?.players ?? 0} players{t.coachName ? ` • Coach ${t.coachName}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(t)}><Edit3 className="w-4 h-4" />Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => { if (confirm('Delete team?')) delMut.mutate(t.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>{editing?.id ? 'Edit Team' : 'Create Team'}</CardTitle></CardHeader>
          {!editing && <div className="text-sm text-fg-subtle">Select a team to edit or click Register Team.</div>}
          {editing && (
            <div className="space-y-3">
              <div><Label>Team name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>Short name</Label><Input value={form.shortName} onChange={e => setForm({ ...form, shortName: e.target.value.toUpperCase().slice(0, 4) })} /></div><div><Label>Code</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>City</Label><Input value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} /></div><div><Label>Country</Label><Input value={form.country || ''} onChange={e => setForm({ ...form, country: e.target.value })} /></div></div>
              <ImageUpload label="Team logo" scope="team-logo" aspect={1} previewShape="square" value={form.logo} onChange={logo => setForm({ ...form, logo })} />
              <div className="grid grid-cols-1 gap-2">
                <div><Label>Coach name</Label><Input value={form.coachName || ''} onChange={e => setForm({ ...form, coachName: e.target.value })} /></div>
                <div><Label>Assistant coach</Label><Input value={form.assistantCoachName || ''} onChange={e => setForm({ ...form, assistantCoachName: e.target.value })} /></div>
                <div><Label>Manager</Label><Input value={form.managerName || ''} onChange={e => setForm({ ...form, managerName: e.target.value })} /></div>
              </div>
              <ImageUpload label="Coach photo" scope="team-coach" aspect={1} previewShape="square" value={form.coachPhoto} onChange={coachPhoto => setForm({ ...form, coachPhoto })} />
              <ImageUpload label="Team photo" scope="team-photo" aspect={16 / 9} previewShape="landscape" value={form.teamPhoto} onChange={teamPhoto => setForm({ ...form, teamPhoto })} />
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Primary</Label><Input type="color" value={form.primaryColor || '#0ea5e9'} onChange={e => setForm({ ...form, primaryColor: e.target.value })} /></div>
                <div><Label>Secondary</Label><Input type="color" value={form.secondaryColor || '#0369a1'} onChange={e => setForm({ ...form, secondaryColor: e.target.value })} /></div>
                <div><Label>Text</Label><Input type="color" value={form.textColor || '#ffffff'} onChange={e => setForm({ ...form, textColor: e.target.value })} /></div>
              </div>
              <div><Label><Palette className="inline w-3.5 h-3.5 mr-1" />Live scorebug preview</Label><ScorebugPreview team={{ ...form, logoUrl: form.logo?.url, logoThumbUrl: form.logo?.thumbUrl }} /></div>
              <div className="flex gap-2 pt-2"><Button variant="primary" onClick={() => saveMut.mutate()} isLoading={saveMut.isPending}>Save team</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>

              {editing.id && (
                <>
                  <div className="pt-3 border-t border-border space-y-2">
                    <Label>Bulk paste players (per line: "7, K. Mensah, OH")</Label>
                    <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} className="h-28 text-xs font-mono" />
                    <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" onClick={() => runBulk(true)}>Dry-run preview</Button><Button variant="secondary" size="sm" onClick={() => runBulk(false)}>Import players</Button></div>
                    {bulkPreview && <div className="text-xs text-fg-subtle">Parsed: {bulkPreview.validCount} valid, {bulkPreview.errorCount} errors{Array.isArray(bulkPreview.rows) && bulkPreview.rows.some((r: any) => !r.valid) ? ` — ${bulkPreview.rows.filter((r: any) => !r.valid).slice(0, 3).map((r: any) => r.raw + ': ' + r.errors.join(';')).join(' | ')}` : ''}</div>}
                  </div>
                  <BulkPhotoUpload teamId={editing.id} teamColor={form.primaryColor} teamTextColor={form.textColor} />
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
