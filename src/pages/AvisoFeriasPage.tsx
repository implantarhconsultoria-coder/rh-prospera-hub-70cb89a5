import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  CalendarCheck, Printer, Save, AlertTriangle, Plus, Upload, Eye, Trash2,
  CheckCircle2, FileText, Plane, ArrowRight,
} from 'lucide-react';
import { formatDate } from '@/lib/calculations';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { gerarAvisoFeriasPdf, downloadPdf } from '@/lib/pdfGenerator';
import { registrarDocumento, uploadDocumentoPdf } from '@/lib/documentoHistorico';

interface FeriasAviso {
  id: string;
  funcionario_id: string;
  funcionario_nome: string;
  funcionario_cpf: string;
  funcionario_cargo: string;
  company_id: string;
  empresa_nome: string;
  periodo_aquisitivo_inicio: string | null;
  periodo_aquisitivo_fim: string | null;
  periodo_gozo_inicio: string;
  periodo_gozo_fim: string;
  data_retorno: string;
  dias_ferias: number;
  status: string;
  aviso_pdf_url: string;
  assinado_pdf_url: string;
  data_entrega: string | null;
  observacao: string;
  user_nome: string;
  created_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const addYears = (iso: string, years: number): string => {
  const d = new Date(iso + 'T12:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number => {
  const d1 = new Date(a + 'T12:00:00').getTime();
  const d2 = new Date(b + 'T12:00:00').getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
};

type SituacaoFerias =
  | { tipo: 'ate_inicio'; dias: number; label: string; cor: string }
  | { tipo: 'em_ferias'; dias: number; label: string; cor: string }
  | { tipo: 'ate_retorno'; dias: number; label: string; cor: string }
  | { tipo: 'retornado'; label: string; cor: string }
  | { tipo: 'cancelado'; label: string; cor: string };

const computarSituacao = (a: FeriasAviso): SituacaoFerias => {
  if (a.status === 'cancelado') return { tipo: 'cancelado', label: 'Cancelado', cor: 'bg-muted text-muted-foreground' };
  const hoje = today();
  const dToInicio = daysBetween(hoje, a.periodo_gozo_inicio);
  const dToRetorno = daysBetween(hoje, a.data_retorno);
  if (dToInicio > 0) {
    let label = `Inicia em ${dToInicio} dia(s)`;
    let cor = 'bg-primary text-primary-foreground';
    if (dToInicio <= 7) { label = `Inicia em ${dToInicio} dia(s) — URGENTE`; cor = 'bg-destructive text-destructive-foreground'; }
    else if (dToInicio <= 15) { cor = 'bg-warning text-warning-foreground'; }
    return { tipo: 'ate_inicio', dias: dToInicio, label, cor };
  }
  if (dToRetorno > 0) {
    return { tipo: 'em_ferias', dias: dToRetorno, label: `Em férias — retorno em ${dToRetorno} dia(s)`, cor: 'bg-accent text-accent-foreground' };
  }
  if (dToRetorno === 0) {
    return { tipo: 'ate_retorno', dias: 0, label: 'Retorna HOJE', cor: 'bg-warning text-warning-foreground' };
  }
  return { tipo: 'retornado', label: 'Retornado', cor: 'bg-success text-success-foreground' };
};

const AvisoFeriasPage: React.FC = () => {
  const { companies, employees, session } = useApp();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [avisos, setAvisos] = useState<FeriasAviso[]>([]);
  const [loading, setLoading] = useState(true);

  // dialog cadastro/edição
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [empId, setEmpId] = useState('');
  const [periodoAquisitivoInicio, setPaIni] = useState('');
  const [periodoAquisitivoFim, setPaFim] = useState('');
  const [gozoInicio, setGozoInicio] = useState('');
  const [diasFerias, setDiasFerias] = useState(30);
  const [observacao, setObservacao] = useState('');

  const [filterStatus, setFilterStatus] = useState<'todos' | 'proximas' | 'em_ferias' | 'retorno' | 'concluidos' | 'cancelados'>('todos');

  // dialog detalhes
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchAvisos = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('ferias_avisos' as any).select('*').order('periodo_gozo_inicio', { ascending: true });
    const { data, error } = await q;
    if (error) {
      console.error('fetchAvisos:', error);
      toast.error('Erro ao carregar avisos de férias');
    } else if (data) {
      let list = data as unknown as FeriasAviso[];
      if (isFilial && filialCompanyId) {
        list = list.filter(a => a.company_id === filialCompanyId);
      }
      setAvisos(list);
    }
    setLoading(false);
  }, [isFilial, filialCompanyId]);

