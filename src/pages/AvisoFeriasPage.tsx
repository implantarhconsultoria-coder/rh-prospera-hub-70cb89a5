import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Printer, Save, ArrowLeft, AlertTriangle, Mail } from 'lucide-react';
import { formatDate, feriasStatus } from '@/lib/calculations';
import { toast } from 'sonner';
import { openEmailClient, getDestinatariosFerias, CC_OBRIGATORIO } from '@/lib/emailUtils';
import { arquivarDocumentoFuncionario, marcarComoEnviado } from '@/lib/documentoHistorico';
import { gerarAvisoFeriasPdf, downloadPdf } from '@/lib/pdfGenerator';
import { supabase } from '@/integrations/supabase/client';

type FeriasAvisoRow = {
  id: string;
  funcionario_id: string | null;
  company_id: string | null;
  funcionario_nome: string;
  funcionario_cpf: string;
  funcionario_cargo: string;
  empresa_nome: string;
  periodo_gozo_inicio: string;
  periodo_gozo_fim: string;
  data_retorno: string;
  dias_ferias: number;
  status: string;
  status_pagamento: string;
  observacao: string;
  aviso_pdf_url: string;
  created_at: string;
  updated_at: string;
};

type FeriasStatusCode = 'em_dia' | 'atencao' | 'vencido' | 'marcada' | 'em_ferias' | 'ja_tirou';

