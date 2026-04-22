import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Printer, Save, X, ChevronLeft, Landmark } from 'lucide-react';
import { toast } from 'sonner';

interface Prestador {
  id: string;
  nome: string;
  cpf: string;
  funcao: string;
  empresa_pagadora: string;
  dias_trabalho: string;
  pagamento_tipo: string;
  valor_diario: number;
  observacao: string;
  status: string;
  banco: string;
  banco_titular: string;
  banco_tipo_conta: string;
  banco_agencia: string;
  banco_conta: string;
  ultimo_pagamento: string | null;
  proximo_pagamento: string | null;
}

const getAlertStatus = (proximo: string | null) => {
  if (!proximo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prox = new Date(proximo + 'T00:00:00');
  const diff = Math.ceil((prox.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: 'ATRASADO', color: 'bg-destructive text-destructive-foreground', days: diff };
  if (diff === 0) return { label: 'HOJE', color: 'bg-warning text-warning-foreground', days: 0 };
  if (diff === 1) return { label: 'AMANHÃ', color: 'bg-warning text-warning-foreground', days: 1 };
  return { label: `${diff} dias`, color: 'bg-muted text-muted-foreground', days: diff };
};

const PrestadoresPage: React.FC = () => {
  const { session } = useApp();
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: '', cpf: '', funcao: 'Serviços Gerais', valorDiario: 0, observacao: '',
    banco: '', bancoTitular: '', bancoTipoConta: 'Conta corrente', bancoAgencia: '', bancoConta: '',
  });
  const [selectedId, setSelectedId] = useState('');
  const [quinzena, setQuinzena] = useState('1');
  const [diasTrabalhados, setDiasTrabalhados] = useState(0);
  const [valorPago, setValorPago] = useState(0);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const fetchPrestadores = async () => {
    const { data, error } = await supabase.from('prestadores').select('*').order('created_at', { ascending: false });
    if (!error && data) setPrestadores(data as unknown as Prestador[]);
  };

  useEffect(() => { fetchPrestadores(); }, []);

  const handleAdd = async () => {
    if (!form.nome) { toast.error('Preencha o nome'); return; }
    if (!session?.user?.id) { toast.error('Faça login'); return; }
    setLoading(true);
    const { error } = await supabase.from('prestadores').insert({
      user_id: session.user.id,
      nome: form.nome,
      cpf: form.cpf,
      funcao: form.funcao,
      valor_diario: form.valorDiario,
      observacao: form.observacao,
      empresa_pagadora: 'ALQUI OBRAS',
      dias_trabalho: 'segunda,quinta',
      pagamento_tipo: 'quinzenal',
      status: 'ativo',
      banco: form.banco,
      banco_titular: form.bancoTitular,
      banco_tipo_conta: form.bancoTipoConta,
      banco_agencia: form.bancoAgencia,
      banco_conta: form.bancoConta,
    } as any);
    if (error) { toast.error('Erro: ' + error.message); } else {
      toast.success('Prestador cadastrado!');
      setForm({ nome: '', cpf: '', funcao: 'Serviços Gerais', valorDiario: 0, observacao: '', banco: '', bancoTitular: '', bancoTipoConta: 'Conta corrente', bancoAgencia: '', bancoConta: '' });
      setShowForm(false);
      fetchPrestadores();
    }
    setLoading(false);
  };

  const selected = prestadores.find(p => p.id === selectedId);

  useEffect(() => {
    if (selected) setValorPago(diasTrabalhados * selected.valor_diario);
  }, [diasTrabalhados, selected]);

  const handlePrintRecibo = () => {
    if (!selected) return;
    const mes = new Date().toISOString().slice(0, 7);
    const total = valorPago || diasTrabalhados * selected.valor_diario;

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
    ${selected.banco ? `<div class="block"><div class="block-title">Dados Bancários</div>
    <div class="grid">
    <div class="field"><span>Banco:</span> ${selected.banco}</div>
    <div class="field"><span>Titular:</span> ${selected.banco_titular}</div>
    <div class="field"><span>Tipo:</span> ${selected.banco_tipo_conta}</div>
    <div class="field"><span>Agência:</span> ${selected.banco_agencia}</div>
    <div class="field"><span>Conta:</span> ${selected.banco_conta}</div>
    </div></div>` : ''}
    <table><thead><tr><th>Descrição</th><th>Qtd Dias</th><th>Valor/Dia</th><th>Total</th></tr></thead>
    <tbody><tr><td>Serviço prestado — ${selected.funcao}</td><td>${diasTrabalhados}</td><td>R$ ${selected.valor_diario.toFixed(2)}</td><td>R$ ${total.toFixed(2)}</td></tr></tbody></table>
    <p style="font-size:12px;font-weight:bold;text-align:right;margin-top:8px">TOTAL A PAGAR: R$ ${total.toFixed(2)}</p>
    <p style="font-size:11px;margin-top:4px"><span style="color:#666">Data do Pagamento:</span> ${new Date(dataPagamento).toLocaleDateString('pt-BR')}</p>
    <div class="signatures">
    <div class="sig-line"><hr/><small>Assinatura do Prestador</small></div>
    <div class="sig-line"><hr/><small>Assinatura — ALQUI OBRAS</small></div>
    </div>
    <!-- rodapé limpo -->
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
          <div className="bg-muted/30 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            </div>
            <div className="border-t pt-3 mt-2">
              <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1"><Landmark className="w-3 h-3" /> Dados Bancários (opcional)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">Banco / Instituição</label>
                  <Input value={form.banco} onChange={e => setForm({ ...form, banco: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Titular</label>
                  <Input value={form.bancoTitular} onChange={e => setForm({ ...form, bancoTitular: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Tipo de Conta</label>
                  <select value={form.bancoTipoConta} onChange={e => setForm({ ...form, bancoTipoConta: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                    <option>Conta corrente</option><option>Conta poupança</option>
                  </select></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Agência</label>
                  <Input value={form.bancoAgencia} onChange={e => setForm({ ...form, bancoAgencia: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">Conta</label>
                  <Input value={form.bancoConta} onChange={e => setForm({ ...form, bancoConta: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex items-end pt-2">
              <Button onClick={handleAdd} disabled={loading}><Save className="w-4 h-4 mr-1" /> Salvar</Button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nome</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Função</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Valor Quinzenal</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Próx. Pagamento</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {prestadores.map(p => {
              const alert = getAlertStatus(p.proximo_pagamento);
              return (
                <tr key={p.id} className={`border-b hover:bg-muted/30 cursor-pointer ${selectedId === p.id ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`} onClick={() => setSelectedId(selectedId === p.id ? '' : p.id)}>
                  <td className="px-3 py-2 font-medium">{p.nome}</td>
                  <td className="px-3 py-2">{p.funcao}</td>
                  <td className="px-3 py-2">R$ {(p.valor_diario || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{p.proximo_pagamento ? new Date(p.proximo_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                      {alert && <Badge className={`text-[10px] ${alert.color}`}>{alert.label}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><Badge className="text-[10px] bg-success text-success-foreground">{p.status}</Badge></td>
                </tr>
              );
            })}
            {prestadores.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhum prestador cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Detalhes — {selected.nome}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedId('')}><ChevronLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          </div>

          {/* Alerta de pagamento */}
          {(() => {
            const alert = getAlertStatus(selected.proximo_pagamento);
            if (!alert) return null;
            const isUrgent = alert.days <= 1;
            return (
              <div className={`rounded-lg p-4 flex items-center justify-between ${isUrgent ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted/30'}`}>
                <div>
                  <p className={`text-sm font-bold ${isUrgent ? 'text-destructive' : 'text-foreground'}`}>
                    {alert.days < 0 ? `⚠️ Pagamento atrasado há ${Math.abs(alert.days)} dia(s)` :
                     alert.days === 0 ? '🔔 Pagamento vence HOJE' :
                     alert.days === 1 ? '⏰ Pagamento vence AMANHÃ' :
                     `Próximo pagamento em ${alert.days} dias`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Último: {selected.ultimo_pagamento ? new Date(selected.ultimo_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} | 
                    Próximo: {selected.proximo_pagamento ? new Date(selected.proximo_pagamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} | 
                    Valor: R$ {(selected.valor_diario || 0).toFixed(2)}
                  </p>
                </div>
                <Button size="sm" variant={isUrgent ? 'destructive' : 'default'} onClick={async () => {
                  const hoje = new Date().toISOString().slice(0, 10);
                  const prox = new Date();
                  prox.setDate(prox.getDate() + 15);
                  const proxStr = prox.toISOString().slice(0, 10);
                  await supabase.from('prestadores').update({ ultimo_pagamento: hoje, proximo_pagamento: proxStr } as any).eq('id', selected.id);
                  toast.success('Pagamento registrado! Próximo em 15 dias.');
                  fetchPrestadores();
                }}>
                  Registrar Pagamento
                </Button>
              </div>
            );
          })()}

          {/* Dados bancários */}
          {selected.banco && (
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1"><Landmark className="w-3 h-3" /> Dados Bancários</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div><span className="text-muted-foreground">Banco:</span> {selected.banco}</div>
                <div><span className="text-muted-foreground">Titular:</span> {selected.banco_titular}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {selected.banco_tipo_conta}</div>
                <div><span className="text-muted-foreground">Agência:</span> {selected.banco_agencia}</div>
                <div><span className="text-muted-foreground">Conta:</span> {selected.banco_conta}</div>
              </div>
            </div>
          )}

          {/* Lançamento quinzenal */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">Quinzena</label>
              <select value={quinzena} onChange={e => setQuinzena(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                <option value="1">1ª Quinzena</option>
                <option value="2">2ª Quinzena</option>
              </select></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Dias Trabalhados</label>
              <Input type="number" value={diasTrabalhados} onChange={e => setDiasTrabalhados(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Valor a Pagar (R$)</label>
              <Input type="number" step="0.01" value={valorPago} onChange={e => setValorPago(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Data Pagamento</label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} /></div>
            <div className="flex items-end">
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
