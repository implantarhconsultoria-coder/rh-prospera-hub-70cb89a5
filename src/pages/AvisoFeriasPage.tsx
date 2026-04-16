import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Printer, Save, ArrowLeft, AlertTriangle, Mail } from 'lucide-react';
import { formatDate, feriasStatus } from '@/lib/calculations';
import { toast } from 'sonner';
import { openEmailClient, DESTINATARIOS, CC_OBRIGATORIO } from '@/lib/emailUtils';
import { registrarDocumento, marcarComoEnviado, uploadDocumentoPdf } from '@/lib/documentoHistorico';

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

  const buildPrintHtml = () => {
    if (!emp || !inicioFerias) return '';
    const co = company;
    return `<!DOCTYPE html><html><head><title>Aviso de Férias</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:0;padding:0}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px}
    .title{font-size:18px;font-weight:bold;text-align:right}
    .block{border:1px solid #ccc;border-radius:4px;padding:12px;margin-bottom:14px}
    .block-title{font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}
    .field{font-size:11px}.field span{color:#666}
    .comunicacao{border:1px solid #ccc;border-radius:4px;padding:14px;margin-bottom:14px;font-size:11px;line-height:1.6}
    .signatures{display:flex;justify-content:space-between;margin-top:50px}
    .sig-line{text-align:center;width:45%}.sig-line hr{border:0;border-top:1px solid #000;margin-bottom:4px}
    </style></head><body>
    <div class="header"><div><strong>${co?.name || ''}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
    <div class="title">AVISO DE<br/>FÉRIAS</div></div>
    <div class="block"><div class="block-title">Dados do Colaborador</div>
    <div class="grid">
    <div class="field"><span>Nome:</span> ${emp.name}</div>
    <div class="field"><span>Função:</span> ${emp.cargo}</div>
    <div class="field"><span>CPF:</span> ${emp.cpf}</div>
    <div class="field"><span>RG:</span> ${emp.rg || '—'}</div>
    <div class="field"><span>Matrícula:</span> ${emp.registro || '—'}</div>
    <div class="field"><span>Empresa:</span> ${co?.name || ''}</div>
    <div class="field"><span>Admissão:</span> ${emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '—'}</div>
    </div></div>
    <div class="comunicacao">
    <strong>COMUNICAÇÃO DE FÉRIAS</strong><br/><br/>
    Comunicamos que o(a) colaborador(a) acima identificado(a) gozará férias de <strong>${diasFerias} dias</strong>,
    com início em <strong>${new Date(inicioFerias).toLocaleDateString('pt-BR')}</strong>
    e retorno em <strong>${retorno ? new Date(retorno).toLocaleDateString('pt-BR') : '—'}</strong>.<br/><br/>
    Data de emissão: ${new Date().toLocaleDateString('pt-BR')}
    </div>
    <div class="signatures">
    <div class="sig-line"><hr/><small>Assinatura do Colaborador</small></div>
    <div class="sig-line"><hr/><small>Assinatura do Responsável</small></div>
    </div>
    </body></html>`;
  };

  const [lastDocId, setLastDocId] = useState('');

  const handlePrint = async () => {
    if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
    const htmlContent = buildPrintHtml();

    // Print
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 300);

    // Archive automatically
    if (session?.user) {
      try {
        const arquivoUrl = await uploadDocumentoPdf(emp.id, 'aviso-ferias', htmlContent);
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
        toast.success('Aviso gerado e salvo no histórico do funcionário!');
      } catch {
        toast.success('Aviso gerado! (erro ao salvar no histórico)');
      }
    } else {
      toast.success('Aviso de férias gerado!');
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
            <Button onClick={() => {
              if (!emp || !inicioFerias) { toast.error('Preencha os dados'); return; }
              openEmailClient({
                to: DESTINATARIOS.ferias,
                cc: CC_OBRIGATORIO,
                subject: `Aviso de Férias — ${emp.name} — ${company?.name || ''}`,
                body: `Prezados,\n\nSegue aviso de férias do(a) colaborador(a) ${emp.name}.\n\nEmpresa: ${company?.name || ''}\nCargo: ${emp.cargo}\nInício: ${new Date(inicioFerias).toLocaleDateString('pt-BR')}\nRetorno: ${retorno ? new Date(retorno).toLocaleDateString('pt-BR') : '—'}\nDias: ${diasFerias}\n\nFavor conferir o documento em anexo.\n\nAtt.`,
              });
              toast.success('Outlook aberto com destinatários preenchidos');
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
