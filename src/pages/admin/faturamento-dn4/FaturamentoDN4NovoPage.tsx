import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save, Sparkles, Eye, FilePlus2, Loader2 } from 'lucide-react';
import { fmtBRL, STATUS_DN4 } from '@/lib/dn4';
import { useApp } from '@/context/AppContext';

interface Cliente {
  id: string; nome: string; cnpj_cpf?: string; endereco?: string;
  empresa_vinculada?: string; forma_pagamento_padrao?: string; observacoes?: string;
}

const empty = {
  cliente_id: '' as string | '',
  cliente_nome: '',
  cnpj_cpf: '',
  empresa_filial: '',
  numero_pedido: '',
  data_servico: '',
  data_emissao: new Date().toISOString().slice(0, 10),
  descricao: '',
  quantidade: 1,
  valor_unitario: 0,
  forma_pagamento: '',
  vencimento: '',
  observacoes: '',
  status: 'pendente' as string,
};

const FaturamentoDN4NovoPage: React.FC = () => {
  const nav = useNavigate();
  const { session } = useApp();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [form, setForm] = useState(empty);
  const [previa, setPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [puxando, setPuxando] = useState(false);

  useEffect(() => {
    supabase.from('clientes_dn4' as any).select('*').order('nome').then(({ data }) => setClientes(((data as unknown) as Cliente[]) || []));
  }, []);

  const valorTotal = useMemo(
    () => Math.round((Number(form.quantidade || 0) * Number(form.valor_unitario || 0)) * 100) / 100,
    [form.quantidade, form.valor_unitario]
  );

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const handlePuxarDados = async () => {
    if (!form.cliente_id) { toast.error('Selecione um cliente primeiro'); return; }
    setPuxando(true);
    const c = clientes.find((x) => x.id === form.cliente_id);
    if (c) {
      setForm((p) => ({
        ...p,
        cliente_nome: c.nome,
        cnpj_cpf: c.cnpj_cpf || p.cnpj_cpf,
        empresa_filial: c.empresa_vinculada || p.empresa_filial,
        forma_pagamento: c.forma_pagamento_padrao || p.forma_pagamento,
      }));
    }
    const { data } = await supabase
      .from('faturamento_dn4' as any)
      .select('*')
      .eq('cliente_id', form.cliente_id)
      .order('created_at', { ascending: false })
      .limit(5);
    setHistorico((data as any[]) || []);
    toast.success('Dados puxados automaticamente');
    setPuxando(false);
  };

  const reaproveitar = (h: any) => {
    setForm((p) => ({
      ...p,
      descricao: h.descricao || p.descricao,
      quantidade: Number(h.quantidade) || p.quantidade,
      valor_unitario: Number(h.valor_unitario) || p.valor_unitario,
      forma_pagamento: h.forma_pagamento || p.forma_pagamento,
      empresa_filial: h.empresa_filial || p.empresa_filial,
    }));
    toast.success('Dados copiados do faturamento anterior');
  };

  const salvar = async (statusFinal?: string) => {
    if (!form.cliente_nome.trim()) { toast.error('Informe o cliente'); return; }
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return; }
    if (form.quantidade <= 0 || form.valor_unitario < 0) { toast.error('Quantidade/valor inválidos'); return; }
    setSalvando(true);
    const payload = {
      cliente_id: form.cliente_id || null,
      cliente_nome: form.cliente_nome.trim(),
      cnpj_cpf: form.cnpj_cpf || null,
      empresa_filial: form.empresa_filial || null,
      numero_pedido: form.numero_pedido || null,
      data_servico: form.data_servico || null,
      data_emissao: form.data_emissao,
      descricao: form.descricao.trim(),
      quantidade: form.quantidade,
      valor_unitario: form.valor_unitario,
      forma_pagamento: form.forma_pagamento || null,
      vencimento: form.vencimento || null,
      observacoes: form.observacoes || null,
      status: statusFinal || form.status,
      criado_por_user_id: session?.user?.id || null,
      criado_por_nome: session?.user?.email || null,
    };
    const { error } = await supabase.from('faturamento_dn4' as any).insert(payload as any);
    setSalvando(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Faturamento salvo');
    nav('/admin/faturamento/dn4/conferencia');
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FilePlus2 className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold">Novo faturamento</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Cliente cadastrado</Label>
            <Select value={form.cliente_id} onValueChange={(v) => set('cliente_id', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.cnpj_cpf ? ' — ' + c.cnpj_cpf : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={handlePuxarDados} disabled={puxando || !form.cliente_id}>
              {puxando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Puxar dados automaticamente
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Cliente *</Label>
            <Input value={form.cliente_nome} onChange={(e) => set('cliente_nome', e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>CNPJ/CPF</Label>
            <Input value={form.cnpj_cpf} onChange={(e) => set('cnpj_cpf', e.target.value)} maxLength={20} />
          </div>
          <div>
            <Label>Empresa/filial</Label>
            <Input value={form.empresa_filial} onChange={(e) => set('empresa_filial', e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label>Nº pedido/ordem</Label>
            <Input value={form.numero_pedido} onChange={(e) => set('numero_pedido', e.target.value)} maxLength={50} />
          </div>
          <div>
            <Label>Data do serviço</Label>
            <Input type="date" value={form.data_servico} onChange={(e) => set('data_servico', e.target.value)} />
          </div>
          <div>
            <Label>Data de emissão</Label>
            <Input type="date" value={form.data_emissao} onChange={(e) => set('data_emissao', e.target.value)} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <Input type="date" value={form.vencimento} onChange={(e) => set('vencimento', e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label>Descrição do serviço/produto *</Label>
            <Input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} maxLength={300} />
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" step="0.001" min={0} value={form.quantidade} onChange={(e) => set('quantidade', Number(e.target.value))} />
          </div>
          <div>
            <Label>Valor unitário (R$)</Label>
            <Input type="number" step="0.01" min={0} value={form.valor_unitario} onChange={(e) => set('valor_unitario', Number(e.target.value))} />
          </div>
          <div>
            <Label>Valor total</Label>
            <Input value={fmtBRL(valorTotal)} readOnly className="bg-muted/40 font-semibold" />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Input value={form.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)} maxLength={60} placeholder="Boleto, Pix, ..." />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_DN4.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} maxLength={1000} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button onClick={() => salvar()} disabled={salvando}>
            <Save className="w-4 h-4 mr-1" /> Salvar
          </Button>
          <Button variant="outline" onClick={() => salvar('em_conferencia')} disabled={salvando}>
            <Eye className="w-4 h-4 mr-1" /> Salvar e enviar p/ conferência
          </Button>
          <Button variant="ghost" onClick={() => setPrevia((p) => !p)}>
            {previa ? 'Esconder prévia' : 'Gerar prévia'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {previa && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-1">
            <h3 className="font-semibold text-base mb-2">Prévia do faturamento</h3>
            <p><strong>Cliente:</strong> {form.cliente_nome || '—'}</p>
            <p><strong>CNPJ/CPF:</strong> {form.cnpj_cpf || '—'}</p>
            <p><strong>Empresa:</strong> {form.empresa_filial || '—'}</p>
            <p><strong>Pedido:</strong> {form.numero_pedido || '—'}</p>
            <p><strong>Descrição:</strong> {form.descricao || '—'}</p>
            <p><strong>Quantidade × Unitário:</strong> {form.quantidade} × {fmtBRL(form.valor_unitario)}</p>
            <p className="text-base"><strong>Total:</strong> <span className="text-primary font-bold">{fmtBRL(valorTotal)}</span></p>
            <p><strong>Vencimento:</strong> {form.vencimento || '—'}</p>
            <p><strong>Pagamento:</strong> {form.forma_pagamento || '—'}</p>
          </div>
        )}

        {historico.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h3 className="font-semibold text-sm">Últimos do cliente</h3>
            <p className="text-xs text-muted-foreground">Clique para reaproveitar dados</p>
            <ul className="space-y-1.5">
              {historico.map((h) => (
                <li key={h.id}>
                  <button onClick={() => reaproveitar(h)} className="w-full text-left text-xs rounded border border-border p-2 hover:bg-muted/30">
                    <div className="flex justify-between">
                      <span className="truncate font-medium">{h.descricao}</span>
                      <span className="font-semibold text-primary">{fmtBRL(h.valor_total)}</span>
                    </div>
                    <div className="text-muted-foreground">{h.competencia} • {h.forma_pagamento || '—'}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaturamentoDN4NovoPage;
