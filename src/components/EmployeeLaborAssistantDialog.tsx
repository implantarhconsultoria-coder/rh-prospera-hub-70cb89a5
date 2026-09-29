import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Brain, CalendarClock, FileText, Gavel, Loader2, Plus, RefreshCw, Search, ShieldAlert, Stethoscope } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type EmployeeLike = {
  id: string;
  name: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
  status?: string | null;
};

type AtestadoRow = {
  id: string;
  data_inicio: string | null;
  data_fim: string | null;
  dias_cobertos: number;
  status: string;
  created_at: string;
};

type OcorrenciaRow = {
  id: string;
  data_ocorrencia: string;
  tipo: string;
  descricao: string;
  medida: string;
  motivo_decisao?: string | null;
  testemunhas?: string | null;
  evidencias?: string | null;
  status: string;
  created_by_nome?: string | null;
  created_at: string;
};

type PontoRow = {
  data: string;
  tipo: string;
  hora: string;
};

type FuncionarioRow = {
  id: string;
  nome: string;
  cargo?: string | null;
  data_admissao?: string | null;
  experiencia_inicio?: string | null;
  experiencia_fim?: string | null;
  experiencia_fonte?: string | null;
};

type DocumentoRow = {
  id: string;
  tipo_documento: string;
  descricao?: string | null;
  data_documento?: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeLike | null;
};

const TIPOS = [
  ['falta','Falta'],
  ['atraso','Atraso'],
  ['indisciplina','Indisciplina'],
  ['insubordinacao','Insubordinação'],
  ['abandono_posto','Abandono do posto'],
  ['equipamento','Uso / cuidado com equipamento'],
  ['procedimento','Descumprimento de procedimento'],
  ['conduta','Conduta'],
  ['outro','Outro'],
] as const;

const MEDIDAS = [
  ['nenhuma','Nenhuma medida'],
  ['orientacao','Orientação'],
  ['advertencia','Advertência'],
  ['suspensao','Suspensão'],
  ['outro','Outra'],
] as const;

const strip = (value: unknown) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

