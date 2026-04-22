import React, { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Droplet, Search, Printer, History as HistoryIcon, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface GaloesRow {
  id: string;
  motorista_nome: string;
  cargo: string;
  placa: string;
  modelo: string;
  tipo_combustivel: string;
  quantidade_litros: number;
  observacao: string;
  data: string;
  hora: string;
  origem: string;
  created_at: string;
}

const TIPO_LABEL: Record<string, string> = {
  gasolina: 'Gasolina',
  diesel: 'Diesel',
  diesel_s10: 'Diesel S10',
  etanol: 'Etanol',
};

const CombustivelPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [tipoCombustivel, setTipoCombustivel] = useState('gasolina');
  const [quantidade, setQuantidade] = useState('15');
  const [observacoes, setObservacoes] = useState('');
  const [dataRetirada, setDataRetirada] = useState(new Date().toISOString().slice(0, 10));
  const [historico, setHistorico] = useState<GaloesRow[]>([]);
  const [filtroComp, setFiltroComp] = useState(new Date().toISOString().slice(0, 7));
  const [salvando, setSalvando] = useState(false);

  const topacMatriz = companies.find(c => c.id === 'topac-matriz');
  const filteredEmps = employees.filter(e =>
    e.status === 'ativo' && e.categoria === 'operacional' &&
    (e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.cpf.includes(search) || e.cargo.toLowerCase().includes(search.toLowerCase()))
  );

  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;

  const carregar = async () => {
    const { data } = await supabase
      .from('combustivel_galoes')
      .select('*')
      .like('competencia', `${filtroComp}%`)
      .order('created_at', { ascending: false })
      .limit(200);
    setHistorico((data as any) || []);
  };

  useEffect(() => { carregar(); }, [filtroComp]);

  const salvar = async () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const litros = Number(String(quantidade).replace(',', '.'));
    if (!litros || litros <= 0) { toast.error('Quantidade inválida'); return; }
    setSalvando(true);
    try {
      const dt = new Date(dataRetirada + 'T12:00:00');
      const { error } = await supabase.from('combustivel_galoes').insert({
        motorista_nome: emp.name,
        cargo: emp.cargo,
        placa: '',
        modelo: '',
        tipo_combustivel: tipoCombustivel,
        quantidade_litros: litros,
        observacao: observacoes,
        data: dataRetirada,
        hora: new Date().toTimeString().slice(0, 8),
        competencia: dataRetirada.slice(0, 7),
        origem: 'central',
      });
      if (error) throw error;
      toast.success('Retirada do galão registrada');
      setObservacoes('');
      carregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const handlePrint = () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const co = topacMatriz || company;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Retirada de Combustível (Galão)</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    .title{font-size:16px;font-weight:bold;text-align:right}
    .block{border:1px solid #ccc;border-radius:4px;padding:10px;margin-bottom:12px}
    .block-title{font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:6px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
    .field{font-size:11px}.field span{color:#666}
    table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}
    th{background:#f5f5f5;font-weight:bold}
    .signatures{display:flex;justify-content:space-between;margin-top:60px}
    .sig-line{text-align:center;width:45%}.sig-line hr{border:0;border-top:1px solid #000;margin-bottom:4px}
    .footer{margin-top:30px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px}
    </style></head><body>
    <div class="header"><div><strong>${co?.name || 'TOPAC MATRIZ'}</strong><br/><span style="font-size:10px">CNPJ: ${co?.cnpj || ''}</span></div>
    <div class="title">RETIRADA DE COMBUSTÍVEL<br/>(GALÃO INTERNO)</div></div>
    <div class="block"><div class="block-title">Identificação do Colaborador</div>
    <div class="grid">
    <div class="field"><span>Nome:</span> ${emp.name}</div>
    <div class="field"><span>Empresa:</span> ${company?.name || co?.name}</div>
    <div class="field"><span>CPF:</span> ${emp.cpf}</div>
    <div class="field"><span>Função:</span> ${emp.cargo}</div>
    <div class="field"><span>Matrícula:</span> ${emp.registro || '—'}</div>
    <div class="field"><span>Data:</span> ${new Date(dataRetirada).toLocaleDateString('pt-BR')}</div>
    </div></div>
    <table><thead><tr><th>Tipo de Combustível</th><th>Quantidade</th><th>Observações</th></tr></thead>
    <tbody><tr><td>${TIPO_LABEL[tipoCombustivel] || tipoCombustivel}</td><td>${quantidade} litros</td><td>${observacoes || '—'}</td></tr></tbody></table>
    <div class="signatures">
    <div class="sig-line"><hr/><small>Assinatura do Colaborador</small></div>
    <div class="sig-line"><hr/><small>Assinatura do Responsável</small></div>
    </div>
    <div class="footer">Topac RH Multiempresa PRO — Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </body></html>`);
    printWin.document.close();
    printWin.print();
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Droplet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Combustível dos Galões</h1>
            <p className="text-primary-foreground/70 text-sm">Controle interno · separado do Abastecimento (Posto/QR)</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Nova retirada</h2>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário (nome, CPF, função)..." value={search}
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
            {filteredEmps.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum encontrado</p>}
          </div>
        )}
        {emp && company && (
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{emp.name}</strong></div>
            <div><span className="text-muted-foreground text-xs block">Empresa</span>{company.name}</div>
            <div><span className="text-muted-foreground text-xs block">CNPJ</span>{company.cnpj}</div>
            <div><span className="text-muted-foreground text-xs block">Função</span>{emp.cargo}</div>
            <div><span className="text-muted-foreground text-xs block">CPF</span>{emp.cpf}</div>
            <div><span className="text-muted-foreground text-xs block">Matrícula</span>{emp.registro || '—'}</div>
            <div>
              <span className="text-muted-foreground text-xs block">Data</span>
              <Input type="date" value={dataRetirada} onChange={e => setDataRetirada(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setSelectedEmpId('')} className="text-xs text-destructive">Trocar</Button>
            </div>
          </div>
        )}

        {emp && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Tipo de Combustível</label>
                <select value={tipoCombustivel} onChange={e => setTipoCombustivel(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                  <option value="gasolina">Gasolina</option>
                  <option value="diesel">Diesel</option>
                  <option value="diesel_s10">Diesel S10</option>
                  <option value="etanol">Etanol</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quantidade (litros)</label>
                <Input value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Observações</label>
                <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional..." />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={salvar} disabled={salvando} className="gradient-accent text-accent-foreground font-semibold">
                <Save className="w-4 h-4 mr-2" /> Salvar retirada
              </Button>
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" /> Imprimir comprovante
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <HistoryIcon className="w-4 h-4" /> Histórico — Combustível dos Galões
          </h2>
          <Input
            type="month"
            value={filtroComp}
            onChange={(e) => setFiltroComp(e.target.value)}
            className="h-8 w-44 text-xs"
          />
        </div>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma retirada nesta competência</p>
        ) : (
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Data/Hora</th>
                  <th className="text-left p-2">Motorista</th>
                  <th className="text-left p-2">Cargo</th>
                  <th className="text-left p-2">Veículo</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Litros</th>
                  <th className="text-left p-2">Origem</th>
                  <th className="text-left p-2">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(h.data).toLocaleDateString('pt-BR')} {h.hora?.slice(0, 5)}
                    </td>
                    <td className="p-2">{h.motorista_nome}</td>
                    <td className="p-2 text-muted-foreground">{h.cargo || '—'}</td>
                    <td className="p-2">{h.placa || '—'} {h.modelo ? `· ${h.modelo}` : ''}</td>
                    <td className="p-2">{TIPO_LABEL[h.tipo_combustivel] || h.tipo_combustivel}</td>
                    <td className="p-2 text-right font-semibold">{Number(h.quantidade_litros).toFixed(2)} L</td>
                    <td className="p-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        h.origem === 'app' ? 'bg-amber-500/15 text-amber-700' : 'bg-blue-500/15 text-blue-700'
                      }`}>{h.origem}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{h.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombustivelPage;
