import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3, Search } from 'lucide-react';
import { competitionsApi } from '../services/api.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Card, CardHeader, CardTitle } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label } from '../components/ui/Input.js';
import { useNotification } from '../contexts/NotificationContext.js';

export const CompetitionsPage: React.FC = () => {
  const notify = useNotification(); const qc = useQueryClient();
  const [q, setQ] = useState(''); const [editing, setEditing] = useState<any|null>(null);
  const [form, setForm] = useState<any>({ name:'', season:'', organizer:'', description:'' });
  const listQ = useQuery({ queryKey:['competitions'], queryFn: competitionsApi.list });
  const items = (listQ.data||[]).filter((c:any)=>`${c.name} ${c.season||''}`.toLowerCase().includes(q.toLowerCase()));

  const saveMut = useMutation({ mutationFn: async()=> editing?.id ? competitionsApi.update(editing.id, form) : competitionsApi.create(form), onSuccess: ()=>{ qc.invalidateQueries({queryKey:['competitions']}); notify.success(editing?.id?'Competition updated':'Competition created'); setEditing(null); setForm({name:'',season:'',organizer:'',description:''}); }, onError:(e:Error)=>notify.error(e.message) });
  const delMut = useMutation({ mutationFn:(id:string)=>competitionsApi.remove(id), onSuccess:()=>{ qc.invalidateQueries({queryKey:['competitions']}); notify.success('Competition deleted'); }, onError:(e:Error)=>notify.error(e.message) });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Structure" title="Competitions" description="Organize competitions and tournaments and group fixtures for production operations." actions={<Button variant="primary" onClick={()=>{setEditing({}); setForm({name:'',season:'',organizer:'',description:''});}}><Plus className="w-4 h-4"/>New Competition</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Competition & Tournament List</CardTitle><div className="relative w-full md:w-72"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"/><Input className="pl-9" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} /></div></CardHeader>
          {listQ.isLoading && <div className="text-sm text-fg-subtle">Loading...</div>}
          {listQ.error && <div className="text-sm text-danger">{(listQ.error as Error).message}</div>}
          {!listQ.isLoading && items.length===0 && <div className="text-sm text-fg-subtle py-10 text-center border border-dashed border-border rounded-xl">No competitions yet. Create one to use in match setup.</div>}
          <div className="space-y-3">
            {items.map((c:any)=>(
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-subtle/40">
                <div className="min-w-0"><div className="font-semibold text-fg truncate">{c.name}</div><div className="text-xs text-fg-subtle">{c.season || 'Season n/a'} • {c._count?.matches ?? 0} matches</div></div>
                <div className="flex gap-2 shrink-0"><Button variant="secondary" size="sm" onClick={()=>{setEditing(c); setForm({name:c.name||'',season:c.season||'',organizer:c.organizer||'',description:c.description||''});}}><Edit3 className="w-4 h-4"/>Edit</Button><Button variant="danger" size="sm" onClick={()=>{if(confirm('Delete competition?')) delMut.mutate(c.id);}}><Trash2 className="w-4 h-4"/></Button></div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>{editing?.id?'Edit Competition':'Create Competition'}</CardTitle></CardHeader>
          {!editing && <div className="text-sm text-fg-subtle">Select a competition or click New Competition.</div>}
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></div>
              <div><Label>Season</Label><Input value={form.season||''} onChange={e=>setForm({...form,season:e.target.value})} placeholder="2026" /></div>
              <div><Label>Organizer</Label><Input value={form.organizer||''} onChange={e=>setForm({...form,organizer:e.target.value})} /></div>
              <div><Label>Description</Label><Input value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} /></div>
              <div className="flex gap-2"><Button variant="primary" onClick={()=>saveMut.mutate()} isLoading={saveMut.isPending}>Save</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