const addDays = (dateValue: string, days: number) => {
  const d = new Date(dateValue + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
};

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value.slice(0,10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const daysBetween = (from: string, to: string) => {
  const a = new Date(from + 'T12:00:00').getTime();
  const b = new Date(to + 'T12:00:00').getTime();
  return Math.ceil((b-a)/86400000);
};

const isDateCovered = (date: string, atestados: AtestadoRow[]) => {
  const target = date.slice(0,10);
  return atestados.some((a) => {
    const start = a.data_inicio?.slice(0,10);
    if (!start) return false;
    const end = a.data_fim?.slice(0,10) || addDays(start, Math.max(0,(a.dias_cobertos || 1)-1)) || start;
    return target >= start && target <= end;
  });
};

const measureLabel = (value: string) => MEDIDAS.find(([k]) => k === value)?.[1] || value;
const typeLabel = (value: string) => TIPOS.find(([k]) => k === value)?.[1] || value;

const EmployeeLaborAssistantDialog: React.FC<Props> = ({ open, onOpenChange, employee }) => {
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [funcionario,setFuncionario] = useState<FuncionarioRow | null>(null);
  const [atestados,setAtestados] = useState<AtestadoRow[]>([]);
  const [ocorrencias,setOcorrencias] = useState<OcorrenciaRow[]>([]);
  const [pontos,setPontos] = useState<PontoRow[]>([]);
  const [documentos,setDocumentos] = useState<DocumentoRow[]>([]);
  const [pergunta,setPergunta] = useState('');
  const [resposta,setResposta] = useState('');
  const [showRegistro,setShowRegistro] = useState(false);
  const [expInicio,setExpInicio] = useState('');
  const [expFim,setExpFim] = useState('');
  const [expFonte,setExpFonte] = useState('');
  const [form,setForm] = useState({
    data: new Date().toISOString().slice(0,10),
    tipo: 'falta',
    descricao: '',
    medida: 'nenhuma',
    motivo: '',
    testemunhas: '',
    evidencias: '',
  });

  const carregar = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const [fRes,aRes,oRes,dRes,accessRes] = await Promise.all([
        (supabase as any).from('funcionarios')
          .select('id,nome,cargo,data_admissao,experiencia_inicio,experiencia_fim,experiencia_fonte')
          .eq('id',employee.id).maybeSingle(),
        (supabase as any).from('atestados')
          .select('id,data_inicio,data_fim,dias_cobertos,status,created_at')
          .eq('funcionario_id',employee.id).order('data_inicio',{ascending:false}).limit(500),
        (supabase as any).from('rh_ocorrencias_disciplinares')
          .select('id,data_ocorrencia,tipo,descricao,medida,motivo_decisao,testemunhas,evidencias,status,created_by_nome,created_at')
          .eq('funcionario_id',employee.id).order('data_ocorrencia',{ascending:false}).limit(500),
        (supabase as any).from('documentos_funcionario')
          .select('id,tipo_documento,descricao,data_documento,created_at')
          .eq('funcionario_id',employee.id).order('created_at',{ascending:false}).limit(300),
        (supabase as any).from('acessos_externos')
          .select('user_id,profile_user_id')
          .eq('funcionario_id',employee.id),
      ]);

      if (fRes.error) throw fRes.error;
      if (aRes.error) throw aRes.error;
      if (oRes.error) throw oRes.error;

      const f = (fRes.data || null) as FuncionarioRow | null;
      setFuncionario(f);
      setAtestados((aRes.data || []) as AtestadoRow[]);
      setOcorrencias((oRes.data || []) as OcorrenciaRow[]);
      setDocumentos((dRes.data || []) as DocumentoRow[]);
      setExpInicio(f?.experiencia_inicio || f?.data_admissao || '');
      setExpFim(f?.experiencia_fim || '');
      setExpFonte(f?.experiencia_fonte || '');

      const ids = Array.from(new Set(((accessRes.data || []) as any[])
        .flatMap((row:any) => [row.user_id,row.profile_user_id])
        .filter(Boolean)));
      if (ids.length) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate()-180);
        const { data:pData } = await (supabase as any).from('registros_ponto')
          .select('data,tipo,hora')
          .in('user_id',ids)
          .gte('data',cutoff.toISOString().slice(0,10))
          .order('data',{ascending:false})
          .limit(3000);
        setPontos((pData || []) as PontoRow[]);
      } else {
        setPontos([]);
      }
    } catch (error:any) {
      toast.error(error?.message || 'Não foi possível carregar o histórico trabalhista.');
    } finally {
      setLoading(false);
    }
  },[employee?.id]);

  useEffect(() => {
    if (open) void carregar();
  },[open,carregar]);

  const hoje = new Date().toISOString().slice(0,10);
  const admissao = funcionario?.data_admissao || employee?.dataAdmissao || null;
  const experienciaRealFim = funcionario?.experiencia_fim || null;
  const experienciaEstimadaFim = !experienciaRealFim && admissao ? addDays(admissao,90) : null;
  const experienciaFim = experienciaRealFim || experienciaEstimadaFim;
  const experienciaConfirmada = Boolean(experienciaRealFim);
  const emExperiencia = Boolean(experienciaFim && hoje <= experienciaFim);
  const diasExperiencia = experienciaFim ? daysBetween(hoje,experienciaFim) : null;

  const ativos = useMemo(() => ocorrencias.filter((o) => o.status === 'ativo'),[ocorrencias]);
  const advertencias = useMemo(() => ativos.filter((o) => o.medida === 'advertencia'),[ativos]);
  const suspensoes = useMemo(() => ativos.filter((o) => o.medida === 'suspensao'),[ativos]);
  const faltas = useMemo(() => ativos.filter((o) => o.tipo === 'falta'),[ativos]);
  const faltasCobertas = useMemo(() => faltas.filter((o) => isDateCovered(o.data_ocorrencia,atestados)),[faltas,atestados]);
  const atestadosDias = useMemo(() => atestados.reduce((s,a) => s + Math.max(0,Number(a.dias_cobertos)||0),0),[atestados]);
  const diasComPonto = useMemo(() => new Set(pontos.map((p) => p.data)).size,[pontos]);

  const reincidencia = useMemo(() => {
    const count = new Map<string,number>();
    ativos.forEach((o) => count.set(o.tipo,(count.get(o.tipo)||0)+1));
    return Array.from(count.entries())
      .filter(([,n]) => n >= 2)
      .sort((a,b) => b[1]-a[1]);
  },[ativos]);

  const nivel = useMemo(() => {
    if (suspensoes.length > 0 && reincidencia.some(([,n]) => n >= 3)) return 'ALTO';
    if (advertencias.length >= 2 || reincidencia.length > 0) return 'ATENÇÃO';
    return 'REGULAR';
  },[advertencias.length,suspensoes.length,reincidencia]);

  const resumoBase = () => {
    const exp = !admissao
      ? 'Data de admissão não cadastrada; não é possível calcular experiência.'
      : experienciaFim
        ? `${emExperiencia ? 'Ainda está' : 'Não está mais'} no período de experiência ${experienciaConfirmada ? 'confirmado' : 'estimado'}; término em ${fmtDate(experienciaFim)}${diasExperiencia != null && emExperiencia ? ` (${Math.max(0,diasExperiencia)} dia(s) restantes)` : ''}.`
        : 'Período de experiência não definido.';
    return `${exp} Histórico disciplinar: ${ativos.length} ocorrência(s) ativa(s), ${advertencias.length} advertência(s) e ${suspensoes.length} suspensão(ões). Atestados: ${atestados.length} documento(s), cobrindo ${atestadosDias} dia(s). Ponto: ${pontos.length} marcação(ões) em ${diasComPonto} dia(s) nos últimos 180 dias disponíveis. O sistema não transforma ausência de marcação em falta automaticamente sem escala/horário esperado.`;
  };

  const responder = (texto?: string) => {
    const q = strip(texto ?? pergunta);
    if (!q) return;
    let answer = '';

    if (q.includes('experien')) {
      if (!admissao) answer = 'Não há data de admissão cadastrada, então não consigo calcular o período de experiência.';
      else if (experienciaFim) {
        answer = `${emExperiencia ? 'SIM' : 'NÃO'}. ${employee?.name} ${emExperiencia ? 'está' : 'não está mais'} no período de experiência ${experienciaConfirmada ? 'registrado' : 'estimado'}. Admissão: ${fmtDate(admissao)}. Término: ${fmtDate(experienciaFim)}.`;
        if (!experienciaConfirmada) answer += ' O fim foi estimado em 90 dias a partir da admissão; confirme o contrato assinado e grave a data real abaixo.';
      }
    } else if (q.includes('justa causa') || q.includes('justa')) {
      const reinc = reincidencia.map(([tipo,n]) => `${typeLabel(tipo)}: ${n}`).join(', ');
      answer = `Não existe um número automático de advertências que gere justa causa. Neste histórico há ${advertencias.length} advertência(s), ${suspensoes.length} suspensão(ões) e ${ativos.length} ocorrência(s) ativa(s).`;
      if (reinc) answer += ` Há reincidência registrada em: ${reinc}.`;
      if (faltasCobertas.length) answer += ` Atenção: ${faltasCobertas.length} falta(s) registrada(s) coincide(m) com período coberto por atestado e precisa(m) ser revisada(s) antes de qualquer medida.`;
      answer += ' Para justa causa, o sistema não autoriza a dispensa automaticamente: exige revisão do fato, prova, imediatidade, proporcionalidade, eventual gradação aplicável, CCT e validação jurídica antes da decisão final.';
    } else if (q.includes('advert')) {
      const semMedida = ativos.filter((o) => ['nenhuma','orientacao'].includes(o.medida) && !isDateCovered(o.data_ocorrencia,atestados));
      answer = `Há ${advertencias.length} advertência(s) registrada(s). Existem ${semMedida.length} ocorrência(s) ativa(s) sem advertência/suspensão e sem coincidência identificada com atestado.`;
      if (semMedida.length) answer += ' Uma advertência pode ser avaliada nesses registros após confirmar o fato, ouvir a justificativa, verificar prova e aplicar medida proporcional.';
      if (faltasCobertas.length) answer += ` Não use como base disciplinar sem revisão as ${faltasCobertas.length} falta(s) que coincidem com atestado.`;
    } else if (q.includes('susp')) {
      answer = `Há ${suspensoes.length} suspensão(ões) e ${advertencias.length} advertência(s) registradas. Suspensão não deve ser automática por quantidade: avalie gravidade, reincidência, medidas anteriores, prova, justificativa e proporcionalidade. ${reincidencia.length ? 'O histórico mostra reincidência em ' + reincidencia.map(([t,n])=>`${typeLabel(t)} (${n})`).join(', ') + '.' : 'Não há reincidência registrada em duas ou mais ocorrências do mesmo tipo.'}`;
    } else if (q.includes('atestado')) {
      answer = `Existem ${atestados.length} atestado(s) registrado(s), cobrindo ${atestadosDias} dia(s). ${faltasCobertas.length ? `${faltasCobertas.length} falta(s) disciplinar(es) coincide(m) com datas cobertas e devem ser revisadas.` : 'Não identifiquei falta disciplinar registrada coincidindo com as datas cobertas.'} O CID não é usado como critério disciplinar nesta análise.`;
    } else if (q.includes('falta') || q.includes('ausen')) {
      answer = `Há ${faltas.length} falta(s) registrada(s) no histórico disciplinar. ${faltasCobertas.length} coincide(m) com período coberto por atestado. O ponto possui registros em ${diasComPonto} dia(s) nos últimos 180 dias disponíveis, mas o sistema não conclui que um dia sem marcação é falta sem antes conhecer a escala e o horário esperado.`;
    } else if (q.includes('acao') || q.includes('agir') || q.includes('podemos') || q.includes('fazer')) {
      if (faltasCobertas.length) {
        answer = `Primeiro revise as ${faltasCobertas.length} ocorrência(s) de falta que coincidem com atestado. Depois, separe fatos comprovados e não justificados. `;
      }
      answer += `Nível atual: ${nivel}. Há ${ativos.length} ocorrência(s), ${advertencias.length} advertência(s), ${suspensoes.length} suspensão(ões) e ${reincidencia.length} tipo(s) com reincidência. A próxima medida deve ser escolhida pelo fato concreto e pelo histórico, não por uma contagem fixa. Para suspensão ou justa causa, valide com RH/jurídico e CCT antes de concluir.`;
    } else {
      answer = resumoBase();
    }

    setResposta(answer);
  };

  const salvarExperiencia = async () => {
    if (!employee?.id) return;
    setSaving(true);
    const { error } = await (supabase as any).from('funcionarios').update({
      experiencia_inicio: expInicio || null,
      experiencia_fim: expFim || null,
      experiencia_fonte: expFonte.trim() || (expFim ? 'informado_manual' : null),
      experiencia_atualizado_em: new Date().toISOString(),
    }).eq('id',employee.id);
    setSaving(false);
    if (error) return toast.error(error.message || 'Não foi possível salvar o período.');
    toast.success('Período de experiência salvo.');
    await carregar();
  };

  const registrarOcorrencia = async () => {
    if (!employee?.id || !form.descricao.trim()) return toast.error('Descreva o fato ocorrido.');
    setSaving(true);
    const { data,error } = await (supabase as any).rpc('rh_registrar_ocorrencia_disciplinar',{
      p_funcionario_id: employee.id,
      p_data: form.data,
      p_tipo: form.tipo,
      p_descricao: form.descricao.trim(),
      p_medida: form.medida,
      p_motivo_decisao: form.motivo.trim() || null,
      p_testemunhas: form.testemunhas.trim() || null,
      p_evidencias: form.evidencias.trim() || null,
    });
    setSaving(false);
    if (error || !data?.ok) return toast.error(data?.error || error?.message || 'Não foi possível registrar a ocorrência.');
    toast.success('Ocorrência disciplinar registrada no histórico.');
    setForm({
      data:new Date().toISOString().slice(0,10),tipo:'falta',descricao:'',medida:'nenhuma',motivo:'',testemunhas:'',evidencias:'',
    });
    setShowRegistro(false);
    await carregar();
  };

  const contratoDocs = documentos.filter((d) => strip(d.tipo_documento + ' ' + (d.descricao || '')).includes('experien'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-500" /> Assistente RH — {employee?.name || 'Funcionário'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-14"><Loader2 className="h-7 w-7 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border p-4">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Situação contratual</span>
                <p className="mt-1 font-black">{emExperiencia ? 'EM EXPERIÊNCIA' : admissao ? 'FORA DA EXPERIÊNCIA' : 'NÃO DEFINIDO'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{experienciaFim ? `Até ${fmtDate(experienciaFim)} ${experienciaConfirmada ? '• confirmado' : '• estimado'}` : 'Sem término cadastrado'}</p>
              </div>
              <div className="rounded-xl border p-4">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Atestados</span>
                <p className="mt-1 text-2xl font-black">{atestados.length}</p>
                <p className="text-xs text-muted-foreground">{atestadosDias} dia(s) coberto(s)</p>
              </div>
              <div className="rounded-xl border p-4">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Medidas</span>
                <p className="mt-1 font-black">{advertencias.length} advert. • {suspensoes.length} susp.</p>
                <p className="text-xs text-muted-foreground">{ativos.length} ocorrência(s) ativa(s)</p>
              </div>
              <div className="rounded-xl border p-4">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Nível de atenção</span>
                <p className={`mt-1 font-black ${nivel==='ALTO'?'text-red-500':nivel==='ATENÇÃO'?'text-amber-500':'text-emerald-500'}`}>{nivel}</p>
                <p className="text-xs text-muted-foreground">{reincidencia.length} tipo(s) com reincidência</p>
              </div>
            </div>

            {faltasCobertas.length > 0 && (
              <div className="rounded-xl border border-amber-400 bg-amber-500/10 p-4 text-sm">
                <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div><b>Conferência obrigatória:</b> {faltasCobertas.length} ocorrência(s) de falta coincide(m) com período coberto por atestado. Não aplicar medida com base nesses registros sem revisar a justificativa.</div>
                </div>
              </div>
            )}

            <section className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 font-bold"><CalendarClock className="h-4 w-4" /> Período de experiência</h3>
                  <p className="text-xs text-muted-foreground">A data real do contrato prevalece sobre qualquer estimativa automática.</p>
                </div>
                {contratoDocs.length > 0 && <Badge variant="outline">{contratoDocs.length} documento(s) com referência a experiência</Badge>}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div><label className="text-xs text-muted-foreground">Início</label><Input type="date" value={expInicio} onChange={(e)=>setExpInicio(e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Fim real do contrato</label><Input type="date" value={expFim} onChange={(e)=>setExpFim(e.target.value)} /></div>
                <div><label className="text-xs text-muted-foreground">Fonte / observação</label><Input value={expFonte} onChange={(e)=>setExpFonte(e.target.value)} placeholder="Ex.: contrato assinado" /></div>
              </div>
              <div className="mt-3 flex justify-end"><Button variant="outline" onClick={()=>void salvarExperiencia()} disabled={saving}>Salvar período</Button></div>
            </section>

            <section className="rounded-2xl border border-violet-400/30 bg-violet-500/5 p-4">
              <div className="flex items-center gap-2 font-bold"><Search className="h-4 w-4 text-violet-500" /> Pergunte sobre este funcionário</div>
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <Input value={pergunta} onChange={(e)=>setPergunta(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter') responder();}} placeholder="Ex.: ainda está em experiência? podemos dar advertência? quantas advertências já teve?" />
                <Button onClick={()=>responder()}>Analisar histórico</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Ainda está em experiência?','Podemos avaliar advertência?','Há reincidência?','Como está o histórico de atestados?','Podemos avaliar suspensão?','E justa causa?','Que ação podemos tomar agora?'].map((q)=>(
                  <Button key={q} size="sm" variant="outline" onClick={()=>{setPergunta(q);responder(q);}}>{q}</Button>
                ))}
              </div>
              {resposta && (
                <div className="mt-4 rounded-xl border bg-background p-4 text-sm leading-relaxed">
                  <p className="font-semibold">Análise do histórico cadastrado</p>
                  <p className="mt-2">{resposta}</p>
                  <p className="mt-3 text-[11px] text-muted-foreground">A ferramenta organiza fatos e documentos. Não autoriza automaticamente justa causa, suspensão ou outra penalidade. Convenção coletiva, gravidade concreta e revisão jurídica podem alterar a decisão.</p>
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div><h3 className="flex items-center gap-2 font-bold"><Gavel className="h-4 w-4" /> Histórico disciplinar</h3><p className="text-xs text-muted-foreground">Fatos, medidas e reincidências.</p></div>
                  <Button size="sm" onClick={()=>setShowRegistro((v)=>!v)}><Plus className="mr-1 h-4 w-4" />Registrar</Button>
                </div>

                {showRegistro && (
                  <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-3">
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input type="date" value={form.data} onChange={(e)=>setForm({...form,data:e.target.value})} />
                      <select className="rounded-md border bg-background px-3 text-sm" value={form.tipo} onChange={(e)=>setForm({...form,tipo:e.target.value})}>{TIPOS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                      <select className="rounded-md border bg-background px-3 text-sm" value={form.medida} onChange={(e)=>setForm({...form,medida:e.target.value})}>{MEDIDAS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
                    </div>
                    <Textarea value={form.descricao} onChange={(e)=>setForm({...form,descricao:e.target.value})} placeholder="Descreva objetivamente o fato ocorrido *" rows={3} />
                    <Input value={form.motivo} onChange={(e)=>setForm({...form,motivo:e.target.value})} placeholder="Motivo da medida / decisão tomada" />
                    <Input value={form.testemunhas} onChange={(e)=>setForm({...form,testemunhas:e.target.value})} placeholder="Testemunhas (se houver)" />
                    <Input value={form.evidencias} onChange={(e)=>setForm({...form,evidencias:e.target.value})} placeholder="Evidências / referência de documentos" />
                    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setShowRegistro(false)}>Cancelar</Button><Button onClick={()=>void registrarOcorrencia()} disabled={saving}>{saving?'Salvando...':'Salvar no histórico'}</Button></div>
                  </div>
                )}

                <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {!ocorrencias.length && <p className="text-sm text-muted-foreground">Nenhuma ocorrência disciplinar registrada.</p>}
                  {ocorrencias.map((o)=>(
                    <div key={o.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2"><b>{typeLabel(o.tipo)}</b><Badge variant="outline">{measureLabel(o.medida)}</Badge>{isDateCovered(o.data_ocorrencia,atestados)&&<Badge className="bg-amber-500 text-black">Coincide com atestado</Badge>}</div>
                        <span className="text-xs text-muted-foreground">{fmtDate(o.data_ocorrencia)}</span>
                      </div>
                      <p className="mt-2 text-sm">{o.descricao}</p>
                      {o.motivo_decisao && <p className="mt-1 text-xs text-muted-foreground"><b>Decisão:</b> {o.motivo_decisao}</p>}
                      <p className="mt-2 text-[10px] text-muted-foreground">Registrado por {o.created_by_nome || 'usuário'} • status {o.status}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border p-4">
                <h3 className="flex items-center gap-2 font-bold"><Stethoscope className="h-4 w-4" /> Atestados e ponto</h3>
                <p className="text-xs text-muted-foreground">Cruza datas, sem usar diagnóstico/CID para decisão disciplinar.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Atestados</p><b className="text-xl">{atestados.length}</b></div>
                  <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Dias cobertos</p><b className="text-xl">{atestadosDias}</b></div>
                  <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Dias com ponto (180d)</p><b className="text-xl">{diasComPonto}</b></div>
                  <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Marcações de ponto</p><b className="text-xl">{pontos.length}</b></div>
                </div>
                <div className="mt-4 max-h-[250px] space-y-2 overflow-y-auto">
                  {atestados.slice(0,20).map((a)=>(
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                      <div><b>{fmtDate(a.data_inicio)}</b>{a.data_fim && a.data_fim!==a.data_inicio ? ` → ${fmtDate(a.data_fim)}` : ''}<p className="text-xs text-muted-foreground">{a.dias_cobertos} dia(s) • {a.status}</p></div>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                  {!atestados.length && <p className="text-sm text-muted-foreground">Nenhum atestado registrado.</p>}
                </div>
              </section>
            </div>

            <div className="rounded-xl border border-red-400/30 bg-red-500/5 p-3 text-xs text-muted-foreground">
              <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /><p><b className="text-foreground">Regra de segurança:</b> o sistema não usa uma fórmula do tipo “X advertências = justa causa”. Ele apresenta o histórico, identifica reincidência e inconsistências e exige análise humana para medidas graves.</p></div>
            </div>

            <div className="flex justify-end"><Button variant="outline" onClick={()=>void carregar()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar dados</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeLaborAssistantDialog;
