import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Printer, Save, ArrowLeft, AlertTriangle, Mail } from 'lucide-react';
import { formatDate, feriasStatus } from '@/lib/calculations';
import { toast } from 'sonner';
import { openEmailClient, getDestinatariosFerias, CC_OBRIGATORIO } from '@/lib/emailUtils';
import { registrarDocumento, marcarComoEnviado, uploadDocumentoPdf } from '@/lib/documentoHistorico';
import { gerarAvisoFeriasPdf, downloadPdf } from '@/lib/pdfGenerator';

const AvisoFeriasPage: React.FC = () => {
  const { companies, employees, updateEmployee, session } = useApp();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [inicioFerias, setInicioFerias] = useState('');
  const [diasFerias, setDiasFerias] = useState(30);
  const [filterCompany, setFilterCompany] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const empsList = useMemo(() => {
    return employees
      .filter(e => {
        if (e.status !== 'ativo' || e.categoria !== 'operacional') return false;
        if (isFilial && e.companyId !== filialCompanyId) return false;
        return true;
      })
      .map(e => {
        const fer = feriasStatus(e.dataAdmissao);
        return { ...e, ferStatus: fer.status, ferMeses: fer.mesesNoPeriodo };
      })
      .filter(e => {
        if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.cpf.includes(search)) return false;
        if (filterCompany && e.companyId !== filterCompany) return false;
        return true;
      })
      .sort((a, b) => {
        const order = { vencida: 0, atenção: 1, 'em dia': 2 };
        return (order[a.ferStatus as keyof typeof order] ?? 2) - (order[b.ferStatus as keyof typeof order] ?? 2);
      });
  }, [employees, search, filterCompany, isFilial, filialCompanyId]);

  const alertas = useMemo(() => empsList.filter(e => e.ferStatus === 'vencido' || e.ferStatus === 'atenção'), [empsList]);

  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;

  const calcRetorno = () => {
    if (!inicioFerias) return '';
    const d = new Date(inicioFerias);
    d.setDate(d.getDate() + diasFerias);
    return d.toISOString().slice(0, 10);
  };
  const retorno = calcRetorno();

  const handleSaveDate = () => {
    if (!emp || !inicioFerias) { toast.error('Selecione funcionário e data'); return; }
    updateEmployee(emp.id, {
      observacoes: `${emp.observacoes}\n[FÉRIAS] Início previsto: ${inicioFerias} | Retorno: ${retorno} | ${diasFerias} dias`.trim(),
    });
    toast.success('Data de férias salva no cadastro!');
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

  const handlePrint = async () => {
    if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
    const pdf = gerarPdfAtual();
    if (!pdf) return;

    downloadPdf(pdf.blob, pdf.fileName);

    if (session?.user) {
      try {
        const arquivoUrl = await uploadDocumentoPdf(emp.id, 'aviso-ferias', pdf.blob, 'pdf');
        const profile = await import('@/integrations/supabase/client').then(m =>
          m.supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single()
        );
        const nomeUsuario = profile.data?.nome_completo || session.user.email || '';

        const registro = await registrarDocumento({
          funcionarioId: emp.id,
          funcionarioNome: emp.name,
          companyId: emp.companyId,
          empresaNome: company?.name || '',
          tipoDocumento: 'Aviso de Férias',
          descricao: `Férias de ${diasFerias} dias — Início: ${new Date(inicioFerias).toLocaleDateString('pt-BR')} — Retorno: ${retorno ? new Date(retorno).toLocaleDateString('pt-BR') : '—'}`,
          arquivoUrl,
          geradoPorUserId: session.user.id,
          geradoPorNome: nomeUsuario,
          unidade: company?.name || '',
        });
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
    const fer = feriasStatus(emp.dataAdmissao);
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground block">Status</span>
              <Badge className={fer.status === 'em dia' ? 'bg-success text-success-foreground' : fer.status === 'atenção' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}>
                {fer.status}
              </Badge>
            </div>
            <div><span className="text-xs text-muted-foreground block">Admissão</span><strong>{formatDate(emp.dataAdmissao)}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Meses no Período</span><strong>{fer.mesesNoPeriodo} meses</strong></div>
            <div><span className="text-xs text-muted-foreground block">CPF</span>{emp.cpf}</div>
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
            <Button onClick={handleSaveDate} variant="outline">
              <Save className="w-4 h-4 mr-2" /> Salvar Data no Cadastro
            </Button>
            <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
              <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir Aviso
            </Button>
            <Button onClick={async () => {
              if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
              // 1. Garante PDF baixado para o operador anexar
              const pdf = gerarPdfAtual();
              if (pdf) downloadPdf(pdf.blob, pdf.fileName);

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

              if (lastDocId && session?.user) {
                const profile = await import('@/integrations/supabase/client').then(m =>
                  m.supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single()
                );
                const nomeUsuario = profile.data?.nome_completo || session.user.email || '';
                await marcarComoEnviado(lastDocId, session.user.id, nomeUsuario, [...destinatarios, ...CC_OBRIGATORIO].join(', '));
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
                {e.name} — {e.ferStatus}
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
                    <Badge variant="outline" className={`text-[10px] ${e.ferStatus === 'em dia' ? 'border-success text-success' : e.ferStatus === 'atenção' ? 'border-warning text-warning' : 'border-destructive text-destructive'}`}>
                      {e.ferStatus}
                    </Badge>
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
