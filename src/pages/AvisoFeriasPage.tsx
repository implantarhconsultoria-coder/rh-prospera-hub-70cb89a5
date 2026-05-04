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
  CheckCircle2, FileText, Plane, ArrowRight, Mail, DollarSign, Send,
} from 'lucide-react';
import { formatDate } from '@/lib/calculations';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { gerarAvisoFeriasPdf, downloadPdf } from '@/lib/pdfGenerator';
import { registrarDocumento, uploadDocumentoPdf } from '@/lib/documentoHistorico';
import { openEmailClient } from '@/lib/emailUtils';

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
  prazo_pagamento?: string | null;
  status_pagamento?: string;
  data_pagamento?: string | null;
  valor_pago?: number | null;
  enviado_contabilidade_em?: string | null;
  enviado_contabilidade_por?: string | null;
  enviado_contabilidade_destinos?: string | null;
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

type SituacaoPagamento =
  | { tipo: 'pago'; label: string; cor: string }
  | { tipo: 'enviado'; label: string; cor: string }
  | { tipo: 'pendente'; dias: number; label: string; cor: string }
  | { tipo: 'vencendo'; dias: number; label: string; cor: string }
  | { tipo: 'vencido'; dias: number; label: string; cor: string };

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

const computarPagamento = (a: FeriasAviso): SituacaoPagamento => {
  const sp = a.status_pagamento || 'pendente';
  if (sp === 'pago') return { tipo: 'pago', label: 'Pago', cor: 'bg-success text-success-foreground' };
  const prazo = a.prazo_pagamento;
  if (!prazo) {
    if (sp === 'enviado') return { tipo: 'enviado', label: 'Enviado p/ contabilidade', cor: 'bg-primary text-primary-foreground' };
    return { tipo: 'pendente', dias: 0, label: 'Pendente', cor: 'bg-warning text-warning-foreground' };
  }
  const d = daysBetween(today(), prazo);
  if (d < 0) return { tipo: 'vencido', dias: d, label: `Pagamento VENCIDO há ${Math.abs(d)}d`, cor: 'bg-destructive text-destructive-foreground' };
  if (d <= 3) return { tipo: 'vencendo', dias: d, label: `Pagar em ${d}d`, cor: 'bg-destructive/80 text-destructive-foreground' };
  if (sp === 'enviado') return { tipo: 'enviado', label: `Enviado — pagar em ${d}d`, cor: 'bg-primary text-primary-foreground' };
  return { tipo: 'pendente', dias: d, label: `Pendente — pagar em ${d}d`, cor: 'bg-warning text-warning-foreground' };
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

  const [filterStatus, setFilterStatus] = useState<'todos' | 'proximas' | 'em_ferias' | 'retorno' | 'concluidos' | 'cancelados' | 'pgto_pendente' | 'pgto_vencendo' | 'pgto_vencido'>('todos');

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
          categoria: 'ferias',
          competencia: gozoInicio.slice(0, 7),
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


  const enviarParaContabilidade = async (a: FeriasAviso) => {
    if (!session?.user) return;
    // Buscar destinatários configurados
    const { data: cfg } = await supabase
      .from('config_emails_contabilidade' as any)
      .select('*').limit(1).maybeSingle();
    const c = (cfg as any) || {};
    const to = [c.email_robson, c.email_marisa].filter(Boolean);
    const cc = (c.emails_copia || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    if (to.length === 0) {
      toast.error('Configure os e-mails da contabilidade em Admin → E-mails Contabilidade');
      return;
    }

    // Baixa o PDF localmente para o operador anexar manualmente
    baixarAviso(a);

    const subject = `Aviso de Férias - ${a.funcionario_nome} - ${a.empresa_nome}`;
    const body =
`Olá,

Segue aviso de férias para conferência e providências de pagamento.

Funcionário: ${a.funcionario_nome}
CPF: ${a.funcionario_cpf}
Empresa/Filial: ${a.empresa_nome}
Cargo: ${a.funcionario_cargo}
Período de férias: ${formatDate(a.periodo_gozo_inicio)} até ${formatDate(a.data_retorno)}
Quantidade de dias: ${a.dias_ferias}
Data limite para pagamento: ${a.prazo_pagamento ? formatDate(a.prazo_pagamento) : '—'}
Status: ${a.status_pagamento || 'pendente'}

(O PDF do aviso foi baixado automaticamente — arraste-o nesta janela do Outlook para anexar.)

Atenciosamente,
Topac RH PRO`;

    openEmailClient({ to, cc, subject, body });

    const destinos = [...to, ...cc].join(', ');
    await supabase.from('ferias_avisos' as any).update({
      status_pagamento: a.status_pagamento === 'pago' ? 'pago' : 'enviado',
      enviado_contabilidade_em: new Date().toISOString(),
      enviado_contabilidade_por: session.user.email || '',
      enviado_contabilidade_destinos: destinos,
    } as any).eq('id', a.id);

    toast.success('Enviado para contabilidade — registrado no histórico');
    fetchAvisos();
  };

  const marcarPago = async (a: FeriasAviso, valor?: number) => {
    const { error } = await supabase.from('ferias_avisos' as any).update({
      status_pagamento: 'pago',
      data_pagamento: today(),
      valor_pago: valor ?? null,
    } as any).eq('id', a.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Pagamento confirmado');
    fetchAvisos();
  };

  // Listagens com situação calculada
  const avisosCalc = useMemo(() => avisos.map(a => ({
    ...a,
    situacao: computarSituacao(a),
    pagamento: computarPagamento(a),
  })), [avisos]);

  // === Funcionários ativos com cálculo automático de período aquisitivo/vencimento ===
  type FuncFerias = {
    emp: typeof empsList[number];
    empresaNome: string;
    aquisitivoIni: string;
    aquisitivoFim: string;
    limiteConcessao: string; // 11 meses após fim aquisitivo
    diasParaLimite: number;
    statusFerias: 'ok' | 'proximas' | 'urgente' | 'vencendo' | 'vencido';
    label: string;
    cor: string;
    temAvisoAtivo: boolean;
  };

  const funcionariosFerias: FuncFerias[] = useMemo(() => {
    const hoje = today();
    const list: FuncFerias[] = empsList.map(emp => {
      const co = companies.find(c => c.id === emp.companyId);
      const empresaNome = co?.name || '';
      const adm = emp.dataAdmissao;
      let aquisitivoIni = '';
      let aquisitivoFim = '';
      let limiteConcessao = '';
      let diasParaLimite = 99999;
      if (adm) {
        // calcula período aquisitivo corrente: encontra o ciclo de 12 meses cujo fim seja >= hoje (ou o último completado)
        const admDate = new Date(adm + 'T12:00:00');
        const hojeDate = new Date(hoje + 'T12:00:00');
        const yearsSinceAdm = (hojeDate.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        // ciclo já completado mais recente
        const ciclo = Math.max(0, Math.floor(yearsSinceAdm) - 1);
        const ini = new Date(admDate);
        ini.setFullYear(ini.getFullYear() + ciclo);
        const fim = new Date(ini);
        fim.setFullYear(fim.getFullYear() + 1);
        aquisitivoIni = ini.toISOString().slice(0, 10);
        aquisitivoFim = fim.toISOString().slice(0, 10);
        // CLT: gozo até 11 meses após o fim do aquisitivo (12 meses concessivo - 1 mês mínimo de gozo)
        const limite = new Date(fim);
        limite.setMonth(limite.getMonth() + 11);
        limiteConcessao = limite.toISOString().slice(0, 10);
        diasParaLimite = daysBetween(hoje, limiteConcessao);
      }
      let statusFerias: FuncFerias['statusFerias'] = 'ok';
      let label = 'Sem urgência';
      let cor = 'bg-muted text-muted-foreground';
      if (adm) {
        if (diasParaLimite < 0) { statusFerias = 'vencido'; label = `VENCIDO há ${Math.abs(diasParaLimite)}d`; cor = 'bg-destructive text-destructive-foreground'; }
        else if (diasParaLimite <= 30) { statusFerias = 'vencendo'; label = `Vence em ${diasParaLimite}d`; cor = 'bg-destructive/80 text-destructive-foreground'; }
        else if (diasParaLimite <= 60) { statusFerias = 'urgente'; label = `Conceder em ${diasParaLimite}d`; cor = 'bg-warning text-warning-foreground'; }
        else if (diasParaLimite <= 120) { statusFerias = 'proximas'; label = `Conceder em ${diasParaLimite}d`; cor = 'bg-primary text-primary-foreground'; }
        else { label = `Conceder em ${diasParaLimite}d`; }
      } else {
        label = 'Sem data de admissão';
      }
      const temAvisoAtivo = avisos.some(a =>
        a.funcionario_id === emp.id &&
        a.status !== 'cancelado' &&
        daysBetween(today(), a.data_retorno) >= 0
      );
      return { emp, empresaNome, aquisitivoIni, aquisitivoFim, limiteConcessao, diasParaLimite, statusFerias, label, cor, temAvisoAtivo };
    });
    // ordena por urgência
    list.sort((a, b) => a.diasParaLimite - b.diasParaLimite);
    return list;
  }, [empsList, companies, avisos]);

  const [funcSearch, setFuncSearch] = useState('');
  const [funcFilter, setFuncFilter] = useState<'todos' | 'urgentes' | 'sem_aviso'>('urgentes');

  const funcionariosFiltrados = useMemo(() => {
    let list = funcionariosFerias;
    if (funcSearch) {
      const q = funcSearch.toLowerCase();
      list = list.filter(f =>
        f.emp.name.toLowerCase().includes(q) ||
        (f.emp.cpf || '').includes(q) ||
        f.empresaNome.toLowerCase().includes(q)
      );
    }
    if (funcFilter === 'urgentes') list = list.filter(f => ['vencido', 'vencendo', 'urgente', 'proximas'].includes(f.statusFerias));
    if (funcFilter === 'sem_aviso') list = list.filter(f => !f.temAvisoAtivo);
    return list;
  }, [funcionariosFerias, funcSearch, funcFilter]);

  const gerarAvisoDireto = (f: FuncFerias) => {
    setEditingId(null);
    setEmpId(f.emp.id);
    setPaIni(f.aquisitivoIni);
    setPaFim(f.aquisitivoFim);
    // sugere início no próximo dia útil (hoje + 35d se não vencido, ou amanhã se vencido)
    const sugestaoIni = f.statusFerias === 'vencido' ? addDays(today(), 1) : addDays(today(), 35);
    // não pode passar do limite de concessão
    const inicioFinal = f.limiteConcessao && daysBetween(sugestaoIni, f.limiteConcessao) < 30
      ? addDays(f.limiteConcessao, -30)
      : sugestaoIni;
    setGozoInicio(inicioFinal);
    setDiasFerias(30);
    setObservacao('');
    setOpenForm(true);
  };

  const imprimirAvisoFuncionario = (f: FuncFerias) => {
    const co = companies.find(c => c.id === f.emp.companyId);
    if (!co) { toast.error('Empresa do funcionário não encontrada'); return; }
    const inicio = f.statusFerias === 'vencido' ? addDays(today(), 1) : addDays(today(), 35);
    const retorno = addDays(inicio, 30);
    const pdf = gerarAvisoFeriasPdf({
      empresa: co.name,
      cnpj: co.cnpj,
      nome: f.emp.name,
      cpf: f.emp.cpf,
      rg: f.emp.rg,
      matricula: f.emp.registro,
      funcao: f.emp.cargo,
      dataAdmissao: f.emp.dataAdmissao,
      inicioFerias: inicio,
      retornoFerias: retorno,
      diasFerias: 30,
    });
    downloadPdf(pdf.blob, pdf.fileName);
    toast.success('Aviso (rascunho) gerado — para arquivar no histórico use "Gerar Aviso".');
  };

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
    if (filterStatus === 'pgto_pendente') list = list.filter(a => a.pagamento.tipo === 'pendente' || a.pagamento.tipo === 'enviado');
    if (filterStatus === 'pgto_vencendo') list = list.filter(a => a.pagamento.tipo === 'vencendo');
    if (filterStatus === 'pgto_vencido') list = list.filter(a => a.pagamento.tipo === 'vencido');
    return list;
  }, [avisosCalc, search, filterStatus]);

  const cards = useMemo(() => ({
    proximas: avisosCalc.filter(a => a.situacao.tipo === 'ate_inicio' && a.situacao.dias <= 30).length,
    em_ferias: avisosCalc.filter(a => a.situacao.tipo === 'em_ferias' || a.situacao.tipo === 'ate_retorno').length,
    retornos: avisosCalc.filter(a => a.situacao.tipo === 'em_ferias' && a.situacao.dias <= 7).length,
    urgentes: avisosCalc.filter(a => a.situacao.tipo === 'ate_inicio' && a.situacao.dias <= 7).length,
    pgtoPendente: avisosCalc.filter(a => a.pagamento.tipo === 'pendente' || a.pagamento.tipo === 'enviado').length,
    pgtoVencendo: avisosCalc.filter(a => a.pagamento.tipo === 'vencendo').length,
    pgtoVencido: avisosCalc.filter(a => a.pagamento.tipo === 'vencido').length,
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

      {/* Cards de pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button onClick={() => setFilterStatus('pgto_pendente')}
          className={`card-premium p-4 text-left transition ${filterStatus === 'pgto_pendente' ? 'ring-2 ring-warning' : ''}`}>
          <div className="flex items-center gap-2 text-warning text-xs font-semibold uppercase">
            <DollarSign className="w-4 h-4" /> Pagamento pendente
          </div>
          <p className="text-2xl font-bold mt-2">{cards.pgtoPendente}</p>
        </button>
        <button onClick={() => setFilterStatus('pgto_vencendo')}
          className={`card-premium p-4 text-left transition border-l-4 border-destructive/70 ${filterStatus === 'pgto_vencendo' ? 'ring-2 ring-destructive' : ''}`}>
          <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase">
            <AlertTriangle className="w-4 h-4" /> Pagamento vencendo (≤3d)
          </div>
          <p className="text-2xl font-bold mt-2">{cards.pgtoVencendo}</p>
        </button>
        <button onClick={() => setFilterStatus('pgto_vencido')}
          className={`card-premium p-4 text-left transition border-l-4 border-destructive ${filterStatus === 'pgto_vencido' ? 'ring-2 ring-destructive' : ''}`}>
          <div className="flex items-center gap-2 text-destructive text-xs font-semibold uppercase">
            <AlertTriangle className="w-4 h-4" /> Pagamento VENCIDO
          </div>
          <p className="text-2xl font-bold mt-2">{cards.pgtoVencido}</p>
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
          <option value="pgto_pendente">Pagamento pendente</option>
          <option value="pgto_vencendo">Pagamento vencendo</option>
          <option value="pgto_vencido">Pagamento vencido</option>
        </select>
      </div>

      {/* === Funcionários ativos com cálculo automático de férias === */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Plane className="w-4 h-4 text-primary" /> Funcionários — Férias a vencer
            </h2>
            <p className="text-xs text-muted-foreground">Cálculo automático com base na data de admissão. Gere o aviso direto sem precisar cadastrar manualmente.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Buscar..." value={funcSearch} onChange={e => setFuncSearch(e.target.value)} className="w-48 h-9" />
            <select value={funcFilter} onChange={e => setFuncFilter(e.target.value as any)}
              className="border rounded-lg px-3 py-2 text-xs bg-background text-foreground">
              <option value="urgentes">Apenas urgentes/próximas</option>
              <option value="sem_aviso">Sem aviso ativo</option>
              <option value="todos">Todos os ativos</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr className="border-b">
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Funcionário</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Empresa</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Admissão</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Aquisitivo</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Limite p/ conceder</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcionariosFiltrados.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">Nenhum funcionário encontrado.</td></tr>
              )}
              {funcionariosFiltrados.map(f => (
                <tr key={f.emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium text-xs">
                    {f.emp.name}
                    <div className="text-[10px] text-muted-foreground">{f.emp.cargo}</div>
                  </td>
                  <td className="px-3 py-2 text-[11px]">{f.empresaNome}</td>
                  <td className="px-3 py-2 text-[11px]">{f.emp.dataAdmissao ? formatDate(f.emp.dataAdmissao) : '—'}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {f.aquisitivoIni ? `${formatDate(f.aquisitivoIni)} → ${formatDate(f.aquisitivoFim)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px]">{f.limiteConcessao ? formatDate(f.limiteConcessao) : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] ${f.cor}`}>{f.label}</Badge>
                    {f.temAvisoAtivo && <Badge variant="outline" className="ml-1 text-[10px] border-success text-success">Aviso ativo</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-[11px]" onClick={() => gerarAvisoDireto(f)}>
                        <Plus className="w-3 h-3 mr-1" /> Gerar Aviso
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Imprimir rascunho" onClick={() => imprimirAvisoFuncionario(f)}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-2 text-[11px] text-muted-foreground border-t bg-muted/20">
          {funcionariosFiltrados.length} funcionário(s) • Limite legal CLT: férias devem ser concedidas em até 11 meses após o fim do período aquisitivo.
        </div>
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
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Prazo Pgto</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pagamento</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Situação</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>)}
            {!loading && filtrados.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhum aviso de férias cadastrado.</td></tr>
            )}
            {filtrados.map(a => (
              <tr key={a.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{a.funcionario_nome}<div className="text-[10px] text-muted-foreground">{a.funcionario_cargo}</div></td>
                <td className="px-3 py-2.5 text-xs">{a.empresa_nome}</td>
                <td className="px-3 py-2.5 text-xs">{formatDate(a.periodo_gozo_inicio)}</td>
                <td className="px-3 py-2.5 text-xs">{formatDate(a.data_retorno)}</td>
                <td className="px-3 py-2.5 text-xs">{a.dias_ferias}</td>
                <td className="px-3 py-2.5 text-xs">{a.prazo_pagamento ? formatDate(a.prazo_pagamento) : '—'}</td>
                <td className="px-3 py-2.5">
                  <Badge className={`text-[10px] ${a.pagamento.cor}`}>{a.pagamento.label}</Badge>
                  {a.enviado_contabilidade_em && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Enviado em {new Date(a.enviado_contabilidade_em).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                </td>
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
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Enviar para Contabilidade" onClick={() => enviarParaContabilidade(a)}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                    {a.pagamento.tipo !== 'pago' && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-success" title="Marcar como pago" onClick={() => marcarPago(a)}>
                        <DollarSign className="w-3.5 h-3.5" />
                      </Button>
                    )}
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
                <div><span className="text-xs text-muted-foreground block">Prazo de Pagamento</span>
                  <strong>{detail.prazo_pagamento ? formatDate(detail.prazo_pagamento) : '—'}</strong>
                  <Badge className={`ml-2 text-[10px] ${detail.pagamento.cor}`}>{detail.pagamento.label}</Badge>
                </div>
                {detail.data_pagamento && (
                  <div><span className="text-xs text-muted-foreground block">Pago em</span>{formatDate(detail.data_pagamento)}</div>
                )}
                {detail.enviado_contabilidade_em && (
                  <div className="col-span-2 text-xs bg-primary/5 p-2 rounded border border-primary/20">
                    <span className="text-muted-foreground">Enviado para contabilidade em </span>
                    <strong>{new Date(detail.enviado_contabilidade_em).toLocaleString('pt-BR')}</strong>
                    {detail.enviado_contabilidade_por && <> por <strong>{detail.enviado_contabilidade_por}</strong></>}
                    {detail.enviado_contabilidade_destinos && (
                      <div className="text-[10px] text-muted-foreground mt-1">Destinatários: {detail.enviado_contabilidade_destinos}</div>
                    )}
                  </div>
                )}
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
                <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => enviarParaContabilidade(detail)}>
                  <Send className="w-3.5 h-3.5 mr-1" /> {detail.enviado_contabilidade_em ? 'Reenviar para Contabilidade' : 'Enviar para Contabilidade'}
                </Button>
                {detail.pagamento.tipo !== 'pago' && (
                  <Button size="sm" variant="outline" className="border-success text-success" onClick={() => marcarPago(detail)}>
                    <DollarSign className="w-3.5 h-3.5 mr-1" /> Marcar como pago
                  </Button>
                )}
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
