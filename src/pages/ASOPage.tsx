import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { asoStatus, formatDate } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Stethoscope, Printer, Search, Mail, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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

  const filteredEmps = employees.filter(e => {
    if (e.status !== 'ativo' || e.categoria !== 'operacional') return false;
    if (isFilial && e.companyId !== filialCompanyId) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.cpf.includes(search)) return false;
    return true;
  }).map(e => {
    const aso = asoStatus(e.dataExameMedico);
    return { ...e, asoInfo: aso };
  });
  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;
  const clinica = company ? CLINICAS[company.name] || '' : '';

  const buildFichaHtml = () => {
    const co = company;
    return `<!DOCTYPE html><html><head><title>Ficha de Agendamento ASO</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px}
    .title{font-size:16px;font-weight:bold;text-align:right}
    .block{border:1px solid #ccc;border-radius:4px;padding:12px;margin-bottom:12px}
    .block-title{font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}
    .field{font-size:11px}.field span{color:#666}
    .signatures{display:flex;justify-content:space-between;margin-top:50px}
    .sig-line{text-align:center;width:45%}.sig-line hr{border:0;border-top:1px solid #000;margin-bottom:4px}
    .footer{margin-top:30px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px}
    </style></head><body>
    <div class="header"><div><strong>${co?.name || ''}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
    <div class="title">FICHA DE AGENDAMENTO<br/>ASO</div></div>
    <div class="block"><div class="block-title">Dados do Colaborador</div>
    <div class="grid">
    <div class="field"><span>Nome:</span> ${emp?.name}</div>
    <div class="field"><span>Função:</span> ${emp?.cargo}</div>
    <div class="field"><span>CPF:</span> ${emp?.cpf}</div>
    <div class="field"><span>RG:</span> ${emp?.rg || '—'}</div>
    <div class="field"><span>Admissão:</span> ${emp?.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : '—'}</div>
    <div class="field"><span>Empresa:</span> ${co?.name || ''}</div>
    </div></div>
    <div class="block"><div class="block-title">Dados do Exame</div>
    <div class="grid">
    <div class="field"><span>Data do Exame:</span> ${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : '—'}</div>
    <div class="field"><span>Tipo:</span> ${tipoExame}</div>
    <div class="field"><span>Obra/Local:</span> ${obraLocal || '—'}</div>
    <div class="field"><span>Trabalho em Altura:</span> ${trabalhoAltura ? 'Sim' : 'Não'}</div>
    <div class="field"><span>Espaço Confinado:</span> ${espacoConfinado ? 'Sim' : 'Não'}</div>
    <div class="field"><span>Responsável/Contato:</span> ${responsavelContato || '—'}</div>
    </div></div>
    <div class="block"><div class="block-title">Clínica</div>
    <p style="font-size:11px">${clinica || 'Não definida para esta unidade'}</p></div>
    <div class="signatures">
    <div class="sig-line"><hr/><small>Assinatura do Colaborador</small></div>
    <div class="sig-line"><hr/><small>Assinatura do Responsável</small></div>
    </div>
    <div class="footer">Topac RH Multiempresa PRO — Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </body></html>`;
  };

  const handlePrint = () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(buildFichaHtml());
    printWin.document.close();
    printWin.print();
    toast.success('Ficha ASO gerada!');
  };

  const handleOutlook = () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const subject = encodeURIComponent(`Agendamento ASO — ${emp.name} — ${tipoExame}`);
    const body = encodeURIComponent(
      `Prezados,\n\nSolicitamos agendamento de exame ${tipoExame} para o colaborador abaixo:\n\n` +
      `Nome: ${emp.name}\nFunção: ${emp.cargo}\nCPF: ${emp.cpf}\nEmpresa: ${company?.name || ''}\n` +
      `Data pretendida: ${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'}\n` +
      `Obra/Local: ${obraLocal || '—'}\nTrabalho em Altura: ${trabalhoAltura ? 'Sim' : 'Não'}\n` +
      `Espaço Confinado: ${espacoConfinado ? 'Sim' : 'Não'}\n` +
      `Clínica: ${clinica || 'A definir'}\n\n` +
      `Contato: ${responsavelContato || '—'}\n\nAtenciosamente,\nTopac RH`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    toast.success('Outlook aberto com assunto e corpo preenchidos!');
  };

  // Detail view
  if (selectedEmpId && emp && company) {
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
            <Button onClick={async () => {
              if (!emp || !session?.user?.id) return;
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
              if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
              toast.success('Agendamento salvo no banco!');
            }} className="gradient-primary text-primary-foreground font-semibold">
              <Save className="w-4 h-4 mr-2" /> Salvar Agendamento
            </Button>
            <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
              <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir Ficha
            </Button>
            <Button onClick={handleOutlook} variant="outline">
              <Mail className="w-4 h-4 mr-2" /> Enviar via Outlook
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
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">ASO — Ficha de Agendamento</h1>
            <p className="text-primary-foreground/70 text-sm">Clique no funcionário para agendar exame</p>
          </div>
        </div>
      </div>

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