  useEffect(() => { fetchAvisos(); }, [fetchAvisos]);

  // recompute "agora" cada minuto para atualizar contagem
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const empsList = useMemo(() => employees.filter(e =>
    e.status === 'ativo' && (!isFilial || e.companyId === filialCompanyId)
  ), [employees, isFilial, filialCompanyId]);

  const empSelecionado = empsList.find(e => e.id === empId);
  const companySelecionada = empSelecionado ? companies.find(c => c.id === empSelecionado.companyId) : null;

  const gozoFim = gozoInicio ? addDays(gozoInicio, diasFerias - 1) : '';
  const dataRetorno = gozoInicio ? addDays(gozoInicio, diasFerias) : '';

  const sugerirPeriodoAquisitivo = (admissao: string) => {
    if (!admissao) return;
    // simples: último período de 12 meses anterior ao gozo
    const d = new Date(admissao + 'T12:00:00');
    setPaIni(d.toISOString().slice(0, 10));
    setPaFim(addYears(d.toISOString().slice(0, 10), 1));
  };

  const resetForm = () => {
    setEditingId(null);
    setEmpId('');
    setPaIni(''); setPaFim('');
    setGozoInicio('');
    setDiasFerias(30);
    setObservacao('');
  };

  const abrirNovo = () => { resetForm(); setOpenForm(true); };

  const abrirEdicao = (a: FeriasAviso) => {
    setEditingId(a.id);
    setEmpId(a.funcionario_id);
    setPaIni(a.periodo_aquisitivo_inicio || '');
    setPaFim(a.periodo_aquisitivo_fim || '');
    setGozoInicio(a.periodo_gozo_inicio);
    setDiasFerias(a.dias_ferias);
    setObservacao(a.observacao || '');
    setOpenForm(true);
  };

  const salvar = async () => {
    if (!empSelecionado || !companySelecionada) { toast.error('Selecione um funcionário'); return; }
    if (!gozoInicio) { toast.error('Informe a data de início das férias'); return; }
    if (!session?.user) { toast.error('Sessão inválida'); return; }

    const payload: any = {
      funcionario_id: empSelecionado.id,
      funcionario_nome: empSelecionado.name,
      funcionario_cpf: empSelecionado.cpf || '',
      funcionario_cargo: empSelecionado.cargo || '',
      company_id: companySelecionada.id,
      empresa_nome: companySelecionada.name,
      periodo_aquisitivo_inicio: periodoAquisitivoInicio || null,
      periodo_aquisitivo_fim: periodoAquisitivoFim || null,
      periodo_gozo_inicio: gozoInicio,
      periodo_gozo_fim: gozoFim,
      data_retorno: dataRetorno,
      dias_ferias: diasFerias,
      observacao,
      user_id: session.user.id,
      user_nome: session.user.email || '',
    };

    if (editingId) {
      const { error } = await supabase.from('ferias_avisos' as any).update(payload).eq('id', editingId);
      if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
      toast.success('Aviso de férias atualizado!');
    } else {
      const { data, error } = await supabase.from('ferias_avisos' as any).insert(payload).select().single();
      if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
      toast.success('Aviso de férias cadastrado! Contagem regressiva iniciada.');

      // Gera PDF e arquiva no histórico do funcionário
      try {
        const pdf = gerarAvisoFeriasPdf({
          empresa: companySelecionada.name,
          cnpj: companySelecionada.cnpj,
          nome: empSelecionado.name,
          cpf: empSelecionado.cpf,
          rg: empSelecionado.rg,
          matricula: empSelecionado.registro,
          funcao: empSelecionado.cargo,
          dataAdmissao: empSelecionado.dataAdmissao,
          inicioFerias: gozoInicio,
          retornoFerias: dataRetorno,
          diasFerias,
        });
        const url = await uploadDocumentoPdf(empSelecionado.id, 'aviso-ferias', pdf.blob, 'pdf');
        if (url && data) {
          await supabase.from('ferias_avisos' as any).update({ aviso_pdf_url: url }).eq('id', (data as any).id);
        }
        await registrarDocumento({
          funcionarioId: empSelecionado.id,
          funcionarioNome: empSelecionado.name,
          companyId: companySelecionada.id,
          empresaNome: companySelecionada.name,
          tipoDocumento: 'Aviso de Férias',
          descricao: `Início ${formatDate(gozoInicio)} • Retorno ${formatDate(dataRetorno)} • ${diasFerias} dias`,
          arquivoUrl: url,
          geradoPorUserId: session.user.id,
          geradoPorNome: session.user.email || '',
          unidade: companySelecionada.name,
        });
      } catch (e) {
        console.error('upload aviso pdf:', e);
      }
    }

    setOpenForm(false);
    resetForm();
    fetchAvisos();
  };

