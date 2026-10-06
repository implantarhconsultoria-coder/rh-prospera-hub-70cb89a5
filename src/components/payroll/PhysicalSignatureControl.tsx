import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const brDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const compLabel = (value?: string | null) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : String(value || '');
};

type PendingDoc = { id:string; document_type:string; competencia:string; label:string; date?:string|null; date_label?:string|null };
type EmployeeRow = { id:string; name:string; phone:string; pending:PendingDoc[]; reminder_count:number; last_reminder_at?:string|null; can_remind_again:boolean };

const api = async (payload:Record<string,unknown>) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const response = await fetch('/api/payroll-physical-signature', {
    method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${token}` }, body:JSON.stringify(payload),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || `Falha ${response.status}`), { payload:result });
  return result;
};

const PhysicalSignatureControl:React.FC<{companyId:string}> = ({ companyId }) => {
  const [rows,setRows] = useState<EmployeeRow[]>([]);
  const [loading,setLoading] = useState(false);
  const [working,setWorking] = useState('');
  const [selected,setSelected] = useState<Record<string,string[]>>({});

  const load = async (silent=false) => {
    if (!companyId) return;
    if (!silent) setLoading(true);
    try {
      const result = await api({action:'list',company_id:companyId});
      setRows(result.employees || []);
      setSelected(current => {
        const next={...current};
        for(const row of result.employees || []) {
          const valid=new Set(row.pending.map((d:PendingDoc)=>d.id));
          next[row.id]=(next[row.id] || []).filter(id=>valid.has(id));
        }
        return next;
      });
    } catch(error:any) { if(!silent) toast.error(error?.message || 'Não foi possível carregar as assinaturas físicas.'); }
    finally { if(!silent) setLoading(false); }
  };

  useEffect(()=>{ void load(); const timer=window.setInterval(()=>void load(true),15000); return()=>window.clearInterval(timer); },[companyId]);

  const totalDocs=useMemo(()=>rows.reduce((sum,row)=>sum+row.pending.length,0),[rows]);

  const toggleDoc=(employeeId:string,docId:string)=>setSelected(current=>{
    const active=current[employeeId] || [];
    return {...current,[employeeId]:active.includes(docId)?active.filter(id=>id!==docId):[...active,docId]};
  });

  const remind = async (row:EmployeeRow, force=false) => {
    setWorking(`remind:${row.id}`);
    try {
      const result=await api({action:'prepare-reminder',company_id:companyId,employee_id:row.id,force});
      const opened=window.open(result.whatsapp_url,'_blank','noopener,noreferrer');
      if(!opened) {
        try { await navigator.clipboard.writeText(result.message); toast.success('Mensagem copiada. Abra o WhatsApp e envie ao funcionário.'); }
        catch { window.prompt('Copie a mensagem para o WhatsApp:',result.message); }
      } else toast.success(result.attempt>1?'Novo aviso preparado no WhatsApp.':'Aviso preparado no WhatsApp.');
      await load(true);
    } catch(error:any) {
      if(error?.message==='reminder_already_prepared_today') toast.info('Este funcionário já recebeu/preparou aviso hoje. Amanhã o botão vira “Avisar novamente”.');
      else toast.error(error?.message || 'Não foi possível preparar o aviso.');
    } finally { setWorking(''); }
  };

  const signoff = async (row:EmployeeRow) => {
    const ids=selected[row.id] || [];
    if(!ids.length) return toast.info('Marque os documentos que foram assinados no papel.');
    const labels=row.pending.filter(d=>ids.includes(d.id)).map(d=>d.label).join(', ');
    if(!window.confirm(`Confirmar assinatura física de ${row.name}?\n\n${labels}`)) return;
    setWorking(`sign:${row.id}`);
    try {
      await api({action:'physical-signoff',company_id:companyId,employee_id:row.id,document_ids:ids});
      toast.success('Baixa física registrada. Esses documentos não entrarão no próximo aviso.');
      setSelected(current=>({...current,[row.id]:[]}));
      await load();
    } catch(error:any) { toast.error(error?.message || 'Não foi possível dar baixa.'); }
    finally { setWorking(''); }
  };

  return <div className="rounded-xl border border-violet-500/30 bg-violet-500/[.05] p-4 space-y-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-300"><BellRing className="h-4 w-4"/>Assinatura no escritório · avisos WhatsApp</p>
        <p className="mt-1 text-xs text-muted-foreground">A mensagem é individual e lista somente os documentos ainda sem assinatura. Cartão de Ponto acompanha o pagamento. Depois da baixa, o item sai automaticamente do próximo aviso.</p>
      </div>
      <div className="flex items-center gap-2"><Badge variant="outline">{rows.length} funcionário(s)</Badge><Badge variant="outline">{totalDocs} documento(s)</Badge><Button size="sm" variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-1 h-3 w-3 ${loading?'animate-spin':''}`}/>Atualizar</Button></div>
    </div>

    {!rows.length && !loading && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[.05] p-4 text-sm text-emerald-300"><CheckCircle2 className="mr-2 inline h-4 w-4"/>Nenhuma assinatura física pendente nesta empresa.</div>}

    <div className="space-y-3">{rows.map(row=>{
      const checked=selected[row.id] || [];
      const busy=working.endsWith(row.id);
      return <div key={row.id} className="rounded-xl border bg-background/55 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0"><div className="font-bold">{row.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{row.phone ? `WhatsApp final ${row.phone.slice(-4)}` : 'Telefone não cadastrado'}{row.last_reminder_at ? ` · Último aviso: ${brDateTime(row.last_reminder_at)} · ${row.reminder_count} aviso(s)` : ' · Ainda não avisado'}</div></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !row.phone || (!row.can_remind_again && row.reminder_count>0)} onClick={()=>void remind(row)}><Send className="mr-1 h-3 w-3"/>{row.reminder_count===0?'Avisar':row.can_remind_again?'Avisar novamente':'Avisado hoje'}</Button>
            <Button size="sm" disabled={busy || checked.length===0} onClick={()=>void signoff(row)}><CheckCircle2 className="mr-1 h-3 w-3"/>Dar baixa ({checked.length})</Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{row.pending.map(doc=>{
          const isChecked=checked.includes(doc.id);
          return <label key={doc.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs ${isChecked?'border-emerald-500/40 bg-emerald-500/[.06]':'border-border'}`}>
            <input type="checkbox" checked={isChecked} onChange={()=>toggleDoc(row.id,doc.id)} className="mt-0.5 h-4 w-4 accent-emerald-500"/>
            <span><b>{doc.label}</b><br/><span className="text-muted-foreground">{doc.date_label ? doc.date_label : `Competência ${compLabel(doc.competencia)}`}</span>{doc.document_type==='HOLERITE'&&<><br/><span className="text-cyan-300">+ Cartão de Ponto do fechamento</span></>}</span>
          </label>})}</div>
      </div>})}</div>
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground"><Clock3 className="mt-0.5 h-3 w-3 shrink-0"/><span>Regra de cobrança: depois de um aviso, o botão fica como “Avisado hoje”. Se no próximo dia ainda houver documento pendente, muda automaticamente para “Avisar novamente” e a nova mensagem leva apenas o que ainda falta assinar.</span></div>
  </div>;
};

export default PhysicalSignatureControl;
