import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Edit3, Upload, Palette } from 'lucide-react';
import { teamsApi, uploadsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Textarea } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { Badge } from '../components/ui/Badge.js';

function ScorebugPreview({ team }: { team: any }) {
  const bg = team.primaryColor || 'rgb(15,23,42)';
  const text = team.textColor || 'rgb(255,255,255)';
  return (
    <div className="rounded-lg border border-border overflow-hidden text-xs font-bold">
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: bg, color: text }}>
        {team.logoUrl ? <img src={team.logoUrl} alt="" className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 rounded bg-surface/20" />}
        <span>{team.shortName || team.code || team.name?.slice(0,4) || 'TEAM'}</span>
        <span className="ml-auto bg-black/30 px-2 py-0.5 rounded">12</span>
      </div>
    </div>
  );
}

export const TeamsPage: React.FC = () => {
  const notify = useNotification(); const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: '', shortName: '', code: '', city: '', country: '', logoUrl: '', primaryColor: 'rgb(14,165,233)', secondaryColor: 'rgb(3,105,161)', textColor: 'rgb(255,255,255)' });
  const [bulkText, setBulkText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<any>(null);

  const teamsQ = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const teams = (teamsQ.data || []).filter((t: any) => `${t.name} ${t.shortName||''} ${t.code||''}`.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({
    mutationFn: async () => editing?.id ? teamsApi.update(editing.id, form) : teamsApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); notify.success(editing?.id ? 'Team updated' : 'Team created'); setEditing(null); setForm({ name: '', shortName: '', code: '', city: '', country: '', logoUrl: '', primaryColor: 'rgb(14,165,233)', secondaryColor: 'rgb(3,105,161)', textColor: 'rgb(255,255,255)' }); },
    onError: (e: Error) => notify.error(e.message),
  });
  const delMut = useMutation({ mutationFn: (id: string) => teamsApi.remove(id), onSuccess: () => { qc.invalidateQueries({queryKey:['teams']}); notify.success('Team deleted'); }, onError: (e:Error)=>notify.error(e.message) });

  const openEdit = (t: any) => { setEditing(t); setForm({ name: t.name||'', shortName: t.shortName||'', code: t.code||'', city: t.city||'', country: t.country||'', logoUrl: t.logoUrl||'', primaryColor: t.primaryColor||'rgb(14,165,233)', secondaryColor: t.secondaryColor||'rgb(3,105,161)', textColor: t.textColor||'rgb(255,255,255)' }); };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    try { const up = await uploadsApi.upload(file); setForm((f:any)=>({ ...f, logoUrl: up.url })); notify.success('Logo uploaded'); } catch(e:any){ notify.error(e.message); }
  };

  const runBulk = async (dryRun: boolean) => {
    if (!editing?.id) return notify.error('Select/save a team first');
    try { const res = await teamsApi.bulkPlayers(editing.id, { text: bulkText, dryRun }); setBulkPreview(res.parsed || res); if (!dryRun) { notify.success(`Created ${res.createdCount || 0} players`); qc.invalidateQueries({queryKey:['teams']}); setBulkText(''); } } catch(e:any){ notify.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Registry" title="Teams" description="Manage team profiles, branding, and rosters used across competitions and matches." actions={<Button variant="primary" onClick={()=>{setEditing({}); setForm({ name:'', shortName:'', code:'', city:'', country:'', logoUrl:'', primaryColor:'rgb(14,165,233)', secondaryColor:'rgb(3,105,161)', textColor:'rgb(255,255,255)'});}}><Plus className="w-4 h-4"/>Register Team</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Team Directory</CardTitle>
            <div className="relative w-full md:w-72"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"/><Input className="pl-9" placeholder="Search teams" value={q} onChange={e=>setQ(e.target.value)} /></div>
          </CardHeader>
          {teamsQ.isLoading && <div className="text-sm text-fg-subtle">Loading teams...</div>}
          {teamsQ.error && <div className="text-sm text-danger">{(teamsQ.error as Error).message}</div>}
          {!teamsQ.isLoading && teams.length===0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-xl">No teams yet. Create your first team to start match setup.</div>}
          <div className="space-y-3">
            {teams.map((t:any)=>(
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-subtle/40">
                <div className="flex items-center gap-3 min-w-0">
                  {t.logoUrl ? <img src={t.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface/5"/> : <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-fg" style={{ background: t.primaryColor || 'var(--app-surface-sunken)', color: t.primaryColor ? (t.textColor || '#ffffff') : 'var(--app-foreground)' }}>{(t.shortName||t.name||'?').slice(0,3)}</div>}
                  <div className="min-w-0">
                    <div className="font-semibold text-fg truncate">{t.name}</div>
                    <div className="text-xs text-fg-subtle">{t.shortName || t.code || '-'} • {t._count?.players ?? 0} players</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={()=>openEdit(t)}><Edit3 className="w-4 h-4"/>Edit</Button>
                  <Button variant="danger" size="sm" onClick={()=>{ if(confirm('Delete team?')) delMut.mutate(t.id); }}><Trash2 className="w-4 h-4"/></Button>
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
              <div><Label>Team name</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>Short name</Label><Input value={form.shortName} onChange={e=>setForm({...form,shortName:e.target.value.toUpperCase().slice(0,4)})} /></div><div><Label>Code</Label><Input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} /></div></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>City</Label><Input value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})} /></div><div><Label>Country</Label><Input value={form.country||''} onChange={e=>setForm({...form,country:e.target.value})} /></div></div>
              <div><Label>Logo</Label><div className="flex items-center gap-2"><Input value={form.logoUrl||''} onChange={e=>setForm({...form,logoUrl:e.target.value})} placeholder="/uploads/..." /><label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border-strong cursor-pointer text-sm"><Upload className="w-4 h-4"/>Upload<input type="file" className="hidden" accept="image/*" onChange={e=>uploadLogo(e.target.files?.[0])}/></label></div></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Primary</Label><Input type="color" value={form.primaryColor||'rgb(14,165,233)'} onChange={e=>setForm({...form,primaryColor:e.target.value})} /></div>
                <div><Label>Secondary</Label><Input type="color" value={form.secondaryColor||'rgb(3,105,161)'} onChange={e=>setForm({...form,secondaryColor:e.target.value})} /></div>
                <div><Label>Text</Label><Input type="color" value={form.textColor||'rgb(255,255,255)'} onChange={e=>setForm({...form,textColor:e.target.value})} /></div>
              </div>
              <div><Label><Palette className="inline w-3.5 h-3.5 mr-1"/>Live scorebug preview</Label><ScorebugPreview team={form} /></div>
              <div className="flex gap-2 pt-2"><Button variant="primary" onClick={()=>saveMut.mutate()} isLoading={saveMut.isPending}>Save team</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div>

              {editing.id && (
                <div className="pt-3 border-t border-border space-y-2">
                  <Label>Bulk paste players (per line: "7, K. Mensah, OH")</Label>
                  <Textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} className="h-28 text-xs font-mono" />
                  <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" onClick={()=>runBulk(true)}>Dry-run preview</Button><Button variant="secondary" size="sm" onClick={()=>runBulk(false)}>Import players</Button></div>
                  {bulkPreview && <div className="text-xs text-fg-subtle">Parsed: {bulkPreview.validCount} valid, {bulkPreview.errorCount} errors{Array.isArray(bulkPreview.rows) && bulkPreview.rows.some((r:any)=>!r.valid) ? ` — ${bulkPreview.rows.filter((r:any)=>!r.valid).slice(0,3).map((r:any)=>r.raw+': '+r.errors.join(';')).join(' | ')}`:''}</div>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
