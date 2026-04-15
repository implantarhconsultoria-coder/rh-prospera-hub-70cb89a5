import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stethoscope, Printer, Search, Mail } from 'lucide-react';
import { toast } from 'sonner';

const CLINICAS: Record<string, string> = {
  'topac-praia-grande': 'Rua Londrina, 483, Centro, Praia Grande/SP',
  'topac-goiania': 'ASMETRO - Medicina do Trabalho, Rua 18, nº 247, Setor Central, Goiânia - GO, CEP 74030-040',
  'topac-matriz': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
  'lmt': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
  'alqui': 'Avenida São João, 313, 1º andar, Centro, São Paulo/SP',
};

const TIPOS_EXAME = [
  'Admissional', 'Demissional', 'Periódico', 'Mudança de Função',
  'Retorno ao Trabalho', 'Avaliação Médica', 'Outros',
];

const ASOPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [dataExame, setDataExame] = useState('');
  const [obraLocal, setObraLocal] = useState('');
  const [tipoExame, setTipoExame] = useState('Periódico');
  const [trabalhoAltura, setTrabalhoAltura] = useState(false);
  const [espacoConfinado, setEspacoConfinado] = useState(false);
  const [responsavelContato, setResponsavelContato] = useState('');

  const filteredEmps = employees.filter(e =>
    e.status === 'ativo' && e.categoria === 'operacional' &&
    (e.name.toLowerCase().includes(search.toLowerCase()) || e.cpf.includes(search))
  );
  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;
  const clinica = company ? CLINICAS[company.id] || '' : '';

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

  const handleEmail = () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const subject = encodeURIComponent(`Agendamento ASO — ${emp.name} — ${tipoExame}`);
    const body = encodeURIComponent(
      `Prezados,\n\nSolicitamos agendamento de exame ${tipoExame} para o colaborador abaixo:\n\n` +
      `Nome: ${emp.name}\nFunção: ${emp.cargo}\nCPF: ${emp.cpf}\nEmpresa: ${company?.name || ''}\n` +
      `Data pretendida: ${dataExame ? new Date(dataExame).toLocaleDateString('pt-BR') : 'A definir'}\n` +
      `Obra/Local: ${obraLocal || '—'}\nTrabalho em Altura: ${trabalhoAltura ? 'Sim' : 'Não'}\n` +
      `Espaço Confinado: ${espacoConfinado ? 'Sim' : 'Não'}\n\n` +
      `Contato: ${responsavelContato || '—'}\n\nAtenciosamente,\nTopac RH`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    toast.success('E-mail preparado para envio!');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Stethoscope className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">ASO — Ficha de Agendamento</h1>
            <p className="text-primary-foreground/70 text-sm">Agendamento de exames médicos</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1" />
        </div>
        {search && !selectedEmpId && (
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {filteredEmps.map(e => {
              const co = companies.find(c => c.id === e.companyId);
              return (
                <button key={e.id} onClick={() => { setSelectedEmpId(e.id); setSearch(''); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex justify-between items-center border-b last:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{co?.name} — {e.cargo}</span>
                </button>
              );
            })}
          </div>
        )}
        {emp && company && (
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{emp.name}</strong></div>
            <div><span className="text-muted-foreground text-xs block">Empresa</span>{company.name}</div>
            <div><span className="text-muted-foreground text-xs block">Função</span>{emp.cargo}</div>
            <div><span className="text-muted-foreground text-xs block">CPF</span>{emp.cpf}</div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setSelectedEmpId('')} className="text-xs text-destructive">Trocar</Button>
            </div>
          </div>
        )}
      </div>

      {emp && (
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
                <input type="checkbox" checked={trabalhoAltura} onChange={e => setTrabalhoAltura(e.target.checked)}
                  className="rounded border-border" /> Trabalho em Altura
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={espacoConfinado} onChange={e => setEspacoConfinado(e.target.checked)}
                  className="rounded border-border" /> Espaço Confinado
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
            <Button onClick={handlePrint} className="gradient-accent text-accent-foreground font-semibold">
              <Printer className="w-4 h-4 mr-2" /> Gerar e Imprimir Ficha
            </Button>
            <Button onClick={handleEmail} variant="outline">
              <Mail className="w-4 h-4 mr-2" /> Enviar por E-mail
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ASOPage;