  const baixarAviso = (a: FeriasAviso) => {
    const company = companies.find(c => c.id === a.company_id);
    const emp = employees.find(e => e.id === a.funcionario_id);
    const pdf = gerarAvisoFeriasPdf({
      empresa: a.empresa_nome,
      cnpj: company?.cnpj || '',
      nome: a.funcionario_nome,
      cpf: a.funcionario_cpf,
      rg: emp?.rg || '',
      matricula: emp?.registro || '',
      funcao: a.funcionario_cargo,
      dataAdmissao: emp?.dataAdmissao || '',
      inicioFerias: a.periodo_gozo_inicio,
      retornoFerias: a.data_retorno,
      diasFerias: a.dias_ferias,
    });
    downloadPdf(pdf.blob, pdf.fileName);
    toast.success('PDF gerado!');
  };

  const subirAssinado = async (a: FeriasAviso, file: File) => {
    if (!session?.user) return;
    const path = `${a.funcionario_id}/aviso-ferias-assinado-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage.from('ferias-avisos').upload(path, file);
    if (upErr) { toast.error('Falha no upload'); return; }
    const { data: urlData } = supabase.storage.from('ferias-avisos').getPublicUrl(path);
    const { error } = await supabase.from('ferias_avisos' as any).update({
      assinado_pdf_url: urlData.publicUrl,
      status: 'assinado',
      data_entrega: today(),
    }).eq('id', a.id);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success('Aviso assinado arquivado!');
    fetchAvisos();
  };

  const marcarStatus = async (a: FeriasAviso, novoStatus: string) => {
    const patch: any = { status: novoStatus };
    if (novoStatus === 'entregue') patch.data_entrega = today();
    const { error } = await supabase.from('ferias_avisos' as any).update(patch).eq('id', a.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Status atualizado!');
    fetchAvisos();
  };

  const cancelar = async (a: FeriasAviso) => {
    const { error } = await supabase.from('ferias_avisos' as any).update({ status: 'cancelado' }).eq('id', a.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Aviso cancelado.');
    fetchAvisos();
  };

  const excluir = async (a: FeriasAviso) => {
    const { error } = await supabase.from('ferias_avisos' as any).delete().eq('id', a.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Aviso excluído.');
    fetchAvisos();
  };

  // Listagens com situação calculada
  const avisosCalc = useMemo(() => avisos.map(a => ({ ...a, situacao: computarSituacao(a) })), [avisos]);

  const filtrados = useMemo(() => {
    let list = avisosCalc;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.funcionario_nome.toLowerCase().includes(q) ||
        a.funcionario_cpf.includes(q) ||
        a.empresa_nome.toLowerCase().includes(q)
      );
    }
    if (filterStatus === 'proximas') list = list.filter(a => a.situacao.tipo === 'ate_inicio' && a.situacao.dias <= 30);
    if (filterStatus === 'em_ferias') list = list.filter(a => a.situacao.tipo === 'em_ferias' || a.situacao.tipo === 'ate_retorno');
    if (filterStatus === 'retorno') list = list.filter(a => a.situacao.tipo === 'em_ferias' && a.situacao.dias <= 7);
    if (filterStatus === 'concluidos') list = list.filter(a => a.situacao.tipo === 'retornado');
    if (filterStatus === 'cancelados') list = list.filter(a => a.situacao.tipo === 'cancelado');
    return list;
  }, [avisosCalc, search, filterStatus]);

  const cards = useMemo(() => ({
    proximas: avisosCalc.filter(a => a.situacao.tipo === 'ate_inicio' && a.situacao.dias <= 30).length,
    em_ferias: avisosCalc.filter(a => a.situacao.tipo === 'em_ferias' || a.situacao.tipo === 'ate_retorno').length,
    retornos: avisosCalc.filter(a => a.situacao.tipo === 'em_ferias' && a.situacao.dias <= 7).length,
    urgentes: avisosCalc.filter(a => a.situacao.tipo === 'ate_inicio' && a.situacao.dias <= 7).length,
  }), [avisosCalc]);

  const detail = detailId ? avisosCalc.find(a => a.id === detailId) : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
              <CalendarCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Aviso de Férias</h1>
              <p className="text-primary-foreground/70 text-sm">Cadastro, alertas regressivos e arquivamento de PDFs assinados</p>
            </div>
          </div>
          <Button onClick={abrirNovo} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <Plus className="w-4 h-4 mr-2" /> Novo Aviso
          </Button>
        </div>
      </div>

      {/* Cards de alerta */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={() => setFilterStatus('proximas')}
          className={`card-premium p-4 text-left transition ${filterStatus === 'proximas' ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase">
            <Plane className="w-4 h-4" /> Férias Próximas (30d)
          </div>
          <p className="text-2xl font-bold mt-2">{cards.proximas}</p>
        </button>
        <button onClick={() => setFilterStatus('proximas')}
          className={`card-premium p-4 text-left transition border-l-4 border-destructive`}>
          <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase">
            <AlertTriangle className="w-4 h-4" /> Urgentes (≤ 7d)
          </div>
          <p className="text-2xl font-bold mt-2">{cards.urgentes}</p>
        </button>
        <button onClick={() => setFilterStatus('em_ferias')}
          className={`card-premium p-4 text-left transition ${filterStatus === 'em_ferias' ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center gap-2 text-accent text-xs font-semibold uppercase">
            <CalendarCheck className="w-4 h-4" /> Em férias
          </div>
          <p className="text-2xl font-bold mt-2">{cards.em_ferias}</p>
        </button>
        <button onClick={() => setFilterStatus('retorno')}
          className={`card-premium p-4 text-left transition ${filterStatus === 'retorno' ? 'ring-2 ring-primary' : ''}`}>
          <div className="flex items-center gap-2 text-warning text-xs font-semibold uppercase">
            <ArrowRight className="w-4 h-4" /> Retornos próximos
          </div>
          <p className="text-2xl font-bold mt-2">{cards.retornos}</p>
        </button>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <Input placeholder="Buscar nome, CPF ou empresa..." value={search}
          onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          <option value="todos">Todos</option>
          <option value="proximas">Próximas (30d)</option>
          <option value="em_ferias">Em férias</option>
          <option value="retorno">Retornos próximos</option>
          <option value="concluidos">Concluídos</option>
          <option value="cancelados">Cancelados</option>
        </select>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Funcionário</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Início</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Retorno</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Dias</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Situação</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>)}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum aviso de férias cadastrado.</td></tr>
            )}
            {filtrados.map(a => (
              <tr key={a.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{a.funcionario_nome}<div className="text-[10px] text-muted-foreground">{a.funcionario_cargo}</div></td>
                <td className="px-3 py-2.5 text-xs">{a.empresa_nome}</td>
                <td className="px-3 py-2.5 text-xs">{formatDate(a.periodo_gozo_inicio)}</td>
                <td className="px-3 py-2.5 text-xs">{formatDate(a.data_retorno)}</td>
                <td className="px-3 py-2.5 text-xs">{a.dias_ferias}</td>
                <td className="px-3 py-2.5">
                  <Badge className={`text-[10px] ${a.situacao.cor}`}>{a.situacao.label}</Badge>
                  {a.assinado_pdf_url && <Badge variant="outline" className="text-[10px] ml-1 border-success text-success">Assinado</Badge>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => setDetailId(a.id)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Baixar PDF" onClick={() => baixarAviso(a)}>
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(a)}>
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir aviso?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O aviso de {a.funcionario_nome} ({formatDate(a.periodo_gozo_inicio)}) será removido permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir(a)} className="bg-destructive">Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filtrados.length} aviso(s)</div>
      </div>

      {/* Dialog cadastro/edição */}
      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Aviso de Férias' : 'Novo Aviso de Férias'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Funcionário</label>
              <select value={empId} onChange={e => {
                setEmpId(e.target.value);
                const emp = empsList.find(x => x.id === e.target.value);
                if (emp?.dataAdmissao && !periodoAquisitivoInicio) sugerirPeriodoAquisitivo(emp.dataAdmissao);
              }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="">Selecione...</option>
                {empsList.map(e => {
                  const co = companies.find(c => c.id === e.companyId);
                  return <option key={e.id} value={e.id}>{e.name} — {co?.name} — {e.cargo}</option>;
                })}
              </select>
            </div>

            {empSelecionado && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-muted/30 p-3 rounded">
                <div><span className="text-muted-foreground block">CPF</span><strong>{empSelecionado.cpf}</strong></div>
                <div><span className="text-muted-foreground block">Cargo</span><strong>{empSelecionado.cargo}</strong></div>
                <div><span className="text-muted-foreground block">Empresa</span><strong>{companySelecionada?.name}</strong></div>
                <div><span className="text-muted-foreground block">Admissão</span><strong>{formatDate(empSelecionado.dataAdmissao)}</strong></div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Período Aquisitivo — Início</label>
                <Input type="date" value={periodoAquisitivoInicio} onChange={e => setPaIni(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Período Aquisitivo — Fim</label>
                <Input type="date" value={periodoAquisitivoFim} onChange={e => setPaFim(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Início das Férias *</label>
                <Input type="date" value={gozoInicio} onChange={e => setGozoInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Dias de Férias *</label>
                <select value={diasFerias} onChange={e => setDiasFerias(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                  <option value={30}>30 dias</option>
                  <option value={20}>20 dias</option>
                  <option value={15}>15 dias</option>
                  <option value={10}>10 dias</option>
                  <option value={5}>5 dias</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Retorno (auto)</label>
                <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{dataRetorno ? formatDate(dataRetorno) : '—'}</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Observação</label>
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenForm(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={salvar} className="gradient-primary text-primary-foreground">
              <Save className="w-4 h-4 mr-2" /> {editingId ? 'Salvar' : 'Cadastrar e gerar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog detalhes */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Aviso de Férias</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="card-premium p-3 bg-muted/20">
                <Badge className={detail.situacao.cor}>{detail.situacao.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground block">Funcionário</span><strong>{detail.funcionario_nome}</strong></div>
                <div><span className="text-xs text-muted-foreground block">Empresa</span><strong>{detail.empresa_nome}</strong></div>
                <div><span className="text-xs text-muted-foreground block">CPF</span>{detail.funcionario_cpf}</div>
                <div><span className="text-xs text-muted-foreground block">Cargo</span>{detail.funcionario_cargo}</div>
                <div><span className="text-xs text-muted-foreground block">Período Aquisitivo</span>
                  {detail.periodo_aquisitivo_inicio ? `${formatDate(detail.periodo_aquisitivo_inicio)} → ${formatDate(detail.periodo_aquisitivo_fim || '')}` : '—'}</div>
                <div><span className="text-xs text-muted-foreground block">Período de Gozo</span>
                  {formatDate(detail.periodo_gozo_inicio)} → {formatDate(detail.periodo_gozo_fim)}</div>
                <div><span className="text-xs text-muted-foreground block">Retorno</span><strong>{formatDate(detail.data_retorno)}</strong></div>
                <div><span className="text-xs text-muted-foreground block">Dias</span>{detail.dias_ferias}</div>
              </div>
              {detail.observacao && (
                <div>
                  <span className="text-xs text-muted-foreground block">Observação</span>
                  <p className="text-sm">{detail.observacao}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <Button size="sm" variant="outline" onClick={() => baixarAviso(detail)}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Baixar PDF
                </Button>
                {detail.aviso_pdf_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={detail.aviso_pdf_url} target="_blank" rel="noreferrer"><Eye className="w-3.5 h-3.5 mr-1" /> Ver PDF original</a>
                  </Button>
                )}
                {detail.assinado_pdf_url ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={detail.assinado_pdf_url} target="_blank" rel="noreferrer">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-success" /> Ver Assinado
                    </a>
                  </Button>
                ) : (
                  <label>
                    <Button size="sm" variant="outline" asChild>
                      <span><Upload className="w-3.5 h-3.5 mr-1" /> Subir PDF assinado</span>
                    </Button>
                    <input type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && subirAssinado(detail, e.target.files[0])} />
                  </label>
                )}
                {detail.status !== 'entregue' && detail.status !== 'assinado' && (
                  <Button size="sm" variant="outline" onClick={() => marcarStatus(detail, 'entregue')}>
                    Marcar como entregue
                  </Button>
                )}
                {detail.status !== 'cancelado' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive">Cancelar aviso</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar este aviso?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O aviso ficará marcado como cancelado, mas o histórico continuará disponível.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { cancelar(detail); setDetailId(null); }} className="bg-destructive">Confirmar cancelamento</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvisoFeriasPage;
