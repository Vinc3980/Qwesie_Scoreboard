import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3, Search } from 'lucide-react';
import { competitionsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { ImageUpload } from '../components/ui/ImageUpload.js';
import { Avatar } from '../components/ui/Avatar.js';
import { useNotification } from '../contexts/NotificationContext.js';

const DEFAULT_RULE = { preset: 'fivb', win3_0: 3, win3_1: 3, win3_2: 2, loss2_3: 1, loss1_3: 0, loss0_3: 0, forfeitWin: 3, forfeitLoss: 0 };
const DEFAULT_CFG = { tieBreakOrder: ['points','wins','setRatio','pointRatio','headToHead'], qualificationZones: [] as any[] };

export const CompetitionsPage: React.FC = () => {
  const notify = useNotification(); const qc = useQueryClient();
  const [q, setQ] = useState(''); const [editing, setEditing] = useState<any|null>(null);
  const [form, setForm] = useState<any>({ name:'', season:'', organizer:'', description:'', logo: null, pointsRule: { ...DEFAULT_RULE }, standingsConfig: { ...DEFAULT_CFG } });
  const listQ = useQuery({ queryKey:['competitions'], queryFn: competitionsApi.list });
  const items = (listQ.data||[]).filter((c:any)=>`${c.name} ${c.season||''}`.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({ mutationFn: async()=> {
    const payload = { ...form, logoKey: form.logo?.key ?? (form.logo === null ? null : undefined), logoThumbKey: form.logo?.thumbKey ?? (form.logo === null ? null : undefined), logoUrl: form.logo?.key ? undefined : (form.logo?.url ?? (form.logo === null ? null : undefined)) };
    delete payload.logo;
    return editing?.id ? competitionsApi.update(editing.id, payload) : competitionsApi.create(payload);
  }, onSuccess: ()=>{ qc.invalidateQueries({queryKey:['competitions']}); notify.success(editing?.id?'Competition updated':'Competition created'); setEditing(null); setForm({name:'',season:'',organizer:'',description:'', logo:null, pointsRule:{...DEFAULT_RULE}, standingsConfig:{...DEFAULT_CFG}}); }, onError:(e:Error)=>notify.error(e.message) });
  const delMut = useMutation({ mutationFn:(id:string)=>competitionsApi.remove(id), onSuccess:()=>{ qc.invalidateQueries({queryKey:['competitions']}); notify.success('Competition deleted'); }, onError:(e:Error)=>notify.error(e.message) });
  const pr = form.pointsRule || DEFAULT_RULE;
  const cfg = form.standingsConfig || DEFAULT_CFG;

  const openEdit = (c:any) => {
    setEditing(c);
    setForm({ name:c.name||'', season:c.season||'', organizer:c.organizer||'', description:c.description||'', logo: c.logoUrl || c.logoKey ? { url: c.logoUrl, thumbUrl: c.logoThumbUrl || c.logoUrl, key: c.logoKey, thumbKey: c.logoThumbKey } : null, pointsRule: { ...DEFAULT_RULE, ...(c.pointsRule||{}) }, standingsConfig: { ...DEFAULT_CFG, ...(c.standingsConfig||{}), qualificationZones: c.standingsConfig?.qualificationZones || [] } });
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Structure" title="Competitions" description="Organize competitions, points rules, and tie-breaks for standings." actions={<Button variant="primary" onClick={()=>{setEditing({}); setForm({name:'',season:'',organizer:'',description:'', logo:null, pointsRule:{...DEFAULT_RULE}, standingsConfig:{...DEFAULT_CFG, qualificationZones:[]}});}}><Plus className="w-4 h-4"/>New Competition</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Competition & Tournament List</CardTitle><div className="relative w-full md:w-72"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"/><Input className="pl-9" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} /></div></CardHeader>
          {listQ.isLoading && <div className="text-sm text-fg-subtle">Loading...</div>}
          {listQ.error && <div className="text-sm text-danger">{(listQ.error as Error).message}</div>}
          {!listQ.isLoading && items.length===0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-xl">No competitions yet. Create one to use in match setup.</div>}
          <div className="space-y-3">
            {items.map((c:any)=>(
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-subtle/40">
                <div className="flex items-center gap-3 min-w-0"><Avatar src={c.logoThumbUrl || c.logoUrl} name={c.name} size={36} /><div className="min-w-0"><div className="font-semibold text-fg truncate">{c.name}</div><div className="text-xs text-fg-subtle">{c.season || 'Season n/a'} � {c._count?.matches ?? 0} matches � {c.pointsRule?.preset || 'fivb'}</div></div></div>
                <div className="flex gap-2 shrink-0"><Button variant="secondary" size="sm" onClick={()=>openEdit(c)}><Edit3 className="w-4 h-4"/>Edit</Button><Button variant="danger" size="sm" onClick={()=>{if(confirm('Delete competition?')) delMut.mutate(c.id);}}><Trash2 className="w-4 h-4"/></Button></div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>{editing?.id?'Edit Competition':'Create Competition'}</CardTitle></CardHeader>
          {!editing && <div className="text-sm text-fg-subtle">Select a competition or click New Competition.</div>}
          {editing && (
            <div className="space-y-3 max-h-[70vh] overflow-auto pr-1">
              <div><Label>Competition logo</Label><ImageUpload value={form.logo} scope="team-logo" aspect={1} previewShape="square" onChange={(logo)=>setForm({...form, logo})} helpText="JPEG/PNG/WebP, max 5MB." /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
              <div><Label>Season</Label><Input value={form.season||''} onChange={e=>setForm({...form,season:e.target.value})} placeholder="2026" /></div>
              <div><Label>Organizer</Label><Input value={form.organizer||''} onChange={e=>setForm({...form,organizer:e.target.value})} /></div>
              <div><Label>Description</Label><Input value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} /></div>
              <div className="border-t border-border pt-3"><div className="text-sm font-semibold text-fg mb-2">Points rule</div>
                <Label>Preset</Label>
                <Select value={pr.preset||'fivb'} onChange={e=>{ const preset=e.target.value; const next = preset==='simple2' ? {...pr,preset,win3_0:2,win3_1:2,win3_2:2,loss2_3:0,loss1_3:0,loss0_3:0,forfeitWin:2,forfeitLoss:0} : preset==='simple3' ? {...pr,preset,win3_0:3,win3_1:3,win3_2:3,loss2_3:0,loss1_3:0,loss0_3:0,forfeitWin:3,forfeitLoss:0} : {...pr,preset,win3_0:3,win3_1:3,win3_2:2,loss2_3:1,loss1_3:0,loss0_3:0,forfeitWin:3,forfeitLoss:0}; setForm({...form, pointsRule: next}); }}>
                  <option value="fivb">FIVB (3-0/3-1=3, 3-2=2, 2-3=1)</option>
                  <option value="simple3">Simple 3/0</option>
                  <option value="simple2">Simple 2/0</option>
                  <option value="custom">Custom</option>
                </Select>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  {([['win3_0','3-0 win'],['win3_1','3-1 win'],['win3_2','3-2 win'],['loss2_3','2-3 loss'],['loss1_3','1-3 loss'],['loss0_3','0-3 loss']] as const).map(([k,label])=> (
                    <label key={k} className="flex items-center gap-1"><span className="w-14 text-fg-muted">{label}</span><Input type="number" min={0} max={10} value={pr[k]} onChange={e=>setForm({...form, pointsRule:{...pr, preset:'custom', [k]: Number(e.target.value)}})} /></label>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-3"><div className="text-sm font-semibold text-fg mb-2">Tie-break order</div>
                <div className="text-xs text-fg-muted mb-2">Comma-separated: points,wins,setRatio,pointRatio,headToHead</div>
                <Input value={(cfg.tieBreakOrder||DEFAULT_CFG.tieBreakOrder).join(',')} onChange={e=>setForm({...form, standingsConfig:{...cfg, tieBreakOrder: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}})} />
              </div>
              <div className="border-t border-border pt-3"><div className="text-sm font-semibold text-fg mb-2">Qualification zones</div>
                <div className="text-xs text-fg-muted mb-2">One per line: toRank|label|#color</div>
                <textarea className="w-full min-h-[72px] rounded-xl border border-border bg-surface-sunken px-3 py-2 text-sm text-fg" value={(cfg.qualificationZones||[]).map((z:any)=>`${z.toRank}|${z.label}|${z.color||'#22c55e'}`).join('\n')} onChange={e=>{ const zones = e.target.value.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{ const [r,label,color]=l.split('|'); return { toRank:Number(r)||1, label:label||'Zone', color:color||'#22c55e' }; }); setForm({...form, standingsConfig:{...cfg, qualificationZones: zones}}); }} />
              </div>
              <div className="flex gap-2"><Button variant="primary" onClick={()=>saveMut.mutate()} isLoading={saveMut.isPending}>Save</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
