import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { asoStatus, formatDate } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Stethoscope, Printer, Search, ArrowLeft, Save, AlertTriangle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { openEmailClient, DESTINATARIOS_ASO, CC_OBRIGATORIO } from '@/lib/emailUtils';
import { registrarDocumento, marcarComoEnviado, uploadDocumentoPdf } from '@/lib/documentoHistorico';
import { gerarFichaASOPdf, downloadPdf } from '@/lib/pdfGenerator';

const CLINICAS: Record<string, string> = {
  'TOPAC MATRIZ': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
  'TOPAC FILIAL PRAIA GRANDE': 'Rua Londrina, 483, Centro, Praia Grande/SP',
  'TOPAC FILIAL GOIÂNIA': 'ASMETRO - Medicina do Trabalho, Rua 18, nº 247, Setor Central, Goiânia - GO, CEP 74030-040',
  'LMT': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
  'ALQUI OBRAS': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
};

const TIPOS_EXAME = [
  'Admissional', 'Demissional', 'Periódico', 'Mudança de Função',
  'Retorno ao Trabalho', 'Avaliação Médica', 'Outros',
];

const ASOPage: React.FC = () => {
  const { companies, employees, session } = useApp();
  const { isFilial, filialCompanyId } = useFilialFilter();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [dataExame, setDataExame] = useState('');
  const [obraLocal, setObraLocal] = useState('');
  const [tipoExame, setTipoExame] = useState('Periódico');
  const [trabalhoAltura, setTrabalhoAltura] = useState(false);
  const [espacoConfinado, setEspacoConfinado] = useState(false);
  const [responsavelContato, setResponsavelContato] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastDocId, setLastDocId] = useState('');

  const filteredEmps = employees.filter(e => {
    if (e.status !== 'ativo' || e.categoria !== 'operacional') return false;
    if (isFilial && e.companyId !== filialCompanyId) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.cpf.includes(search)) return false;
    return true;
  }).map(e => {
    const aso = asoStatus(e.dataExameMedico);
    return { ...e, asoInfo: aso };
  }).sort((a, b) => {
    const order = { vencido: 0, próximo: 1, ok: 2 };
    return (order[a.asoInfo.status as keyof typeof order] ?? 2) - (order[b.asoInfo.status as keyof typeof order] ?? 2);
  });

  const alertas = filteredEmps.filter(e => e.asoInfo.status !== 'ok');

  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;
  const clinica = company ? CLINICAS[company.name] || '' : '';

  const gerarPdfAtual = () => {
    if (!emp || !company) return null;
    return gerarFichaASOPdf({
      empresa: company.name,
      cnpj: company.cnpj,
      nome: emp.name,
      cpf: emp.cpf,
      rg: emp.rg,
      funcao: emp.cargo,
      dataAdmissao: emp.dataAdmissao,
      dataExame,
      tipoExame,
      obraLocal,
      trabalhoAltura,
      espacoConfinado,
      responsavelContato,
      clinica,
    });
  };

  const handlePrint = async () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const pdf = gerarPdfAtual();
    if (!pdf) return;

    // Baixa o PDF localmente — operador anexa no Outlook
    downloadPdf(pdf.blob, pdf.fileName);

    if (session?.user) {
      try {
        const arquivoUrl = await uploadDocumentoPdf(emp.id, 'ficha-aso', pdf.blob, 'pdf');
        const profile = await supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single();
        const nomeUsuario = profile.data?.nome_completo || session.user.email || '';

        const registro = await registrarDocumento({
          funcionarioId: emp.id,
          funcionarioNome: emp.name,
          companyId: emp.companyId,
          empresaNome: company?.name || '',
          tipoDocumento: `Ficha ASO — ${tipoExame}`,
          descricao: `Exame ${tipoExame} — Data: ${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'} — ${obraLocal || 'Sem local'}`,
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

  const handleSave = async () => {
    if (!emp || !session?.user?.id) return;
    setSaving(true);
    const { error } = await supabase.from('aso_agendamentos').insert({
      funcionario_nome: emp.name,
      empresa: company?.name || '',
      funcao: emp.cargo,
      data_exame: dataExame || null,
      tipo_exame: tipoExame.toLowerCase(),
      obra_local: obraLocal,
      trabalho_altura: trabalhoAltura,
      espaco_confinado: espacoConfinado,
      responsavel_contato: responsavelContato,
      clinica_endereco: clinica,
      cpf: emp.cpf,
      rg: emp.rg,
      data_admissao: emp.dataAdmissao || null,
      user_id: session.user.id,
      status: 'pendente',
    });
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Agendamento salvo no banco!');
  };

  // Detail view
  if (selectedEmpId && emp && company) {
    const aso = asoStatus(emp.dataExameMedico);
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="card-premium p-6 gradient-primary text-primary-foreground">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedEmpId('')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-display">ASO — {emp.name}</h1>
              <p className="text-primary-foreground/70 text-sm">{company.name} — {emp.cargo}</p>
            </div>
          </div>
        </div>

        {/* ASO Status - same pattern as Férias */}
        <div className="card-premium p-5 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Situação do ASO</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground block">Status</span>
              <Badge className={aso.status === 'ok' ? 'bg-success text-success-foreground' : aso.status === 'próximo' ? 'bg-warning text-warning-foreground' : 'bg-destructive text-destructive-foreground'}>
                {aso.status === 'ok' ? 'Em dia' : aso.status === 'próximo' ? 'Atenção' : 'Vencido'}
              </Badge>
            </div>
            <div><span className="text-xs text-muted-foreground block">Último Exame</span><strong>{formatDate(emp.dataExameMedico)}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Próximo ASO</span><strong>{formatDate(aso.proximoASO.toISOString())}</strong></div>
            <div><span className="text-xs text-muted-foreground block">Dias Restantes</span><strong>{aso.diasRestantes} dias</strong></div>
          </div>
        </div>

        <div className="card-premium p-5">
          <h2 className="text-sm font-bold text-foreground mb-3">Dados do Colaborador</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{emp.name}</strong></div>
            <div><span className="text-muted-foreground text-xs block">Empresa</span>{company.name}</div>
            <div><span className="text-muted-foreground text-xs block">Função</span>{emp.cargo}</div>
            <div><span className="text-muted-foreground text-xs block">CPF</span>{emp.cpf}</div>
          </div>
        </div>

        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Dados do Exame</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="text-xs text-muted-foreground block mb-1">Data do Exame</label>
              <Input type="date" value={dataExame} onChange={e => setDataExame(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Tipo de Exame</label>
              <select value={tipoExame} onChange={e => setTipoExame(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                {TIPOS_EXAME.map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Obra / Local</label>
              <Input value={obraLocal} onChange={e => setObraLocal(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Responsável / Contato</label>
              <Input value={responsavelContato} onChange={e => setResponsavelContato(e.target.value)} /></div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={trabalhoAltura} onChange={e => setTrabalhoAltura(e.target.checked)} className="rounded border-border" /> Trabalho em Altura
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={espacoConfinado} onChange={e => setEspacoConfinado(e.target.checked)} className="rounded border-border" /> Espaço Confinado
              </label>
            </div>
          </div>
          {clinica && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <span className="text-xs text-muted-foreground block mb-1">Clínica</span>
              <span>{clinica}</span>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground font-semibold">
              <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar Agendamento'}
            </Button>
            <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
              <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir Ficha
            </Button>
            <Button onClick={async () => {
              if (!emp) { toast.error('Selecione um funcionário'); return; }
              // 1. Garante PDF baixado para o operador anexar
              const pdf = gerarPdfAtual();
              if (pdf) downloadPdf(pdf.blob, pdf.fileName);

              // 2. Texto humano e legível, sem "+", sem URL params quebrados
              const linhas = [
                `Solicitamos agendamento de exame ${tipoExame} para o(a) colaborador(a) abaixo:`,
                ``,
                `Nome: ${emp.name}`,
                `CPF: ${emp.cpf}`,
                `Função: ${emp.cargo}`,
                `Empresa: ${company?.name || ''}`,
                `Data sugerida: ${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'}`,
                `Trabalho em Altura: ${trabalhoAltura ? 'Sim' : 'Não'}`,
                `Espaço Confinado: ${espacoConfinado ? 'Sim' : 'Não'}`,
              ];
              if (clinica) linhas.push(`Clínica: ${clinica}`);
              linhas.push('', 'Favor confirmar data e horário.', 'Segue ficha em anexo.', '', 'Atenciosamente.');

              openEmailClient({
                to: DESTINATARIOS_ASO,
                cc: CC_OBRIGATORIO,
                subject: `Agendamento ASO — ${emp.name} — ${tipoExame} — ${company?.name || ''}`,
                body: linhas.join('\n'),
              });

              if (lastDocId && session?.user) {
                const profile = await supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single();
                const nomeUsuario = profile.data?.nome_completo || session.user.email || '';
                await marcarComoEnviado(lastDocId, session.user.id, nomeUsuario, [...DESTINATARIOS_ASO, ...CC_OBRIGATORIO].join(', '));
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

  // List view - same pattern as AvisoFeriasPage
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">ASO — Ficha de Agendamento</h1>
            <p className="text-primary-foreground/70 text-sm">Clique no funcionário para agendar exame</p>
          </div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="card-premium p-4 border-l-4 border-warning bg-warning/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm font-bold text-foreground">{alertas.length} funcionário(s) com ASO pendente</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {alertas.slice(0, 5).map(e => (
              <Badge key={e.id} variant="outline" className="text-xs cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedEmpId(e.id)}>
                {e.name} — {e.asoInfo.status === 'vencido' ? 'Vencido' : 'Atenção'}
              </Badge>
            ))}
            {alertas.length > 5 && <Badge variant="outline" className="text-xs">+{alertas.length - 5} mais</Badge>}
          </div>
        </div>
      )}

      <div className="card-premium p-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CPF..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1" />
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
              {!isFilial && <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa</th>}
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Cargo</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Último ASO</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmps.map(e => {
              const co = companies.find(c => c.id === e.companyId);
              return (
                <tr key={e.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => { setSelectedEmpId(e.id); setSearch(''); }}>
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  {!isFilial && <td className="px-3 py-2.5 text-muted-foreground">{co?.name}</td>}
                  <td className="px-3 py-2.5">{e.cargo}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{e.dataExameMedico ? formatDate(e.dataExameMedico) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge className={`text-[10px] ${e.asoInfo.status === 'ok' ? 'bg-success/20 text-success' : e.asoInfo.status === 'vencido' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                      {e.asoInfo.status === 'ok' ? 'Em dia' : e.asoInfo.status === 'vencido' ? 'Vencido' : 'Atenção'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="p-3 text-xs text-muted-foreground border-t">{filteredEmps.length} funcionário(s)</div>
      </div>
    </div>
  );
};

export default ASOPage;
