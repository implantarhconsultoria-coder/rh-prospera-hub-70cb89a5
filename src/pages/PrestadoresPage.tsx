import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Printer, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Prestador {
  id: string;
  nome: string;
  cpf: string;
  funcao: string;
  empresaPagadora: string;
  diasTrabalho: string;
  pagamentoTipo: string;
  valorDiario: number;
  observacao: string;
  status: string;
  diasTrabalhados: { quinzena: string; dias: number }[];
}

const PrestadoresPage: React.FC = () => {
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: '', cpf: '', funcao: 'Serviços Gerais', valorDiario: 0, observacao: '' });
  const [selectedId, setSelectedId] = useState('');
  const [quinzena, setQuinzena] = useState('1');
  const [diasTrabalhados, setDiasTrabalhados] = useState(0);

  const handleAdd = () => {
    if (!form.nome) { toast.error('Preencha o nome'); return; }
    const p: Prestador = {
      id: `prest-${Date.now()}`, nome: form.nome, cpf: form.cpf, funcao: form.funcao,
      empresaPagadora: 'ALQUI OBRAS', diasTrabalho: 'segunda,quinta',
      pagamentoTipo: 'quinzenal', valorDiario: form.valorDiario,
      observacao: form.observacao, status: 'ativo', diasTrabalhados: [],
    };
    setPrestadores(prev => [...prev, p]);
    setForm({ nome: '', cpf: '', funcao: 'Serviços Gerais', valorDiario: 0, observacao: '' });
    setShowForm(false);
    toast.success('Prestador cadastrado!');
  };

  const handleLancar = () => {
    if (!selectedId) return;
    setPrestadores(prev => prev.map(p => {
      if (p.id !== selectedId) return p;
      const mes = new Date().toISOString().slice(0, 7);
      const key = `${mes}-Q${quinzena}`;
      const existing = p.diasTrabalhados.filter(d => d.quinzena !== key);
      return { ...p, diasTrabalhados: [...existing, { quinzena: key, dias: diasTrabalhados }] };
    }));
    toast.success('Dias lançados!');
  };

  const selected = prestadores.find(p => p.id === selectedId);

  const handlePrintRecibo = () => {
    if (!selected) return;
    const mes = new Date().toISOString().slice(0, 7);
    const key = `${mes}-Q${quinzena}`;
    const reg = selected.diasTrabalhados.find(d => d.quinzena === key);
    const dias = reg?.dias || 0;
    const total = dias * selected.valorDiario;

    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Recibo de Pagamento</title>
    <style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:16px}
    .title{font-size:16px;font-weight:bold;text-align:right}
    .block{border:1px solid #ccc;border-radius:4px;padding:12px;margin-bottom:12px}
    .block-title{font-weight:bold;font-size:11px;text-transform:uppercase;color:#555;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px}
    .field{font-size:11px}.field span{color:#666}
    table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}th{background:#f5f5f5}
    .signatures{display:flex;justify-content:space-between;margin-top:50px}
    .sig-line{text-align:center;width:45%}.sig-line hr{border:0;border-top:1px solid #000;margin-bottom:4px}
    .footer{margin-top:30px;text-align:center;font-size:9px;color:#999;border-top:1px solid #eee;padding-top:6px}
    </style></head><body>
    <div class="header"><div><strong>ALQUI OBRAS</strong></div>
    <div class="title">RECIBO DE<br/>PAGAMENTO</div></div>
    <div class="block"><div class="block-title">Dados do Prestador</div>
    <div class="grid">
    <div class="field"><span>Nome:</span> ${selected.nome}</div>
    <div class="field"><span>CPF:</span> ${selected.cpf || '—'}</div>
    <div class="field"><span>Função:</span> ${selected.funcao}</div>
    <div class="field"><span>Período:</span> ${quinzena}ª Quinzena de ${mes}</div>
    </div></div>
    <table><thead><tr><th>Descrição</th><th>Qtd Dias</th><th>Valor/Dia</th><th>Total</th></tr></thead>
    <tbody><tr><td>Serviço prestado — ${selected.funcao}</td><td>${dias}</td><td>R$ ${selected.valorDiario.toFixed(2)}</td><td>R$ ${total.toFixed(2)}</td></tr></tbody></table>
    <p style="font-size:12px;font-weight:bold;text-align:right;margin-top:8px">TOTAL A PAGAR: R$ ${total.toFixed(2)}</p>
    <div class="signatures">
    <div class="sig-line"><hr/><small>Assinatura do Prestador</small></div>
    <div class="sig-line"><hr/><small>Assinatura — ALQUI OBRAS</small></div>
    </div>
    <div class="footer">Topac RH Multiempresa PRO — Documento gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </body></html>`);
    printWin.document.close();
    printWin.print();
    toast.success('Recibo gerado!');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Prestadores de Serviço</h1>
            <p className="text-primary-foreground/70 text-sm">Cadastro, controle de dias e recibo quinzenal — Empresa pagadora: ALQUI OBRAS</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold text-foreground">Prestadores Cadastrados</h2>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            {showForm ? 'Cancelar' : 'Novo'}
          </Button>
        </div>

        {showForm && (
          <div className="bg-muted/30 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Nome</label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">CPF</label>
              <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Função</label>
              <Input value={form.funcao} onChange={e => setForm({ ...form, funcao: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Valor/Dia (R$)</label>
              <Input type="number" value={form.valorDiario} onChange={e => setForm({ ...form, valorDiario: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Observação</label>
              <Input value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
            <div className="flex items-end">
              <Button onClick={handleAdd}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Função</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Valor/Dia</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Dias (seg/qui)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {prestadores.map(p => (
              <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedId(p.id)}>
                <td className="px-3 py-2 font-medium">{p.nome}</td>
                <td className="px-3 py-2">{p.funcao}</td>
                <td className="px-3 py-2">R$ {p.valorDiario.toFixed(2)}</td>
                <td className="px-3 py-2 text-xs">{p.diasTrabalho}</td>
                <td className="px-3 py-2"><Badge className="text-[10px] bg-success text-success-foreground">{p.status}</Badge></td>
              </tr>
            ))}
            {prestadores.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhum prestador cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card-premium p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground">Lançamento — {selected.nome}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Quinzena</label>
              <select value={quinzena} onChange={e => setQuinzena(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="1">1ª Quinzena</option>
                <option value="2">2ª Quinzena</option>
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Dias Trabalhados</label>
              <Input type="number" value={diasTrabalhados} onChange={e => setDiasTrabalhados(Number(e.target.value))} /></div>
            <div className="flex items-end gap-2">
              <Button onClick={handleLancar} variant="outline"><Save className="w-4 h-4 mr-1" /> Lançar</Button>
              <Button onClick={handlePrintRecibo} className="gradient-accent text-accent-foreground font-semibold">
                <Printer className="w-4 h-4 mr-1" /> Recibo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrestadoresPage;