type FeriasInfo = {
  code: FeriasStatusCode;
  status: string;
  label: string;
  mesesNoPeriodo: number;
  periodoAtual: number;
  inicio?: string;
  fim?: string;
  dias?: number;
  origem: 'cadastro' | 'salvo' | 'rascunho';
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const toDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const toISODateOnly = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const todayISO = () => toISODateOnly(new Date());

const addDaysISO = (value: string, days: number) => {
  const date = toDateOnly(value);
  date.setDate(date.getDate() + days);
  return toISODateOnly(date);
};

const feriasPeriodoStatus = (inicio?: string, fim?: string): Pick<FeriasInfo, 'code' | 'label'> | null => {
  if (!inicio || !fim) return null;
  const hoje = todayISO();
  if (hoje < inicio) return { code: 'marcada', label: 'Férias marcadas' };
  if (hoje <= fim) return { code: 'em_ferias', label: 'Em férias' };
  return { code: 'ja_tirou', label: 'Já tirou' };
};

const legacyBadgeStatus = (code: FeriasStatusCode) => {
  if (code === 'em_dia' || code === 'ja_tirou') return 'em dia';
  if (code === 'atencao' || code === 'marcada' || code === 'em_ferias') return 'atenção';
  return 'vencido';
};

const feriasFallbackStatus = (dataAdmissao: string): FeriasInfo => {
  const fer = feriasStatus(dataAdmissao);
  const raw = String(fer.status);
  if (raw === 'vencido') {
    return { code: 'vencido', status: 'vencido', label: 'Vencido', mesesNoPeriodo: fer.mesesNoPeriodo, periodoAtual: fer.periodoAtual, origem: 'cadastro' };
  }
  if (raw === 'em dia') {
    return { code: 'em_dia', status: 'em dia', label: 'Em dia', mesesNoPeriodo: fer.mesesNoPeriodo, periodoAtual: fer.periodoAtual, origem: 'cadastro' };
  }
  return { code: 'atencao', status: 'atenção', label: 'Atenção', mesesNoPeriodo: fer.mesesNoPeriodo, periodoAtual: fer.periodoAtual, origem: 'cadastro' };
};

const buildFeriasInfo = (
  dataAdmissao: string,
  aviso?: FeriasAvisoRow,
  rascunho?: { inicio: string; fim: string; dias: number },
): FeriasInfo => {
  const base = feriasFallbackStatus(dataAdmissao);
  const periodo = rascunho?.inicio
    ? { inicio: rascunho.inicio, fim: rascunho.fim, dias: rascunho.dias, origem: 'rascunho' as const }
    : aviso?.periodo_gozo_inicio
      ? { inicio: aviso.periodo_gozo_inicio, fim: aviso.periodo_gozo_fim || aviso.data_retorno, dias: Number(aviso.dias_ferias) || undefined, origem: 'salvo' as const }
      : null;
  const statusPeriodo = periodo ? feriasPeriodoStatus(periodo.inicio, periodo.fim) : null;
  if (!periodo || !statusPeriodo) return base;
  return {
    ...base,
    ...statusPeriodo,
    status: legacyBadgeStatus(statusPeriodo.code),
    inicio: periodo.inicio,
    fim: periodo.fim,
    dias: periodo.dias,
    origem: periodo.origem,
  };
};

const statusBadgeClass = (code: FeriasStatusCode) => {
  if (code === 'em_dia' || code === 'ja_tirou') return 'bg-success text-success-foreground';
  if (code === 'atencao' || code === 'marcada' || code === 'em_ferias') return 'bg-warning text-warning-foreground';
  return 'bg-destructive text-destructive-foreground';
};

const statusOutlineClass = (code: FeriasStatusCode) => {
  if (code === 'em_dia' || code === 'ja_tirou') return 'border-success text-success';
  if (code === 'atencao' || code === 'marcada' || code === 'em_ferias') return 'border-warning text-warning';
  return 'border-destructive text-destructive';
};

const statusOrder: Record<FeriasStatusCode, number> = {
  em_ferias: 0,
  vencido: 1,
  atencao: 2,
  marcada: 3,
  em_dia: 4,
  ja_tirou: 5,
};

const AvisoFeriasPage: React.FC = () => {
  const { companies, employees, updateEmployee, session } = useApp();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inicioFerias, setInicioFerias] = useState('');
  const [diasFerias, setDiasFerias] = useState(30);
  const [filterCompany, setFilterCompany] = useState('');
  const [feriasAvisos, setFeriasAvisos] = useState<FeriasAvisoRow[]>([]);
  const [savingFerias, setSavingFerias] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const feriasByEmployee = useMemo(() => {
    const map = new Map<string, FeriasAvisoRow>();
    feriasAvisos.forEach(aviso => {
      if (aviso.funcionario_id && !map.has(aviso.funcionario_id)) {
        map.set(aviso.funcionario_id, aviso);
      }
    });
    return map;
  }, [feriasAvisos]);

  useEffect(() => {
    const loadFeriasAvisos = async () => {
      const employeeIds = employees
        .filter(e => e.status === 'ativo' && e.categoria === 'operacional')
        .filter(e => !isFilial || e.companyId === filialCompanyId)
        .map(e => e.id);
      if (employeeIds.length === 0) {
        setFeriasAvisos([]);
        return;
      }

      const { data, error } = await supabase
        .from('ferias_avisos')
        .select('id, funcionario_id, company_id, funcionario_nome, funcionario_cpf, funcionario_cargo, empresa_nome, periodo_gozo_inicio, periodo_gozo_fim, data_retorno, dias_ferias, status, status_pagamento, observacao, aviso_pdf_url, created_at, updated_at')
        .in('funcionario_id', employeeIds)
        .order('periodo_gozo_inicio', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar avisos de ferias:', error);
        toast.error('Erro ao carregar historico de ferias');
        return;
      }

      setFeriasAvisos((data || []) as FeriasAvisoRow[]);
    };

    loadFeriasAvisos();
  }, [employees, isFilial, filialCompanyId]);

  useEffect(() => {
    if (!selectedEmpId) return;
    const aviso = feriasByEmployee.get(selectedEmpId);
    if (aviso?.periodo_gozo_inicio) {
      setInicioFerias(aviso.periodo_gozo_inicio);
      setDiasFerias(Number(aviso.dias_ferias) || 30);
      return;
    }
    setInicioFerias('');
    setDiasFerias(30);
  }, [selectedEmpId, feriasByEmployee]);

  const empsList = useMemo(() => {
    return employees
      .filter(e => {
        if (e.status !== 'ativo' || e.categoria !== 'operacional') return false;
        if (isFilial && e.companyId !== filialCompanyId) return false;
        return true;
      })
      .map(e => {
        const fer = buildFeriasInfo(e.dataAdmissao, feriasByEmployee.get(e.id));
        return { ...e, ferCode: fer.code, ferStatus: fer.status, ferLabel: fer.label, ferMeses: fer.mesesNoPeriodo, ferInicio: fer.inicio, ferFim: fer.fim };
      })
      .filter(e => {
        if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.cpf.includes(search)) return false;
        if (filterCompany && e.companyId !== filterCompany) return false;
        return true;
      })
      .sort((a, b) => {
        return (statusOrder[a.ferCode as FeriasStatusCode] ?? 9) - (statusOrder[b.ferCode as FeriasStatusCode] ?? 9);
      });
  }, [employees, search, filterCompany, isFilial, filialCompanyId, feriasByEmployee]);

  const alertas = useMemo(() => empsList.filter(e => e.ferCode === 'vencido' || e.ferCode === 'atencao' || e.ferCode === 'em_ferias'), [empsList]);

  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;

  const calcRetorno = () => {
    if (!inicioFerias) return '';
    return addDaysISO(inicioFerias, Math.max(0, diasFerias - 1));
  };
  const retorno = calcRetorno();

  const salvarFeriasNoBanco = async (options: { silent?: boolean; avisoPdfUrl?: string } = {}) => {
    if (!emp || !inicioFerias) { toast.error('Selecione funcionario e data'); return null; }
    if (!retorno) { toast.error('Informe o periodo de ferias'); return null; }

    setSavingFerias(true);
    try {
      const avisoAtual = feriasByEmployee.get(emp.id);
      const statusAtual = feriasPeriodoStatus(inicioFerias, retorno);
      const observacao = `Ferias de ${diasFerias} dias. Inicio: ${formatDate(inicioFerias)}. Fim/retorno previsto: ${formatDate(retorno)}.`;
      const payload: Record<string, unknown> = {
        funcionario_id: emp.id,
        company_id: emp.companyId,
        funcionario_nome: emp.name,
        funcionario_cpf: emp.cpf,
        funcionario_cargo: emp.cargo,
        empresa_nome: company?.name || '',
        periodo_gozo_inicio: inicioFerias,
        periodo_gozo_fim: retorno,
        data_retorno: retorno,
        dias_ferias: diasFerias,
        status: statusAtual?.code || 'marcada',
        status_pagamento: avisoAtual?.status_pagamento || 'pendente',
        observacao,
        updated_at: new Date().toISOString(),
        user_nome: session?.user?.email || '',
      };
      if (session?.user?.id) payload.user_id = session.user.id;
      if (options.avisoPdfUrl) payload.aviso_pdf_url = options.avisoPdfUrl;

      const feriasTable = supabase.from('ferias_avisos') as any;
      const result = avisoAtual?.id
        ? await feriasTable.update(payload).eq('id', avisoAtual.id).select('*').single()
        : await feriasTable.insert(payload).select('*').single();

      if (result.error) {
        console.error('Erro Supabase ao salvar ferias:', result.error);
        toast.error('Erro ao salvar ferias no banco');
        return null;
      }

      const saved = result.data as FeriasAvisoRow;
      setFeriasAvisos(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);

      await updateEmployee(emp.id, {
        observacoes: `${emp.observacoes || ''}\n[FERIAS] Inicio: ${inicioFerias} | Fim/retorno previsto: ${retorno} | ${diasFerias} dias | Status: ${statusAtual?.label || 'Ferias marcadas'}`.trim(),
      });

      if (!options.silent) toast.success('Ferias salvas e status atualizado!');
      return saved;
    } finally {
      setSavingFerias(false);
    }
  };

  const handleSaveDate = async () => {
    await salvarFeriasNoBanco();
  };

  const gerarPdfAtual = () => {
    if (!emp || !inicioFerias || !company) return null;
    return gerarAvisoFeriasPdf({
      empresa: company.name,
      cnpj: company.cnpj,
      nome: emp.name,
      cpf: emp.cpf,
      rg: emp.rg,
      matricula: emp.registro,
      funcao: emp.cargo,
      dataAdmissao: emp.dataAdmissao,
      inicioFerias,
      retornoFerias: retorno,
      diasFerias,
    });
  };

  const [lastDocId, setLastDocId] = useState('');

  const getNomeUsuarioAtual = async () => {
    if (!session?.user) return '';
    const profile = await supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single();
    return profile.data?.nome_completo || session.user.email || '';
  };

  const arquivarAvisoFerias = async (pdf: { blob: Blob; fileName: string }) => {
    if (!emp || !company || !session?.user) return null;
    const nomeUsuario = await getNomeUsuarioAtual();
    const registro = await arquivarDocumentoFuncionario({
      funcionarioId: emp.id,
      funcionarioNome: emp.name,
      companyId: emp.companyId,
      empresaNome: company.name || '',
      tipoDocumento: 'Aviso de Ferias',
      descricao: `Ferias de ${diasFerias} dias - Inicio: ${new Date(inicioFerias).toLocaleDateString('pt-BR')} - Retorno: ${retorno ? new Date(retorno).toLocaleDateString('pt-BR') : '-'}`,
      conteudo: pdf.blob,
      extensao: 'pdf',
      storageTipo: 'aviso-ferias',
      geradoPorUserId: session.user.id,
      geradoPorNome: nomeUsuario,
      unidade: company.name || '',
    });
    setLastDocId(registro?.id || '');
    return registro;
  };

  const handlePrint = async () => {
    if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
    const pdf = gerarPdfAtual();
    if (!pdf) return;

    downloadPdf(pdf.blob, pdf.fileName);

    if (session?.user) {
      try {
        const registro = await arquivarAvisoFerias(pdf);
        await salvarFeriasNoBanco({ silent: true, avisoPdfUrl: (registro as any)?.arquivo_url || '' });
        setLastDocId(registro?.id || '');
        toast.success('PDF gerado, baixado e salvo no histórico!');
      } catch {
        toast.success('PDF gerado e baixado! (erro ao salvar no histórico)');
      }
    } else {
      toast.success('PDF gerado e baixado!');
    }
  };

  // Detail view
  if (selectedEmpId && emp) {
    const fer = buildFeriasInfo(
      emp.dataAdmissao,
      feriasByEmployee.get(emp.id),
      inicioFerias && retorno ? { inicio: inicioFerias, fim: retorno, dias: diasFerias } : undefined,
    );
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="card-premium p-6 gradient-primary text-primary-foreground">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedEmpId('')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-display">Aviso de Férias — {emp.name}</h1>
              <p className="text-primary-foreground/70 text-sm">{company?.name} — {emp.cargo}</p>
            </div>
          </div>
        </div>

        <div className="card-premium p-5 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Situação de Férias</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground block">Status</span>
              <Badge className={statusBadgeClass(fer.code)}>
                {fer.label}
              </Badge>
            </div>
            <div><span className="text-xs text-muted-foreground block">Admissão</span><strong>{formatDate(emp.dataAdmissao)}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Meses no Período</span><strong>{fer.mesesNoPeriodo} meses</strong></div>
            <div><span className="text-xs text-muted-foreground block">CPF</span>{emp.cpf}</div>
            <div><span className="text-xs text-muted-foreground block">Inicio marcado</span><strong>{fer.inicio ? formatDate(fer.inicio) : 'Sem data'}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Fim/retorno</span><strong>{fer.fim ? formatDate(fer.fim) : 'Sem data'}</strong></div>
          </div>
        </div>

        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Dados das Férias</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="text-xs text-muted-foreground block mb-1">Início das Férias</label>
              <Input type="date" value={inicioFerias} onChange={e => setInicioFerias(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Dias de Férias</label>
              <select value={diasFerias} onChange={e => setDiasFerias(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value={30}>30 dias</option>
                <option value={20}>20 dias</option>
                <option value={15}>15 dias</option>
                <option value={10}>10 dias</option>
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Retorno Previsto</label>
              <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{retorno ? formatDate(retorno) : '—'}</p></div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleSaveDate} variant="outline" disabled={savingFerias}>
              <Save className="w-4 h-4 mr-2" /> {savingFerias ? 'Salvando...' : 'Salvar Data no Cadastro'}
            </Button>
            <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
              <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir Aviso
            </Button>
            <Button onClick={async () => {
              if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
              // 1. Garante PDF baixado para o operador anexar
              const pdf = gerarPdfAtual();
              if (pdf) downloadPdf(pdf.blob, pdf.fileName);
              const registro = pdf ? await arquivarAvisoFerias(pdf) : null;
              await salvarFeriasNoBanco({ silent: true, avisoPdfUrl: (registro as any)?.arquivo_url || '' });

              const destinatarios = getDestinatariosFerias(company?.name || '');
              // 2. Texto humano e legível, sem "+", sem URL params quebrados
              const body = [
                `Segue aviso de férias do(a) colaborador(a) abaixo:`,
                ``,
                `Nome: ${emp.name}`,
                `CPF: ${emp.cpf}`,
                `Cargo: ${emp.cargo}`,
                `Empresa: ${company?.name || ''}`,
                `Início: ${new Date(inicioFerias).toLocaleDateString('pt-BR')}`,
                `Retorno: ${retorno ? new Date(retorno).toLocaleDateString('pt-BR') : '—'}`,
                `Dias: ${diasFerias}`,
                ``,
                `Segue aviso em anexo.`,
                ``,
                `Atenciosamente.`,
              ].join('\n');

              openEmailClient({
                to: destinatarios,
                cc: CC_OBRIGATORIO,
                subject: `Aviso de Férias — ${emp.name} — ${company?.name || ''}`,
                body,
              });

              const documentoId = (registro as any)?.id || lastDocId;
              if (documentoId && session?.user) {
                const nomeUsuario = await getNomeUsuarioAtual();
                await marcarComoEnviado(documentoId, session.user.id, nomeUsuario, [...destinatarios, ...CC_OBRIGATORIO].join(', '));
              }
              toast.success('Outlook aberto — arraste o PDF baixado para anexar');
            }} variant="outline" className="border-primary text-primary hover:bg-primary/10">
              <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <CalendarCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Aviso de Férias</h1>
            <p className="text-primary-foreground/70 text-sm">Clique no funcionário para gerar o aviso</p>
          </div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="card-premium p-4 border-l-4 border-warning bg-warning/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm font-bold text-foreground">{alertas.length} funcionário(s) com férias pendentes</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {alertas.slice(0, 5).map(e => (
              <Badge key={e.id} variant="outline" className="text-xs cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedEmpId(e.id)}>
                {e.name} — {e.ferLabel}
              </Badge>
            ))}
            {alertas.length > 5 && <Badge variant="outline" className="text-xs">+{alertas.length - 5} mais</Badge>}
          </div>
        </div>
      )}

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <Input placeholder="Buscar por nome ou CPF..." value={search}
          onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px]" />
        {!isFilial && (
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            <option value="">Todas Empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      <div className="card-premium overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
              {!isFilial && <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>}
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Cargo</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Admissão</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status Férias</th>
            </tr>
          </thead>
          <tbody>
            {empsList.map(e => {
              const co = companies.find(c => c.id === e.companyId);
              return (
                <tr key={e.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedEmpId(e.id)}>
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  {!isFilial && <td className="px-3 py-2.5 text-muted-foreground">{co?.name}</td>}
                  <td className="px-3 py-2.5">{e.cargo}</td>
                  <td className="px-3 py-2.5 text-xs">{formatDate(e.dataAdmissao)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className={`text-[10px] ${statusOutlineClass(e.ferCode as FeriasStatusCode)}`}>
                      {e.ferLabel}
                    </Badge>
                    {e.ferInicio && e.ferFim && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDate(e.ferInicio)} a {formatDate(e.ferFim)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{empsList.length} funcionário(s)</div>
      </div>
    </div>
  );
};

export default AvisoFeriasPage;
